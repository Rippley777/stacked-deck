import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { cookieName } from '../server/auth.js';
const db = openDatabase(':memory:');
const app = createApp(db);
const alice = request.agent(app);
const bob = request.agent(app);
const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const itemInput = {
  name: 'Raspberry Pi 4',
  category: 'Raspberry Pi',
  quantity: 3,
  condition: 'Good',
  status: 'Available',
  tags: ['ARM64'],
  estimatedValueCents: 6500,
};
let itemId: string;
let projectId: string;
let locationId: string;
beforeAll(async () => {
  expect(
    (
      await alice
        .post('/api/auth/register')
        .set(headers)
        .send({ name: 'Alice', email: 'ALICE@example.com', password: 'strong-test-password-123' })
    ).status,
  ).toBe(201);
  expect(
    (
      await bob
        .post('/api/auth/register')
        .set(headers)
        .send({ name: 'Bob', email: 'bob@example.com', password: 'another-test-password-123' })
    ).status,
  ).toBe(201);
});
afterAll(() => db.close());
describe('authenticated core loop', () => {
  it('protects all application endpoints', async () => {
    expect((await request(app).get('/api/inventory')).status).toBe(401);
    expect((await request(app).get('/api/projects')).status).toBe(401);
  });
  it('stores hashed passwords and hashed persistent session tokens', async () => {
    const identity = db.prepare('SELECT passwordHash FROM identities LIMIT 1').get() as {
      passwordHash: string;
    };
    expect(identity.passwordHash).toMatch(/^scrypt:/);
    expect(identity.passwordHash).not.toContain('strong-test');
    const response = await request(app)
      .post('/api/auth/login')
      .set(headers)
      .send({ email: 'alice@example.com', password: 'strong-test-password-123' });
    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie'][1] || response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const raw = cookie.match(new RegExp(`${cookieName}=([^;]+)`))?.[1];
    expect(raw).toBeTruthy();
    expect(db.prepare('SELECT tokenHash FROM sessions WHERE tokenHash=?').get(raw)).toBeUndefined();
    expect(response.body.passwordHash).toBeUndefined();
  });
  it('creates a location and custom-category hardware with normalized tags', async () => {
    const loc = await alice.post('/api/locations').set(headers).send({ name: 'Office → Bin 3' });
    expect(loc.status).toBe(201);
    locationId = loc.body.id;
    const response = await alice
      .post('/api/inventory')
      .set(headers)
      .send({ ...itemInput, locationId });
    expect(response.status).toBe(201);
    itemId = response.body.id;
    expect(response.body.tags).toEqual(['arm64']);
    expect(response.body.locationName).toBe('Office → Bin 3');
    expect(response.body.availableQuantity).toBe(3);
  });
  it('isolates lists, details, edits, deletes, and location foreign keys', async () => {
    expect((await bob.get('/api/inventory')).body.total).toBe(0);
    expect((await bob.get(`/api/inventory/${itemId}`)).status).toBe(404);
    expect((await bob.put(`/api/inventory/${itemId}`).set(headers).send(itemInput)).status).toBe(
      404,
    );
    expect((await bob.delete(`/api/inventory/${itemId}`).set(headers)).status).toBe(404);
    expect(
      (
        await bob
          .post('/api/inventory')
          .set(headers)
          .send({ ...itemInput, locationId })
      ).status,
    ).toBe(400);
    expect((await bob.delete(`/api/locations/${locationId}`).set(headers)).status).toBe(404);
  });
  it('filters text, category, location, tags and availability', async () => {
    for (const query of [
      'q=raspberry',
      'category=Raspberry%20Pi',
      `locationId=${locationId}`,
      'tag=arm64',
      'status=Available',
    ])
      expect((await alice.get(`/api/inventory?${query}`)).body.total).toBe(1);
    expect((await alice.get('/api/inventory?q=nothing')).body.total).toBe(0);
  });
  it('validates negative money, quantities, unsafe URLs, and impossible dates', async () => {
    for (const invalid of [
      { quantity: -1 },
      { purchasePriceCents: -1 },
      { imageUrl: 'javascript:alert(1)' },
      { purchaseDate: '2026-02-31' },
    ])
      expect(
        (
          await alice
            .post('/api/inventory')
            .set(headers)
            .send({ ...itemInput, ...invalid })
        ).status,
      ).toBe(400);
  });
  it('creates a project and reserves only assigned quantities', async () => {
    const p = await alice
      .post('/api/projects')
      .set(headers)
      .send({
        name: 'Pi cluster',
        status: 'Planning',
        requirements: [{ name: 'Nodes', categories: ['Raspberry Pi'], quantity: 3 }],
      });
    expect(p.status).toBe(201);
    projectId = p.body.id;
    const assigned = await alice
      .post(`/api/projects/${projectId}/assignments`)
      .set(headers)
      .send({ itemId, quantity: 2 });
    expect(assigned.status).toBe(201);
    const i = await alice.get(`/api/inventory/${itemId}`);
    expect(i.body.availableQuantity).toBe(1);
    expect(i.body.assignments[0].projectName).toBe('Pi cluster');
    expect((await alice.get('/api/inventory?status=Reserved')).body.total).toBe(1);
    expect((await alice.get(`/api/projects/${projectId}/compatibility`)).body.readiness).toBe(100);
  });
  it('rejects cross-user project access and assignment references', async () => {
    expect((await bob.get('/api/projects')).body).toEqual([]);
    expect((await bob.get(`/api/projects/${projectId}/compatibility`)).status).toBe(404);
    expect(
      (
        await bob
          .post(`/api/projects/${projectId}/assignments`)
          .set(headers)
          .send({ itemId, quantity: 1 })
      ).status,
    ).toBe(404);
    const bp = await bob
      .post('/api/projects')
      .set(headers)
      .send({ name: 'Bob project', status: 'Idea' });
    expect(
      (
        await bob
          .post(`/api/projects/${bp.body.id}/assignments`)
          .set(headers)
          .send({ itemId, quantity: 1 })
      ).status,
    ).toBe(404);
  });
  it('rejects over-allocation, shrinking below assignments, and archiving assigned units', async () => {
    expect(
      (
        await alice
          .post(`/api/projects/${projectId}/assignments`)
          .set(headers)
          .send({ itemId, quantity: 2 })
      ).status,
    ).toBe(409);
    expect(
      (
        await alice
          .put(`/api/inventory/${itemId}`)
          .set(headers)
          .send({ ...itemInput, quantity: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await alice
          .put(`/api/inventory/${itemId}`)
          .set(headers)
          .send({ ...itemInput, status: 'Archived' })
      ).status,
    ).toBe(409);
    expect((await alice.delete(`/api/inventory/${itemId}`).set(headers)).status).toBe(409);
  });
  it('keeps completed build hardware in use and releases abandoned builds', async () => {
    await alice
      .put(`/api/projects/${projectId}`)
      .set(headers)
      .send({ name: 'Pi cluster', status: 'Complete' });
    expect((await alice.get('/api/inventory?status=In%20Use')).body.total).toBe(1);
    expect((await alice.get(`/api/inventory/${itemId}`)).body.availableQuantity).toBe(1);
    await alice
      .put(`/api/projects/${projectId}`)
      .set(headers)
      .send({ name: 'Pi cluster', status: 'Abandoned' });
    expect((await alice.get(`/api/inventory/${itemId}`)).body.availableQuantity).toBe(3);
  });
  it('seeds useful recommendations and creates a template project without claiming parts', async () => {
    const rs = await alice.get('/api/recommendations');
    expect(rs.body).toHaveLength(11);
    expect(rs.body[0].required).toBeInstanceOf(Array);
    const p = await alice.post('/api/templates/pihole/projects').set(headers).send({});
    expect(p.status).toBe(201);
    expect(p.body.requirements.length).toBeGreaterThan(0);
    expect(p.body.assignments).toEqual([]);
  });
  it('removes locations without deleting inventory', async () => {
    expect((await alice.delete(`/api/locations/${locationId}`).set(headers)).status).toBe(204);
    expect((await alice.get(`/api/inventory/${itemId}`)).body.locationId).toBeNull();
  });
  it('archives, restores, and deletes hardware', async () => {
    expect(
      (
        await alice
          .put(`/api/inventory/${itemId}`)
          .set(headers)
          .send({ ...itemInput, status: 'Archived' })
      ).status,
    ).toBe(200);
    expect((await alice.get('/api/inventory')).body.total).toBe(0);
    expect((await alice.get('/api/inventory?status=Archived')).body.total).toBe(1);
    await alice.put(`/api/inventory/${itemId}`).set(headers).send(itemInput);
    expect((await alice.delete(`/api/inventory/${itemId}`).set(headers)).status).toBe(204);
  });
  it('rejects cross-origin writes, missing anti-CSRF header, and short passwords', async () => {
    expect(
      (
        await alice
          .post('/api/locations')
          .set({ ...headers, Origin: 'https://evil.example' })
          .send({ name: 'Bad' })
      ).status,
    ).toBe(403);
    expect((await alice.post('/api/locations').send({ name: 'Bad' })).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set(headers)
          .send({ name: 'Short', email: 'short@example.com', password: 'short' })
      ).status,
    ).toBe(400);
  });
  it('rejects bad credentials and duplicate accounts, and invalidates sessions on logout', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set(headers)
          .send({ email: 'alice@example.com', password: 'incorrect-password' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app).post('/api/auth/register').set(headers).send({
          name: 'Duplicate',
          email: 'alice@example.com',
          password: 'strong-test-password-123',
        })
      ).status,
    ).toBe(409);
    expect((await alice.post('/api/auth/logout').set(headers).send({})).status).toBe(204);
    expect((await alice.get('/api/auth/me')).status).toBe(401);
  });
});

