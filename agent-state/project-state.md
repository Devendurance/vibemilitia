# Project State

## What this is

Vibe Militia is a side-view free-for-all arena shooter built with Next.js 16, React 19, Phaser 4.2.1, TypeScript and Colyseus 0.18. The local route stays playable against bots. The online route adds server-authoritative rooms for up to eight human and bot combatants, with a pre-match countdown, server-side Quick Match placement, ten validated official Viber skins and a player-facing character picker.

VIBER-010 remains the default and fallback, preserved from the original Vibe Vibers NFT artwork. Players can select any of the ten validated characters before joining. Online bots draw unique skins from appearances not already occupied where possible.

## Approved sprite art (current milestone)

- `LoadoutArt.ts` loads all gun, grenade, pickup and projectile PNGs in `preload`. `TextureFactory` no longer draws those keys, and keeps sparks, voxels, drone, muzzle flash, baked rings and `bullet-drone`.
- `scripts/export-sprites.py` trims and downscales the sources at 2x. Art draws at `ART_SCALE` 0.5. `WEAPON_ANCHORS` holds origin and barrel tip per gun, measured from pixels.
- Akimbo is two layers, `weapon-akimbo` and `weapon-akimbo-b`.
- Online and practice bullets are a pooled image per shot in `drawProjectiles`, plus the existing soft streak. They were Graphics dots before.
- HUD, hub and touch icons are small PNGs through `LoadoutIcon`. Selected slots use a lime outline.

## Mobile control correction (previous milestone)

- Right pad: fire is "thumb down", aim is "thumb has a direction". Tap keeps the retained aim, drag or a 140 ms hold takes the thumb direction. Pad state writes straight to the DOM.
- Packets: a press latches into the next packet, and the rest of that frame sends no fire so a slow-frame tap stays one shot.
- Local shots are predicted at weapon cadence for flash and sound, matched to server `shot` events.
- `RenderScaler` owns CSS size, backing size and world zoom. Phone world zoom and control sizes come from the screen. A resolution drop must earn at least 8% within two steps or it is reverted.
- `lockMatchViewport` holds the page during touch matches and re-applies its viewport meta when Next rewrites head tags.
- Countdown: `MatchCountdown` plus one cached `match-backdrop`. Batch shaders are linked behind it, bot views build one per frame.

## Playability rescue (previous milestone)

- Netcode: the server consumes one client tick per server tick and holds a player whose input is late, so `LocalPredictor` replay lands exactly. `RemoteInterpolator` plays remotes from a timestamped buffer with a monotonic clock.
- Snapshots: version 2 clients get fast, slow and self sections (`snapshotCodec.ts`), about 650 B instead of 10 KB. Older tabs keep the full message.
- Practice: `GameSimulation` in a worker behind `PracticeRoom`, with `SIM_BOT_TUNING` per difficulty. Works offline once loaded, never has a profile id, so cannot earn XP.
- HUD: slim edge strip, clock, bottom loadout, scoreboard on Tab or tap. Eliminated replaces SIGNAL LOST. Results have PLAY AGAIN, LOBBY and BACK TO HUB.
- Touch: hybrid right pad (drag aims and fires, tap fires, release stops and keeps aim), separate FIRE mode, camera look-ahead, 2x render scale with adaptive fallback.

## UX overhaul (previous milestone)

