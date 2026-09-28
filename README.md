# Stacked Deck

**Know what you own. Find what you can build.**

A deployable personal hardware inventory and project workspace. A dark interface, a quiet card-deck motif, and a practical loop: **add hardware → organize it → choose a project → check your parts → reserve hardware**.

![Stacked Deck dashboard](docs/screenshots/dashboard.png)

## Run locally

Use **Node 24 LTS** (Node 22.12+ is supported). The repository includes `.nvmrc`.

```sh
nvm install
nvm use
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Open **http://localhost:5173**. Create an account; new accounts start with an empty private deck. Shared project templates are installed automatically at API startup. Vite proxies `/api` to the Express server on port 3001.

For the populated development experience, set `SEED_PASSWORD` in `.env` to a password of at least 12 characters, then:

```sh
npm run db:seed
```

Sign in with `SEED_EMAIL` (default `demo@stackeddeck.local`) and your `SEED_PASSWORD`. Seeding never overwrites an existing account. The seed includes 16 hardware cards / 36 physical components, four locations, two projects, and all 11 templates. It includes the specified Raspberry Pis, NVIDIA GPUs (including an unavailable integrated laptop GPU), storage drives, networking, adapters, and microcontrollers. Never enable demo credentials on a public production deployment.

## What works

- Account creation, sign in/out, protected API routes, private per-user workspaces, persistent 30-day sessions.
- Inventory creation, details, edits, archive/restore and deletion. Quantities, condition, base status, manufacturer, model, per-unit purchase/current values, purchase date, serial, notes, tags and optional image URL.
- Complete computer catalog: desktops, laptops, mini PCs, servers and all-in-ones; prebuilt/custom build origin; processor, graphics, RAM, storage, motherboard, power supply and OS specifications. When creating a computer, enter installed components directly: each component name reveals another optional input below. The computer and its new parts save together, with all entered quantities installed. Existing parts can also be linked from your deck with quantity limits and cannot be double-booked for projects.
- Custom categories and tags. Search across names, manufacturer, model, serial, notes and tags. Category, status, location and tag filters, paging, grid/list views.
- Location management with descriptive paths such as `Office → Shelf → Bin 3`. Deleting a location clears the location reference without deleting its hardware.
- Dashboard with physical quantities, availability, assigned units, value, recent additions, categories, status breakdown and recommendations.
- Project CRUD, statuses, descriptions, notes, cost estimates, required/optional components and a live compatibility checklist.
- Explicit, quantity-based inventory assignments. A project displays its hardware; each hardware card links back to its projects. Transactional allocation prevents overbooking.
- Eleven shared templates: NAS, Pi-hole, RetroPie-style gaming, home server, Home Assistant, media server, Minecraft server, Pi cluster, network monitoring, development server and local AI workstation.
- Recommendations show matched hardware, missing quantities, optional matches, readiness and additional purchase estimates. Creating a project from a template copies its requirements; it does not silently reserve components.
- Responsive layouts, native modal focus handling, validation/error feedback, loading/empty states, reduced motion support, locally served fonts and custom SVG category illustrations.

## Architecture and boundaries

| Layer          | Technology / responsibility                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Browser        | React 19, React Router, TypeScript, Vite, Lucide icons, plain CSS                                               |
| HTTP API       | Express 5; explicit authenticated JSON routes; shared Zod validation                                            |
| Data           | SQLite locally; Azure SQL for Azure hosting; foreign keys and versioned transactional migrations                |
| Authentication | Asynchronous scrypt password hashing, provider-neutral identities, hashed random session tokens in the database |
| Matching       | Pure deterministic integer-capacity matching; independent of HTTP and persistence                               |
| Delivery       | One Node process serves the built client and API; Docker image and Compose example included                     |

The user ID comes exclusively from the authenticated session. Owner-scoped repository queries and composite ownership foreign keys protect references between inventory, locations, projects, tags and assignments. Money is stored as integer USD cents; inventory values and purchase prices are **per unit**. Dashboard valuation multiplies current value by quantity and excludes Sold/Archived items; unpriced items contribute zero.

SQLite keeps the MVP simple and is intended for **one application instance with a persistent local disk**. Indexed ownership/status/category/location queries isolate users. Inventory filter hydration currently loads one user's deck before filtering/paging, which is appropriate for hundreds of cards but should move into indexed SQL/FTS for very large individual decks. Use the shared Azure SQL backend and a distributed rate-limit store before scaling to multiple application servers. WAL permits concurrent reads but SQLite still serializes writers; see [SQLite WAL documentation](https://www.sqlite.org/wal.html).

### Schema

- `users`: profile and unique normalized email.
- `identities`: user, provider, provider subject, optional password hash. The schema can accommodate OAuth identities; no OAuth providers are implemented yet.
- `sessions`: hashed token, user and expiry. Cookies are HTTP-only, SameSite=Lax, and Secure in production. Tokens rotate on sign in; logout revokes the server session.
- `categories`, `tags`: per-user vocabulary; `item_tags` connects cards to tags.
- `locations`: per-user descriptive storage locations.
- `inventory_items`: hardware fields and owner/category/location relationships; component/system kind and optional structured computer specifications.
- `system_components`: owner-constrained links from complete computers to installed inventory parts and quantities.
- `projects`, `project_requirements`: private build plans and editable criteria.
- `project_assignments`: owner-constrained project/item relationship with allocated quantity.
- `project_templates`, `template_requirements`: shared build recipes, installed idempotently at startup.
- `schema_migrations`: records applied SQL migrations.

Requirement categories/tags are small JSON arrays inside otherwise relational requirement rows. Categories are OR alternatives; tags are AND constraints. When both are present, a card must satisfy the category and all tags. Tag-only requirements support arbitrary accessories. Template edits belong in `server/templates.ts`; startup updates shared templates, leaving users' copied projects unchanged.

### Reservation semantics

- `Available` is the allocatable base status. Other base statuses have zero available quantity.
- Available units = total quantity − project assignments − installed units.
- Each complete computer is a separate card with quantity 1. Its specs can be recorded without creating individual part cards.
- Linked parts remain in your inventory. Removing a part or deleting its computer releases installed quantities; a computer assigned to a project must be released before changing its installed parts.
- A computer’s declared value includes its parts. When no whole-computer value is set, the dashboard uses the sum of linked part values; installed units are excluded from separate component valuation.
- Archive/sell a complete computer to exclude its whole value and its installed parts from the deck valuation. Installed parts remain unavailable until explicitly removed or the computer is deleted.
- Idea/Planning/Ready assignments display as Reserved. In Progress/Complete assignments display as In Use.
- Completing a build keeps its parts in use. Abandoning or deleting a project releases its assignments.
- Release can also be done explicitly from the project's hardware list.
- Assigned cards cannot be archived, deleted, marked unusable, or reduced below the allocated quantity until the affected assignments are released.
- Each recommendation is an **independent alternative** using the current available deck. Parts can appear in different recommendations, but a physical unit is never counted twice within one recommendation.
- Matching uses bipartite capacity flow to resolve overlapping requirements, matching required units before optional units. It maximizes covered quantities, then estimates the missing hardware; it does not optimize the monetary cost of alternative component allocations.
- A project's checklist includes its own allocated hardware plus currently available hardware. A match in the checklist is not itself a reservation.

### Important files

| File                                                                                                       | Purpose                                                           |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `shared/types.ts`, `shared/validation.ts`                                                                  | API contracts, enums, validation                                  |
| `migrations/001_initial.sql`                                                                               | Tables, ownership constraints and indexes                         |
| `server/db.ts`                                                                                             | Database configuration and transactional migrations               |
| `server/auth.ts`                                                                                           | Password identities and session lifecycle                         |
| `server/store.ts`, `server/sqlite-store.ts`, `server/sqlserver-store.ts`, `server/sqlserver-repository.ts` | Provider contract and Azure SQL persistence                       |
| `server/repository.ts`                                                                                     | Owner-scoped persistence and reservation invariants               |
| `server/app.ts`                                                                                            | API routes, validation, CSRF defense, security headers and errors |
| `server/compatibility.ts`                                                                                  | Pure matching and ranking engine                                  |
| `server/templates.ts`, `server/seed.ts`                                                                    | Build recipes and optional demo data                              |
| `src/App.tsx`, `src/pages/`                                                                                | Authentication, workspace shell and application screens           |
| `src/components/`, `src/styles.css`                                                                        | Shared forms, dialog, hardware art and responsive UI              |
| `tests/`                                                                                                   | API integration, matching and browser workflow tests              |
| `docs/IMPLEMENTATION.md`                                                                                   | Original implementation plan and boundaries                       |

## Environment

| Variable                                  | Default                                | Purpose                                                                           |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                | `development`                          | Set `production` for secure cookies and static client serving                     |
| `PORT`                                    | `3001`                                 | Express port; the dev proxy assumes 3001                                          |
| `APP_ORIGIN`                              | `http://localhost:5173` in development | Exact trusted origin, without trailing slash. Required HTTPS origin in production |
| `DATABASE_PROVIDER`                       | `sqlite`                               | `sqlite` for local disk, `sqlserver` for Azure SQL                                |
| `AZURE_SQL_SERVER` / `AZURE_SQL_DATABASE` | none                                   | Required for Azure SQL; connections use Azure identity                            |
| `DATABASE_PATH`                           | `./data/stacked-deck.db`               | Persistent SQLite file                                                            |
| `TRUST_PROXY`                             | `0`                                    | Trusted reverse proxy hops; typically `1` behind one proxy                        |
| `SEED_EMAIL`                              | `demo@stackeddeck.local`               | Optional demo account email                                                       |
| `SEED_PASSWORD`                           | none                                   | Required only for creating the optional demo account                              |

