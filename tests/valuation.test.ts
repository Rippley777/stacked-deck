import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { openDatabase, type DB } from '../server/db.js';
import { createApp } from '../server/app.js';
import { valuationSchema, gain } from '../shared/valuation.js';
import { conservativeValuation } from '../server/valuation.js';
import { portfolioHistory } from '../server/portfolio.js';
import { Repository } from '../server/repository.js';
import { itemSchema } from '../shared/validation.js';

const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const valuation = {
  estimatedValueCents: 37500,
  lowEstimateCents: 32500,
  highEstimateCents: 42500,
  confidence: 'medium',
  currency: 'USD',
  explanation: 'Known generation in good used condition; broad estimate without live sales data.',
};
const input = {
  name: 'RTX 3070 Ti',
  manufacturer: 'NVIDIA',
  model: 'RTX 3070 Ti',
  category: 'GPU',
  quantity: 2,
  condition: 'Good',
  status: 'Available',
  purchasePriceCents: 50000,
};
const upstream = vi.fn<typeof fetch>();
let db: DB;
let app: ReturnType<typeof createApp>;
let user: ReturnType<typeof request.agent>;
let owner: string;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only');
  vi.stubEnv('OPENAI_VALUATION_MODEL', 'test-value-model');
  vi.stubGlobal('fetch', upstream);
  upstream.mockReset();
  db = openDatabase(':memory:');
  app = createApp(db);
  user = request.agent(app);
  const result = await user
    .post('/api/auth/register')
    .set(headers)
    .send({ name: 'Valuer', email: 'value@example.com', password: 'test-valuation-password' });
  owner = result.body.id;
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const response = (value: unknown = { valuation, message: '' }) =>
  Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  });
