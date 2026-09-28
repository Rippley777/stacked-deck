import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import type { AppStore } from './store.js';
import { Repository } from './repository.js';
import { AppError } from './errors.js';
import { seedTemplates } from './templates.js';
import { defaultCategories, type User } from '../shared/types.js';
export class SqliteStore implements AppStore {
  constructor(public db: DB) {
    seedTemplates(db);
  }
  repository(userId: string) {
    return new Repository(this.db, userId);
  }
  health() {
    this.db.prepare('SELECT 1').get();
  }
  categories(userId: string) {
    return (
      this.db.prepare('SELECT name FROM categories WHERE userId=? ORDER BY name').all(userId) as {
        name: string;
      }[]
    ).map((r) => r.name);
  }
  insertUser(name: string, email: string, passwordHash: string): User {
    return this.db.transaction(() => {
      if (this.db.prepare('SELECT id FROM users WHERE email=?').get(email))
        throw new AppError(409, 'An account with this email already exists.');
      const id = randomUUID();
      this.db.prepare('INSERT INTO users(id,name,email) VALUES (?,?,?)').run(id, name, email);
      this.db
        .prepare(
          'INSERT INTO identities(id,userId,provider,subject,passwordHash) VALUES (?,?,?,?,?)',
        )
        .run(randomUUID(), id, 'password', email, passwordHash);
      const category = this.db.prepare('INSERT INTO categories(userId,name) VALUES (?,?)');
      for (const categoryName of defaultCategories) category.run(id, categoryName);
      return { id, name, email };
    })();
  }
  identity(email: string) {
    return this.db
      .prepare(
        "SELECT u.id,u.name,u.email,i.passwordHash FROM users u JOIN identities i ON i.userId=u.id WHERE i.provider='password' AND i.subject=?",
      )
      .get(email) as (User & { passwordHash: string }) | undefined;
  }
  sessionUser(tokenHash: string, now: number) {
    return this.db
      .prepare(
        'SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?',
      )
      .get(tokenHash, now) as User | undefined;
  }
  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(tokenHash);
  }
  insertSession(tokenHash: string, userId: string, expiresAt: number, now: number) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM sessions WHERE expiresAt<=?').run(now);
      this.db
        .prepare('INSERT INTO sessions(tokenHash,userId,expiresAt) VALUES (?,?,?)')
        .run(tokenHash, userId, expiresAt);
    })();
  }
  close() {
    this.db.close();
  }
}
