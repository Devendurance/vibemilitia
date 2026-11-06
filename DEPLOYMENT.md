# Deployment

Vibe Militia has two deployables:

1. A Next.js frontend. It can run on Vercel, a Node host, or any host that supports the Next.js production server.
2. A persistent Colyseus Node.js process. It must not run as a serverless function, because matches, countdowns, reconnection seats and WebSocket connections live in memory.

Progression is stored in PostgreSQL when `DATABASE_URL` is set. The server falls back to SQLite on a persistent disk when `DATABASE_URL` is absent or blank. PostgreSQL is the recommended beta and production path because it supports backups, point-in-time recovery and future horizontal scaling.

## Authorized database status

A dedicated Neon project named `vibe-militia` was provisioned in the authorized organization:

- Region: `aws-us-east-2`
- PostgreSQL 17
- Production branch: `main`, database `vibe_militia`, role `vibe_app`
- Test branch: `p5-test`
- Connection strings live only in the gitignored `.env.local`. They are never committed, logged or printed by the application.

The production branch currently contains only synthetic guest profiles created during this milestone's verification. No real player data exists yet.

## Required environment

Build-time frontend variable:

```text
NEXT_PUBLIC_GAME_SERVER_URL=https://game.example.com
```

Game server runtime variables:

```text
NODE_ENV=production
PORT=2567
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
DATABASE_SSL=1
DATABASE_POOL_MAX=8
ALLOWED_ORIGINS=https://play.example.com
PUBLIC_GAME_SERVER_URL=https://game.example.com
RECONNECT_GRACE_SECONDS=30
MATCH_COUNTDOWN_MS=10000
XP_MIN_PARTICIPATION_MS=45000
TRUST_PROXY=1
```

SQLite fallback variables:

```text
DATABASE_PATH=/data/vibe-militia.sqlite
```

`DATABASE_URL` must use the `postgres` or `postgresql` protocol. Use the pooled Neon connection string for the game server. The pool defaults to 8 connections and caps at 20. Keep the pool small because each game-server process opens its own connections and Neon bills compute time.

`ALLOWED_ORIGINS` is mandatory in production and rejects wildcards. It applies to HTTP CORS and WebSocket upgrades. `NEXT_PUBLIC_GAME_SERVER_URL` is embedded at build time, so rebuild the frontend after changing it.

Never enable `VIBE_MILITIA_TEST_HOOKS` in production.

## Local production check

PostgreSQL:

```bash
npm ci
npm run build
DATABASE_URL="postgresql://..." npm run server:start
NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:2567 npm run start -- -p 3101
```

SQLite fallback:

```bash
DATABASE_URL=" " DATABASE_PATH=./data/vibe-militia.sqlite npm run server:start
```

A single space is used above to prevent `.env.local` from injecting a local PostgreSQL URL. In a real shell, unsetting `DATABASE_URL` is cleaner.

The game server exposes:

- `GET /health`: process liveness.
- `GET /ready`: database backend, readiness, player count and match count.
- `GET /api/config`: reconnect grace, countdown and persistence backend.
- `POST /api/guest`: create a device-bound guest and opaque token.
- `GET /api/leaderboard?limit=25`: server-derived ALL-TIME online XP standings. Unauthenticated, read-only and limited to players who opted in. Self-declared X handles appear only when the player made them public and are always labelled unverified.
- `POST /api/resume`: exchange a single-use resume handle and the guest bearer token for a Colyseus reconnection token. The handle expires with `RECONNECT_GRACE_SECONDS`, is identity-bound and is deleted after one redemption.
- `GET /api/profile`: read the authenticated guest profile.
- `PATCH /api/profile`: update callsign, skin, equipped cosmetics or claim pending awards.
- `POST /api/client-error`: anonymous client error capture, rate-limited by session client ID.
- `POST /api/feedback`: anonymous 1-5 rating and optional message, rate-limited by session client ID.

Feedback events store only kind, message, route, app version, optional guest ID and rating. They do not store IP addresses, user agents or names.