No application signing secret is required: sessions use cryptographically random 256-bit tokens; only their SHA-256 hashes are stored. Keep `.env`, database files and backups private. `.gitignore` and `.dockerignore` exclude local secrets/data.

## Checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Unit and integration tests use in-memory databases. Playwright starts an isolated local server on ports 5179/3179 and uses `data/e2e.db`, so other projects running on the default development port cannot intercept the tests. It creates disposable accounts and hardware. `PLAYWRIGHT_BASE_URL` targets a deployed server instead.

The API suite covers account isolation, invalid cross-user references, credential/session hashing, CSRF rejection, input validation, filters, lifecycle behavior, and allocation limits. The matching suite covers quantity, overlap, specialist constraints, optional components, tag-only criteria, availability and ranking. Browser tests cover registration, locations, adding hardware, template matching, project creation, reservation, reload persistence, mobile layout and logout, plus computer creation, specifications, installed parts, edits and returning parts to the available deck.

See [verification notes](docs/VERIFICATION.md) for the completed run and deployment limits.

## Free Azure deployment

Use **App Service F1 + Azure SQL’s free offer**, with database overage billing disabled. The app includes an Azure SQL backend and repeatable deployment scripts. See [the Azure deployment guide](docs/AZURE.md) for the command, quota limits, managed identity, firewall setup and operational guidance. Local development still uses SQLite.

