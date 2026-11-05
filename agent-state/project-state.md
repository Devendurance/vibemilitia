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
- Supplies: thirty-one fixed server-authoritative caches: fourteen medkits, three contact, three frag, three stinking and eight weapon caches (two Vibe Lance, two Akimbo Rifles, two Vibe SMG, one Heavy Cannon, one Rocket Launcher). Players carry up to two medkits and three grenades total. Collected caches disappear for every client and respawn after 20 to 25 seconds depending on type.
- Online weapons: server-authoritative three-slot inventory over seven weapons. Starter loadout is Vibe Rifle, Scatter Blaster and an empty slot. Vibe Lance and all four advanced weapons are acquired from authored world pickups or elimination drops. Full loadouts require an explicit `E` swap. Duplicate pickups refill one full magazine. Empty slots cannot fire. Death and respawn restore the starter loadout.
- Advanced weapons: Akimbo Rifles (36 shared rounds, 85 ms, 10 damage, 1.8 s reload, server-alternated barrels and dual visible layers), Vibe SMG (30 rounds, 70 ms, 8 damage, 1.25 s reload), Heavy Cannon (5 rounds, 900 ms, 60 damage, 2.1 s reload), Rocket Launcher (3 rounds, 1100 ms, 850 px/s projectile, 180 px blast, 120 to 40 falloff damage, self-damage, no grenade cost).
- Elimination loot: every valid hostile human or bot elimination creates one equipped-weapon drop, one medkit and one grenade. Items scatter and settle on reachable platform tops, last 12 seconds of server time, use server proximity collection, cap at 48 active entities per room, and are cleared on match start, end and replay. Self and duplicate deaths create no loot.
- Grenades: contact grenades detonate on terrain or combatant impact. Frag grenades bounce and detonate after five seconds of server simulation time. Stinking grenades bounce, activate a 160 px toxic cloud after 900 ms, and apply 24 HP/s in deterministic 250 ms ticks for six seconds. All use gravity, swept substeps, owner clearance, blast falloff or toxic damage, self-damage and existing elimination attribution.
- Bots: online bots carry the one-of-each grenade loadout, collect nearby supplies, seek medkits when injured, use medkits, throw finite server-owned grenades with conservative cooldowns, steer away from nearby toxic clouds, and can acquire advanced weapons or dynamic loot when curious. Existing A* movement, targeting and rifle combat are preserved.
- Weapons: Vibe Rifle, Scatter Blaster (seven pellets), Vibe Lance (two-shot precision), Akimbo Rifles, Vibe SMG, Heavy Cannon and Rocket Launcher. Each has independent ammo, cadence, reload, recoil, projectile texture, weapon texture and HUD slot.
- Bots: online bots use ten validated official Viber skins with unique server-assigned `skinId` values, visible Vibe Rifle, muzzle flare, recoil, jetpack exhaust, health bars, damage reaction, spawn shield, death/respawn presentation and BOT callsign labels. They keep A* navigation, platform colliders, path smoothing, line-of-sight burst fire, vertical thrusters, stuck recovery, target hysteresis, bot-versus-bot combat and automatic respawns. Local P1 bots remain the original drones.
- Online networking: Colyseus rooms, 60 Hz server tick, 20 Hz snapshots, 30 Hz client input, 45 messages/second input cap, local prediction with soft reconciliation, remote interpolation, projected bullets and server-side validation.
- Mobile: responsive landscape touch controls for movement, aim, fire, jump and jetpack, reload, three weapon slots, grenade selection and throw, medkit, swap and settings. Controls write the shared `ControlFrame`, use pointer capture, safe-area insets, a 0.18 dead zone, simultaneous multi-touch and cancellation reset. Coarse-pointer devices hide desktop HUD panels in favour of a compact health, fuel, weapon and clock strip.
- Audio: original Web Audio synthesis for all weapons, grenades, rocket impact, toxic ticks, jetpack, damage, eliminations, pickups, medkit, countdown, victory, defeat and UI. Master/effects volume and mute persist locally. 14-voice ceiling and one smoothed jetpack loop.
- Progression: server-confirmed XP, 50-level curve, per-match participation checks and caps, level-up celebration, results XP breakdown, and level-based titles, badges, elimination variants and jetpack trails. Cosmetics never affect gameplay.
- Guest profiles: opaque server-issued bearer token, SHA-256 at rest, SQLite persistence for identity, skin, XP, matches, wins, losses, eliminations, deaths, per-weapon stats, recent matches, unlocks and equipped cosmetics. Match records are idempotent by `(match_id, player_id)`.
- Reconnect: Colyseus `allowReconnection` with a 20-second configurable grace. Seat, score, character and inventory stay reserved. Buffered input is cleared, no extra invulnerability is granted, and the client shows a reconnect overlay. Grace expiry returns the player to the lobby and restores bot backfill.
- Deployment: validated environment config, strict production `ALLOWED_ORIGINS`, WebSocket upgrade origin checks, HTTP CORS, `/health`, `/ready`, structured JSON logs, API and input rate limits, Dockerfile, Docker Compose, SQLite backup command and `DEPLOYMENT.md`.
- Room lifecycle: countdown, lobby, server-side quick match, create room, realtime room browser, invite links, full-room and ended-room errors, replay in the same room and auto-dispose when empty.
- HUD: identity, health, jetpack, medkit count and use feedback, contact/frag/stinking grenade selection and counts, throw cooldown, supply pickup feedback, match clock, leaderboard, kill feed, weapon selector, ammo, reload, controls, debug, death overlay, results, boot overlay, online ping and server tick.
- Browser test APIs: `window.__VIBE_MILITIA__` for local, `window.__VIBE_MILITIA_ONLINE__` for online.

