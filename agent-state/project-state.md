# Project State

## What this is

Vibe Militia is a side-view free-for-all arena shooter built with Next.js 16, React 19, Phaser 4.2.1, TypeScript and Colyseus 0.18. The local route stays playable against bots. The online route adds server-authoritative rooms for up to eight human and bot combatants, with a pre-match countdown, server-side Quick Match placement, ten validated official Viber skins and a player-facing character picker.

VIBER-010 remains the default and fallback, preserved from the original Vibe Vibers NFT artwork. Players can select any of the ten validated characters before joining. Online bots draw unique skins from appearances not already occupied where possible.

## Current build

- One arena: Sector 07, 3600 x 1500, with a ground lane, tiered left route, center bridge, right elevated route, floating perches and fourteen respawn pads.
- Local match: 90 seconds, first to 10 eliminations, one human and three bots.
- Online rooms: 90 seconds, first to 10 eliminations, eight combatant seats. New rooms run a configurable 10-second countdown, then fill empty seats with bots. Eight humans start immediately. Humans joining live replace bots. Disconnects backfill with a bot.
- Matchmaking: Quick Match filters to rooms with open human seats, prefers the most populated room, and creates a new room when current rooms fill. Seat races retry safely.
- Character selection: a keyboard-accessible ten-card picker with a large preview sits in the online lobby. The selection is stored locally, sent on every join path, validated by the server and shown in the HUD portrait, HUD name and in-world body. Invalid saved or submitted IDs fall back to VIBER-010.
- Player: accelerated movement, jump, fuel-limited jetpack, 360 aim, three weapons, reload, damage, delayed regeneration, medkit inventory, automatic fair-pad respawn and 1.5 s spawn protection.
- Supplies: twenty fixed server-authoritative caches, fourteen medkits plus three contact and three frag grenade caches. Players carry up to two medkits and three grenades total. Collected caches disappear for every client and respawn after 20 to 22 seconds.
- Grenades: contact grenades detonate on terrain or combatant impact. Frag grenades bounce and detonate after five seconds of server simulation time. Both use gravity, swept substeps, blast falloff, terrain cover reduction, self-damage and existing elimination attribution.
- Weapons: Vibe Rifle, Scatter Blaster (seven pellets), Vibe Lance (two-shot precision). Each has independent ammo, cadence, reload, recoil, projectile texture, weapon texture and HUD slot.
- Bots: online bots use ten validated official Viber skins with unique server-assigned `skinId` values, visible Vibe Rifle, muzzle flare, recoil, jetpack exhaust, health bars, damage reaction, spawn shield, death/respawn presentation and BOT callsign labels. They keep A* navigation, platform colliders, path smoothing, line-of-sight burst fire, vertical thrusters, stuck recovery, target hysteresis, bot-versus-bot combat and automatic respawns. Local P1 bots remain the original drones.
- Online networking: Colyseus rooms, 60 Hz server tick, 20 Hz snapshots, 30 Hz client input, 45 messages/second input cap, local prediction with soft reconciliation, remote interpolation, projected bullets and server-side validation.
- Room lifecycle: countdown, lobby, server-side quick match, create room, realtime room browser, invite links, full-room and ended-room errors, replay in the same room and auto-dispose when empty.
- HUD: identity, health, jetpack, medkit count and use feedback, grenade selection and counts, throw cooldown, supply pickup feedback, match clock, leaderboard, kill feed, weapon selector, ammo, reload, controls, debug, death overlay, results, boot overlay, online ping and server tick.
- Browser test APIs: `window.__VIBE_MILITIA__` for local, `window.__VIBE_MILITIA_ONLINE__` for online.

## Architecture