async function create(extra = {}) {
  const r = await user
    .post('/api/inventory')
    .set(headers)
    .send({ ...input, ...extra });
  expect(r.status).toBe(201);
  return r.body;
}
async function refresh(id: string) {
  upstream.mockResolvedValueOnce(response());
  const r = await user.post(`/api/inventory/${id}/valuation`).set(headers).send({});
  expect(r.status).toBe(200);
  return r.body.record;
}
async function apply(id: string, valuationId: string, replaceManual = false) {
  return user
    .put(`/api/inventory/${id}/valuation`)
    .set(headers)
    .send({ valuationId, replaceManual });
}
describe('equipment valuations', () => {
  it('validates prices, currency, ranges and confidence, including zero', () => {
    expect(valuationSchema.parse(valuation)).toEqual(valuation);
    for (const bad of [
      { estimatedValueCents: -1 },
      { estimatedValueCents: 2.2 },
      { currency: 'EUR' },
      { confidence: 'certain' },
      { lowEstimateCents: 40000 },
      { highEstimateCents: 20000 },
      { estimatedValueCents: Infinity },
      { explanation: '' },
    ])
      expect(valuationSchema.safeParse({ ...valuation, ...bad }).success).toBe(false);
    expect(
      valuationSchema.safeParse({ ...valuation, estimatedValueCents: 0, lowEstimateCents: 0 })
        .success,
    ).toBe(true);
    expect(conservativeValuation(valuation, 'low')).toBeNull();
    expect(conservativeValuation({ ...valuation, confidence: 'high' }, 'high')?.confidence).toBe(
      'medium',
    );
    expect(conservativeValuation(valuation, 'medium')?.confidence).toBe('low');
    expect(gain(37500, 50000)).toEqual({ cents: -12500, percent: -25 });
    expect(gain(100, 0)).toEqual({ cents: 100, percent: null });
    expect(gain(null, 100)).toEqual({ cents: null, percent: null });
  });
  it('keeps legacy and unvalued creation available without AI or history guesses', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const i = await create();
    expect(i.estimatedValueCents).toBeNull();
    expect(i.valuationUpdatedAt).toBeNull();
    expect((await user.get(`/api/inventory/${i.id}/valuations`)).body).toEqual([]);
    expect((await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).status).toBe(
      503,
    );
    expect((await user.get('/api/portfolio/valuation')).body).toMatchObject({
      totalValueCents: 0,
      totalSpentCents: 100000,
      gainPercent: -100,
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('saves a reviewed initial AI valuation atomically and calculates portfolio totals', async () => {
    const i = await create({ initialValuation: valuation });
    expect(i).toMatchObject({
      estimatedValueCents: 37500,
      manualValueOverrideCents: null,
      aiValuation: valuation,
    });
    const history = (await user.get(`/api/inventory/${i.id}/valuations`)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ source: 'ai', effectiveValueCents: 37500 });
    expect((await user.get('/api/portfolio/valuation')).body).toMatchObject({
      totalValueCents: 75000,
      totalSpentCents: 100000,
      gainCents: -25000,
      gainPercent: -25,
      comparableGainPercent: -25,
      categories: [{ name: 'GPU', valueCents: 75000 }],
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('refreshes into history, requires review, and applies idempotently', async () => {
    const i = await create();
    const record = await refresh(i.id);
    expect(record.appliedAt).toBeNull();
    expect((await user.get(`/api/inventory/${i.id}`)).body.estimatedValueCents).toBeNull();
    expect((await apply(i.id, record.id)).body.estimatedValueCents).toBe(37500);
    expect((await apply(i.id, record.id)).status).toBe(200);
    expect((await user.get(`/api/inventory/${i.id}/valuations`)).body).toHaveLength(1);
    const body = JSON.parse(String(upstream.mock.calls[0][1]?.body));
    expect(body.model).toBe('test-value-model');
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content[0].text).toContain('RTX 3070 Ti');
    expect((await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).status).toBe(
      429,
    );
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('preserves manual overrides through refresh and unrelated edits, including zero', async () => {
    const i = await create({ estimatedValueCents: 0 });
    const record = await refresh(i.id);
    expect((await apply(i.id, record.id)).body).toMatchObject({
      estimatedValueCents: 0,
      manualValueOverrideCents: 0,
      aiValuation: valuation,
    });
    const saved = (await user.get(`/api/inventory/${i.id}`)).body;
    expect(
      (
        await user
          .put(`/api/inventory/${i.id}`)
          .set(headers)
          .send({ ...saved, name: 'Renamed GPU' })
      ).body.manualValueOverrideCents,
    ).toBe(0);
    const cleared = await user
      .put(`/api/inventory/${i.id}/manual-value`)
      .set(headers)
      .send({ valueCents: null });
    expect(cleared.body).toMatchObject({
      estimatedValueCents: 37500,
      manualValueOverrideCents: null,
    });
    expect((await user.get(`/api/inventory/${i.id}/valuations`)).body).toHaveLength(3);
    const updated = await user
      .put(`/api/inventory/${i.id}/manual-value`)
      .set(headers)
      .send({ valueCents: 40000 });
    expect(updated.body.estimatedValueCents).toBe(40000);
  });
  it('replaces a manual override only when explicitly requested', async () => {
    const i = await create({ estimatedValueCents: 42000 });
    const record = await refresh(i.id);
    expect((await apply(i.id, record.id, true)).body).toMatchObject({
      estimatedValueCents: 37500,
      manualValueOverrideCents: null,
    });
  });
  it('rejects stale proposals after hardware edits', async () => {
    const i = await create();
    const record = await refresh(i.id);
    await user
      .put(`/api/inventory/${i.id}`)
      .set(headers)
      .send({ ...input, name: 'Different model' });
    expect((await apply(i.id, record.id)).status).toBe(409);
  });
  it('invalidates system proposals when installed part details change', async () => {
    const part = await create({ quantity: 1 });
    const repo = new Repository(db, owner);
    const pc = repo.saveItem(
      itemSchema.parse({
        name: 'PC',
        category: 'Desktop Computer',
        kind: 'System',
        quantity: 1,
        condition: 'Good',
        status: 'Available',
        systemSpecs: {},
      }),
    );
    repo.install(pc.id, part.id, 1);
    const record = await refresh(pc.id);
    repo.saveItem(itemSchema.parse({ ...part, model: 'A different GPU' }), part.id, true);
    expect((await apply(pc.id, record.id)).status).toBe(409);
  });
  it('enforces authentication, ownership and CSRF on every valuation operation', async () => {
    const i = await create();
    const record = await refresh(i.id);
    const other = request.agent(app);
    await other
      .post('/api/auth/register')
      .set(headers)
      .send({ name: 'Other', email: 'other@example.com', password: 'other-test-password' });
    for (const agent of [request(app), other]) {
      const status = agent === other ? 404 : 401;
      expect((await agent.get(`/api/inventory/${i.id}/valuations`)).status).toBe(status);
      expect(
        (await agent.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).status,
      ).toBe(status);
      expect(
        (
          await agent
            .put(`/api/inventory/${i.id}/valuation`)
            .set(headers)
            .send({ valuationId: record.id })
        ).status,
      ).toBe(status);
      expect(
        (
          await agent
            .put(`/api/inventory/${i.id}/manual-value`)
            .set(headers)
            .send({ valueCents: 1 })
        ).status,
      ).toBe(status);
    }
    expect((await request(app).get('/api/portfolio/valuation')).status).toBe(401);
    expect((await request(app).get('/api/portfolio/valuation-history')).status).toBe(401);
    expect((await other.get('/api/portfolio/valuation')).body.totalValueCents).toBe(0);
    expect((await other.get('/api/portfolio/valuation-history')).body).toEqual([]);
    expect((await user.post('/api/hardware/valuation').send(input)).status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each([401, 429, 500])(
    'handles provider HTTP %s without losing equipment or value',
    async (status) => {
      const i = await create({ estimatedValueCents: 12300 });
      upstream.mockResolvedValueOnce(Response.json({ error: 'private' }, { status }));
      const r = await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({});
      expect(r.status).toBe(status === 401 ? 503 : status === 500 ? 502 : 429);
      expect(JSON.stringify(r.body)).not.toContain('private');
      expect((await user.get(`/api/inventory/${i.id}`)).body.estimatedValueCents).toBe(12300);
      expect((await user.get(`/api/inventory/${i.id}/valuations`)).body).toHaveLength(1);
    },
  );
  it('handles timeout, malformed output, reversed ranges and insufficient identity', async () => {
    const i = await create();
    upstream.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    expect((await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).status).toBe(
      504,
    );
    for (const result of [
      { valuation: { ...valuation, lowEstimateCents: 90000 }, message: '' },
      { valuation: { ...valuation, currency: 'EUR' }, message: '' },
      { oops: 1 },
    ]) {
      upstream.mockResolvedValueOnce(response(result));
      expect(
        (await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).status,
      ).toBe(502);
    }
    upstream.mockResolvedValueOnce(
      response({ valuation: null, message: 'Confirm GPU model and memory.' }),
    );
    expect(
      (await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({})).body,
    ).toMatchObject({ record: null, message: 'Confirm GPU model and memory.' });
    expect((await user.get(`/api/inventory/${i.id}/valuations`)).body).toEqual([]);
  });
  it('rejects concurrent duplicate estimates without a second paid call', async () => {
    const i = await create();
    let resolveFetch: (response: Response) => void = () => {};
    upstream.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const first = user
      .post(`/api/inventory/${i.id}/valuation`)
      .set(headers)
      .send({})
      .then((r) => r);
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
    const second = await user.post(`/api/inventory/${i.id}/valuation`).set(headers).send({});
    expect(second.status).toBe(409);
    resolveFetch(response());
    expect((await first).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('limits explicit draft requests without background requests', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    for (let i = 0; i < 20; i++)
      await user.post('/api/hardware/valuation').set(headers).send(input);
    expect((await user.post('/api/hardware/valuation').set(headers).send(input)).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('records quantity, installation, archive and deletion changes without double counting', async () => {
    const part = await create({ estimatedValueCents: 1000, purchasePriceCents: 2000, quantity: 3 });
    const r = new Repository(db, owner);
    const computer = r.saveItem(
      itemSchema.parse({
        name: 'PC',
        category: 'Desktop Computer',
        kind: 'System',
        quantity: 1,
        condition: 'Good',
        status: 'Available',
        systemSpecs: {},
        estimatedValueCents: 10000,
        purchasePriceCents: 20000,
      }),
    );
    r.install(computer.id, part.id, 2);
    expect((await user.get('/api/portfolio/valuation')).body).toMatchObject({
      totalValueCents: 11000,
      totalSpentCents: 22000,
    });
    const before = r.portfolioEvents().slice();
    r.saveItem(itemSchema.parse({ ...computer, status: 'Archived' }), computer.id, true);
    expect((await user.get('/api/portfolio/valuation')).body.totalValueCents).toBe(1000);
    r.deleteItem(computer.id);
    expect((await user.get('/api/portfolio/valuation')).body.totalValueCents).toBe(3000);
    r.saveItem(itemSchema.parse({ ...part, quantity: 2 }), part.id, true);
    expect((await user.get('/api/portfolio/valuation')).body.totalValueCents).toBe(2000);
    r.deleteItem(part.id);
    expect(r.portfolioEvents().slice(0, before.length)).toEqual(before);
    expect((await user.get('/api/portfolio/valuation-history')).body.at(-1).valueCents).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM equipment_valuations').get()).toEqual({ n: 0 });
  });
  it('rolls back initial valuations and events when a system bundle fails', async () => {
    const r = new Repository(db, owner);
    expect(() =>
      r.createSystem(
        itemSchema.parse({
          name: 'PC',
          category: 'Desktop Computer',
          kind: 'System',
          quantity: 1,
          condition: 'Good',
          status: 'Available',
          systemSpecs: {},
          initialValuation: valuation,
        }),
        [itemSchema.parse({ ...input, locationId: 'not-owned', initialValuation: valuation })],
      ),
    ).toThrow();
    expect(r.inventory()).toEqual([]);
    expect(r.portfolioEvents()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) n FROM equipment_valuations').get()).toEqual({ n: 0 });
  });
  it('uses partial computer values and comparable gains without treating missing cost as zero profit', async () => {
    await create({ estimatedValueCents: 5000, purchasePriceCents: null, quantity: 1 });
    const known = await create({
      estimatedValueCents: 1000,
      purchasePriceCents: 2000,
      quantity: 1,
    });
    const r = new Repository(db, owner);
    const pc = r.saveItem(
      itemSchema.parse({
        name: 'PC',
        category: 'Desktop Computer',
        kind: 'System',
        quantity: 1,
        condition: 'Good',
        status: 'Available',
        systemSpecs: {},
      }),
    );
    r.install(pc.id, known.id, 1);
    expect((await user.get('/api/portfolio/valuation')).body).toMatchObject({
      totalValueCents: 6000,
      totalSpentCents: 2000,
      comparableGainCents: -1000,
      comparableGainPercent: -50,
    });
  });
  it('carries recorded values forward and uses the last event for a day', () => {
    const events = [
      { sequence: 1, itemId: 'a', valueCents: 100, createdAt: '2026-01-01T00:00:00Z' },
      { sequence: 2, itemId: 'b', valueCents: 200, createdAt: '2026-02-01T00:00:00Z' },
      { sequence: 3, itemId: 'a', valueCents: 90, createdAt: '2026-02-01T01:00:00Z' },
      { sequence: 4, itemId: 'b', valueCents: 0, createdAt: '2026-03-01T00:00:00Z' },
    ];
    expect(portfolioHistory(events).slice(0, 3)).toEqual([
      { date: '2026-01-01', valueCents: 100 },
      { date: '2026-02-01', valueCents: 290 },
      { date: '2026-03-01', valueCents: 90 },
    ]);
  });
});
