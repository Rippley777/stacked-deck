# Verification

Validated locally on 2026-09-28 using Node 24, Chromium, and Docker Desktop (Linux ARM64 image).

| Check                  | Result                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TypeScript             | Browser/shared and server/shared projects pass strict type checking                                                       |
| ESLint                 | No errors or warnings                                                                                                     |
| Prettier               | Source/config/docs formatting checked                                                                                     |
| Unit + API integration | 27 tests passed across 2 test files                                                                                       |
| Playwright             | Core end-to-end workflow passed                                                                                           |
| Production build       | Client assets and compiled server generated; routes split into separate chunks                                            |
| Production HTTP smoke  | Migrations, health, SPA fallback, bundled JS, CSP and unauthorized API response verified                                  |
| Docker                 | Multi-stage image built; fresh container migrated its database and served API/SPA successfully as non-root                |
| Database backup        | SQLite online backup completed successfully                                                                               |
| Browser inspection     | Seeded dashboard and recommendations rendered without JavaScript errors; 390px mobile viewport had no horizontal overflow |

## Tested behavior

The browser workflow creates a new account, adds a hierarchical-style location, creates a 3-unit Raspberry Pi card, examines Pi-hole matches and missing requirements, creates a project from the template, reserves one unit, verifies that two remain available after reload, switches to a mobile viewport and signs out.

API tests cover authentication gates, normalized email/tag storage, hashed credentials and session tokens, secure production cookies, session expiry, wrong credentials, duplicate accounts, logout revocation, CSRF rejection, validation, inventory filters, user isolation, cross-user foreign keys, quantity limits, concurrent allocations, project completion/abandonment/deletion, archive/restore, location removal, and template copies.

Matching tests cover partial quantities, no double counting, reserved/unusable units, desktop versus laptop tags, tag-only requirements, optional matches, specialist constraints, overlapping requirements requiring reassignment, and independent recommendation ordering.

## Azure verification

The live Azure SQL integration test passed against the dedicated free-offer database, including migrations, ownership checks and concurrent reservations. Disposable integration accounts were removed after the test.

## Practical limits

- Azure deployment uses the platform hostname and managed HTTPS. No custom domain was configured.
- Chromium was exercised; Safari and Firefox were not. Mobile layouts were inspected in an emulated viewport, not on physical devices.
- No load test or formal accessibility/security audit was performed. Local development uses SQLite; Azure uses a shared SQL database. Large individual decks would benefit from SQL-level filtering and FTS; multiple instances also need a shared rate-limit store.
- Hardware compatibility remains a category/tag approximation with explicit caveats; exact electrical, interface, capacity and software checks are future work.
- Backup creation was exercised. Operators should test full restore procedures and off-host retention for their deployment.

Screenshots: [dashboard](screenshots/dashboard.png), [recommendations](screenshots/recommendations.png), [mobile](screenshots/mobile.png).
