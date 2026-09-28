import 'dotenv/config';
import { openDatabase } from './db.js';
import { openSqlServerStore } from './sqlserver-store.js';
if (process.env.DATABASE_PROVIDER === 'sqlserver') {
  const store = await openSqlServerStore();
  await store.close();
} else {
  const db = openDatabase(process.env.DATABASE_PATH || './data/stacked-deck.db');
  db.close();
}
console.log('Database migrations applied.');