## Architecture

- `src/game/core`: pure rules for jetpack, weapon, combat, match timer/ranking, spawn selection, pickup/medkit supply rules, grenade physics/damage, toxic cloud configuration, weapon-slot ownership, shared radial damage and dynamic loot.
- `src/game/core/weaponInventory.ts`: starter loadout, slot ownership, duplicate and replacement decisions.
- `src/game/config/gameplay.ts`: `PLAYER_WEAPONS` (three P1 weapons), `ADVANCED_WEAPONS`, `ALL_PLAYER_WEAPONS`, rocket config and the 220-projectile room cap.
- `src/game/core/loot.ts`: dynamic loot creation, deterministic grenade reward, platform settling, expiry, room cap and nearest-collectable search.
- `src/game/ai`: pure navigation grid and A* pathfinding.
- `src/game/config`: tuning for movement, weapons, bots and match.
- `src/game/arena`: arena data, baked visuals and collision helpers.
- `src/game/entities`: Player, PlayerVisuals and Drone for local mode.
- `src/game/scenes/ArenaScene.ts`: local Phaser orchestration, AI, scoring and match flow.
- `src/game/characters`: generated validated roster manifest and typed skin lookup.
- `src/game/multiplayer`: shared protocol, deterministic human movement and authoritative `GameSimulation`.
- `src/game/online`: online Phaser scene, combatant views and game bootstrap.
- `src/game/audio`: original Web Audio synthesis and persistent master/effects/mute settings.
- `src/game/input/touchInput.ts`: shared mutable touch frame consumed by the same `InputController` as keyboard and mouse.
- `src/game/progression`: XP rules, level curve, cosmetics, profile types, tests and the SQLite profile-store test.
- `src/components/online/ProfilePanel.tsx`: guest level, XP, stats, cosmetic equip and recent matches.
- `src/components/game/TouchControls.tsx`: landscape joysticks, fire, jump, reload, weapons, grenades, medkit, swap and settings.
- `server/persistence/ProfileStore.ts`: SQLite schema/migrations, guest tokens, XP settlement, match records, cosmetics and backups.
- `server/config.ts`: environment validation and production origin guards.
- `server/log.ts`: structured JSON logging.
- `DEPLOYMENT.md`, `Dockerfile`, `docker-compose.yml`: persistent game-server hosting guidance.
- `server`: Colyseus bootstrap, FFA room lifecycle, bot seat replacement, input limits and metadata.
- `src/components/online`: lobby, room browser, invite flow and online session bar.
- `src/game/bridge.ts`: typed HUD snapshot and command transport shared by both modes.
- `scripts/verify-browser.mjs`: P1 Playwright regression suite.
- `scripts/verify-online-match.mjs`, `verify-online-rooms.mjs`, `verify-online-perf.mjs`: P2 browser and performance suites.
- `scripts/verify-online-pickups.mjs`: P3B-A pickup, medkit and room-isolation suite.
- `scripts/verify-online-grenades.mjs`: P3B-B grenade inventory, fuse, explosion, elimination and room-isolation suite.
- `scripts/verify-online-stinking.mjs`: P3B-C stinking cloud, toxic damage, attribution, late join, HUD and green cache suite.
- `scripts/verify-online-loot.mjs`: P3C-A starter loadout, elimination bundle, weapon pickup, full-loadout swap, contest, expiry, late join, respawn, match-end and replay suite.
- `scripts/verify-online-arsenal.mjs`: P3C advanced weapon cache, Akimbo alternation, SMG, Cannon, rocket, HUD and mixed-lineup suite.
- `scripts/verify-online-p4.mjs`: guest profile, audio persistence, XP/levels, duplicate prevention, reconnect/capacity/grace expiry and mobile multi-touch suite.
- `scripts/verify-online-grenade-perf.mjs`: headed grenade, advanced weapon and dynamic-loot stress performance and snapshot measurement.

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
- Bot projectiles use the carried weapon presentation. Default rifle bots preserve the previous 7 damage, 900 speed, 0.055 spread and 3-shot burst cadence. Advanced-weapon bots use the shared `stepWeapon` and `fireWeapon` path, so cadence, ammo, reload and projectile identity stay authoritative.
- `PLAYER_WEAPONS` remains exactly three for P1. Advanced weapons live in `ADVANCED_WEAPONS`, and `ALL_PLAYER_WEAPONS` has seven entries for online ownership, testing and HUD lookup.
- Rocket blast reuses shared radial damage (`computeRadialDamage`), applies blast once per victim, supports self-damage and resolve order guarantees no direct-hit plus explosion double damage.
- Akimbo alternation is server-owned through `akimboBarrel`. Projectile origins are offset by `barrelSeparation: 11`, and the client renders two weapon layers with per-barrel muzzle flash and recoil.
- The room projectile cap is 220. Sustained SMG or Akimbo fire cannot grow projectile state without bound.
- Pickups are server-owned room state. Collection validates proximity and capacity, a pickup can be granted once, and the item respawns after a fixed cooldown. Late joins read the same authoritative state.
- Online loadout lives on `HumanRuntime.weaponIds` plus per-slot `WeaponState`. Slot 3 starts empty. The server ignores selection of an empty or unowned slot. Clients send a slot index, never a weapon ID.
- Duplicate weapon pickup refills one full magazine on the equipped copy when it owns that weapon, otherwise the lowest-ammo owned copy. This is the only duplicate rule.
- A full inventory never auto-consumes an unowned weapon. `E` replaces the currently equipped slot and scraps the old weapon, so a swap cannot duplicate either gun.
- Elimination loot uses the victim's equipped weapon ID and authoritative magazine ammo. A bot drops whatever it actually carries, including an acquired advanced weapon. The grenade reward is the most-carried victim type, ties resolve contact, frag, stinking, empty inventory falls back to contact.
- Dynamic loot is separate from static caches. Static caches keep timed respawns. Dynamic loot never respawns, expires after 12 seconds and is capped at 48 active entities per room with oldest-first cleanup.
- Loot settles on the first platform top below the death point. The client adds the outward drop-in animation over the final server position.
- Vibe Lance, Akimbo, SMG, Heavy Cannon and Rocket Launcher caches are authored in Sector 07. The one-of-a-kind Cannon and Rocket sit on contested elevated routes. Static weapon collection uses the same empty-slot and `E` replacement rules and a 25-second respawn.
- Bots can acquire advanced weapons and dynamic loot through bounded, short-range decisions. Default rifle bots keep their existing combat behavior, and only curious bots replace their carried weapon with eligible advanced gear.
- Client pickup and loot views are culled when offscreen. Dense rooms with 31 caches and active loot stay cheap to render, and rocket explosion particle counts are bounded.
- Elimination bursts use one-shot voxel cube emitters with bounded counts. They are triggered from server elimination events, not from repeated snapshots.
- Medkits are instant, capped at 100 HP, consumed from a two-slot inventory and gated by a 900 ms server cooldown. A player loses carried medkits on death/respawn. Pickups reset when a match starts, when it ends and on replay.
- Fourteen fixed medkit spawns and nine grenade caches sit on platform tops near, but outside, spawn bodies. Contact, frag and stinking caches use distinct artworks. Bots collect nearby supplies, seek medkits when injured and throw finite grenades through the existing movement/targeting systems.
- Grenade config: contact 180 max damage, 220 blast radius, immediate impact; frag 120 max damage, 215 blast radius, 5000 ms server fuse; stinking 760 px/s, 1400 gravity, 900 ms activation, 160 px cloud, 6000 ms cloud life, 24 HP/s in 250 ms ticks. All use 700 ms throw cooldowns, swept collision and a 64-entity active cap.
- Grenade inventory is server-owned and starts at one contact, one frag and one stinking, capped at three total. Throws are edge-triggered, input-sequence guarded and cooldown-gated. Death and respawn reset the loadout.
- One explosion damages each combatant at most once. Blast cover reduces damage by 55 percent. Self-eliminations count as deaths and feed entries but never award an opponent a kill. Grenades and clouds clear at match start, match end and replay.
- Toxic clouds use one global 250 ms server tick with catch-up for uneven step sizes. A combatant inside overlapping clouds takes damage from only the closest cloud, with the lower ID breaking ties. Solid terrain fully blocks cloud damage. Cloud owner names are retained for kill-feed attribution after disconnect.
- Bot grenade decisions are conservative: finite inventory, 9 to 14 second decision cooldowns, range gates, LoS checks and shared throw creation with humans. Bots seek medkits below 55 HP and grenade caches when below two grenades. Cloud avoidance is a short local repulsion with upward thrust.
- Static authored NFT pose is intentional. Weapon and effects remain separate layers.
- HUD follows `DESIGN.md`: graphite panels, lime signal color, mono telemetry, Archivo display type.
- P4 touch controls write the existing `ControlFrame` fields. There is no separate mobile physics or combat path.
- P4 audio uses only original Web Audio synthesis. Preferences persist under `vibe-militia-audio`. Sounds are triggered by one-shot events, not snapshots.
- P4 XP and level rules are pure and shared. The server settles once per `match_id` and `player_id`. Client totals are never trusted.
- P4 guest tokens are 32 random bytes, shown once, and stored only as SHA-256 hashes. Profiles are device-bound.
- P4 reconnect relies on Colyseus `allowReconnection`. The disconnected body stays vulnerable and input-free. The client caps retries at the configured grace plus a small buffer, then returns to the lobby.
- P4 production config rejects wildcard and missing production origins. The game server must be a persistent Node process with a persistent SQLite volume.

