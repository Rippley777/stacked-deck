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
  vi.stubEnv('AI_SCAN_LIMIT_PER_WINDOW', undefined);
  vi.stubEnv('AI_SCAN_LIMIT_WINDOW_MINUTES', undefined);
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
  vi.useRealTimers();
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
    expect((await user.get('/api/hardware/scan')).body).toEqual({
      enabled: true,
      limit: 20,
      windowMinutes: 60,
    });
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
    expect((await user.get('/api/hardware/scan')).body).toEqual({
      enabled: false,
      limit: 20,
      windowMinutes: 60,
    });
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
    upstream.mockImplementation(async () => response({ items: [suggestion], message: '' }));
    for (let i = 0; i < 20; i++)
      expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(200);
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(20);
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

it('combines three views into one unverified electrical record and never infers nulls', async () => {
  upstream.mockResolvedValue(
    response({
      items: [
        {
          ...suggestion,
          category: 'Power Adapter',
          connectivity: {
            version: 1,
            verified: true,
            evidence: 'Readable output label',
            adapter: {
              voltage: 12,
              current: 2,
              acDc: 'DC',
              polarity: null,
              connector: { connector: 'DC barrel', outerMm: null, innerMm: null },
            },
            cable: null,
            power: null,
            connections: null,
          },
          candidates: ['5.5 × 2.1mm barrel', '5.5 × 2.5mm barrel'],
          likelyUses: ['Routers'],
        },
      ],
      message: 'Verify connector dimensions.',
    }),
  );
  const result = await user
    .post('/api/hardware/scan')
    .set(headers)
    .send({ images: [image, image, image], mode: 'charger' });
  expect(result.status).toBe(200);
  expect(result.body.items).toHaveLength(1);
  expect(result.body.items[0].connectivity.verified).toBe(false);
  expect(result.body.items[0].connectivity.adapter.polarity).toBeUndefined();
  expect(result.body.items[0].connectivity.adapter.connector.innerMm).toBeUndefined();
  const body = JSON.parse(String(upstream.mock.calls[0][1]?.body));
  expect(
    body.input[0].content.filter((c: { type: string }) => c.type === 'input_image'),
  ).toHaveLength(3);
  expect(body.instructions).toContain('Mode: charger');
  function checkStrict(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.properties) expect(node.required).toEqual(Object.keys(node.properties as object));
    for (const child of Object.values(node)) checkStrict(child);
  }
  checkStrict(body.text.format.schema);
  expect((await user.get('/api/inventory')).body.total).toBe(0);
});
it('rejects too many images, ambiguous payloads, malformed secondary photos and invalid modes without AI calls', async () => {
  for (const body of [
    { images: [image, image, image, image] },
    { image, images: [image] },
    { images: [image, 'bad'] },
    { images: [] },
    { image, mode: 'unrecognized' },
  ])
    expect((await user.post('/api/hardware/scan').set(headers).send(body)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

describe('configurable scan allowance', () => {
  beforeEach(async () => {
    vi.stubEnv('AI_SCAN_LIMIT_PER_WINDOW', '3');
    vi.stubEnv('AI_SCAN_LIMIT_WINDOW_MINUTES', '5');
    app = createApp(db, { trustProxy: 1 });
    user = request.agent(app);
    expect(
      (
        await user.post('/api/auth/login').set(headers).send({
          email: 'scan@example.com',
          password: 'photo-scan-password-123',
        })
      ).status,
    ).toBe(200);
    upstream.mockImplementation(async () => response({ items: [suggestion], message: '' }));
  });

  it('accepts three scans, then reports the configured window and standard rate-limit metadata', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const began = Date.now();
    expect((await user.get('/api/hardware/scan')).body).toEqual({
      enabled: true,
      limit: 3,
      windowMinutes: 5,
    });
    for (let i = 0; i < 3; i++) {
      const result = await user.post('/api/hardware/scan').set(headers).send({ image });
      expect(result.status).toBe(200);
      expect(result.headers.ratelimit).toContain(`r=${2 - i}`);
      expect(result.headers['ratelimit-policy']).toContain('q=3; w=300');
    }
    const exhausted = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(exhausted.status).toBe(429);
    expect(exhausted.body.error).toContain('3 scans per 5 minutes');
    expect(exhausted.body.error).toContain('continue adding hardware manually');
    expect(Number(exhausted.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(exhausted.headers['retry-after'])).toBeLessThanOrEqual(300);
    expect(exhausted.headers.ratelimit).toContain('r=0');
    expect(upstream).toHaveBeenCalledTimes(3);
    vi.setSystemTime(began + 5 * 60 * 1000 - 1);
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
    vi.setSystemTime(began + 5 * 60 * 1000);
    const renewed = await user.post('/api/hardware/scan').set(headers).send({ image });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.ratelimit).toContain('r=2');
    expect(upstream).toHaveBeenCalledTimes(4);
  });

  it('keeps users behind the same IP separate and does not grant fresh quota on an IP or session change', async () => {
    const other = request.agent(app);
    const registered = await other.post('/api/auth/register').set(headers).send({
      name: 'Other scanner',
      email: 'other-scan@example.com',
      password: 'photo-scan-password-123',
    });
    expect(registered.status).toBe(201);
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await user
            .post('/api/hardware/scan')
            .set({ ...headers, 'X-Forwarded-For': '192.0.2.1' })
            .send({ image })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await user
          .post('/api/hardware/scan')
          .set({ ...headers, 'X-Forwarded-For': '192.0.2.2' })
          .send({ image })
      ).status,
    ).toBe(429);
    await user
      .post('/api/auth/login')
      .set(headers)
      .send({ email: 'scan@example.com', password: 'photo-scan-password-123' });
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await other
            .post('/api/hardware/scan')
            .set({ ...headers, 'X-Forwarded-For': '192.0.2.1' })
            .send({ image })
        ).status,
      ).toBe(200);
    }
    expect((await other.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(6);
  });

  it('preserves manual creation and the independent 20-request valuation allowance after scan exhaustion', async () => {
    for (let i = 0; i < 3; i++) await user.post('/api/hardware/scan').set(headers).send({ image });
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
    const input = {
      name: 'Manual drive',
      category: 'HDD',
      quantity: 1,
      condition: 'Good',
      status: 'Available',
    };
    const saved = await user.post('/api/inventory').set(headers).send(input);
    expect(saved.status).toBe(201);
    expect(saved.body.name).toBe(input.name);
    upstream.mockImplementation(async () =>
      response({ valuation: null, message: 'Confirm the model.' }),
    );
    for (let i = 0; i < 20; i++) {
      expect((await user.post('/api/hardware/valuation').set(headers).send(input)).status).toBe(
        200,
      );
    }
    const exhausted = await user.post('/api/hardware/valuation').set(headers).send(input);
    expect(exhausted.status).toBe(429);
    expect(exhausted.body.error).toContain('20 valuations');
    expect(upstream).toHaveBeenCalledTimes(23);
  });

  it('snapshots environment settings at server construction and rejects invalid startup settings', async () => {
    vi.stubEnv('AI_SCAN_LIMIT_PER_WINDOW', '0');
    expect(() => createApp(db)).toThrow(
      'AI_SCAN_LIMIT_PER_WINDOW must be a whole decimal integer from 1 to 1000.',
    );
    expect((await user.get('/api/hardware/scan')).body).toEqual({
      enabled: true,
      limit: 3,
      windowMinutes: 5,
    });
    for (let i = 0; i < 3; i++)
      expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(200);
    expect((await user.post('/api/hardware/scan').set(headers).send({ image })).status).toBe(429);
  });
});