- `src/game/core`: pure rules for jetpack, weapon, combat, match timer/ranking, spawn selection, pickup/medkit supply rules and grenade physics/damage helpers.
- `src/game/ai`: pure navigation grid and A* pathfinding.
- `src/game/config`: tuning for movement, weapons, bots and match.
- `src/game/arena`: arena data, baked visuals and collision helpers.
- `src/game/entities`: Player, PlayerVisuals and Drone for local mode.
- `src/game/scenes/ArenaScene.ts`: local Phaser orchestration, AI, scoring and match flow.
- `src/game/characters`: generated validated roster manifest and typed skin lookup.
- `src/game/multiplayer`: shared protocol, deterministic human movement and authoritative `GameSimulation`.
- `src/game/online`: online Phaser scene, combatant views and game bootstrap.
- `server`: Colyseus bootstrap, FFA room lifecycle, bot seat replacement, input limits and metadata.
- `src/components/online`: lobby, room browser, invite flow and online session bar.
- `src/game/bridge.ts`: typed HUD snapshot and command transport shared by both modes.
- `scripts/verify-browser.mjs`: P1 Playwright regression suite.
- `scripts/verify-online-match.mjs`, `verify-online-rooms.mjs`, `verify-online-perf.mjs`: P2 browser and performance suites.
- `scripts/verify-online-pickups.mjs`: P3B-A pickup, medkit and room-isolation suite.
- `scripts/verify-online-grenades.mjs`: P3B-B grenade inventory, fuse, explosion, elimination and room-isolation suite.

## Key decisions

- `/` remains P1 local mode. `/online` is the multiplayer route so the local game stays an independent fallback.
- The server owns movement, health, ammo, projectiles, damage, eliminations, bots, clocks and outcomes. Clients send inputs only.
- Snapshots are Colyseus messages rather than schema-driven simulation state.
- Shared AABB movement in `humanMovement.ts` keeps client prediction aligned with the server without Phaser physics in Node.
- Every room fills to eight combatants with bots at countdown expiry. Eight humans start immediately. Humans replace bots without resetting the clock. Disconnects return a bot to the seat.
- Quick Match uses Colyseus `joinOrCreate` with an `open` metadata filter and `clients: -1` ordering. This keeps concurrent joins in the most populated room instead of racing client-side.
- FFA room handlers enable realtime listing so countdown and phase changes reach the lobby.
- Countdown state is server-owned. Combat input is frozen until the match is live.
- Ten official source images were each confirmed as a distinct single-character render. The deterministic matte pipeline prepared and validated all ten.
- Online bots reuse `PlayerVisuals` with per-skin textures from `src/game/characters/roster.json`. Bot snapshots use feet coordinates, and bot damage uses the character-sized hitbox while navigation keeps the compact movement body.
- `skinId` is server-authoritative. Human selections are validated against the roster and stored in `HumanRuntime`; invalid values fall back to VIBER-010. Bots choose room-seeded unique skins, retain them through death/respawn, and receive valid unused skins after human replacement and disconnect backfill.
- Character selection is cosmetic only. It never changes health, damage, weapons or movement.
- The picker uses native radio inputs in a fieldset, so arrow keys, Space and focus behavior work without a custom keyboard handler.
- `vibe-militia-skin` stores the selected ID locally. The default is persisted on first load and invalid values are repaired.
- Bot projectiles use the Vibe Rifle presentation while preserving the previous 7 damage, 900 speed, 0.055 spread and 3-shot burst cadence.
- Replay restarts the same room, resets scores and health, and keeps its human occupants.
- Pickups are server-owned room state. Collection validates proximity and capacity, a pickup can be granted once, and the item respawns after a fixed cooldown. Late joins read the same authoritative state.
- Medkits are instant, capped at 100 HP, consumed from a two-slot inventory and gated by a 900 ms server cooldown. A player loses carried medkits on death/respawn. Pickups reset when a match starts, when it ends and on replay.
- Fourteen fixed medkit spawns sit on platform tops near, but outside, spawn bodies. Six grenade caches use distinct contact and frag artworks. Bots do not collect supplies or throw grenades yet; that belongs to P3B-C.
- Grenade config: contact 180 max damage, 220 blast radius, immediate impact; frag 120 max damage, 215 blast radius, 5000 ms server fuse. Both use 700 ms throw cooldowns, 1500/1400 gravity, swept collision and a 64-entity active cap.
- Grenade inventory is server-owned and starts at one contact plus one frag, capped at three total. Throws are edge-triggered, input-sequence guarded and cooldown-gated. Death and respawn reset the loadout.
- One explosion damages each combatant at most once. Blast cover reduces damage by 55 percent. Self-eliminations count as deaths and feed entries but never award an opponent a kill. Grenades clear at match start, match end and replay.
- Static authored NFT pose is intentional. Weapon and effects remain separate layers.
- HUD follows `DESIGN.md`: graphite panels, lime signal color, mono telemetry, Archivo display type.

