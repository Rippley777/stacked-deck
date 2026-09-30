import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
const db = openDatabase(':memory:');
const app = createApp(db);
// Keep one listener for the suite; avoid repeated ephemeral port close/reopen races.
const server = createServer(app);
const alice = request.agent(server),
  bob = request.agent(server);
const headers = { 'X-Stacked-Deck': '1', Origin: 'http://localhost:5173' };
const base = {
  name: 'Router',
  category: 'Router',
  quantity: 1,
  condition: 'Good',
  status: 'Available',
};
const power = {
  voltage: 12,
  current: 1,
  acDc: 'DC',
  polarity: 'center_positive',
  proprietaryProtocol: 'none',
  connector: { connector: 'DC barrel', outerMm: 5.5, innerMm: 2.1 },
};
let router: string, charger: string, foreign: string;
beforeAll(async () => {
  server.listen(0);
  await once(server, 'listening');
  for (const [i, agent] of [alice, bob].entries())
    expect(
      (
        await agent
          .post('/api/auth/register')
          .set(headers)
          .send({
            name: 'Owner',
            email: `connect-${i}@example.com`,
            password: 'test-connectivity-password',
          })
      ).status,
    ).toBe(201);
  const location = await alice
    .post('/api/locations')
    .set(headers)
    .send({ name: 'Office → Drawer 2 → Cable Bin' });
  router = (
    await alice
      .post('/api/inventory')
      .set(headers)
      .send({ ...base, connectivity: { version: 1, verified: true, power } })
  ).body.id;
  const input = {
    ...base,
    name: '12V supply',
    category: 'Power Adapter',
    quantity: 3,
    locationId: location.body.id,
    connectivity: {
      version: 1,
      verified: true,
      adapter: { ...power, current: 2, outputMode: 'fixed' },
    },
  };
  const saved = await alice.post('/api/inventory').set(headers).send(input);
  expect(saved.status).toBe(201);
  charger = saved.body.id;
  foreign = (
    await bob
      .post('/api/inventory')
      .set(headers)
      .send({ ...input, locationId: null })
  ).body.id;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  db.close();
});
describe('connectivity API', () => {
  it('persists JSON metadata, quantities and locations and matches in both directions', async () => {
    const forward = await alice.get(`/api/inventory/${router}/compatibility`);
    expect(forward.status).toBe(200);
    expect(forward.body.matches).toHaveLength(1);
    expect(forward.body.matches[0]).toMatchObject({
      itemId: charger,
      quantity: 3,
      location: 'Office → Drawer 2 → Cable Bin',
      result: { status: 'compatible' },
    });
    expect(
      (await alice.get(`/api/inventory/${charger}/compatibility`)).body.matches[0].itemId,
    ).toBe(router);
    expect(
      (
        await alice
          .post('/api/hardware/compatibility')
          .set(headers)
          .send({ deviceId: router, adapterId: charger })
      ).body.status,
    ).toBe('compatible');
  });
  it('isolates forward, reverse, direct checks, draft matches and duplicates by session owner', async () => {
    expect((await bob.get(`/api/inventory/${router}/compatibility`)).status).toBe(404);
    expect((await alice.get(`/api/inventory/${foreign}/compatibility`)).status).toBe(404);
    for (const data of [
      { deviceId: router, adapterId: foreign },
      { deviceId: foreign, adapterId: charger },
    ])
      expect((await alice.post('/api/hardware/compatibility').set(headers).send(data)).status).toBe(
        404,
      );
    const draft = {
      connectivity: {
        version: 1,
        verified: true,
        adapter: { ...power, current: 2, outputMode: 'fixed' },
      },
    };
    expect((await bob.post('/api/hardware/matches').set(headers).send(draft)).body.matches).toEqual(
      [],
    );
    const own = await alice.post('/api/hardware/matches').set(headers).send(draft);
    expect(own.body.matches[0].result.status).toBe('uncertain'); // scan drafts can never self-certify
    const duplicates = await bob.post('/api/hardware/duplicates').set(headers).send(draft);
    expect(duplicates.body.items.map((i: { itemId: string }) => i.itemId)).toEqual([foreign]);
  });
  it('requires authentication and CSRF header on new APIs', async () => {
    expect((await request(server).get(`/api/inventory/${router}/compatibility`)).status).toBe(401);
    for (const path of ['compatibility', 'matches', 'duplicates']) {
      expect(
        (await request(server).post(`/api/hardware/${path}`).set(headers).send({})).status,
      ).toBe(401);
      expect((await alice.post(`/api/hardware/${path}`).send({})).status).toBe(403);
    }
  });
  it('structured and practical text search only returns own matching items', async () => {
    for (const query of [
      'voltage=12&outerMm=5.5&innerMm=2.1',
      'accessory=adapter',
      `q=${encodeURIComponent('Show me 12V power adapters')}`,
    ]) {
      const response = await alice.get(`/api/inventory?${query}`);
      expect(response.status).toBe(200);
      expect(response.body.items.map((i: { id: string }) => i.id)).toEqual([charger]);
    }
    expect((await alice.get('/api/inventory?voltage=19')).body.total).toBe(0);
    expect((await alice.get('/api/inventory?minWatts=NaN')).status).toBe(400);
    expect((await alice.get('/api/inventory?connector[x]=USB-C')).status).toBe(200);
  });
  it('validates nested specifications and preserves metadata from older clients', async () => {
    expect(
      (
        await alice
          .post('/api/inventory')
          .set(headers)
          .send({ ...base, connectivity: { version: 1, power: { voltage: -12 } } })
      ).status,
    ).toBe(400);
    const saved = await alice
      .put(`/api/inventory/${router}`)
      .set(headers)
      .send({ ...base, name: 'Updated router' });
    expect(saved.status).toBe(200);
    expect(saved.body.connectivity.power.voltage).toBe(12);
    expect(
      (await alice.post('/api/inventory').set(headers).send(base)).body.connectivity,
    ).toBeNull();
  });
  it('allows intentional removal of specifications', async () => {
    const saved = await alice
      .put(`/api/inventory/${router}`)
      .set(headers)
      .send({ ...base, connectivity: null });
    expect(saved.body.connectivity).toBeNull();
    expect((await alice.get(`/api/inventory/${router}/compatibility`)).body.matches).toEqual([]);
  });
});
