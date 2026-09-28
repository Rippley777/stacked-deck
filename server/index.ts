import 'dotenv/config';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { SqliteStore } from './sqlite-store.js';
import { openSqlServerStore } from './sqlserver-store.js';
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN?.startsWith('https://'))
  throw new Error('Production requires an HTTPS APP_ORIGIN.');
const provider = process.env.DATABASE_PROVIDER || 'sqlite';
if (!['sqlite', 'sqlserver'].includes(provider))
  throw new Error('DATABASE_PROVIDER must be sqlite or sqlserver.');
const db =
  provider === 'sqlserver'
    ? await openSqlServerStore()
    : new SqliteStore(openDatabase(process.env.DATABASE_PATH || './data/stacked-deck.db'));
const server = createApp(db, {
  production,
  origin: process.env.APP_ORIGIN,
  trustProxy: Number(process.env.TRUST_PROXY || 0),
}).listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log(`Stacked Deck API listening on port ${process.env.PORT || 3001}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
