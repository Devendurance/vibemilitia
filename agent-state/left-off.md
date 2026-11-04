# Left Off

## Current task

P3C-A elimination loot, real online weapon ownership and authored Vibe Lance pickups are implemented and verified. Stop before P3C-B.

## Done

- Added `src/game/core/weaponInventory.ts`: three-slot online ownership, starter rifle/scatter/empty loadout, empty and duplicate outcomes, explicit replacement rules and unowned-slot rejection.
- Added server-owned `HumanRuntime.weaponIds` and per-slot `WeaponState`. Empty slots cannot fire or reload. Death and respawn restore the starter loadout.
- Added duplicate magazine refill: equipped copy first, otherwise the lowest-ammo owned copy, capped at one full magazine.
- Added full-loadout `E` swap. The server replaces the equipped slot, scraps the old weapon and emits `weapon-swapped`. No weapon duplication path remains.
- Added `src/game/core/loot.ts`: three-item elimination bundles, victim weapon and ammo, deterministic grenade selection, platform settling, 12-second expiry, 48-entity room cap, oldest-first cleanup and nearest collectable search.
- Added hostile elimination generation for bullets, contact, frag and toxic damage, including bot victims and disconnected toxic owners. Self and duplicate deaths create no loot.
- Added server proximity collection, capacity-gated medkits/grenades, explicit full-inventory swap, two-client contest safety and match start/end/replay cleanup.
- Added two authored Vibe Lance caches at mid-step and right-high with 25-second respawn. Existing medkit and grenade caches keep their behavior.
- Added snapshot `loot`, per-slot `owned` weapon data, `equippedSlot`, and events `loot-collected`, `loot-expired`, `weapon-swapped`, extended elimination payloads.
- Added HUD empty slots, owned and reload states, nearby weapon prompt, clickable swap control, field pickup payload text and batch feedback priority.
- Added one-shot voxel cube elimination bursts, loot drop-in/beam/glow/bob/expiry presentation, and loot-expired/swap effects.
- Added `E` to the buffered input controller. Local P1 still ignores it and keeps all three training weapons.
- Added 32 focused unit tests across weapon inventory, loot rules and simulation integration.
- Added `scripts/verify-online-loot.mjs` with 43 production browser checks and screenshots.
- Extended the grenade stress suite with dynamic loot metrics and headed anti-throttling flags.
- Updated README, agent state and Fast Build state.

## Verified

- `npm run typecheck`: pass
- `npm test`: 134 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:characters`: 35/35
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:match`: 25/25
- `npm run verify:online:pickups`: 29/29
- `npm run verify:online:grenades`: all checks pass
- `npm run verify:online:stinking`: 25/25
- `npm run verify:online:loot`: 43/43
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 6/6, 57 fps, 0.28 ms average tick, 0.67 ms p95
- `HEADED=1 npm run verify:online:grenade-perf`: 14/14, 51 fps, 1.04 ms average tick, 0.65 ms p95, 9 peak loot, 8 peak grenades, 7 clouds, 2 overlapping clouds, 25 pickups, 15,460-byte snapshot, second room live
- P3B-C baseline: 60 fps, 0.21 ms average, 0.27 ms p95, 14,471-byte snapshot
- Screenshots in `artifacts/p3c-a/`: elimination burst, three dropped rewards, weapon pickup, swap prompt, inventory swap, contested loot, respawn loadout, match-end cleanup, replay reset
- Local P1 remains 37/37. The ten NFT skins and VIBER-010 cutout are unchanged.

## Next

1. Stop and report P3C-A.
2. Wait for P3C-B instructions.
3. Known limitations: bots do not collect dynamic loot, swapped weapons are scrapped, and loot settles instantly with a client-only scatter animation.

## Checkpoint

P3C-A is ready to commit on `main`. The last verified base checkpoint was `be249c3`.