describe('production and reservation invariants', () => {
  it('sets Secure cookies and security headers in production', async () => {
    const localDb = openDatabase(':memory:');
    try {
      const productionApp = createApp(localDb, {
        production: true,
        origin: 'https://deck.example.com',
      });
      const response = await request(productionApp)
        .post('/api/auth/register')
        .set({ 'X-Stacked-Deck': '1', Origin: 'https://deck.example.com' })
        .send({
          name: 'Secure',
          email: 'secure@example.com',
          password: 'secure-test-password-123',
        });
      expect(response.status).toBe(201);
      expect(response.headers['set-cookie'].join(';')).toContain('Secure');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      localDb.close();
    }
  });
  it('expires server-side sessions', async () => {
    const localDb = openDatabase(':memory:');
    try {
      const agent = request.agent(createApp(localDb));
      await agent.post('/api/auth/register').set(headers).send({
        name: 'Expires',
        email: 'expire@example.com',
        password: 'expires-test-password-123',
      });
      localDb.prepare('UPDATE sessions SET expiresAt=?').run(Date.now() - 1000);
      expect((await agent.get('/api/auth/me')).status).toBe(401);
    } finally {
      localDb.close();
    }
  });
  it('serializes competing assignments and releases units when a project is deleted', async () => {
    const localDb = openDatabase(':memory:');
    try {
      const agent = request.agent(createApp(localDb));
      await agent
        .post('/api/auth/register')
        .set(headers)
        .send({ name: 'Race', email: 'race@example.com', password: 'competing-test-password-123' });
      const card = await agent
        .post('/api/inventory')
        .set(headers)
        .send({ ...itemInput, quantity: 1 });
      const p1 = await agent
        .post('/api/projects')
        .set(headers)
        .send({ name: 'First', status: 'Ready' });
      const p2 = await agent
        .post('/api/projects')
        .set(headers)
        .send({ name: 'Second', status: 'Ready' });
      const results = await Promise.all(
        [p1, p2].map((p) =>
          agent
            .post(`/api/projects/${p.body.id}/assignments`)
            .set(headers)
            .send({ itemId: card.body.id, quantity: 1 }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const winner = results.findIndex((r) => r.status === 201);
      await agent.delete(`/api/projects/${[p1, p2][winner].body.id}`).set(headers);
      expect((await agent.get(`/api/inventory/${card.body.id}`)).body.availableQuantity).toBe(1);
    } finally {
      localDb.close();
    }
  });
});

describe('Azure proxy authentication limits', () => {
  it.each(['203.0.113.7', '[2001:db8::7]'])(
    'limits a client with changing source ports: %s',
    async (address) => {
      const localDb = openDatabase(':memory:');
      try {
        const proxyApp = createApp(localDb, { trustProxy: 1 });
        for (let attempt = 0; attempt < 31; attempt++) {
          const response = await request(proxyApp)
            .post('/api/auth/login')
            .set(headers)
            .set('X-Forwarded-For', `${address}:${50000 + attempt}`)
            .send({ email: 'invalid', password: 'unused' });
          expect(response.status).toBe(attempt < 30 ? 400 : 429);
        }
      } finally {
        localDb.close();
      }
    },
  );
});
