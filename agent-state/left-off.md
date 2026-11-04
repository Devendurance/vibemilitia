# Left Off

## Current task

P3B-C stinking grenades, toxic clouds, bot supplies and final P3B integration are implemented and verified. P3C has not started.

## Done

- Extended the shared grenade system with `stinking`, slot 6, 760 px/s, 1400 gravity, 900 ms activation, 160 px cloud, 6000 ms duration, 24 HP/s and 250 ms ticks.
- Added a server-owned toxic cloud entity with a global 250 ms damage clock, catch-up for uneven step sizes, 6 HP ticks, one responsible cloud per combatant, closest-cloud selection with lower-ID tie-breaking, invulnerability checks and terrain blocking.
- Added cloud owner ID and name retention for kill-feed attribution after disconnect.
- Added stinking cloud creation and expiry events, snapshot cloud state and per-combatant stinking inventory.
- Added three green stinking caches at mid-step, right-low and the crate-b top, preserving all medkit, contact and frag caches.
- Added green canister and green supply artwork, a thicker layered toxic cloud with bubbles and a strong hazard boundary, toxic damage colors and cloud effects.
- Added the third HUD throwable slot with a stinking icon, counts, selection, throw label and data attributes.
- Added key 6 selection and extended the existing G throw path.
- Added bot medkit inventory, grenade inventory, cooldowns, nearby supply collection, medkit use below 55 HP, range-based medkit/grenade seeking, conservative grenade throws and local toxic cloud avoidance.
- Added bot throw creation through the same shared grenade function as humans.
- Added 16 new unit/integration tests for stinking config, inventory, slots, cloud activation, toxic damage, step-size stability, overlap policy, owner attribution, terrain blocking, invulnerability, cloud expiry, late join, the cloud cap, replay cleanup, room isolation and bot supply/grenade behavior.
- Added `scripts/verify-online-stinking.mjs` with 25 production browser checks.
- Added `scripts/verify-online-grenade-perf.mjs` with 10 controlled stress performance checks.
- Updated the pickup and grenade suites for 23 caches and the three-slot loadout.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 102 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:characters`: 35/35
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:pickups`: 29/29
- `npm run verify:online:grenades`: 29/29
- `npm run verify:online:stinking`: 25/25
- `npm run verify:online:grenade-perf`: 11/11
- `npm run verify:online:match`: 25/25
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 59 fps, 0.36 ms average tick, 1.10 ms p95 on a clean server. Accumulated history measured 56 fps, 0.23 ms average and 0.50 ms p95.
- `HEADED=1 npm run verify:online:grenade-perf`: 60 fps, 0.21 ms average tick, 0.27 ms p95, 5.04 ms max with 8 humans, 8 peak in-flight grenades, 8 active clouds, 2 overlapping clouds, 23 pickups, 14,471-byte snapshots and a second concurrent room.
- Stinking evidence: cloud activation, self toxic damage and self-elimination without credit, an opponent toxic damage and elimination with owner credit, late-join cloud visibility, green cache art and the three-slot HUD.
- Visual evidence is in `artifacts/p3b-c/`: HUD/green cache, cloud activation, self damage, self elimination, opponent damage, opponent elimination, multi-grenade battle, late join and grenade stress battle.
- The 10-character roster, original NFT sources and VIBER-010 cutout remain unchanged.
- Local P1 mode remains 37/37.

## Next

1. Stop here and report P3B-C evidence.
2. Wait for a new P3C instruction before loot, new weapons, progression or other milestones.
3. Future: reconnect/resume and lag compensation remain unfinished.

## Checkpoint

P3B-C code, tests and docs are committed at `PENDING` on `main`. P3C has not started.