## Verification

- `npm run typecheck`: pass
- `npm test`: 174 tests pass across 22 files
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks against the production build
- `npm run verify:online:countdown`: 16/16 checks against the production build
- `npm run verify:online:matchmaking`: 11/11 checks against the production build on a clean server
- `npm run verify:online:characters`: 35/35 checks against the production build
- `npm run verify:online:bots`: 32/32 checks against the production build, including valid advanced bot weapons
- `npm run verify:online:pickups`: 29/29 checks against the production build
- `npm run verify:online:grenades`: 28/28 checks against the production build
- `npm run verify:online:stinking`: 25/25 checks against the production build
- `npm run verify:online:loot`: 41/41 checks against the production build
- `npm run verify:online:arsenal`: 26/26 checks against the production build
- `npm run verify:online:p4`: 35/35 checks against the production build
- `npm run verify:online:rooms`: 16/16 checks
- `npm run verify:online:match`: 25/25 checks
- `npm run verify:online:grenade-perf`: 15/15 checks
- All ten cards render and select, keyboard arrows work, mobile keeps two columns, refresh persists the choice, and corrupt storage falls back to VIBER-010
- Create Room, invite join and Quick Match all used the selected skin, and two clients with different selections agreed on shared combatant skins
- Eight independent human clients kept eight requested skins with no bot visuals
- A selected human kept its skin while dead, after respawn, and after a 90-second match replay
- The server rejected an arbitrary asset URL and fell back to VIBER-010
- 15 concurrent Quick Match clients joined in under a second as 8 + 7 humans across two rooms
- `npm run verify:online:match`: 25/25 checks, 8 humans, time-limit result, identical standings, replay reset, preserved selected skins
- `npm run verify:online:rooms`: 16/16 checks, including countdown auto-start, full-room and ended-room errors
- P3C loot suite: 31 shared static caches, starter rifle/scatter/empty HUD, exact three-item hostile bundle from the victim's actual weapon, identical loot ids and Phaser views on two clients, authoritative ammo on pickup, full-loadout E swap, duplicate-free replacement, late-join remaining loot, one-winner medkit contest, server-clock expiry, human death dropping the equipped weapon, starter respawn loadout, match-end cleanup and replay reset
- P3C arsenal suite: Akimbo dual layers and server barrel alternation, SMG burst and reload, Heavy Cannon 60-damage impact, rocket flight and explosion with one falloff hit per victim, advanced elimination loot, authoritative ammo, respawn reset and an eight-combatant mixed-weapon lineup
- P3C screenshots: `artifacts/p3c/` includes akimbo pickup/firing, SMG firing, heavy cannon firing/impact, rocket flight/explosion, advanced elimination loot and the eight-combatant lineup
- P3B-C baseline performance: 59 fps clean, 0.36 ms average tick, 1.10 ms p95; grenade stress 60 fps, 0.21 ms average, 0.27 ms p95, 14,471-byte snapshots
- P3C-A standard perf: 57 fps, 0.28 ms average tick, 0.67 ms p95, 6/6 checks
- P3C standard perf: 58 to 59 fps, 0.22 ms average tick, 0.77 ms p95, 6/6 checks
- P3C grenade, advanced weapon and loot stress: 60 fps, 0.06 ms average tick, 0.15 ms p95, 31 advanced shots, 7 peak grenades, 7 clouds, 2 overlapping clouds, 10 peak loot entities, 31 pickups, 16,319-byte snapshot and a second concurrent room
- P4 standard perf: 60 fps, 0.245 ms average tick, 0.547 ms p95, 6/6 checks with audio active
- P4 stress: 60 fps, 0.041 ms average tick, 0.128 ms p95, all four advanced weapons, 31 advanced shots, 8 peak grenades, 8 clouds, max overlap 8, 16 peak loot, 31 pickups, 17,600-byte snapshot and a second room
- P4 mobile: Chromium emulation at 844 x 390, `hasTouch`, CDP multi-touch, 35/35 P4 checks, no browser page errors
- Original public sources, archived sources and VIBER-010 cutout hash are unchanged
- Local P1 remains 37/37 with no regression