- `/` is the game hub: Sector 07 SVG skydeck, selected Viber hero, compact level/XP card, 10-character drawer, preview loadout, online/practice switch, Easy/Normal/Hard/Merciless, primary CTA, rankings/profile/settings/loadout drawers.
- First-visit onboarding captures an editable, non-unique display name, optional self-declared X handle and leaderboard opt-in. No fake verification. Practice is never ranked.
- `/practice?difficulty=...` was the local P1 route, now replaced by the shared simulation. Practice bots use real difficulty profiles for reaction, cadence, burst, aim error, movement, standoff, repath, projectile speed and damage.
- `/online` is one fixed viewport: callsign, quick match, create room, join code, compact operator rail, rooms, compact profile, invite banner. No long roster/profile/audio document.
- Global all-time leaderboard: Neon/SQLite schema v3 (`x_handle`, `x_public`, `leaderboard_visible`), `GET /api/leaderboard?limit=25`, server-derived XP/wins/K/D only. The first-visit leaderboard box is ticked by default (opt-out). X handle public only when explicitly enabled.
- 30-second reconnect default. `POST /api/resume` exchanges a tab-scoped, single-use, identity-bound handle for the Colyseus reconnection token. Reload/navigation recovers the same room and seat; second tabs and grace expiry cannot take the live seat.
- Touch v2: thin segmented HP/fuel/ammo/time strip, 4-way left pad with up-thrust, round right aim/fire pad, compact grenade/throw/reload/weapon/medkit/pickup, safe areas, pointer cancellation, portrait guard, fullscreen in settings.
- Mobile camera targets a 680 px world view (`zoom = height / 680`, clamped 0.5 to 0.86) in both online and local practice, with manual arena clamping and hit registration unchanged.
- One global stylesheet: hub/online/touch CSS is appended to `src/app/globals.css`. A second root-layout CSS import caused Turbopack to drop the first sheet during this milestone.

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
- Mobile: Mini Militia-inspired twin-stick landscape controls. Left stick moves and pushes up for jetpack thrust, right stick aims independently and can auto-fire past a configurable threshold, and a separate FIRE button mode remains available. Settings persist move/aim dead zones, sensitivity, auto-fire threshold and fly threshold. Controls write the shared `ControlFrame`, use pointer capture, safe-area insets, simultaneous multi-touch and cancellation reset. Full-screen layout uses `Phaser.Scale.RESIZE`, a `100dvh` frame, safe areas, a portrait rotation guard and a fullscreen control. Coarse-pointer devices hide desktop HUD panels in favour of a compact status strip.
- Audio: original Web Audio synthesis for gameplay effects plus a lazy-loaded CC0 Sector 07 hub loop, currently Seth_Makes_Sounds' approved `Fun Music Loop`. Master, music and effects volume, master mute and music mute persist locally. Hub music uses one Web Audio buffer source, fades at route boundaries, pauses while backgrounded and has a hub-session token guard against delayed starts after navigation to Practice or Online. 14-voice ceiling and one smoothed jetpack loop.
- Progression: server-confirmed XP, 50-level curve, per-match participation checks and caps, level-up celebration, results XP breakdown, and level-based titles, badges, elimination variants and jetpack trails. Cosmetics never affect gameplay.
- Guest profiles: opaque server-issued bearer token, SHA-256 at rest, PostgreSQL persistence when `DATABASE_URL` is set and SQLite fallback otherwise. Stores identity, skin, XP, matches, wins, losses, eliminations, deaths, per-weapon stats, recent matches, unlocks, equipped cosmetics and anonymous client events. PostgreSQL uses a bounded `pg` pool, versioned migrations and transactional `SELECT ... FOR UPDATE` reward settlement. Match records are idempotent by `(match_id, player_id)`.
- Beta feedback: anonymous `client_events` capture for client errors and 1-5 feedback, rate-limited by a session client ID, with no IP, user agent or personal data stored.
- Reconnect: Colyseus `allowReconnection` with a 20-second configurable grace. Seat, score, character and inventory stay reserved. Buffered input is cleared, no extra invulnerability is granted, and the client shows a reconnect overlay. Grace expiry returns the player to the lobby and restores bot backfill.
- Deployment: validated environment config, strict production `ALLOWED_ORIGINS`, WebSocket upgrade origin checks, HTTP CORS, `/health`, `/ready` with database backend reporting, structured JSON logs, API and input rate limits, Dockerfile, Docker Compose, SQLite backup command, Neon PostgreSQL guidance and `DEPLOYMENT.md`.
- Public beta: frontend on Vercel at `https://vibemilitia.vercel.app`, game server on the shared `endy-vps` host at `https://vibemilitia-game.endyos.xyz` behind a dedicated Cloudflare Tunnel, Neon PostgreSQL production branch behind it. `HOST` config allows loopback binding.
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
- `src/game/input/touchInput.ts`: shared mutable touch frame consumed by the same `InputController` as keyboard and mouse. Separate button-fire and aim-fire flags plus button and thrust jump sources keep the modes independent.
- `src/game/input/touchSettings.ts`: persisted touch dead zones, sensitivity, auto-fire threshold and fly threshold.
- `src/game/progression`: XP rules, level curve, cosmetics, profile types and tests for SQLite and PostgreSQL stores.
- `src/components/online/ProfilePanel.tsx`: guest level, XP, stats, cosmetic equip and recent matches.
- `src/components/game/TouchControls.tsx`: twin-stick movement, thrust, aim, auto-fire, fire, jump, reload, weapons, grenades, medkit, swap and settings.
- `src/components/game/TouchSettingsPanel.tsx`: touch mode, sensitivity, dead zones and threshold controls.
- `src/components/online/BetaFeedback.tsx`: anonymous rating and feedback dialog.
- `src/lib/betaTelemetry.ts`: anonymous client error and feedback submission.
- `server/persistence/ProfileStore.ts`: SQLite schema/migrations, guest tokens, XP settlement, match records, cosmetics and backups.
- `server/persistence/PostgresProfileStore.ts`: PostgreSQL pool, versioned schema, transactional idempotent rewards, client events and health.
- `server/persistence/repository.ts`: async persistence contract used by both backends.
- `server/db-migrate-postgres.ts`: validated, non-destructive SQLite-to-PostgreSQL migration.
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
- `scripts/verify-online-p5.mjs`: mobile viewport fit, safe control layout, twin-stick thrust/aim/auto-fire, touch settings, feedback, portrait guard and desktop regression suite.
- `scripts/verify-online-grenade-perf.mjs`: headed grenade, advanced weapon and dynamic-loot stress performance and snapshot measurement.
- `scripts/create-migration-fixture.ts`: deterministic SQLite fixture for the PostgreSQL migration validation.
- `BETA_TESTING.md`: 15-20 player beta runbook, metrics, pass criteria and privacy rules.

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
- P5 chooses PostgreSQL when `DATABASE_URL` is present and keeps SQLite as the fallback. The async repository contract wraps both backends.
- P5 uses a bounded `pg` pool and `SELECT ... FOR UPDATE` so duplicate and concurrent per-player rewards serialize correctly. Reward delivery is tracked separately from reward calculation.
- P5 settles match rewards off the simulation loop through a queued async call with a five-second retry on failure.
- P5 uses Phaser `Scale.RESIZE` with the mobile frame fixed to the viewport. Desktop keeps the centered 16:9 frame. Artwork is never stretched.
- P5 touch settings are stored under `vibe-militia-touch` and streamed to the control layer through a `vibe-touch-settings` event so changes apply without reloading the match.
- P5 feedback stores only kind, message, route, app version, optional guest ID and rating. It never stores IP addresses or user agents.

