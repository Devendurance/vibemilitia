# Project State

## What this is

Vibe Militia is a side-view free-for-all arena shooter built with Next.js 16, React 19, Phaser 4.2.1, TypeScript and Colyseus 0.18. The local route stays playable against bots. The online route adds server-authoritative rooms for up to eight human and bot combatants, with a pre-match countdown and server-side Quick Match placement.

The player operator is VIBER-010, preserved from the original Vibe Vibers NFT artwork.

## Current build

- One arena: Sector 07, 3600 x 1500, with a ground lane, tiered left route, center bridge, right elevated route, floating perches and fourteen respawn pads.
- Local match: 90 seconds, first to 10 eliminations, one human and three bots.
- Online rooms: 90 seconds, first to 10 eliminations, eight combatant seats. New rooms run a configurable 10-second countdown, then fill empty seats with bots. Eight humans start immediately. Humans joining live replace bots. Disconnects backfill with a bot.
- Matchmaking: Quick Match filters to rooms with open human seats, prefers the most populated room, and creates a new room when current rooms fill. Seat races retry safely.
- Player: accelerated movement, jump, fuel-limited jetpack, 360 aim, three weapons, reload, damage, delayed regeneration, automatic fair-pad respawn and 1.5 s spawn protection.
- Weapons: Vibe Rifle, Scatter Blaster (seven pellets), Vibe Lance (two-shot precision). Each has independent ammo, cadence, reload, recoil, projectile texture, weapon texture and HUD slot.
- Bots: online bots use the VIBER-010 character presentation, visible Vibe Rifle, muzzle flare, recoil, jetpack exhaust, health bars, damage reaction, spawn shield, death/respawn presentation and BOT callsign labels. They keep A* navigation, platform colliders, path smoothing, line-of-sight burst fire, vertical thrusters, stuck recovery, target hysteresis, bot-versus-bot combat and automatic respawns. Local P1 bots remain the original drones.
- Online networking: Colyseus rooms, 60 Hz server tick, 20 Hz snapshots, 30 Hz client input, 45 messages/second input cap, local prediction with soft reconciliation, remote interpolation, projected bullets and server-side validation.
- Room lifecycle: countdown, lobby, server-side quick match, create room, realtime room browser, invite links, full-room and ended-room errors, replay in the same room and auto-dispose when empty.
- HUD: identity, health, jetpack, match clock, leaderboard, kill feed, weapon selector, ammo, reload, controls, debug, death overlay, results, boot overlay, online ping and server tick.
- Browser test APIs: `window.__VIBE_MILITIA__` for local, `window.__VIBE_MILITIA_ONLINE__` for online.

## Architecture

- `src/game/core`: pure rules for jetpack, weapon, combat, match timer/ranking and spawn selection.
- `src/game/ai`: pure navigation grid and A* pathfinding.
- `src/game/config`: tuning for movement, weapons, bots and match.
- `src/game/arena`: arena data, baked visuals and collision helpers.
- `src/game/entities`: Player, PlayerVisuals and Drone for local mode.
- `src/game/scenes/ArenaScene.ts`: local Phaser orchestration, AI, scoring and match flow.
- `src/game/multiplayer`: shared protocol, deterministic human movement and authoritative `GameSimulation`.
- `src/game/online`: online Phaser scene, combatant views and game bootstrap.
- `server`: Colyseus bootstrap, FFA room lifecycle, bot seat replacement, input limits and metadata.
- `src/components/online`: lobby, room browser, invite flow and online session bar.
- `src/game/bridge.ts`: typed HUD snapshot and command transport shared by both modes.
- `scripts/verify-browser.mjs`: P1 Playwright regression suite.
- `scripts/verify-online-match.mjs`, `verify-online-rooms.mjs`, `verify-online-perf.mjs`: P2 browser and performance suites.

## Key decisions

- `/` remains P1 local mode. `/online` is the multiplayer route so the local game stays an independent fallback.
- The server owns movement, health, ammo, projectiles, damage, eliminations, bots, clocks and outcomes. Clients send inputs only.
- Snapshots are Colyseus messages rather than schema-driven simulation state.
- Shared AABB movement in `humanMovement.ts` keeps client prediction aligned with the server without Phaser physics in Node.
- Every room fills to eight combatants with bots at countdown expiry. Eight humans start immediately. Humans replace bots without resetting the clock. Disconnects return a bot to the seat.
- Quick Match uses Colyseus `joinOrCreate` with an `open` metadata filter and `clients: -1` ordering. This keeps concurrent joins in the most populated room instead of racing client-side.
- FFA room handlers enable realtime listing so countdown and phase changes reach the lobby.
- Countdown state is server-owned. Combat input is frozen until the match is live.
- Online bots reuse `PlayerVisuals` and the VIBER-010 cutout. Bot snapshots use feet coordinates, and bot damage uses the character-sized hitbox while navigation keeps the compact movement body.
- Bot projectiles use the Vibe Rifle presentation while preserving the previous 7 damage, 900 speed, 0.055 spread and 3-shot burst cadence.
- Replay restarts the same room, resets scores and health, and keeps its human occupants.
- Static authored NFT pose is intentional. Weapon and effects remain separate layers.
- HUD follows `DESIGN.md`: graphite panels, lime signal color, mono telemetry, Archivo display type.

## Verification

- `npm run typecheck`: pass
- `npm test`: 47 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks against the production build
- `npm run verify:online:countdown`: 16/16 checks against the production build
- `npm run verify:online:matchmaking`: 11/11 checks against the production build
- `npm run verify:online:bots`: 23/23 checks against the production build
- 15 concurrent Quick Match clients joined in under a second as 8 + 7 humans across two rooms; the second room filled one bot at countdown expiry
- `npm run verify:online:match`: 22/22 checks, 8 humans, time-limit result, identical standings, replay reset, 0.09 ms average server tick
- `npm run verify:online:rooms`: 16/16 checks, including countdown auto-start, full-room and ended-room errors
- `HEADED=1 npm run verify:online:perf`: 59 fps, 0.14 ms average server tick, 0.30 ms p95
- Bot verification observed Vibe Rifle projectiles, human damage, bot-versus-bot eliminations, bot death and respawn, BOT labels, damaged health bars, human replacement, disconnect backfill and no bots in an eight-human match
- Original cutout and archived NFT source are unchanged
- Local P1 remains 37/37 with no regression

## Known limitations

- No mid-match reconnect or resume. A disconnected human returns to the lobby and a bot takes the seat.
- No lag compensation or historical hit rewinding.
- Ended rooms need a current occupant to start a replay. New players must join or create another room.
- Room discovery is in-memory and disappears on server restart.
- Combat input is frozen during countdown.
- Quick Match can fall back to creating a new room under extreme seat-race contention.
- All online bots reuse VIBER-010 and the Vibe Rifle until the official roster and character selection milestone.
- Bot navigation uses the compact movement body while damage uses the character-sized hitbox. Tight cover can overlap the visible character more than the navigation body.
- Character body is static because the NFT is a 3/4 frontal portrait.
- No audio, accounts, wallets, XP or persistent stats.
