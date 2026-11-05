# Left Off

## Current task

P5 is implemented and locally verified. Neon PostgreSQL is provisioned and migrated. Public deployment and real-player beta are blocked on explicitly authorized persistent hosting and physical device access.

## Done

- PostgreSQL: dedicated Neon project `vibe-militia`, PG 17, `aws-us-east-2`, separate `p5-test` branch. Pooled connection configured through `DATABASE_URL`, SSL and `DATABASE_POOL_MAX`. Schema v1 covers players, weapon stats, matches, cosmetics and migrations. Schema v2 adds anonymous `client_events`. Transactions use `SELECT ... FOR UPDATE` for idempotent per-player rewards.
- Persistence: async `ProfileRepository`, `SqliteProfileRepository`, `PostgresProfileStore`, shared token/name/equipped codec, `/ready` backend reporting, graceful async shutdown and request error middleware.
- Migration: `server/db-migrate-postgres.ts` plus `scripts/create-migration-fixture.ts`. Validated 2 players, 1 weapon stat, 1 match, 8 cosmetics, retained XP and match count. SQLite source untouched.
- Mobile: twin-stick controls with left-stick upward thrust, right-stick 360 aim, optional auto-fire past a configurable threshold, separate FIRE mode, persisted sensitivity/dead zones/thresholds, reliable multitouch, cancellation reset and safe-area layout.
- Full-screen fit: Phaser `Scale.RESIZE`, `100dvh` mobile frame, safe areas, portrait rotation guard, fullscreen control and a web manifest. Desktop keeps centered 16:9.
- Beta tooling: anonymous `POST /api/client-error` and `/api/feedback`, session client ID rate limiting, no IP or user-agent storage, in-match settings feedback trigger and session-bar trigger.
- Verification: 182 unit tests pass, including 7 PostgreSQL tests. P4 35/35 and P5 42/42 pass against the Neon test branch. All P0-P4 browser suites pass on a clean SQLite server with `MATCH_COUNTDOWN_MS=10000`. P4/P5 use Neon.
- Performance: final clean headless perf 56 fps, 0.40 ms average server tick, 1.43 ms p95. Grenade/advanced-weapon stress 15/15.
- Artifacts: `artifacts/p5/` contains mobile screenshots at 1280x720, 844x390, 915x412, 740x360, portrait guard, P5 logs, P4 Neon logs and regression logs.

## Next

1. Review and commit the P5 changes.
2. Push `main` to `origin/main`.
3. If a persistent game-server host is explicitly authorized, deploy the game server and frontend, update `ALLOWED_ORIGINS`, and verify external guest creation, room joins, WSS and `/ready`.
4. Run the real-player beta from `BETA_TESTING.md`.
5. Start physical iOS/Android testing before declaring mobile parity.

## Known issues

- No public deployment and no live URL.
- Physical iOS/Android device testing not performed.
- Real-player beta not started.
- Production Neon branch contains synthetic test profiles from this milestone. No real player data.
- Multiple game-server replicas still need shared room discovery or sticky matchmaking even though PostgreSQL is shared.
- Legacy suites need a clean server; matchmaking is sensitive to old open rooms.
- Test hooks must stay disabled in production.

## Baseline

- P4 implementation commit: `280871d`.
- P4 reconnect verification commit: `20348f1`.
- Last documented checkpoint before P5: `2136963`.
- `origin/main` should match this P5 checkpoint after push.
