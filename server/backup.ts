import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
if (process.env.DATABASE_PROVIDER === 'sqlserver')
  throw new Error(
    'Azure SQL uses managed backups. Use Azure Portal point-in-time restore or a database export instead of db:backup.',
  );
const destination = process.argv[2];
if (!destination) throw new Error('Usage: npm run db:backup -- /path/to/backup.db');
const source = resolve(process.env.DATABASE_PATH || './data/stacked-deck.db');
if (resolve(destination) === source || existsSync(destination))
  throw new Error('Choose a new backup filename, different from the live database.');
mkdirSync(dirname(resolve(destination)), { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(resolve(destination));
  console.log('Consistent database backup created.');
} finally {
  db.close();
}
