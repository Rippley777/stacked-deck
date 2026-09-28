import { afterAll, beforeAll, expect, test } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openSqlServerStore, execute, type SqlServerStore } from '../server/sqlserver-store.js';
import { createApp } from '../server/app.js';
const enabled = process.env.RUN_SQLSERVER_TESTS === '1';
let store: SqlServerStore;
const userIds: string[] = [];
beforeAll(async () => {
  if (enabled) store = await openSqlServerStore();
}, 120000);
afterAll(async () => {
  if (!enabled || !store) return;
  try {
    for (const userId of userIds)
      await execute(
        store.pool,
        'DELETE FROM projects WHERE userId=@userId; DELETE FROM inventory_items WHERE userId=@userId; DELETE FROM locations WHERE userId=@userId; DELETE FROM categories WHERE userId=@userId; DELETE FROM tags WHERE userId=@userId; DELETE FROM users WHERE id=@userId;',
        { userId },
      );
  } finally {
    await store.close();
  }
}, 60000);
test.skipIf(!enabled)(
  'Azure SQL preserves private inventories and transactional allocations',
  async () => {
    const app = createApp(store);
    const alice = request.agent(app);
    const bob = request.agent(app);
    const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
    for (const [index, agent] of [alice, bob].entries()) {
      const response = await agent
        .post('/api/auth/register')
        .set(headers)
        .send({
          name: 'Azure integration test',
          email: `azure-test-${randomUUID()}-${index}@example.com`,
          password: 'azure-integration-password-123',
        });
      expect(response.status).toBe(201);
      userIds.push(response.body.id);
    }
    const location = await alice
      .post('/api/locations')
      .set(headers)
      .send({ name: 'Office → Bin 3' });
    expect(location.status).toBe(201);
    const input = {
      name: 'Integration Raspberry Pi',
      category: 'Raspberry Pi',
      quantity: 3,
      condition: 'Good',
      status: 'Available',
      tags: ['ARM64'],
      locationId: location.body.id,
      estimatedValueCents: 6500,
    };
    const card = await alice.post('/api/inventory').set(headers).send(input);
    expect(card.status).toBe(201);
    expect(card.body.tags).toEqual(['arm64']);
    expect(card.body.createdAt).toMatch(/Z$/);
    expect((await bob.get(`/api/inventory/${card.body.id}`)).status).toBe(404);
    expect((await bob.put(`/api/inventory/${card.body.id}`).set(headers).send(input)).status).toBe(
      404,
    );
    expect((await bob.post('/api/inventory').set(headers).send(input)).status).toBe(400);
    expect((await alice.get('/api/inventory?tag=arm64')).body.total).toBe(1);
    const projects = [];
    for (const name of ['First plan', 'Second plan']) {
      const response = await alice
        .post('/api/projects')
        .set(headers)
        .send({
          name,
          status: 'Planning',
          requirements: [{ name: 'Host', categories: ['Raspberry Pi'], quantity: 1 }],
        });
      expect(response.status).toBe(201);
      projects.push(response.body);
    }
    const attempts = await Promise.all(
      projects.map((p) =>
        alice
          .post(`/api/projects/${p.id}/assignments`)
          .set(headers)
          .send({ itemId: card.body.id, quantity: 2 }),
      ),
    );
    expect(attempts.map((a) => a.status).sort()).toEqual([201, 409]);
    const winner = projects[attempts.findIndex((a) => a.status === 201)];
    expect((await alice.get(`/api/inventory/${card.body.id}`)).body.availableQuantity).toBe(1);
    expect((await alice.get(`/api/projects/${winner.id}/compatibility`)).body.readiness).toBe(100);
    expect(
      (
        await alice
          .put(`/api/inventory/${card.body.id}`)
          .set(headers)
          .send({ ...input, status: 'Archived' })
      ).status,
    ).toBe(409);
    expect((await alice.get('/api/recommendations')).body).toHaveLength(11);
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(19500);
    expect(
      (
        await alice
          .put(`/api/projects/${winner.id}`)
          .set(headers)
          .send({ name: winner.name, status: 'Abandoned' })
      ).status,
    ).toBe(200);
    expect((await alice.get(`/api/inventory/${card.body.id}`)).body.availableQuantity).toBe(3);
    expect((await alice.delete(`/api/locations/${location.body.id}`).set(headers)).status).toBe(
      204,
    );
    expect((await alice.get(`/api/inventory/${card.body.id}`)).body.locationId).toBeNull();
    expect((await alice.delete(`/api/inventory/${card.body.id}`).set(headers)).status).toBe(204);
    expect((await alice.post('/api/auth/logout').set(headers).send({})).status).toBe(204);
    expect((await alice.get('/api/auth/me')).status).toBe(401);
  },
  120000,
);
