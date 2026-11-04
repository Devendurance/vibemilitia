# Left Off

## Current task

P3B-B contact and frag grenades are implemented and verified. P3B-C has not started.

## Done

- Added `src/game/core/grenades.ts` with contact/frag configs, typed inventory helpers, blast falloff and circle-rect collision.
- Added server-owned grenade physics to `GameSimulation`: aimed throws, gravity, swept collision substeps, world bounds, owner clearance, frag bouncing, five-second frag fuses and a hard active-entity cap.
- Added contact impact detonation with bright orange-red effects and frag fuse detonation with a flashing warning indicator.
- Added distance falloff, direct-hit damage, terrain cover reduction, self-damage and self-elimination handling without awarding an opponent a kill.
- Added typed grenade inventory: one contact plus one frag at start, max three total, 700 ms throw cooldown, edge-triggered and sequence-guarded throws.
- Added `grenadeSlot` and `throwGrenade` inputs, plus `grenades`, per-human grenade counts, selected type and cooldown in snapshots.
- Added `grenade-thrown` and `grenade-exploded` events.
- Extended the pickup system with three contact caches and three frag caches, distinct orange-red and olive artworks, 22-second respawns and shared contested-pickup rules.
- Added the HUD throwables panel with inline icons, counts, selection, clickable throw control and cooldown status.
- Added supply pickup toasts for grenade and medkit pickups.
- Added self-elimination feed/death handling and excluded self-kills from the local elimination toast.
- Added 18 unit/integration tests for grenade config, inventory, collision, blast falloff, contact/frag detonation, bot kills, self-damage, pickups, invalid throws, replay cleanup and room isolation.
- Added `scripts/verify-online-grenades.mjs` with 29 production browser checks.
- Updated the P3B-A pickup suite for twenty supply caches.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 86 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:characters`: 35/35
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:pickups`: 29/29
- `npm run verify:online:grenades`: 29/29
- `npm run verify:online:match`: 25/25
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 56 to 58 fps, 0.33 to 1.04 ms average server tick, 0.82 to 2.62 ms p95 across clean runs
- Grenade browser evidence: contact and frag caches synchronized across two clients, HUD selection and counts worked, frag detonated after about 4.9 seconds of server simulation time with a visible warning and explosion, contact grenade eliminated a bot near 289 px with kill-feed credit, medkits still healed before the throw, and a second room kept independent grenade and pickup state.
- Visual evidence is in `artifacts/p3b-b/`: loadout and caches, frag thrown, frag warning, frag explosion, contact explosion, contact elimination.
- Performance returns to the baseline after restarting accumulated test rooms. A clean run measured 58 fps and 0.33 ms average tick.

## Next

1. Stop here and report P3B-B evidence.
2. Await approval before beginning P3B-C.
3. P3B-C still needs the stinking grenade, toxic cloud damage-over-time and stacking policy, bot supply decisions, final HUD integration and full acceptance verification.
4. Future: reconnect/resume and lag compensation remain unfinished.

## Checkpoint

P3B-B code, tests and docs are committed at `50f442f` on `main`. P3B-C has not started.