## PostgreSQL schema and migrations

The server applies versioned migrations at startup inside a transaction. `schema_migrations` records applied versions.

- Version 1: `players`, `weapon_stats`, `matches`, `cosmetics`.
- Version 2: `client_events` for anonymous beta feedback and error reports.

Schema code lives in `server/persistence/PostgresProfileStore.ts`. SQLite parity lives in `server/persistence/ProfileStore.ts`. Every schema change must add an additive migration and must run the PostgreSQL concurrency tests.

Match rewards are transactional and idempotent. `recordMatch` locks the player row with `SELECT ... FOR UPDATE`, reuses `(match_id, player_id)` as the primary key, adds XP and statistics in one transaction, and records reward delivery separately. Duplicate match-end events or concurrent writes cannot award XP twice.

Persistence runs off the 60 Hz simulation loop. Match settlement is queued after the phase becomes `ended` and retries after five seconds on failure.

## Migrating existing SQLite data

The migration is non-destructive. The source SQLite file is opened read-only and is never deleted.

```bash
# 1. Stop the game server so the SQLite source is stable.
# 2. Create a deterministic fixture or point at the real database.
npm run db:fixture:sqlite
npm run db:migrate:postgres -- --from=data/p5-migration-fixture.sqlite

# 3. Apply to the target PostgreSQL database.
DATABASE_URL="postgresql://..." npm run db:migrate:postgres -- \
  --from=/data/vibe-militia.sqlite --apply
```

The script prints source counts, target counts before and after, and validates that the target contains at least every source player, weapon stat, match and cosmetic. Existing target rows are preserved. `ON CONFLICT` rules make a repeated migration safe. After validation, keep the SQLite file and its backup as a rollback copy.

## Backups and restore

### Neon PostgreSQL

Neon provides branch-based point-in-time recovery. For a logical backup, use a direct, non-pooled connection string from the Neon console:

```bash
pg_dump --format=custom --no-owner --no-acl \
  --file=vibe-militia-$(date +%Y%m%d).dump \
  "postgresql://USER:PASSWORD@DIRECT_HOST/DATABASE?sslmode=require"
```

Restore into a new Neon branch or database first, validate player and match counts, then promote or switch `DATABASE_URL` during a maintenance window:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require" \
  vibe-militia-20261105.dump
