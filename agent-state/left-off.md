# Left Off

## Current task

P2 multiplayer is implemented and verified. P1 remains committed at `1a4d7da` and available at `/`.

## Done

- Added a Colyseus 0.18 server with a lobby, independent FFA rooms, 60 Hz simulation, 20 Hz snapshots, input validation and room health endpoint.
- Added an authoritative simulation for human movement, jetpack, weapons, projectiles, damage, eliminations, bot AI, respawns, match timer, score limit and rematch.
- Added `/online` with guest names, quick match, create room, live room browser, invite links, room codes, ping and server tick.
- Added eight combatant seats, bot fill, human replacement of bots, disconnect bot backfill and room disposal when empty.
- Added client prediction and soft reconciliation, remote interpolation, projectile extrapolation, local muzzle feedback and online HUD mapping.
- Added clear full-room and ended-room errors.
- Added P2 browser verification suites for two-client sync, 90-second completion and replay, concurrent rooms, seat errors and performance.
- Made the P1 browser test robust around active player death and target tracking.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 44 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks against the production build
- `npm run verify:online:match`: 21/21 checks, 8 humans, time-limit result, identical standings, replay reset, 0.06 ms average server tick
- `npm run verify:online:rooms`: 15/15 checks, including full-room and ended-room errors
- `HEADED=1 npm run verify:online:perf`: 52 to 60 fps, 0.57 ms average tick, 0.80 ms p95
- Two independent Chromium contexts saw the same human positions, jetpack state and projectiles
- Closing one browser left the other in a live match with bot backfill
- Prediction view stayed within about 34 px of the authoritative position while moving and converged after input stopped

## Next

1. Add reconnect tokens and mid-match resume.
2. Add lag compensation for hit registration and a repeatable latency test.
3. Review match pacing and bot pressure with real players.
4. Add audio and distinct bot loadouts in a later pass.
5. Add separate client and server deployment configuration.

## Checkpoint

P2 code and verification are committed on `main`. This file is updated with the checkpoint hash in the follow-up state commit.
