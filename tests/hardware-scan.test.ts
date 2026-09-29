import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { openDatabase, type DB } from '../server/db.js';
import { createApp } from '../server/app.js';

const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const suggestion = {
  name: 'WD hard drive',
  category: 'HDD',
  manufacturer: 'WD',
  model: '',
  serialNumber: '',
  quantity: 1,
  notes: '',
  evidence: 'WD logo visible; model label is blurred.',
  confidence: 'medium',
};
let db: DB;
let app: ReturnType<typeof createApp>;
let user: ReturnType<typeof request.agent>;
const upstream = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only-key');
  vi.stubEnv('OPENAI_VISION_MODEL', 'test-vision-model');
  vi.stubGlobal('fetch', upstream);
  upstream.mockReset();
  db = openDatabase(':memory:');
  app = createApp(db);
  user = request.agent(app);
  await user
    .post('/api/auth/register')
    .set(headers)
    .send({ name: 'Scanner', email: 'scan@example.com', password: 'photo-scan-password-123' });
});
afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function response(result: unknown) {
  return Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
  });
}
describe('hardware photo scanning', () => {
  it('requires a signed-in user and trusted request before sending photos', async () => {
    expect(
      (await request(app).post('/api/hardware/scan').set(headers).send({ image })).status,
    ).toBe(401);
    expect((await request(app).get('/api/hardware/scan')).status).toBe(401);
    expect((await user.post('/api/hardware/scan').send({ image })).status).toBe(403);
    expect(
      (
        await user
          .post('/api/hardware/scan')
          .set({ ...headers, Origin: 'https://foreign.example' })
          .send({ image })
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('returns reviewable suggestions without saving any inventory or exposing the API key', async () => {
    upstream.mockResolvedValue(
      response({ items: [suggestion], message: 'Check the model label.' }),
    );
    expect((await user.get('/api/hardware/scan')).body).toEqual({ enabled: true });
    const result = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(result.status).toBe(200);
    expect(result.body.items).toEqual([suggestion]);
    expect((await user.get('/api/inventory')).body.total).toBe(0);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('test-vision-model');
    expect(body.store).toBe(false);
    expect(body.input[0].content[1].image_url).toBe(image);
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain('test-only-key');
  });
  it('reports missing configuration while manual inventory remains available', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await user.get('/api/hardware/scan')).body).toEqual({ enabled: false });
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(503);
    expect((await user.get('/api/inventory')).status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects URLs, malformed uploads, mismatched media types and oversized payloads', async () => {
    for (const value of [
      'https://example.com/photo.png',
      'data:image/png;base64,aGVsbG8=',
      image.replace('image/png', 'image/jpeg'),
      'data:image/svg+xml;base64,aGVsbG8=',
    ])
      expect(
        (await user.post('/api/hardware/scan').set(headers).send({ image: value })).status,
      ).toBe(400);
    expect(
      (
        await user
          .post('/api/hardware/scan')
          .set(headers)
          .send({ image: 'a'.repeat(7 * 1024 * 1024) })
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('limits scans per user', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    for (let i = 0; i < 20; i++) await user.post('/api/hardware/scan').set(headers).send({ image });
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
  });
  it.each([401, 403, 429, 500])(
    'handles provider error %s without leaking provider details',
    async (status) => {
      upstream.mockResolvedValue(Response.json({ error: 'secret-provider-detail' }, { status }));
      const result = await user.post('/api/hardware/scan').set(headers).send({ image });
      expect(result.status).toBe(status === 429 ? 429 : status === 500 ? 502 : 503);
      expect(JSON.stringify(result.body)).not.toContain('secret-provider-detail');
    },
  );
  it('handles timeouts', async () => {
    upstream.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(504);
  });
  it.each([
    ['credit_balance_exhausted', 'insufficient_quota', 'API credits are exhausted'],
    [
      'project_spend_limit_exceeded',
      'insufficient_quota',
      'project has reached its API spend limit',
    ],
    [
      'organization_spend_limit_exceeded',
      'insufficient_quota',
      'organization has reached its API spend limit',
    ],
    ['organization_usage_limit_exceeded', 'insufficient_quota', 'approved API usage limit'],
    ['insufficient_quota', 'insufficient_quota', 'Retrying will not restore quota'],
    ['rate_limit_exceeded', 'rate_limit_error', 'temporarily rate-limited'],
    ['slow_down', 'rate_limit_error', 'reduce how frequently'],
  ])('explains OpenAI 429 code %s', async (code, type, message) => {
    upstream.mockResolvedValue(
      Response.json({ error: { code, type, message: 'secret-provider-detail' } }, { status: 429 }),
    );
    const result = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(result.status).toBe(429);
    expect(result.body.error).toContain(message);
    expect(result.body.error).not.toContain('secret-provider-detail');
  });
  it('rejects invalid model output and incomplete or refused scans', async () => {
    for (const body of [
      response({ items: [{ ...suggestion, quantity: -1 }], message: '' }),
      Response.json({ status: 'incomplete', output: [] }),
      Response.json({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal' }] }],
      }),
    ]) {
      upstream.mockResolvedValueOnce(body);
      expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(502);
    }
    expect((await user.get('/api/inventory')).body.total).toBe(0);
  });
  it('returns initial valuations in one call and drops unsafe valuations without losing identification', async () => {
    const valuation = {
      estimatedValueCents: 3000,
      lowEstimateCents: 2000,
      highEstimateCents: 4000,
      confidence: 'high',
      currency: 'USD',
      explanation: 'Assumes untested used condition, without live sales.',
    };
    upstream.mockResolvedValue(
      response({
        items: [
          { ...suggestion, confidence: 'high', valuation },
          { ...suggestion, confidence: 'low', valuation },
          { ...suggestion, valuation: { ...valuation, lowEstimateCents: 9000 } },
        ],
        message: '',
      }),
    );
    const result = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(result.status).toBe(200);
    expect(result.body.items[0].valuation.confidence).toBe('medium');
    expect(result.body.items[1].valuation).toBeNull();
    expect(result.body.items[2].valuation).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body));
    expect(body.text.format.schema.properties.items.items.required).toContain('valuation');
    expect((await user.get('/api/inventory')).body.total).toBe(0);
  });
  it('handles a photo with no identifiable hardware', async () => {
    upstream.mockResolvedValue(
      response({ items: [], message: 'Try a close-up of the hardware label.' }),
    );
    const result = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(result.status).toBe(200);
    expect(result.body.items).toEqual([]);
  });
});
