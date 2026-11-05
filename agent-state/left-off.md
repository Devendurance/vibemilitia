# Left Off

## Current task

P4 is complete: mobile touch, original audio, XP and levels, guest SQLite profiles, cosmetics, reconnect, UX/accessibility polish and production hosting configuration are implemented and verified. Stop before P5.

## Done

- Mobile: landscape touch controls for move, aim, fire, jump/jetpack, reload, three weapons, grenade select/throw, medkit, swap and settings. Shared ControlFrame, pointer capture, safe areas, 0.18 dead zone, multi-touch, cancellation reset and compact touch HUD. Verified with Chromium 844 x 390 emulation and CDP multi-touch, not physical hardware.
- Audio: original Web Audio synthesis for every required gameplay and UI event, persistent master/effects/mute, gesture unlock, 14-voice cap and jetpack loop.
- Progression: server-confirmed XP, 50-level curve, participation checks, per-match caps, level-up celebration, results breakdown, titles, badges, elimination variants and jetpack trails.
- Persistence: `node:sqlite` ProfileStore with migrations, WAL, hashed guest tokens, 174 tests, match idempotency, recent matches, weapon stats, unlocks and `VACUUM INTO` backups. Verified across server restart.
- Reconnect: 20-second configurable grace, same seat/session/inventory, reserved capacity, input clearing, no extra invulnerability, reconnect overlay and clean lobby return after expiry.
- UX: lobby onboarding banner, settings guide, reconnect status, profile panel, XP results, compact mobile HUD, accessible labels and reduced-motion styles.
- Deployment: env validation, production origin guards, WebSocket origin checks, `/health`, `/ready`, structured logs, API and input limits, Dockerfile, Compose, `.env.example` and `DEPLOYMENT.md`.
- Final suites: unit 174; local 37/37; countdown 16/16; matchmaking 11/11; characters 35/35; bots 32/32; match 25/25; pickups 29/29; grenades 28/28; stinking 25/25; loot 41/41; arsenal 26/26; P4 33/33; rooms 16/16.
- Performance: standard 60 fps, 0.245 ms average tick, 0.547 ms p95. Stress 60 fps, 0.041 ms average, 0.128 ms p95, all four advanced weapons, 31 advanced shots, 8 clouds, max overlap 8, 17,600-byte snapshot, second room live.
- Screenshots: `artifacts/p4/` desktop lobby/match/results, mobile lobby/touch/final, plus stress and test artifacts.

## Next

- Commit and push the P4 checkpoint.
- Stop before P5. Start P5 only on a new instruction.

## Known issues

- Reconnect does not survive a full page reload or game-server restart.
- Guest profiles are device-bound. SQLite supports one persistent game-server process. No account linking.
- Mobile was not tested on physical iOS or Android hardware.
- No gamepad, remapping, licensed music, voice, ranked mode or public deployment.
- Verification hooks require `VIBE_MILITIA_TEST_HOOKS=1`; P4 suite also needs a disposable DB and short countdown/grace env.
- Matchmaking suite expects a clean server because old open rooms can absorb Quick Match clients.

## Baseline

- P4 working tree is uncommitted at the time of writing.
- Last verified checkpoint before P4: `7dfb28b`.
