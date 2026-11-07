# Left Off

## Current task

Implement and ship the official CC0 hub soundtrack as `feat/hub-background-music`.

## Done

- Researched the three requested Freesound candidates by page metadata. Actual playback audition was unavailable in this environment, so no listening claim is made. Selected Jadis0x's 53.333-second CC0 retro game loop as the best title and loop-format fit, pending human auditory approval.
- Added `public/audio/sector-07-hub-loop.mp3`, 640,775 bytes, 96 kbps, and rights documentation in `ASSET_RIGHTS.md`.
- Added separate Web Audio music gain, lazy decode, one-source loop, preference migration, fade/visibility handling, hub header toggle and settings slider.
- Production browser smoke checks passed hub, music toggle, settings slider, independent persistence and one lazy music request. Full `verify:ux` reached 50/51, with the existing recovered-room movement check flaky/failing. Typecheck, lint, tests and build pass.

- Final commit: `0744a75`. Earlier milestone commits: `21f4ff2` (server identity/rankings/reload recovery), `eebd97b` (hub/practice/mobile overhaul), `e9d3ea1` (verification hardening).
- Frontend: latest Vercel production `dpl_FDvQ89MUKGketaeBWfuYpRaQRNHt`, `https://vibemilitia-kkew73l45-endy-s-winning-szn.vercel.app`, aliased to `https://vibemilitia.vercel.app`. Git automatic deployment works from `main`. The app-code deployment for the UX overhaul was `dpl_4A1gHshqfhUV1FhXzXNUnwtCFrUs` from `e9d3ea1`; later deploys were docs and verification scripts only.
- Backend: `https://vibemilitia-game.endyos.xyz`, release `~/apps/vibe-militia-releases/eebd97b`, symlink `~/apps/vibe-militia`, loopback `127.0.0.1:2767`.
- `/api/config` live: `reconnectGraceSeconds=30`, `matchCountdownMs=20000`, `persistence=postgres`.
- Public UX: `verify:ux` 49/49 with zero browser errors across the ten-size matrix, drawers, practice, reload recovery and a two-human room.
- Public regression: `verify:production` 50/50 against the live URL, including PostgreSQL, two browsers, join, live round, replay, reconnect, XP settlement and mobile guard.
- Local regressions: P1 37/37, P4 35/35, P5 42/42, online match 25/25, online bots 32/32, pickups 28/28, loot 41/41, grenades 28/28, stinking 25/25, arsenal 26/26, clean matchmaking 11/11, characters 34/35 (one timing-only bot skin collision on a late human join; separate run passed the same area), unit 179 pass, typecheck/lint/build pass. PostgreSQL suite 7/7 on a rerun against the test branch after a transient Neon timeout.
- Countdown suite passed core countdown/bot-fill/HUD/lobby checks but failed a strict 90-second-clock assertion after a cold start (sampled 82.85s). Rooms suite was 15/16 with one transient 522 on an HTTP join request and all functional checks passing.
- Headed perf: 46 fps, 1.77 ms average server tick, 5.20 ms p95 while other local test processes were active. Headless UX of the recovered public match measured 59 fps.
- Screenshots and discrepancy log: `artifacts/ux-final/` and `artifacts/ux-production/`. Public regression logs: `artifacts/production-ux11/`.

## Next

1. Create the feature branch, commit and push the soundtrack slice.
2. Open a pull request to main with the audition limitation and verification results.
3. Human-audition the three candidates and confirm or replace the selected loop before merge.
4. Run the 15-20 player beta from `BETA_TESTING.md`.
2. Physical iOS and Android testing.
3. Re-measure headed FPS on an idle host; the 46 fps run was under load.

## Known issues

- Physical phone hardware was unavailable. Mobile evidence is Chromium emulation and CDP multi-touch.
- Practice is the local P1 drone arena and has no online grenades, medkits, advanced caches or loot.
- The production verify script uses one active browser tab for the long combat phase because headless Chrome throttles background tabs. Two-browser room, join and shared-room checks happen before that phase.
- A second tab cannot redeem a live seat because resume context is sessionStorage-scoped.
