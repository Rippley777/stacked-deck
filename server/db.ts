import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDatabase(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  for (const file of readdirSync(resolve('migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (!db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(file)) {
      db.transaction(() => {
        db.exec(readFileSync(resolve('migrations', file), 'utf8'));
        db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(file);
      })();
    }
  }
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
