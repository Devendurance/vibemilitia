# Left Off

## Current task

P2.5 Slice B is implemented and verified. P3 has not started.

## Done

- Replaced online drone bot visuals with the VIBER-010 character presentation through the shared `CombatantView` and `PlayerVisuals` path.
- Bots now show the Vibe Rifle, 360-degree aiming, muzzle flash, recoil, jetpack exhaust, health bars, damage tint, spawn shield and death/respawn presentation.
- Bot snapshots use feet coordinates like humans. Bot damage uses a human-sized hitbox while navigation keeps the compact movement body.
- Added copper BOT labels above callsigns. Humans keep standard labels.
- Bot projectiles use the Vibe Rifle presentation while preserving the existing balance: 7 damage, 900 speed, 0.055 spread, 3-shot burst and 1600 ms cycle.
- Bot aim and projectile origin now match the character weapon pivot.
- Added `{ dust: false }` option to `PlayerVisuals` for online combatants. Local P1 keeps the full effects.
- Added `verify:online:bots` covering presentation, real projectiles, human damage, bot-vs-bot kills, navigation, thrusters, aiming, health bars, death/respawn, human replacement, disconnect backfill and eight-human no-bot state.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 47 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:bots`: 23/23
- `npm run verify:online:match`: 22/22
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 51 to 60 fps across runs, 0.14 to 0.26 ms average server tick, p95 under 0.6 ms
- Bot verification observed Vibe Rifle projectiles, player damage, bot-versus-bot eliminations, bot death and respawn, damaged health bars, human replacement with no visual ghost, disconnect backfill and no bot visuals in an eight-human match
- Original cutout and archived NFT source are unchanged. P1 transparency checks still pass.
- Production screenshots inspected: eight Viber views, visible weapons, BOT labels, combat feed, death/respawn and eight-human state.

## Next

1. Stop here and report Slice B evidence.
2. Await approval before any P3 work.
3. Future work: official Viber roster and character selection, reconnect/resume, lag compensation and deployment hardening.

## Checkpoint

P2.5 Slice B code and verification are committed on `main`. This file receives the checkpoint hash in the follow-up state commit.