## Known limitations

- Reconnect works across network loss inside the same page. A full page reload or game-server restart returns the player to the lobby.
- No lag compensation or historical hit rewinding.
- Disconnected bodies stay vulnerable and can be eliminated. No extra invulnerability is granted.
- Ended rooms need a current occupant to start a replay. New players must join or create another room.
- Room discovery is in-memory and disappears on server restart.
- Combat input is frozen during countdown.
- Quick Match can fall back to creating a new room under extreme seat-race contention.
- Character selection is lobby-only. A player cannot change skin during a live match.
- Humans may select the same character. Bots keep existing appearances if a late human joins with the same skin.
- Bots share the player weapon and PlayerVisuals layer, and carry valid rifle or advanced weapon projectiles. They differ by official skin, callsign and BOT label. Per-skin loadouts are not implemented.
- Bot navigation uses the compact movement body while damage uses the character-sized hitbox. Tight cover can overlap the visible character more than the navigation body.
- If the roster is smaller than the combatant count, skin assignment gracefully reuses entries rather than fabricating assets.
- Character body is static because the NFT is a 3/4 frontal portrait.
- Medkits reset on death/respawn. Pickup respawn timers run only while the round is live and reset at round start, round end and replay.
- Grenades reset to one of each on death/respawn. Active grenades and toxic clouds clear at match start, match end and replay.
- Bot supply decisions are range-based heuristics. Bots do not coordinate caches or plan multi-stop routes.
- Bot grenade decisions are conservative and cooldown-gated, but not coordinated with other bots. Cloud avoidance is a short local repulsion, not full hazard pathfinding.
- Toxic clouds are fully blocked by solid terrain, not attenuated. Overlapping clouds apply one responsible cloud per 250 ms tick, so damage does not stack.
- A disconnected cloud owner keeps kill-feed name attribution, but there is no live standing entry to update.
- Pickup spawns are fixed authored caches, not dynamic random spawns. Dynamic loot exists only as elimination rewards.
- Bots collect medkits, grenade caches and eligible dynamic loot through short-range heuristics. They do not coordinate loot routing. A bot only replaces its weapon with advanced gear when curiosity is enabled.
- A full-loadout `E` swap scraps the replaced weapon rather than dropping it. This is deliberate anti-duplication behavior.
- Dynamic loot settles on the first platform top below the death point. The outward scatter is a client animation over the final server point.
- Dynamic loot is capped at 48 active entities per room and is cleared on match start, match end and replay.
- The room cap is 220 active projectiles. Sustained SMG or Akimbo fire across eight players can still reach the cap, which degrades sustained fire rather than the frame rate.
- Rocket blast is a single radial check with linear-ish falloff and no line-of-sight geometry beyond the shared cover test. It does not model splash around corners.
- Advanced weapon pickups are authored static positions. The Heavy Cannon and Rocket Launcher are one-of-a-kind per room and remain contested routes.
- Verification-only server hooks (`VIBE_MILITIA_TEST_HOOKS=1`) support deterministic browser placement, eliminations, weapon grants, freezing, pickup reset and match extension. They are disabled by default and are not gameplay messages.
- Blast cover uses a uniform 55 percent reduction when a platform blocks the blast line, not full occlusion.
- Grenade and toxic damage are not counted in weapon accuracy. Each grenade and cloud has a stable ID and owner for attribution.
- Guest profiles are device-bound. Clearing browser storage loses access. No accounts, wallets or account linking.
- SQLite assumes one persistent game-server process. Multiple replicas need a shared database.
- Progression and cosmetics are cosmetic only. No ranked, skill rating or paid content.
- Audio uses original synthesis only. No music, voice acting, 3D mix or dynamic soundtrack.
- Mobile was verified with Chromium emulation and CDP multi-touch, not physical iOS or Android hardware.
- No gamepad support or keyboard remapping. Touch controls are online-only.
- Deployment configuration is verified locally. No public deployment was performed because no infrastructure credentials were supplied.