## Verification

- `npm run typecheck`: pass
- `npm test`: 86 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks against the production build
- `npm run verify:online:countdown`: 16/16 checks against the production build
- `npm run verify:online:matchmaking`: 11/11 checks against the production build
- `npm run verify:online:characters`: 35/35 checks against the production build
- `npm run verify:online:bots`: 32/32 checks against the production build
- `npm run verify:online:pickups`: 29/29 checks against the production build
- `npm run verify:online:grenades`: 29/29 checks against the production build
- All ten cards render and select, keyboard arrows work, mobile keeps two columns, refresh persists the choice, and corrupt storage falls back to VIBER-010
- Create Room, invite join and Quick Match all used the selected skin, and two clients with different selections agreed on shared combatant skins
- Eight independent human clients kept eight requested skins with no bot visuals
- A selected human kept its skin while dead, after respawn, and after a 90-second match replay
- The server rejected an arbitrary asset URL and fell back to VIBER-010
- 15 concurrent Quick Match clients joined in under a second as 8 + 7 humans across two rooms
- `npm run verify:online:match`: 25/25 checks, 8 humans, time-limit result, identical standings, replay reset, preserved selected skins
- `npm run verify:online:rooms`: 16/16 checks, including countdown auto-start, full-room and ended-room errors
- `HEADED=1 npm run verify:online:perf`: 56 to 58 fps, 0.33 to 1.04 ms average server tick, 0.82 to 2.62 ms p95 across clean runs.
- Pickup suite covered identical 20-cache snapshots on two clients, cross-client disappearance, late-join isolation, independent second-room state, medkit respawn, H healing, HUD feedback and duplicate-use rejection.
- Grenade suite covered HUD selection, one-contact-one-frag starting inventory, a shared frag fuse on two clients, about 4.9 seconds of server simulation time, warning visuals, a real contact-grenade bot kill near 289 px, kill-feed credit, medkit use before combat and independent second-room state.
- Original public sources, archived sources and VIBER-010 cutout hash are unchanged
- Local P1 remains 37/37 with no regression

## Known limitations

- No mid-match reconnect or resume. A disconnected human returns to the lobby and a bot takes the seat.
- No lag compensation or historical hit rewinding.
- Ended rooms need a current occupant to start a replay. New players must join or create another room.
- Room discovery is in-memory and disappears on server restart.
- Combat input is frozen during countdown.
- Quick Match can fall back to creating a new room under extreme seat-race contention.
- Character selection is lobby-only. A player cannot change skin during a live match.
- Humans may select the same character. Bots keep existing appearances if a late human joins with the same skin.
- Bots share the same Vibe Rifle tuning and differ only by official skin, callsign and BOT label.
- Bot navigation uses the compact movement body while damage uses the character-sized hitbox. Tight cover can overlap the visible character more than the navigation body.
- If the roster is smaller than the combatant count, skin assignment gracefully reuses entries rather than fabricating assets.
- Character body is static because the NFT is a 3/4 frontal portrait.
- Medkits reset on death/respawn. Pickup respawn timers run only while the round is live and reset at round start, round end and replay.
- Grenades reset to one contact and one frag on death/respawn. Active grenades clear at match start, match end and replay.
- Bots do not collect pickups or throw grenades yet. Bot supply decisions and grenade use are planned for P3B-C.
- Pickup spawns are fixed authored caches, not dynamic random spawns.
- Blast cover uses a uniform 55 percent reduction when a platform blocks the blast line, not full occlusion.
- Grenade damage is not counted in weapon accuracy. Each grenade has a stable ID and owner for attribution.
- No audio, accounts, wallets, XP or persistent stats.
