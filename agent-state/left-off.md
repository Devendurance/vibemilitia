# Left Off

## Current task

UX overhaul milestone is implemented, committed, deployed and verified. P6 not started.

## Done

- Final commit: `e9d3ea1`. Earlier milestone commits: `21f4ff2` (server identity/rankings/reload recovery), `eebd97b` (hub/practice/mobile overhaul).
- Frontend: Vercel production `dpl_4A1gHshqfhUV1FhXzXNUnwtCFrUs`, `https://vibemilitia-oeu7oj914-endy-s-winning-szn.vercel.app`, aliased to `https://vibemilitia.vercel.app`. Git automatic deployment works from `main`.
- Backend: `https://vibemilitia-game.endyos.xyz`, release `~/apps/vibe-militia-releases/eebd97b`, symlink `~/apps/vibe-militia`, loopback `127.0.0.1:2767`.
- `/api/config` live: `reconnectGraceSeconds=30`, `matchCountdownMs=20000`, `persistence=postgres`.
- Public UX: `verify:ux` 49/49 with zero browser errors across the ten-size matrix, drawers, practice, reload recovery and a two-human room.
- Public regression: `verify:production` 50/50 against the live URL, including PostgreSQL, two browsers, join, live round, replay, reconnect, XP settlement and mobile guard.
- Local regressions: P1 37/37, P4 35/35, P5 42/42, online match 25/25, online bots 32/32, pickups 28/28, loot 41/41, clean matchmaking 11/11, characters 34/35 (one timing-only bot skin collision on a late human join; separate run passed the same area), unit 179 pass, typecheck/lint/build pass.
- Headed perf: 46 fps, 1.77 ms average server tick, 5.20 ms p95 while other local test processes were active. Headless UX of the recovered public match measured 59 fps.
- Screenshots and discrepancy log: `artifacts/ux-final/` and `artifacts/ux-production/`. Public regression logs: `artifacts/production-ux11/`.

## Next

1. Run the 15-20 player beta from `BETA_TESTING.md`.
2. Physical iOS and Android testing.
3. Re-measure headed FPS on an idle host; the 46 fps run was under load.

## Known issues

- Physical phone hardware was unavailable. Mobile evidence is Chromium emulation and CDP multi-touch.
- Practice is the local P1 drone arena and has no online grenades, medkits, advanced caches or loot.
- The production verify script uses one active browser tab for the long combat phase because headless Chrome throttles background tabs. Two-browser room, join and shared-room checks happen before that phase.
- A second tab cannot redeem a live seat because resume context is sessionStorage-scoped.