## Production deployment

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://deck.example.com TRUST_PROXY=1 npm start
```

Run from the project root so `migrations/` and `dist/client/` resolve. Terminate TLS with a reverse proxy such as Caddy/nginx and forward to port 3001. Set `TRUST_PROXY` to the actual proxy topology; do not broadly trust arbitrary forwarded headers. Health is available at `/api/health`. Startup applies pending migrations and refreshes shared templates. SIGINT/SIGTERM close the HTTP server and database.

Or use Docker Compose behind an HTTPS proxy:

```sh
APP_ORIGIN=https://deck.example.com docker compose up --build -d
```

The image runs as the unprivileged `node` user, binds the host port to loopback, and keeps its database in a named volume. Ensure the proxy is the only public entry point. Do not use an ephemeral/serverless filesystem or a shared network filesystem for this database. Do not launch multiple replicas with this SQLite setup. The Docker image has been built and smoke-tested locally; validate your own TLS proxy and persistent-volume setup before releasing publicly.

### Backup and restore

Use SQLite's online backup API, which safely includes committed WAL data:

```sh
npm run db:backup -- ./backups/stacked-deck-2026-09-28.db
```

In the production image (no development dependencies):

```sh
node --env-file-if-exists=.env dist/server/backup.js /app/data/backups/stacked-deck.db
```

Use a **new destination filename** for each backup. Store encrypted copies off-host and test restores. A backup inside the same volume is not disaster recovery. Before restoring, stop the application, preserve the existing database **and its WAL/SHM files**, then restore the backup at `DATABASE_PATH` with appropriate ownership. Do not copy only a live `.db` file while WAL writes are active. Back up before applying new migrations; migrations are forward-only.

### Current boundaries

Readiness is a category/tag check, **not proof of electrical or software compatibility**. Templates cannot yet validate wattage, physical fit, interfaces, minimum RAM/VRAM, drive connectivity counts, or exact software support. Costs are rough editable USD estimates, not live prices. Photo URLs are displayed directly; image uploads and automated recognition are not included. Images contact the supplied external host (without a referrer). Artwork without a photo is illustrative by category.

Authentication has rate limiting, generic login failures, scrypt, secure production cookies, same-origin write checks and JSON/custom-header CSRF protection. Email verification, recovery, MFA, OAuth, account deletion and session management screens are not part of this MVP. Public self-registration is enabled. Decide on registration policy and implement email recovery before opening a broad public service. The auth limiter is process-local, consistent with the single-instance deployment.

## Recommended next five features

1. **Account recovery and verification:** verified emails, password reset, session/device management, and OAuth.
2. **Portable inventories:** CSV/JSON import, export, bulk edits and deduplication.
3. **Specification-aware matching:** RAM, VRAM, connector types, power budgets and embedded capabilities.
4. **QR labels and mobile capture:** camera uploads, labels for bins/cards, and photo-assisted entry.
5. **Reusable build recipes:** user-authored templates, build steps, compatibility notes and optional sharing.
