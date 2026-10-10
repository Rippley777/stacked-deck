import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../server/db';
import { createApp } from '../server/app';
import type { InventoryItem } from '../shared/types';
const db = openDatabase(':memory:');
const app = createApp(db);
const alice = request.agent(app),
  bob = request.agent(app);
const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const input = {
  name: 'Raspberry Pi 4 Model B 8GB',
  manufacturer: 'Raspberry Pi',
  model: '4 Model B 8GB',
  category: 'Raspberry Pi',
  quantity: 3,
  condition: 'Good',
  status: 'Available',
};
const create = async (extra = {}) => {
  const result = await alice
    .post('/api/inventory')
    .set(headers)
    .send({ ...input, ...extra });
  expect(result.status).toBe(201);
  return result.body as InventoryItem;
};
const duplicates = (draft: object) =>
  alice.post('/api/hardware/duplicates').set(headers).send(draft);
const add = (id: string, draft: object = input, addQuantity = 1) =>
  alice.put(`/api/inventory/${id}`).set(headers).send({ addQuantity, draft });
beforeAll(async () => {
  for (const [name, agent] of [
    ['alice', alice],
    ['bob', bob],
  ] as const)
    expect(
      (
        await agent
          .post('/api/auth/register')
          .set(headers)
          .send({
            name,
            email: `${name}@duplicates.test`,
            password: 'duplicate-tests-password-123',
          })
      ).status,
    ).toBe(201);
});
afterAll(() => db.close());

describe('owner scoped duplicate API and quantity updates', () => {
  it('finds normalized serials only in the current user inventory, including sold and archived', async () => {
    const own = await create({ serialNumber: 'ABC123', status: 'Archived' });
    const sold = await create({ serialNumber: 'ABC123', status: 'Sold' });
    const foreign = await bob
      .post('/api/inventory')
      .set(headers)
      .send({ ...input, serialNumber: 'ABC123' });
    const result = await duplicates({ serialNumber: ' abc123 ' });
    expect(result.status).toBe(200);
    expect(result.body.items.map((i: { itemId: string }) => i.itemId).sort()).toEqual(
      [own.id, sold.id].sort(),
    );
    expect(
      result.body.items.every((i: { matchStrength: string }) => i.matchStrength === 'exact'),
    ).toBe(true);
    const other = await bob
      .post('/api/hardware/duplicates')
      .set(headers)
      .send({ serialNumber: 'abc123' });
    expect(other.body.items.map((i: { itemId: string }) => i.itemId)).toEqual([foreign.body.id]);
    expect(
      (
        await bob
          .put(`/api/inventory/${own.id}`)
          .set(headers)
          .send({ addQuantity: 1, draft: input })
      ).status,
    ).toBe(404);
    expect((await duplicates({ serialNumber: 123 })).status).toBe(400);
    expect((await duplicates({ name: 'USB cable' })).body.items).toEqual([]);
  });
  it('increments 3 to 4 through the existing PUT API without creating a card or losing metadata', async () => {
    const own = await create({ notes: 'Keep this', tags: ['spare'], estimatedValueCents: 6000 });
    const result = await add(own.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      id: own.id,
      quantity: 4,
      availableQuantity: 4,
      notes: 'Keep this',
      tags: ['spare'],
      estimatedValueCents: 6000,
    });
    const results = await Promise.all([add(own.id), add(own.id)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await alice.get(`/api/inventory/${own.id}`)).body.quantity).toBe(6);
    for (const quantity of [0, -1, 1.5, 100001])
      expect((await add(own.id, input, quantity)).status).toBe(400);
    expect((await add(own.id, input, 100000)).status).toBe(400);
  });
  it('rechecks serialized, archived, system, location and metadata guards on the server', async () => {
    const location = await alice
      .post('/api/locations')
      .set(headers)
      .send({ name: 'Office → Shelf 3' });
    for (const extra of [
      { serialNumber: 'ABC' },
      { status: 'Archived' },
      { status: 'Sold' },
      { locationId: location.body.id },
      { condition: 'Fair' },
    ]) {
      const own = await create(extra);
      expect((await add(own.id)).status).toBe(409);
      expect((await alice.get(`/api/inventory/${own.id}`)).body.quantity).toBe(3);
    }
    const system = await create({
      kind: 'System',
      category: 'Desktop Computer',
      quantity: 1,
      systemSpecs: {},
    });
    expect((await add(system.id)).status).toBe(409);
    const own = await create();
    expect((await add(own.id, { ...input, model: '5 Model B' })).status).toBe(409);
    expect((await add(own.id, { ...input, notes: 'Different metadata' })).status).toBe(409);
    // Warnings are advisory: the ordinary create route still allows intentional separate cards.
    expect(
      (
        await alice
          .post('/api/inventory')
          .set(headers)
          .send({ ...input, serialNumber: 'ABC123' })
      ).status,
    ).toBe(201);
  });
  it('includes human-readable installation/project state and refuses ambiguous additions', async () => {
    const installed = await create({ model: 'installed-test' });
    const assigned = await create({ model: 'assigned-test' });
    const system = await create({
      name: 'Gaming PC',
      kind: 'System',
      category: 'Desktop Computer',
      quantity: 1,
      systemSpecs: {},
    });
    expect(
      (
        await alice
          .post(`/api/inventory/${system.id}/components`)
          .set(headers)
          .send({ itemId: installed.id, quantity: 1 })
      ).status,
    ).toBe(201);
    const project = await alice
      .post('/api/projects')
      .set(headers)
      .send({ name: 'Cluster build', status: 'Planning' });
    expect(
      (
        await alice
          .post(`/api/projects/${project.body.id}/assignments`)
          .set(headers)
          .send({ itemId: assigned.id, quantity: 1 })
      ).status,
    ).toBe(201);
    const result = await duplicates({ model: installed.model });
    expect(result.body.items[0]).toMatchObject({
      installedIn: ['Gaming PC'],
      quantity: 3,
      availableQuantity: 2,
    });
    const assignedResult = await duplicates({ model: assigned.model });
    expect(assignedResult.body.items[0]).toMatchObject({
      assignedTo: ['Cluster build'],
      availableQuantity: 2,
    });
    expect((await add(installed.id, { ...input, model: installed.model })).status).toBe(409);
    expect((await add(assigned.id, { ...input, model: assigned.model })).status).toBe(409);
  });
  it('limits results after ranking so exact matches cannot be crowded out', async () => {
    for (let i = 0; i < 14; i++) await create({ model: 'bounded-model' });
    const exact = await create({ model: 'bounded-model', serialNumber: 'LIMIT123' });
    const result = await duplicates({ model: 'bounded-model', serialNumber: 'limit123' });
    expect(result.body.total).toBe(15);
    expect(result.body.items).toHaveLength(12);
    expect(result.body.items[0]).toMatchObject({ itemId: exact.id, matchStrength: 'exact' });
  });
});
