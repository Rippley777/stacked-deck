import express from 'express';
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import type { DB } from './db.js';
import type { Dashboard, User } from '../shared/types.js';
import {
  itemSchema,
  loginSchema,
  registerSchema,
  projectSchema,
  locationSchema,
  assignmentSchema,
} from '../shared/validation.js';
import {
  authenticate,
  createUser,
  endSession,
  startSession,
  verifyPassword,
  hashPassword,
} from './auth.js';
import { SqliteStore } from './sqlite-store.js';
import type { AppStore, UserRepository } from './store.js';
import { recommend, evaluateTemplate } from './compatibility.js';
import { AppError } from './errors.js';
import { inventoryValue } from './inventory.js';
interface Options {
  production?: boolean;
  origin?: string;
  trustProxy?: number;
}
export function createApp(database: DB | AppStore, options: Options = {}) {
  const db: AppStore = 'repository' in database ? database : new SqliteStore(database);
  const production = options.production ?? false;
  const compiledServer = resolve('dist/server/app.js');
  const release =
    production && existsSync(compiledServer)
      ? createHash('sha256')
          .update(readFileSync(compiledServer, 'utf8').trim())
          .digest('hex')
          .slice(0, 16)
      : undefined;
  const origin = options.origin || 'http://localhost:5173';
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', options.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              imgSrc: ["'self'", 'https:', 'http:', 'data:'],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') && req.get('origin') !== origin)
        return next(new AppError(403, 'This request came from an untrusted origin.'));
      // JSON + a custom header prevent cross-site HTML forms, including login CSRF.
      if (
        req.get('x-stacked-deck') !== '1' ||
        (req.method !== 'DELETE' && !req.is('application/json'))
      )
        return next(new AppError(403, 'Invalid request. Please refresh and try again.'));
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const address = req.ip || req.socket.remoteAddress || '';
      // Azure can append a changing source port to a trusted forwarded address.
      // Preserve bare IPv6 addresses and the limiter's IPv6 subnet protection.
      const ip = address.startsWith('[')
        ? address.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] || address
        : address.replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1');
      return ipKeyGenerator(isIP(ip) ? ip : req.socket.remoteAddress || 'unknown');
    },
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  });
  const dummyHash = hashPassword('unused-constant-time-verification-password');
  app.get('/api/health', async (_req, res) => {
    await db.health();
    res.json({ status: 'ok', ...(release ? { release } : {}) });
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const user = await createUser(db, data.name, data.email, data.password);
    await startSession(db, user.id, req, res, production);
    res.status(201).json(user);
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const row = await db.identity(data.email);
    const valid = await verifyPassword(data.password, row?.passwordHash || (await dummyHash));
    if (!row || !valid) throw new AppError(401, 'Email or password is incorrect.');
    const { id, name, email } = row;
    await startSession(db, id, req, res, production);
    res.json({ id, name, email });
  });
  app.post('/api/auth/logout', async (req, res) => {
    await endSession(db, req, res, production);
    res.status(204).end();
  });
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const user = await authenticate(db, req);
    if (!user) return next(new AppError(401, 'Please sign in to continue.'));
    res.locals.user = user;
    res.locals.repo = db.repository(user.id);
    next();
  });
  const repo = (res: Response) => res.locals.repo as UserRepository;
  app.get('/api/auth/me', async (_req, res) => res.json(res.locals.user));
  app.get('/api/meta', async (_req, res) =>
    res.json({
      categories: await db.categories((res.locals.user as User).id),
      locations: await repo(res).locations(),
    }),
  );
  app.get('/api/inventory', async (req, res) => {
    let items = await repo(res).inventory();
    const string = (value: unknown) => (typeof value === 'string' ? value : '');
    const q = string(req.query.q).toLowerCase();
    if (q)
      items = items.filter((i) =>
        [
          i.name,
          i.manufacturer,
          i.model,
          i.serialNumber,
          i.notes,
          ...i.tags,
          ...Object.values(i.systemSpecs || {}),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    if (req.query.category) items = items.filter((i) => i.category === req.query.category);
    if (req.query.kind) items = items.filter((i) => i.kind === req.query.kind);
    if (req.query.status)
      items = items.filter((i) =>
        req.query.status === 'Available'
          ? i.availableQuantity > 0
          : req.query.status === 'Reserved'
            ? i.status === 'Reserved' ||
              i.assignments.some((a) => !['In Progress', 'Complete'].includes(a.projectStatus))
            : req.query.status === 'In Use'
              ? i.status === 'In Use' ||
                i.installedIn.length > 0 ||
                i.assignments.some((a) => ['In Progress', 'Complete'].includes(a.projectStatus))
              : i.status === req.query.status,
      );
    else items = items.filter((i) => i.status !== 'Archived');
    if (req.query.locationId) items = items.filter((i) => i.locationId === req.query.locationId);
    if (req.query.tag)
      items = items.filter((i) => i.tags.includes(string(req.query.tag).toLowerCase()));
    const page = Math.max(1, Number(string(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, Number(string(req.query.limit)) || 24));
    res.json({
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
    });
  });
  app.get('/api/inventory/:id', async (req, res) =>
    res.json(await repo(res).item(String(req.params.id))),
  );
  app.post('/api/inventory', async (req, res) =>
    res.status(201).json(await repo(res).saveItem(itemSchema.parse(req.body))),
  );
  app.put('/api/inventory/:id', async (req, res) =>
    res.json(await repo(res).saveItem(itemSchema.parse(req.body), String(req.params.id), true)),
  );
  app.delete('/api/inventory/:id', async (req, res) => {
    await repo(res).deleteItem(String(req.params.id));
    res.status(204).end();
  });
  app.post('/api/inventory/:id/components', async (req, res) => {
    const data = assignmentSchema.parse(req.body);
    res
      .status(201)
      .json(await repo(res).install(String(req.params.id), data.itemId, data.quantity));
  });
  app.delete('/api/inventory/:id/components/:componentId', async (req, res) => {
    await repo(res).uninstall(String(req.params.id), String(req.params.componentId));
    res.status(204).end();
  });
  app.get('/api/locations', async (_req, res) => res.json(await repo(res).locations()));
  app.post('/api/locations', async (req, res) => {
    const data = locationSchema.parse(req.body);
    res.status(201).json(await repo(res).saveLocation(data.name, data.description));
  });
  app.put('/api/locations/:id', async (req, res) => {
    const data = locationSchema.parse(req.body);
    res.json(
      await repo(res).saveLocation(data.name, data.description, String(req.params.id), true),
    );
  });
  app.delete('/api/locations/:id', async (req, res) => {
    await repo(res).deleteLocation(String(req.params.id));
    res.status(204).end();
  });
  app.get('/api/projects', async (_req, res) => res.json(await repo(res).projects()));
  app.post('/api/projects', async (req, res) =>
    res.status(201).json(await repo(res).saveProject(projectSchema.parse(req.body))),
  );
  app.put('/api/projects/:id', async (req, res) =>
    res.json(
      await repo(res).saveProject(projectSchema.parse(req.body), String(req.params.id), true),
    ),
  );
  app.delete('/api/projects/:id', async (req, res) => {
    await repo(res).deleteProject(String(req.params.id));
    res.status(204).end();
  });
  app.post('/api/projects/:id/assignments', async (req, res) => {
    const data = assignmentSchema.parse(req.body);
    res.status(201).json(await repo(res).assign(String(req.params.id), data.itemId, data.quantity));
  });
  app.delete('/api/projects/:id/assignments/:assignmentId', async (req, res) => {
    await repo(res).release(String(req.params.id), String(req.params.assignmentId));
    res.status(204).end();
  });
  app.get('/api/projects/:id/compatibility', async (req, res) => {
    const r = repo(res);
    const project = await r.project(String(req.params.id));
    const inventory = (await r.inventory()).map((i) => ({
      ...i,
      availableQuantity:
        i.availableQuantity +
        i.assignments.filter((a) => a.projectId === project.id).reduce((n, a) => n + a.quantity, 0),
    }));
    res.json(
      evaluateTemplate(
        {
          ...project,
          icon: 'box',
          accent: 'green',
          difficulty: 'Custom',
          duration: '',
          caveat:
            'Includes available hardware and this project’s assigned units. Verify specifications before building.',
        },
        inventory,
      ),
    );
  });
  app.get('/api/recommendations', async (_req, res) => {
    const r = repo(res);
    res.json(recommend(await r.templates(), await r.inventory()));
  });
  app.post('/api/templates/:id/projects', async (req, res) => {
    const r = repo(res);
    const template = (await r.templates()).find((t) => t.id === req.params.id);
    if (!template) throw new AppError(404, 'Template not found.');
    const result = evaluateTemplate(template, await r.inventory());
    // Creating a plan does not silently claim hardware; allocations are explicit.
    res.status(201).json(
      await r.saveProject(
        projectSchema.parse({
          name: template.name,
          description: template.description,
          status: result.missingCount ? 'Planning' : 'Ready',
          requirements: template.requirements,
          estimatedCostCents: result.additionalCostCents,
          notes: template.caveat,
        }),
      ),
    );
  });
  app.get('/api/dashboard', async (_req, res) => {
    const r = repo(res);
    const inventory = await r.inventory();
    const items = inventory.filter((i) => !['Sold', 'Archived'].includes(i.status));
    const categories = new Map<string, number>();
    const statuses = new Map<string, number>();
    const add = (map: Map<string, number>, name: string, n: number) =>
      map.set(name, (map.get(name) || 0) + n);
    for (const i of items) {
      add(categories, i.category, i.quantity);
      if (i.status !== 'Available') add(statuses, i.status, i.quantity);
      else {
        add(statuses, 'Available', i.availableQuantity);
        add(
          statuses,
          'In Use',
          i.installedIn.reduce((n, c) => n + c.quantity, 0),
        );
        for (const a of i.assignments)
          add(
            statuses,
            ['In Progress', 'Complete'].includes(a.projectStatus) ? 'In Use' : 'Reserved',
            a.quantity,
          );
      }
    }
    const summary: Dashboard = {
      totalUnits: items.reduce((n, i) => n + i.quantity, 0),
      availableUnits: items.reduce((n, i) => n + i.availableQuantity, 0),
      assignedUnits: items.reduce(
        (n, i) => n + i.assignments.reduce((s, a) => s + a.quantity, 0),
        0,
      ),
      totalValueCents: inventoryValue(items, inventory),
      activeProjects: (await r.projects()).filter(
        (p) => !['Complete', 'Abandoned'].includes(p.status),
      ).length,
      categories: [...categories]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      statuses: [...statuses]
        .filter(([, count]) => count > 0)
        .map(([name, count]) => ({ name, count })),
      recent: items.slice(0, 4),
      readyCount: recommend(await r.templates(), await r.inventory()).filter((v) => !v.missingCount)
        .length,
    };
    res.json(summary);
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint not found.')));
  const client = resolve('dist/client');
  if (production && existsSync(client)) {
    app.use(express.static(client, { index: false }));
    app.get('/{*path}', async (_req, res) => res.sendFile(resolve(client, 'index.html')));
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON request.' });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: 'This request is too large.' });
      return;
    }
    if (
      ['ETIMEOUT', 'ESOCKET', 'ECONNCLOSED'].includes(error?.code) ||
      [40613, 40501, 10928, 10929].includes(error?.number)
    ) {
      res
        .status(503)
        .json({ error: 'The database is temporarily unavailable. Please try again shortly.' });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(errors);
  return app;
}
