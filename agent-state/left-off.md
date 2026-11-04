# Left Off

## Current task

P3B-A world pickups and medkits are implemented and verified. P3B-B and P3B-C have not started.

## Done

- Added `src/game/core/pickups.ts` with pure pickup, respawn and medkit rules.
- Added 14 fixed medkit spawns across Sector 07 ground routes and elevated platforms, each on a platform top and away from spawn bodies.
- Added authoritative pickup state to `GameSimulation`: proximity collection, capacity checks, one-grant collection, 20-second respawns and room-isolated state.
- Added per-combatant `medkits` and room `pickups` to snapshots, plus `pickup-collected`, `pickup-respawn` and `medkit-used` events.
- Added `useMedkit` to the input protocol and server handling. H is buffered in `InputController`; the HUD also has a clickable use button.
- Added a generated VibeVibe-style medkit pickup texture, world bobbing, collection and heal effects.
- Added an online HUD medkit row with count, two pips, +50 HP label and a `+N HP` feedback toast.
- Reset pickups on first join, match start, match end and replay. Players lose carried medkits on death/respawn.
- Added 15 unit/integration tests for supply rules, proximity, contested pickups, capacity, healing, cooldown, invalid phases, replay reset and room isolation.
- Added `scripts/verify-online-pickups.mjs` with 28 production browser checks.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 68 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:characters`: 35/35
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:pickups`: 28/28
- `npm run verify:online:match`: 25/25
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 60 fps, 0.19 ms average server tick, 0.39 ms p95
- Pickup evidence: two clients saw identical 14-item lists, a collected medkit disappeared for both, a late join saw no duplicated inventory, a second room kept the pickup active, the world pickup respawned after 20 seconds, H healed 51 to 100 HP with +49 HP feedback, and duplicate use consumed nothing extra.
- The local browser suite had one flaky drone-aim run (34/37) and passed 37/37 on the next run. No local combat code was changed.

## Next

1. Stop here and report P3B-A evidence with screenshots in `artifacts/p3b-a/`.
2. Await approval before beginning P3B-B contact and frag grenades.
3. P3B-B still needs throwable inputs (4/5/6 select, G throw), grenade projectiles, explosions, damage falloff, pickups and HUD.
4. P3B-C still needs stinking clouds, bot supply decisions and final integration.
5. Future: reconnect/resume and lag compensation remain unfinished.

## Checkpoint

P3B-A code, tests and docs are committed at `73bc987` on `main`. P3B-B has not started.