```

Never run a restore against the live branch without a verified backup and an explicit maintenance decision.

### SQLite fallback

Back up while the server is running:

```bash
npm run db:backup
# or
DATABASE_PATH=/data/vibe-militia.sqlite npm run db:backup /backups/nightly.sqlite
```

The command uses `VACUUM INTO`, producing a consistent copy. Store backups off the game-server disk. Restore by stopping the server, replacing the database file, and starting the server again.

## Docker

```bash
cp .env.example .env
# Edit .env with real origins, the public game-server URL and DATABASE_URL.
docker compose up -d --build
```

The compose file mounts `vibe-militia-data` at `/data`. The volume remains useful for the SQLite fallback. When PostgreSQL is configured, the game server still needs no serverless storage, but match state remains in memory.

The container runs as the unprivileged `node` user and has a `/ready` health check.

## Reverse proxy and WSS

Terminate TLS at Nginx, Caddy or a managed load balancer. The game server should listen on a private interface or localhost behind the proxy.

Example Nginx site:

```nginx
server {
  listen 443 ssl http2;
  server_name game.example.com;

  ssl_certificate /etc/letsencrypt/live/game.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:2567;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

Set `TRUST_PROXY=1` when the proxy supplies `X-Forwarded-For`. Keep `ALLOWED_ORIGINS` restricted to the real frontend origins.

## Frontend deployment with Vercel

The Vercel CLI is authenticated for the authorized account. No deployment was performed in this milestone because no persistent game-server host was approved.

```bash
vercel link
vercel env add NEXT_PUBLIC_GAME_SERVER_URL production
# Enter the WSS/HTTPS game-server origin, for example https://game.example.com
vercel --prod
```

Then add the Vercel production origin to `ALLOWED_ORIGINS` on the game server and restart it. A frontend deploy without a reachable game server is not a beta release.

## Persistent game-server deployment

Use a host with a stable public IP, a process supervisor and enough memory for the rooms. Keep the service isolated from unrelated processes, ports, containers and databases.

1. Copy or pull the repository into an isolated directory.
2. Create a dedicated service user.
3. Set the runtime variables from a protected environment file.
4. Run `npm ci && npm run build` only if the host also serves the frontend. The game server itself runs TypeScript through `tsx`.
5. Start with `npm run server:start` under systemd, Docker Compose or another supervisor.
6. Put the service behind HTTPS/WSS.
7. Verify `/health`, `/ready`, guest creation, Quick Match, Create Room and cross-client play from the deployed frontend.

Do not reuse or overwrite unrelated reverse-proxy or systemd configuration. Do not publish the server until `ALLOWED_ORIGINS` contains the real frontend origin.

## Operations

- Restart policy: `restart: unless-stopped`.
- Health check: `/ready`, every 30 seconds.
- Logs: one JSON object per line on stdout/stderr with `at`, `level`, `service`, `message` and safe fields. Guest tokens and connection strings are never logged.
- Input rate limit: 45 messages per second per client.
- API rate limit: 120 requests per minute per IP, guest creation 30 per minute per IP, client events 20 per minute per session client ID.
- Match capacity: eight humans per room. Disconnected seats stay reserved for `RECONNECT_GRACE_SECONDS`, then a bot backfills.
- WebSocket message size and API body size: API bodies are capped at 16 KB. Client inputs are validated and clamped on the server.

## Scaling limits

- In-memory room and seat state is lost on a game-server restart. Reconnect and reload recovery work across network drops, page reloads and same-tab navigation within the grace window, not across process restarts. The resume registry is process-local and intentionally holds no database credentials or long-lived secrets.
- PostgreSQL removes the single-SQLite-file constraint, but Colyseus rooms are still process-local. Multiple game-server replicas need a shared room directory or sticky matchmaking before they can share players.
- Guest identities are device-bound. Clearing browser storage loses access until account linking exists.
- The frontend and game server can live on different hosts. Both must use HTTPS/WSS in production.

## Deployment status

- Code complete: yes.
- Neon PostgreSQL provisioned and migrated: yes, including a validated SQLite-to-PostgreSQL fixture migration.
- Public deployment: live. See the section below.
- Physical iOS/Android testing: pending. Mobile evidence is browser emulation only.
- Real-player beta: ready to start.

See `BETA_TESTING.md` for the 15-20 player beta plan and pass criteria.

## Live public beta

| Piece | Value |
| --- | --- |
| Frontend | `https://vibemilitia.vercel.app` |
| Vercel project | `vibemilitia` in team `endy-s-winning-szn`, root directory `.`, production branch `main` |
| Game server | `https://vibemilitia-game.endyos.xyz` |
| Host | `endy-vps` (`hermes.endyos.xyz`), shared Ubuntu 24.04 VPS |
| Game service | systemd user unit `vibe-militia.service`, `Restart=always`, linger enabled |
| Tunnel service | systemd user unit `vibe-militia-tunnel.service` for the Cloudflare named tunnel `vibe-militia-game` |
| Listen address | `127.0.0.1:2767`, never published directly |
| Persistence | Neon PostgreSQL project `vibe-militia`, branch `main`, database `vibe_militia` |

### Host layout

The game server follows the same isolation pattern as the other Colyseus service on this box:

```text
~/apps/vibe-militia             symlink to the active release
~/apps/vibe-militia-releases/   one directory per deployed commit
~/apps/vibe-militia.env         0600 runtime environment
~/apps/vibe-militia-data/       SQLite fallback directory
~/.config/vibe-militia/         cloudflared config (0600)
~/.config/systemd/user/         vibe-militia*.service units
```

`endy-vps` does not expose inbound 80/443 and has no passwordless sudo. Public ingress is a dedicated Cloudflare Tunnel connector that dials out, so no shared proxy configuration is edited and no global firewall rule changes. Do not expose port 2767.

`PORT=2767` is deliberate because `2567` belongs to another Colyseus service on the same host. `HOST=127.0.0.1` keeps the listener on loopback.

### Production environment

Frontend build variable, set on the Vercel project for Production only:

```text
NEXT_PUBLIC_GAME_SERVER_URL=https://vibemilitia-game.endyos.xyz
```

Game server variables, in `~/apps/vibe-militia.env`:

```text
NODE_ENV=production
PORT=2767
HOST=127.0.0.1
DATABASE_URL=<Neon pooled production connection string>
DATABASE_SSL=1
DATABASE_POOL_MAX=5
DATABASE_PATH=/home/endy/apps/vibe-militia-data/vibe-militia.sqlite
ALLOWED_ORIGINS=https://vibemilitia.vercel.app
PUBLIC_GAME_SERVER_URL=https://vibemilitia-game.endyos.xyz
RECONNECT_GRACE_SECONDS=30
MATCH_COUNTDOWN_MS=20000
XP_MIN_PARTICIPATION_MS=45000
TRUST_PROXY=1
```

Preview deployments deliberately have no `NEXT_PUBLIC_GAME_SERVER_URL`. They fall back to `http://localhost:2567`, so an untrusted preview cannot reach the production game server. Only the production origin is allowed by `ALLOWED_ORIGINS`.

`MATCH_COUNTDOWN_MS=20000` is production tuning, not a code change. A cold invite-link load over the public internet takes 15-18 seconds, so a shorter countdown fills the room with bots before the invited player arrives. Humans joining after the countdown still replace bots.

`VIBE_MILITIA_TEST_HOOKS` is unset in production.

### Deploying a new commit

```bash
# 1. Build a release tarball from the exact commit.
git archive --format=tar.gz --prefix=vibe-militia/ -o vm.tar.gz HEAD
# 2. Ship and install it on the host.
scp vm.tar.gz endy-vps:/tmp/
ssh endy-vps 'REL=$HOME/apps/vibe-militia-releases/<sha>; mkdir -p $REL && tar -xzf /tmp/vm.tar.gz -C $REL --strip-components=1 && cd $REL && npm ci --omit=dev && ln -sfn $REL $HOME/apps/vibe-militia && systemctl --user restart vibe-militia.service'
# 3. Redeploy the frontend when NEXT_PUBLIC_* values changed.
vercel --prod
```

Keep the previous release directory so a rollback is a symlink swap plus a service restart.

### Verification

```bash
BASE_URL=https://vibemilitia.vercel.app \
COLYSEUS_URL=https://vibemilitia-game.endyos.xyz \
npm run verify:production
```

Restart the game service first so no leftover rooms compete with matchmaking:

```bash
ssh endy-vps 'systemctl --user restart vibe-militia.service'
```

The suite uses real Chromium sessions and no test hooks. It covers HTTPS endpoints, PostgreSQL readiness, guest creation, the character picker, countdown join, bot fill, movement sync between two browsers, firing, grenades, cache collection, match completion, replay, reconnect, mobile landscape layout and WSS handling. XP needs a full-length round, so the suite plays a second human-only match to clear the 45 second participation floor.

## Release checks without production writes

`npm run verify:production` creates guest profiles and fills seats with SDK clients. Use it only when that is acceptable. For a routine release:

1. Run the new release beside production on a spare loopback port against the Neon test branch, with no test hooks, and prove XP there with `node scripts/verify-release.mjs`.
2. Confirm no live rooms, swap the symlink and restart. Deploy the backend before the frontend.
3. Run `BASE_URL=https://vibemilitia.vercel.app NO_GUEST=1 node scripts/verify-release.mjs`. It blocks guest creation and writes nothing.
4. `node scripts/probe-public-network.mjs` reports public RTT and snapshot health with no profile.

