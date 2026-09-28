import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase, type DB } from '../server/db.js';
import { createApp } from '../server/app.js';
const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const computer = {
  kind: 'System',
  name: 'My gaming PC',
  category: 'Desktop Computer',
  quantity: 1,
  condition: 'Good',
  status: 'Available',
  systemSpecs: {
    buildType: 'Custom build',
    processor: 'Ryzen 7 7800X3D',
    graphics: 'RTX 4070',
    memoryGB: 32,
    storage: '2 TB NVMe',
    operatingSystem: 'Windows 11',
  },
};
const ram = {
  name: 'DDR5 kit',
  category: 'RAM',
  quantity: 3,
  condition: 'Good',
  status: 'Available',
  estimatedValueCents: 5000,
};
let db: DB;
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;
beforeEach(async () => {
  db = openDatabase(':memory:');
  const app = createApp(db);
  alice = request.agent(app);
  bob = request.agent(app);
  for (const [email, agent] of [
    ['alice@systems.example', alice],
    ['bob@systems.example', bob],
  ] as const) {
    expect(
      (
        await agent
          .post('/api/auth/register')
          .set(headers)
          .send({ name: 'Computer owner', email, password: 'computer-test-password-123' })
      ).status,
    ).toBe(201);
  }
});
afterEach(() => db.close());
describe('complete computer catalog', () => {
  it('stores specs, finds systems by specification, supports edits, and isolates accounts', async () => {
    const added = await alice.post('/api/inventory').set(headers).send(computer);
    expect(added.status).toBe(201);
    expect(added.body.systemSpecs.memoryGB).toBe(32);
    expect(added.body.systemSpecs.motherboard).toBe('');
    expect((await alice.get('/api/inventory?kind=System&q=7800X3D')).body.total).toBe(1);
    expect((await alice.get('/api/inventory?kind=Component')).body.total).toBe(0);
    expect((await bob.get(`/api/inventory/${added.body.id}`)).status).toBe(404);
    expect(
      (await bob.put(`/api/inventory/${added.body.id}`).set(headers).send(computer)).status,
    ).toBe(404);
    const updated = await alice
      .put(`/api/inventory/${added.body.id}`)
      .set(headers)
      .send({ ...computer, systemSpecs: { ...computer.systemSpecs, memoryGB: 64 } });
    expect(updated.status).toBe(200);
    expect((await alice.get(`/api/inventory/${added.body.id}`)).body.systemSpecs.memoryGB).toBe(64);
    const recommendations = await alice.get('/api/recommendations');
    expect(
      recommendations.body.find(
        (r: { template: { id: string } }) => r.template.id === 'home-server',
      ).required[0].matched[0].itemId,
    ).toBe(added.body.id);
  });
  it('rejects invalid profiles, multiple computers on one card, nesting and foreign parts', async () => {
    for (const input of [
      { ...computer, quantity: 2 },
      { ...computer, systemSpecs: null },
      { ...computer, category: 'CPU' },
      { ...computer, systemSpecs: { memoryGB: -1 } },
    ]) {
      expect((await alice.post('/api/inventory').set(headers).send(input)).status).toBe(400);
    }
    const parent = (await alice.post('/api/inventory').set(headers).send(computer)).body;
    const other = (
      await alice
        .post('/api/inventory')
        .set(headers)
        .send({ ...computer, name: 'Laptop', category: 'Laptop' })
    ).body;
    const foreign = (await bob.post('/api/inventory').set(headers).send(ram)).body;
    for (const id of [parent.id, other.id])
      expect(
        (
          await alice
            .post(`/api/inventory/${parent.id}/components`)
            .set(headers)
            .send({ itemId: id, quantity: 1 })
        ).status,
      ).toBe(400);
    expect(
      (
        await alice
          .post(`/api/inventory/${parent.id}/components`)
          .set(headers)
          .send({ itemId: foreign.id, quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await bob
          .post(`/api/inventory/${parent.id}/components`)
          .set(headers)
          .send({ itemId: foreign.id, quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await alice
          .post(`/api/inventory/${parent.id}/components`)
          .set(headers)
          .send({ itemId: other.id, quantity: 0 })
      ).status,
    ).toBe(400);
  });
  it('shares capacity between systems and projects and keeps installed parts out of matching', async () => {
    const parent = (await alice.post('/api/inventory').set(headers).send(computer)).body;
    const part = (
      await alice
        .post('/api/inventory')
        .set(headers)
        .send({ ...ram, quantity: 1 })
    ).body;
    const project = (
      await alice.post('/api/projects').set(headers).send({ name: 'New build', status: 'Planning' })
    ).body;
    const attempts = await Promise.all([
      alice
        .post(`/api/inventory/${parent.id}/components`)
        .set(headers)
        .send({ itemId: part.id, quantity: 1 }),
      alice
        .post(`/api/projects/${project.id}/assignments`)
        .set(headers)
        .send({ itemId: part.id, quantity: 1 }),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    if (attempts[1].status === 201) {
      await alice
        .delete(`/api/projects/${project.id}/assignments/${attempts[1].body.assignments[0].id}`)
        .set(headers);
      expect(
        (
          await alice
            .post(`/api/inventory/${parent.id}/components`)
            .set(headers)
            .send({ itemId: part.id, quantity: 1 })
        ).status,
      ).toBe(201);
    }
    const installed = (await alice.get(`/api/inventory/${part.id}`)).body;
    expect(installed.availableQuantity).toBe(0);
    expect(installed.installedIn[0].systemName).toBe('My gaming PC');
    expect((await alice.get('/api/inventory?status=In%20Use&kind=Component')).body.total).toBe(1);
    expect((await alice.delete(`/api/inventory/${part.id}`).set(headers)).status).toBe(409);
    expect(
      (
        await alice
          .put(`/api/inventory/${part.id}`)
          .set(headers)
          .send({ ...ram, status: 'Archived' })
      ).status,
    ).toBe(409);
    expect(
      (
        await alice
          .put(`/api/inventory/${parent.id}`)
          .set(headers)
          .send({ ...ram, quantity: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await alice
          .post(`/api/projects/${project.id}/assignments`)
          .set(headers)
          .send({ itemId: parent.id, quantity: 1 })
      ).status,
    ).toBe(201);
    const current = (await alice.get(`/api/inventory/${parent.id}`)).body;
    expect(
      (
        await alice
          .delete(`/api/inventory/${parent.id}/components/${current.components[0].id}`)
          .set(headers)
      ).status,
    ).toBe(409);
    await alice.delete(`/api/projects/${project.id}`).set(headers);
    expect(
      (
        await alice
          .delete(`/api/inventory/${parent.id}/components/${current.components[0].id}`)
          .set(headers)
      ).status,
    ).toBe(204);
    expect((await alice.get(`/api/inventory/${part.id}`)).body.availableQuantity).toBe(1);
  });
  it('values a whole computer once, falls back to linked part values, and releases parts on deletion', async () => {
    const parent = (await alice.post('/api/inventory').set(headers).send(computer)).body;
    const part = (await alice.post('/api/inventory').set(headers).send(ram)).body;
    const install = await alice
      .post(`/api/inventory/${parent.id}/components`)
      .set(headers)
      .send({ itemId: part.id, quantity: 2 });
    expect(install.status).toBe(201);
    expect((await alice.get(`/api/inventory/${part.id}`)).body.availableQuantity).toBe(1);
    expect(
      (
        await alice
          .put(`/api/inventory/${part.id}`)
          .set(headers)
          .send({ ...ram, quantity: 1 })
      ).status,
    ).toBe(409);
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(15000);
    await alice
      .put(`/api/inventory/${parent.id}`)
      .set(headers)
      .send({ ...computer, estimatedValueCents: 100000 });
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(105000);
    await alice
      .put(`/api/inventory/${parent.id}`)
      .set(headers)
      .send({ ...computer, status: 'Archived', estimatedValueCents: 100000 });
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(5000);
    expect((await alice.get(`/api/inventory/${part.id}`)).body.availableQuantity).toBe(1);
    expect((await alice.delete(`/api/inventory/${parent.id}`).set(headers)).status).toBe(204);
    expect((await alice.get(`/api/inventory/${part.id}`)).body.availableQuantity).toBe(3);
    expect((await alice.get('/api/dashboard')).body.totalValueCents).toBe(15000);
  });
});
