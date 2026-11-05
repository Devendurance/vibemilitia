# Left Off

## Current task

P3C is complete: elimination loot, real online weapon ownership, four advanced weapons, authored caches, bot acquisition and visual/performance verification are implemented. Stop before P4.

## Done

- P3C-A: three-slot online ownership, starter rifle/scatter/empty loadout, duplicate magazine refill, full-loadout `E` swap, server-owned ammo/cooldowns, elimination loot with 12-second expiry and 48-entity cap, Vibe Lance caches, both-client loot views, late join, contest, respawn reset and replay cleanup.
- P3C advanced weapons: Akimbo Rifles, Vibe SMG, Heavy Cannon and Rocket Launcher in the registry, authoritative firing, projectiles, reload, swap, respawn and bot paths.
- Akimbo: server-owned barrel alternation, dual PlayerVisuals layers, shared 36-round magazine, dual muzzle flash.
- Rocket: 850 px/s projectile, 180 px blast, 120 to 40 falloff, terrain/combatant collision, self-damage, no double direct plus explosion damage, no grenade cost.
- Caches: 31 authored supply caches, including 2 Akimbo, 2 SMG, 1 Heavy Cannon, 1 Rocket Launcher and the existing 2 Lance, 14 medkits and 9 grenades. Moved the unreachable akimbo cache to `akimbo-left-high` (280, 944).
- Bots: can acquire advanced weapons and dynamic loot, respect advanced ammo/reload, and drop their actual carried weapon. Default rifle bots keep existing combat behavior.
- Visuals: advanced weapon textures, projectile textures, rocket trail/explosion, cannon impact, HUD SVG icons, offscreen pickup/loot culling.
- Tests: `advancedWeapons.test.ts`, `GameSimulationArsenal.test.ts`, updated loot/pickups/bots/grenade suites, new `verify-online-arsenal.mjs`.
- Final suites: unit 147, local browser 37/37, countdown 16/16, matchmaking 11/11, characters 35/35, bots 32/32, match 25/25, pickups 29/29, grenades 28/28, stinking 25/25, loot 41/41, arsenal 26/26, rooms 16/16.
- Typecheck, lint and production build pass.
- Performance clean run: stress 60 fps, 0.06 ms average tick, 0.15 ms p95, 10 peak loot, 7 grenades, 7 clouds, 31 advanced shots, 16,319-byte snapshot, second room live, 15/15 checks. Standard 58 to 59 fps, 0.22 ms average, 0.77 ms p95, 6/6 checks.
- Screenshots in `artifacts/p3c/`: akimbo pickup/firing, SMG firing, cannon firing/impact, rocket flight/explosion, advanced elimination loot, eight-combatant mixed lineup.
- README, agent-state and `.fast-build/STATE.md` updated with P3C results and limitations.

## Next

- Commit and push the P3C advanced arsenal checkpoint.
- Stop before P4. Start P4 only on a new instruction.

## Known issues

- FPS and tick measurements are sensitive to machine load. A clean run needs no competing Chrome or build processes.
- Verification hooks require `VIBE_MILITIA_TEST_HOOKS=1`; arsenal and loot also use `MATCH_COUNTDOWN_MS=0`.
- Projectile cap is 220 room-wide. Sustained fire degrades rather than growing state without bound.
- No reconnect, lag compensation, audio or persistent progression.

## Baseline

- P3C arsenal commit: `76a463f`.
- Last pre-P3C checkpoint: `b8f8641` (P3C-A). P3C-A baseline: `4c06103`.
- `origin/main` matches the P3C arsenal commit.