## UX overhaul verification

- Public UX matrix 49/49 with zero browser errors at ten sizes; hub, drawers, practice, focused online lobby, two humans and reload recovery.
- Public production regression 50/50, including HTTPS/WSS, PostgreSQL, guest API, two browser contexts, countdown join, live round, replay, reconnect, XP settlement and mobile guard.
- Local P1 37/37, P4 35/35, P5 42/42, online match 25/25, online bots 32/32, pickups 28/28, loot 41/41, clean matchmaking 11/11. Characters 34/35 on the final timing run; the miss is the documented late-join bot skin collision.
- Unit 179 pass, 7 PostgreSQL tests skipped without `TEST_DATABASE_URL`; typecheck, lint and build pass.
- Headed perf 46 fps with 1.77 ms average and 5.20 ms p95 under local test load. Headless recovered public match 59 fps.
- Screenshots and discrepancy log are under `artifacts/ux-final/` and `artifacts/ux-production/`.

## Verification

- `npm run verify:production`: 50/50 checks against the live public beta with real browsers and no test hooks
- `npm run typecheck`: pass
- `npm test`: 182 tests pass across 23 files, including 7 PostgreSQL tests when `TEST_DATABASE_URL` is set
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks on the final rerun
- `npm run verify:online:countdown`: 16/16 checks
- `npm run verify:online:matchmaking`: 11/11 checks on a clean server
- `npm run verify:online:characters`: 35/35 checks
- `npm run verify:online:bots`: 32/32 checks
- `npm run verify:online:pickups`: 29/29 checks
- `npm run verify:online:grenades`: 28/28 checks
- `npm run verify:online:stinking`: 25/25 checks
- `npm run verify:online:loot`: 41/41 checks
- `npm run verify:online:arsenal`: 26/26 checks
- `npm run verify:online:p4`: 35/35 checks against the Neon test branch
- `npm run verify:online:p5`: 42/42 checks against the Neon test branch
- `npm run verify:online:rooms`: 16/16 checks
- `npm run verify:online:match`: 25/25 checks
- `npm run verify:online:grenade-perf`: 15/15 checks
- `npm run verify:online:perf`: 6/6 checks on the final clean run, 56 fps headless, 0.40 ms average tick, 1.43 ms p95
- P0-P4 browser suites ran on a clean SQLite server with `MATCH_COUNTDOWN_MS=10000` to remove database and host latency from tight timing assumptions. P4 and P5 ran against Neon PostgreSQL.
- PostgreSQL tests cover guest creation, token hashing, concurrent duplicate match writes, concurrent distinct rewards, reward-delivery idempotency, cosmetics validation, anonymous client events and health.
- SQLite-to-PostgreSQL migration validation used 2 players, 1 weapon stat, 1 match and 8 cosmetics. Target counts matched and the migrated player retained XP and match count. The SQLite source was not modified.
- Neon project `vibe-militia` exists in the authorized organization, region `aws-us-east-2`, PostgreSQL 17, with a separate `p5-test` branch.
- P5 mobile evidence: four landscape viewport shapes, real CDP multi-touch, simultaneous movement/thrust/aim/auto-fire, separate FIRE mode, feedback submission, portrait guard and desktop frame dependency.
- Screenshots: `artifacts/p5/` includes mobile 16:9, 19.5:9, 20:9, compact and portrait guard captures.
- Original public sources, archived sources and VIBER-010 cutout hash are unchanged.

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
- PostgreSQL is the durable backend. SQLite remains a single-process fallback. Colyseus room state is process-local, so multiple game-server replicas still need a shared room directory or sticky matchmaking.
- Progression and cosmetics are cosmetic only. No ranked, skill rating or paid content.
- Audio uses original synthesis only. No music, voice acting, 3D mix or dynamic soundtrack.
- Mobile was verified with Chromium emulation and CDP multi-touch at four landscape shapes, not physical iOS or Android hardware. Portrait intentionally shows a rotation guard.
- No gamepad support or keyboard remapping. Touch controls are online-only.
- Deployment configuration is verified locally. Neon PostgreSQL is provisioned and migrated. The public frontend and game server are deployed and live verified.
- Mobile evidence is browser emulation, not physical hardware.
- `MATCH_COUNTDOWN_MS=20000` in production because a cold invite-link load takes 15-18 seconds.
- The real-player beta has not started. `BETA_TESTING.md` is the runbook.
