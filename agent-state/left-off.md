# Left Off

## Current task

Public beta is deployed and live verified. Next step is the real-player beta from `BETA_TESTING.md` and physical device testing.

## Done

- Public frontend live at `https://vibemilitia.vercel.app`. Vercel project `vibemilitia` in team `endy-s-winning-szn`, Next.js framework, Node 24.x, root directory `.`, production branch `main`, GitHub repo connected.
- Public game server live at `https://vibemilitia-game.endyos.xyz` with a valid Cloudflare certificate and WSS.
- VPS `endy-vps` (`hermes.endyos.xyz`): systemd user units `vibe-militia.service` (loopback `127.0.0.1:2767`) and `vibe-militia-tunnel.service` (Cloudflare named tunnel `vibe-militia-game`). Linger enabled, `Restart=always`, `MemoryMax=1400M`.
- PostgreSQL production branch `main` in Neon project `vibe-militia` is live behind the game server. `/ready` reports `postgres`.
- Backend hardening commit `7cb6a76`: `HOST` config so the server can bind loopback. Test added to `serverConfig.test.ts`.
- `npm run verify:production` added (`scripts/verify-production-beta.mjs`). 50/50 checks pass against the live site with real browsers and no test hooks.
- Live evidence: two browsers share a room, countdown join, bot fill, movement sync, firing with ammo loss, grenade throw, live cache collection, match completion, replay, reconnect after network loss, mobile landscape layout with touch controls, portrait guard, WSS and no mixed-content or CORS errors.
- XP persistence proven end to end: results screen `+40 XP`, then profile via public API showed `xp=80`, `matches=2` across a full-length human-only round.
- Controlled restart: new PID, `/ready` unchanged at `players=71 matches=31`, guest creation still 201, all unrelated services still active.
- `MATCH_COUNTDOWN_MS=20000` in production. A cold invite-link load takes 15-18 s, so a shorter countdown filled rooms with bots before the invited player arrived.

## Next

1. Run the 15-20 player beta from `BETA_TESTING.md`.
2. Physical iOS and Android testing. Mobile evidence so far is browser emulation only.
3. Watch Neon compute time and the VPS memory ceiling during the first real sessions.

## Known issues

- Mobile evidence is emulated landscape, not a physical device.
- One game-server process only. Room state is process-local, so a restart returns everyone to the lobby.
- Invite-link joins can still land after the countdown when the network is slow. That path is safe: the human replaces a bot.
- The production Neon branch contains synthetic guest profiles from verification, including the beta test guests. No real players yet.
- Test hooks must stay disabled in production.

## Baseline

- P4 implementation commit: `280871d`.
- P4 reconnect verification commit: `20348f1`.
- P5 checkpoint: `0c6f7df`.
- Loopback binding hardening: `7cb6a76`.
- Vercel production deployment of `0c6f7df` source: `dpl_EU9ixvPWxfwStJodYeeasZuQ5DfA`.
- `origin/main` should match the deployment docs commit after this checkpoint.
