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
      connectivity: {
        version: 1,
        power: { voltage: 5, current: 3, connector: { connector: 'USB-C' } },
      },
    };
    const card = await alice.post('/api/inventory').set(headers).send(input);
    expect(card.status).toBe(201);
    expect(card.body.tags).toEqual(['arm64']);
    expect(card.body.connectivity).toEqual(input.connectivity);
    expect((await bob.get(`/api/inventory/${card.body.id}/compatibility`)).status).toBe(404);
    expect(card.body.createdAt).toMatch(/Z$/);
    expect((await bob.get(`/api/inventory/${card.body.id}`)).status).toBe(404);
    expect((await bob.put(`/api/inventory/${card.body.id}`).set(headers).send(input)).status).toBe(
      404,
    );
    expect((await bob.post('/api/inventory').set(headers).send(input)).status).toBe(400);
    expect((await alice.get('/api/inventory?tag=arm64')).body.total).toBe(1);
    const computerInput = {
      kind: 'System',
      name: 'SQL test desktop',
      category: 'Desktop Computer',
      quantity: 1,
      condition: 'Good',
      status: 'Available',
      estimatedValueCents: 100000,
      systemSpecs: { buildType: 'Custom build', processor: 'Ryzen 7', memoryGB: 32 },
    };
    const computer = await alice.post('/api/inventory').set(headers).send(computerInput);
    expect(computer.status).toBe(201);
    expect(computer.body.systemSpecs.memoryGB).toBe(32);
    expect((await alice.get('/api/inventory?kind=System&q=Ryzen')).body.total).toBe(1);
    const ram = await alice
      .post('/api/inventory')
      .set(headers)
      .send({ ...input, name: 'SQL test RAM', category: 'RAM', estimatedValueCents: 5000 });
    const linked = await alice
      .post(`/api/inventory/${computer.body.id}/components`)
      .set(headers)
      .send({ itemId: ram.body.id, quantity: 2 });
    expect(linked.status).toBe(201);
    expect((await alice.get(`/api/inventory/${ram.body.id}`)).body.availableQuantity).toBe(1);
    expect((await alice.get(`/api/inventory/${ram.body.id}`)).body.installedIn[0].systemId).toBe(
      computer.body.id,
    );
    expect(
      (
        await bob
          .post(`/api/inventory/${computer.body.id}/components`)
          .set(headers)
          .send({ itemId: ram.body.id, quantity: 1 })
      ).status,
    ).toBe(404);
    const competing = await alice
      .post('/api/projects')
      .set(headers)
      .send({ name: 'Competing SQL build', status: 'Planning' });
    expect(
      (
        await alice
          .post(`/api/projects/${competing.body.id}/assignments`)
          .set(headers)
          .send({ itemId: ram.body.id, quantity: 2 })
      ).status,
    ).toBe(409);
    expect((await alice.delete(`/api/inventory/${ram.body.id}`).set(headers)).status).toBe(409);
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(124500);
    expect(
      (
        await alice
          .put(`/api/inventory/${computer.body.id}`)
          .set(headers)
          .send({ ...computerInput, systemSpecs: { memoryGB: 64 } })
      ).status,
    ).toBe(200);
    expect((await alice.get(`/api/inventory/${computer.body.id}`)).body.systemSpecs.memoryGB).toBe(
      64,
    );
    expect(
      (
        await alice
          .delete(`/api/inventory/${computer.body.id}/components/${linked.body.components[0].id}`)
          .set(headers)
      ).status,
    ).toBe(204);
    expect((await alice.get(`/api/inventory/${ram.body.id}`)).body.availableQuantity).toBe(3);
    expect(
      (
        await alice
          .post(`/api/inventory/${computer.body.id}/components`)
          .set(headers)
          .send({ itemId: ram.body.id, quantity: 3 })
      ).status,
    ).toBe(201);
    expect((await alice.delete(`/api/inventory/${computer.body.id}`).set(headers)).status).toBe(
      204,
    );
    expect((await alice.get(`/api/inventory/${ram.body.id}`)).body.availableQuantity).toBe(3);
    await alice.delete(`/api/inventory/${ram.body.id}`).set(headers);
    await alice.delete(`/api/projects/${competing.body.id}`).set(headers);
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
    expect((await alice.get('/api/portfolio/valuation')).body.totalValueCents).toBe(19500);
    expect((await alice.get(`/api/inventory/${card.body.id}/valuations`)).body).toHaveLength(1);
    expect((await bob.get(`/api/inventory/${card.body.id}/valuations`)).status).toBe(404);
    const manual = await alice
      .put(`/api/inventory/${card.body.id}/manual-value`)
      .set(headers)
      .send({ valueCents: 6000 });
    expect(manual.status).toBe(200);
    expect(manual.body.manualValueOverrideCents).toBe(6000);
    expect((await alice.get('/api/portfolio/valuation-history')).body.at(-1).valueCents).toBe(
      18000,
    );
    expect((await alice.get(`/api/inventory/${card.body.id}/valuations`)).body).toHaveLength(2);

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
