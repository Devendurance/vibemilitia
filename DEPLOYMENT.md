# Deployment

Vibe Militia has two deployables:

1. A Next.js frontend. It can run on Vercel, a Node host, or any static-compatible Next.js host.
2. A persistent Colyseus Node.js process. It must not run as a serverless function, because matches, countdowns, reconnection seats and WebSocket connections live in memory.

Guest progression is stored in SQLite on a persistent disk attached to the game server.

## Required environment

Build-time frontend variable:

```text
NEXT_PUBLIC_GAME_SERVER_URL=https://game.example.com
```

Game server runtime variables:

```text
NODE_ENV=production
PORT=2567
DATABASE_PATH=/data/vibe-militia.sqlite
ALLOWED_ORIGINS=https://play.example.com
PUBLIC_GAME_SERVER_URL=https://game.example.com
RECONNECT_GRACE_SECONDS=20
MATCH_COUNTDOWN_MS=10000
XP_MIN_PARTICIPATION_MS=45000
TRUST_PROXY=1
```

`ALLOWED_ORIGINS` is mandatory in production and rejects wildcards. It applies to HTTP CORS and WebSocket upgrades. `NEXT_PUBLIC_GAME_SERVER_URL` is embedded at build time, so rebuild the frontend after changing it.

Never enable `VIBE_MILITIA_TEST_HOOKS` in production.

## Local production check

```bash
npm ci
npm run build
DATABASE_PATH=./data/vibe-militia.sqlite npm run server:start
NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:2567 npm run start -- -p 3101
```

The game server exposes:

- `GET /health`: process liveness.
- `GET /ready`: SQLite readiness plus player and match counts.
- `GET /api/config`: reconnect grace and public runtime settings.
- `POST /api/guest`: create a device-bound guest and opaque token.
- `GET /api/profile`: read the authenticated guest profile.
- `PATCH /api/profile`: update callsign, skin, equipped cosmetics or claim pending awards.

## Docker

```bash
cp .env.example .env
# Edit .env with real origins and the public game-server URL.
docker compose up -d --build
```

The compose file mounts `vibe-militia-data` at `/data`. A named volume is persistent across container recreation. Do not deploy the server with an ephemeral filesystem and claim durable progression.

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

## Persistence and migrations

The server creates the database directory and applies schema version 1 on startup. `schema_migrations` records applied versions. Future migrations must be additive and versioned in `server/persistence/ProfileStore.ts`.

The database uses WAL mode, foreign keys and a five-second busy timeout. Use one game-server process per SQLite file. For horizontal scaling, move `ProfileStore` to a shared database such as Postgres before adding a second game-server replica.

Back up while the server is running:

```bash
npm run db:backup
# or
DATABASE_PATH=/data/vibe-militia.sqlite npm run db:backup /backups/nightly.sqlite
```

The backup command uses SQLite `VACUUM INTO`, producing a consistent copy. Store backups off the game-server disk. Restore by stopping the server, replacing the database file, and starting the server again.

## Operations

- Restart policy: `restart: unless-stopped`.
- Health check: `/ready`, every 30 seconds.
- Logs: one JSON object per line on stdout/stderr with `at`, `level`, `service`, `message` and safe fields. Guest tokens are never logged.
- Input rate limit: 45 messages per second per client.
- API rate limit: 120 requests per minute per IP, with guest creation capped at 10 per minute per IP.
- Match capacity: eight humans per room. Disconnected seats stay reserved for `RECONNECT_GRACE_SECONDS`, then a bot backfills.
- WebSocket message size and API body size: API bodies are capped at 16 KB. Client inputs are validated and clamped on the server.

## Scaling limits

- In-memory room and seat state is lost on a game-server restart. Reconnect works across network drops, not across process restarts.
- SQLite is appropriate for one persistent game-server process. Use a shared database before running multiple game-server replicas.
- Guest identities are device-bound. Clearing browser storage loses access until account linking exists.
- The frontend and game server can live on different hosts. Both must use HTTPS/WSS in production.

## Deployment status

This repository contains deployment-ready configuration and verified local production startup. No public deployment was performed in this milestone because no hosting credentials or infrastructure access were supplied. No live URL is claimed.
