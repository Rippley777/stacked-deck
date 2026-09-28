# Implementation plan

1. Establish a typed React client and Express API with shared validation. Create versioned SQLite migrations, indexes, ownership constraints, password identities, and persistent hashed sessions.
2. Implement owner-scoped inventory CRUD, custom categories/tags, locations, filters, archive, and quantity validation.
3. Implement projects, editable requirements, transactional quantity reservations, and a modular deterministic compatibility engine with shared templates.
4. Build a responsive dark workspace: dashboard, deck, recommendations, projects, locations, accessible forms and feedback.
5. Validate with engine unit tests, API integration/security tests, browser flows, lint, typecheck, and production build. Document environment, seeds, backup and deployment.

## Boundaries

- `shared`: wire types and input validation; no database or UI dependencies.
- `server/db.ts`, `migrations`: persistence and schema lifecycle.
- `server/auth.ts`: credential verification and sessions; identity records support future OAuth providers.
- `server/repository.ts`: owner-scoped persistence operations and reservation invariants.
- `server/compatibility.ts`: pure inventory-to-requirements matching; replaceable independently of routes/UI.
- `server/app.ts`: validated HTTP boundary, authentication, authorization, errors.
- `src`: React application, reusable controls, pages and CSS.

SQLite WAL is a deliberate single-instance MVP choice. Use a persistent local disk and online backups; migrate the repository layer to PostgreSQL before scaling across application servers. All project allocations use transactions and all owned queries include the authenticated user.
