import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AppStore } from './store.js';
import type { User } from '../shared/types.js';
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
export const cookieName = 'stacked_deck_session';
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [, salt, key] = hash.split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function createUser(
  db: AppStore,
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const passwordHash = await hashPassword(password);
  return db.insertUser(name, email, passwordHash);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function authenticate(db: AppStore, req: Request): Promise<User | undefined> {
  const token = req.cookies?.[cookieName];
  if (typeof token !== 'string' || token.length !== 64) return;
  return db.sessionUser(tokenHash(token), Date.now());
}
export async function endSession(db: AppStore, req: Request, res: Response, production: boolean) {
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string') await db.deleteSession(tokenHash(token));
  res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'lax', secure: production });
}

export async function startSession(
  db: AppStore,
  userId: string,
  req: Request,
  res: Response,
  production: boolean,
) {
  await endSession(db, req, res, production);
  const token = randomBytes(32).toString('hex');
  await db.insertSession(tokenHash(token), userId, Date.now() + SESSION_AGE, Date.now());
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    maxAge: SESSION_AGE,
    path: '/',
  });
}
