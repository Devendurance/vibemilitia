# Vibe Militia

A playable side-view free-for-all arena shooter built with Phaser 4, TypeScript, Next.js and Colyseus. `/` is a full-screen Sector 07 game hub with the selected official Viber, profile, starter loadout, online or practice mode, four bot difficulty levels and functional character, loadout, rankings, profile and settings drawers. `/practice` is the deliberate local drill against three navigation-capable bot drones. `/online` is a focused server-authoritative matchmaking lobby for up to eight combatants, with ten validated official Viber skins and a seven-weapon arsenal. Online bots use the same weapon, movement and PlayerVisuals layers as human players.

P4 adds responsive touch gameplay, original synthesized audio with persistent settings, server-confirmed XP and levels, guest profiles, cosmetic titles, badges, elimination styles and jetpack trails, a configurable reconnect grace period, onboarding and production hosting configuration. P5 adds Neon PostgreSQL persistence, a Mini Militia-inspired twin-stick touch model, full-screen landscape fit for wide phones, a portrait rotation guard, anonymous beta feedback and error capture, and release and beta-readiness documentation.

The operator is VIBER-010, prepared from the original Vibe Vibers NFT artwork.

## Quick start

```bash
npm install
```

Run the game server and the Next client in separate terminals:

```bash
npm run server:dev
npm run dev
```

Open `http://localhost:3000` for the game hub, `http://localhost:3000/practice?difficulty=normal` for the local drill, or `http://localhost:3000/online` for multiplayer.

For a production check:

```bash
npm run build
npm run server:start
npm start
```

The Colyseus server listens on port `2567` by default. Set `PORT` for the server and `NEXT_PUBLIC_GAME_SERVER_URL` at build time when the client and server do not share the default local URL. The same URL serves the guest profile API and WebSockets. `NEXT_PUBLIC_COLYSEUS_URL` remains a fallback.

New rooms use a 10-second pre-match countdown. Override it with `MATCH_COUNTDOWN_MS` on the game server. The value is clamped from 0 to 60000 milliseconds.

Guest profiles use PostgreSQL when `DATABASE_URL` is set and fall back to SQLite at `DATABASE_PATH` when it is absent. Set `ALLOWED_ORIGINS` to the trusted frontend origins in production, and set `RECONNECT_GRACE_SECONDS` to change the reconnect reservation from its 30-second default. See `DEPLOYMENT.md` for Neon, Docker, WSS, backup, restore and migration guidance, and `BETA_TESTING.md` for the 15-20 player beta plan.

## Match rules

- Local mode starts with four combatants: VIBER-010 and three bot drones.
- Online rooms hold eight combatant slots. A new room starts a short countdown. Humans can join during the countdown, and Viber-presented bots fill every empty seat when it expires. If all eight human seats fill, the match starts immediately.
- Before the countdown ends, combat input is held and the 90-second clock has not started.
- Humans joining a live room replace a bot without resetting the match. An unexpected disconnect reserves the seat for 30 seconds, keeps the player's score and inventory, and shows a reconnect status. A browser reload or same-tab navigation can exchange a single-use, identity-bound resume handle for the Colyseus reconnection token and return to the exact human seat. A consented leave or an expired grace period releases the seat and restores bot backfill.
- Quick Match prefers the most populated open room with a free human seat, then creates another room when the open rooms fill.
- 90-second match.
- First to 10 eliminations wins immediately.
- If the clock expires, the highest score wins. Ties break on fewer deaths.
- Respawns continue during the match and do not pause the clock.
- Respawn timing is automatic for the player and all bots, so no participant can skip the recovery window.
- Respawning uses a safe pad selection that avoids live enemies, their sightlines, and the last death location where possible.
- The results screen shows final placements, eliminations, deaths, accuracy and a replay button. Replay resets the same room and keeps its occupants.

Bots fight each other as well as the player. A match can be won or lost while the player is waiting to redeploy.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` | Move left and right |
| `Space` | Jump. Hold while airborne to fire the jetpack |
| Mouse | Aim the weapon in 360 degrees |
| Left mouse button | Fire |
| `1` / `2` / `3` | Equip an owned online weapon or the local training rifle, scatter blaster and vibe lance |
| `E` | Swap the equipped weapon for a nearby dropped weapon when all three online slots are occupied |
| `4` / `5` / `6` | Select the contact, frag or stinking grenade |
| `G` | Throw the selected grenade |
| `H` | Use a carried medkit in online matches |
| `R` | Reload |
| `F1` | Toggle physics, navigation and collision debug |
| `Enter` | Replay after the results screen |

The input layer samples a plain `ControlFrame` object. Touch controls write the same fields as keyboard and mouse, so movement, weapons, grenades and prediction share one validated path.

### Touch controls

Landscape mobile play uses a Mini Militia-inspired twin-stick model. The left stick moves horizontally, and pushing it upward engages jetpack thrust. The right stick aims independently in 360 degrees and can fire automatically when pushed past a configurable threshold. A separate FIRE button mode remains available, and the FIRE and JUMP controls stay on screen in either mode.

Touch settings expose move and aim dead zones, aim sensitivity, auto-fire threshold and fly threshold, and persist in `vibe-militia-touch`. The controls support simultaneous movement, aiming, firing and thrust, use pointer capture per control, reset on cancellation, blur, visibility loss or orientation change, and respect safe-area insets.

The mobile match fills the available landscape viewport instead of a fixed 16:9 box. Phaser uses `Scale.RESIZE`, the camera follows the real parent size, and the React frame covers the viewport with `100dvh`. The controller supports 16:9, 19.5:9, 20:9 and compact landscape screens without stretching artwork. A fullscreen control is available in match settings, and portrait orientation shows a rotation guard instead of a tiny match. Touch layout is verified at 1280x720, 844x390, 915x412 and 740x360. Desktop remains a centered 16:9 frame.

## Audio

All sounds are original Web Audio synthesis. No commercial game audio or music is included. The layered oscillator and noise recipes cover rifle, scatter, lance, akimbo, SMG, heavy cannon, rocket launch and impact, contact and frag explosions, stinking activation, toxic ticks, jetpack thrust, damage, elimination, weapon and medkit pickups, medkit use, countdown, victory, defeat, UI selection and confirmation.

- Master and effects volume are independent, persist in `vibe-militia-audio`, and support a mute toggle.
- The audio context initializes only after a user gesture. A blocked context never blocks gameplay.
- A 14-voice ceiling bounds simultaneous sound instances. Jetpack audio is one looping voice with a smoothed gain.
- Sounds are driven by one-shot server events, not by repeated snapshots, so a snapshot refresh cannot double-play an elimination or pickup.
- Settings are available in the online lobby, the in-match settings panel and the local P1 settings drawer.

## Progression and cosmetics

Progression is cosmetic only. It never changes health, damage, jetpack capacity, movement speed or weapon stats. All ten official Viber skins stay freely selectable.

Server-confirmed XP rules:

| Event | XP |
| --- | --- |
| Match completion | 30 |
| Human elimination | 10 |
| Bot elimination | 5 |
| First place | 25 |
| Second place | 15 |
| Third place | 10 |

The match needs at least 45 seconds of connected participation and 20 valid inputs. Human elimination XP caps at 80, bot elimination XP caps at 40, and a match caps at 200. The rules live in `src/game/progression/progression.ts` and can be overridden with `XP_MIN_PARTICIPATION_MS` on the server.

The level curve is easy to tune. Level 1 starts at 0 XP. Each level requires `100 + (level - 1) * 50` XP, and levels cap at 50. The HUD shows level and equipped title and badge. The lobby and results screen show current XP, next-level progress, XP earned, per-match breakdown and a level-up celebration.

Cosmetic rewards unlock from level: player titles, profile badges, elimination burst variants and jetpack trail variants. They render as separate layers around the untouched official character cutouts. Titles and badges appear in the identity HUD and profile. Elimination variants change the voxel ring and burst palette. Jetpack trails tint the exhaust particles.

## Guest profiles and persistence

A guest identity is issued by `POST /api/guest`. The server returns an opaque `vm_guest_...` bearer token once and stores only its SHA-256 hash. The browser keeps the token in local storage. Clearing browser storage loses access to the profile. Account linking does not exist yet.

Profiles are device-bound and server-authoritative. PostgreSQL and SQLite store the same logical records:

- Player ID, token hash, callsign, selected skin and equipped cosmetics.
- Total XP, level, matches, wins, losses, eliminations and deaths.
- Per-weapon shots, hits and eliminations.
- Recent completed matches with placement, stats, XP and outcome.
- Unlocked cosmetics.
- Anonymous client events for beta feedback and error capture.

Match records use `(match_id, player_id)` as a primary key. The server awards XP once per match, regardless of duplicate match-end events, reconnect attempts, replay requests or client messages. The server never accepts client-submitted XP, placement or elimination totals.

PostgreSQL is selected when `DATABASE_URL` exists, uses a bounded `pg` pool, applies versioned migrations on startup and serializes per-player reward settlement with `SELECT ... FOR UPDATE`. SQLite remains the fallback with WAL mode, foreign keys, a five-second busy timeout and a `VACUUM INTO` backup command. Database failures are logged without tokens or connection strings.

Match settlement runs outside the 60 Hz simulation loop and retries after five seconds. `schema_migrations` records the applied schema version in both backends. See `DEPLOYMENT.md` for migration, backup and restore guidance.

## Reconnect

Unexpected disconnects use Colyseus reconnection support. The server calls `allowReconnection` with a configurable grace period, 30 seconds by default. During that period:

- The same session, character, score and authoritative inventory stay reserved.
- The room still counts the reserved seat toward its eight-human capacity.
- The disconnected body remains in the arena, stops accepting buffered input, and receives no extra invulnerability.
- The client shows a reconnect overlay and retries the same room and session.
- A browser reload or same-tab navigation can call `POST /api/resume` with the guest bearer token and the tab-scoped resume handle. The server checks the guest identity, expiry and single-use status before returning the Colyseus reconnection token for the reserved seat.
- Resume handles are 32 random bytes, stored only as hashes in a process-local registry, never placed in URLs or logs, and invalidated on redemption, explicit leave, grace expiry or room disposal.
- Repeated reconnect attempts cannot create a duplicate combatant or duplicate inventory.
- A reconnect during countdown or live play resumes the same seat.
- After grace expiry, or a failed recovery, the seat is released, a bot backfills, and the client returns to the lobby with an explicit status message.

Reconnect works across temporary network loss and same-tab reload or navigation. It does not survive a game-server process restart because the rooms and resume registry are in memory. Guest profiles and leaderboard records do survive a server restart through PostgreSQL or the SQLite fallback.

## Game hub, practice and rankings

The hub is a single fixed viewport at 1280x720 and above, with a compact landscape layout for phones and a useful portrait layout. It never auto-starts a match. Character, loadout, rankings, profile and settings open as drawers over the Sector 07 scene. `PLAY ONLINE` enters the focused `/online` lobby with quick match or create-room intent. `START PRACTICE` enters `/practice?difficulty=easy|normal|hard|merciless`.

Practice uses the local P1 arena. Difficulty tuning changes real bot reaction delay, burst size, fire cadence, aim error, movement speed, standoff distance, strafe timing, repath cadence, projectile speed and damage. Practice never calls the guest profile, match settlement, XP or leaderboard paths.

Guest identity is an editable display name. Names are not unique, reserved or continuously moderated. The optional X handle is self-declared, syntax-validated and never presented as verified. Players opt in or out of the public ALL-TIME XP leaderboard; only completed online matches contribute. `GET /api/leaderboard?limit=25` returns server-derived level, XP, wins and K/D, and only exposes an X handle when that player made it public. Browser-submitted stats are never accepted.

## Weapons

| Weapon | ID | Damage | Magazine | Cadence | Reload | Role |
| --- | --- | --- | --- | --- | --- | --- |
| Vibe Rifle | `vibe-rifle` | 14 | 20 | 108 ms | 1.10 s | Full auto, mid range |
| Scatter Blaster | `scatter-blaster` | 9 x 7 pellets | 6 | 720 ms | 1.80 s | Close range burst |
| Vibe Lance | `vibe-lance` | 50 | 4 | 650 ms | 1.65 s | Precision, two-shot kill |
| Akimbo Rifles | `akimbo-rifles` | 10 | 36 shared | 85 ms | 1.80 s | Twin automatic barrels |
| Vibe SMG | `vibe-smg` | 8 | 30 | 70 ms | 1.25 s | Rapid close-range auto |
| Heavy Cannon | `heavy-cannon` | 60 | 5 | 900 ms | 2.10 s | Slow high-impact slug |
| Rocket Launcher | `rocket-launcher` | 120 center blast | 3 | 1100 ms | 2.40 s | Slow rocket, 180 px blast |

Each weapon has its own magazine state, weapon texture, projectile texture, muzzle colour, spread, recoil and crosshair size. Switching preserves the other magazines. Reload progress belongs to the equipped weapon.

### Advanced weapon behaviour

- Akimbo Rifles fire from alternating left and right barrel origins on the server. Both guns render as separate PlayerVisuals layers, with the muzzle flash and recoil following the active barrel.
- The Vibe SMG fires at 70 ms with a 30-round magazine and higher spread than the rifle. Projectile creation is bounded by a 220-projectile room cap, so sustained fire cannot grow without limit.
- The Heavy Cannon fires a slow, large yellow slug with 60 direct damage, five rounds and a 2.1 s reload. It uses a heavier muzzle flash, cursor, projectile trail and impact effect.
- The Rocket Launcher fires a visible 850 px/s rocket with a 180 px blast, 120 maximum centre damage and 40 minimum edge damage. Rockets collide with terrain and combatants, apply falloff once, support self-damage and never double-apply a direct hit plus explosion. Grenade inventory is never consumed.

### Online weapon ownership

Online humans own three weapon slots. The starter loadout is Vibe Rifle in slot 1, Scatter Blaster in slot 2 and an empty slot 3. The Vibe Lance is a real battlefield acquisition: two authored Lance caches sit in Sector 07, and a defeated combatant drops its equipped weapon. The four advanced weapons are acquired from authored caches and elimination loot. Local P1 mode keeps its original three-weapon training loadout and never sees the advanced registry.

- A dropped weapon fills the first empty slot and becomes equipped.
- A duplicate owned weapon refills the magazine of the equipped copy, or the lowest-ammo owned copy when the equipped slot holds a different gun. The refill is capped at one full magazine.
- When all three slots are occupied and the nearby weapon is not owned, automatic collection leaves it on the ground. Press `E` to replace the currently equipped weapon. The replaced weapon is scrapped instead of re-dropped, which prevents duplication.
- Empty slots cannot fire or reload. Slot selection and weapon identity are server-owned. Clients send only a slot index.
- Death and respawn restore the starter loadout. Ammunition, cooldowns and reload state never come from the client.

## Elimination loot

Every valid hostile elimination of a human or bot creates one dynamic loot bundle at the victim's position:

- The victim's actual equipped weapon, carrying its authoritative magazine ammo. A bot drops whatever weapon it is currently carrying, including an acquired advanced weapon.
- One medkit.
- One grenade. The reward type is the victim's most-carried grenade, with contact, frag, stinking tie order. An empty victim inventory falls back to contact.

The three items scatter 46 px outward and settle on the first platform top below the death point. They expire after 12 seconds of server simulation time, are collected by server proximity, and are capped at 48 active entities per room. Oldest entities are removed first when the cap is exceeded. Collected and expired loot disappears permanently and never respawns. Human and bot combatants can collect eligible dynamic loot; bots preserve their existing static supply behaviour and use simple bounded decisions.

Self-eliminations, duplicate death events and invalid killer attribution never create loot. Both real browser clients and late joiners receive the same active loot from snapshots. Match start, match end and replay clear all dynamic loot. Static supply caches keep their original respawn behavior.

Weapon drops show the actual weapon artwork, including akimbo, SMG, cannon and rocket launcher silhouettes. Loot is presented with a short beam, glow and bob, plus a drop-in animation. A nearby weapon shows an interaction prompt, and a full loadout shows the explicit `E` replacement control. Loot and static pickup views are culled when offscreen to keep dense rooms cheap to render.

## Grenades

Players carry up to three grenades across three types. Online matches start with one contact, one frag and one stinking grenade. Selection is explicit with `4`, `5` and `6`, and `G` throws the selected type.

| Grenade | Slot | Max damage | Radius | Detonation | Throw cooldown |
| --- | --- | --- | --- | --- | --- |
| Contact | 4 | 180 | 220 blast | On terrain or combatant impact | 700 ms |
| Frag | 5 | 120 | 215 blast | Exactly 5.0 s of server simulation time | 700 ms |
| Stinking | 6 | 24 HP/s | 160 cloud | Toxic cloud after 900 ms, cloud lasts 6.0 s | 700 ms |

Grenades are server-owned 2D projectiles with gravity, swept collision substeps, terrain bouncing for frag and stinking grenades, owner clearance and a hard active-entity cap. Explosion damage falls off with distance. Terrain between the blast and a victim reduces damage by 55 percent. Self-damage and self-eliminations are supported and never award an opponent a kill.

Frag grenades show a flashing fuse indicator as the server-owned timer counts down. Contact grenades use a compact orange-red body and a bright impact flash. Stinking grenades use a chunky green canister, layered lime puffs, floating bubbles and a bright hazard boundary.

### Toxic cloud rules

- The canister activates after 900 ms of server simulation time, then creates a 160 px cloud that lasts 6.0 s.
- Toxic damage is 24 HP per second, applied in deterministic 250 ms ticks of 6 HP.
- The global toxic tick uses server simulation time and a while-loop catch-up, so 30 Hz, 60 Hz and uneven step sizes apply the same damage.
- A combatant inside overlapping clouds takes damage from only one cloud per tick. The closest cloud is responsible, with the lower ID breaking ties.
- Solid terrain between the cloud center and a combatant blocks that cloud's damage entirely. Terrain attenuation is documented as a full block rather than a partial reduction.
- Up to 24 clouds may exist per room. A stinking throw is rejected when clouds plus in-flight canisters would exceed the cap.
- Cloud ownership stores the owner ID and display name. A cloud can still credit the correct name in the kill feed after its owner disconnects, although a departed player has no live standing to update.
- Self-damage remains a self-elimination and does not award an opponent a kill.

Nine grenade caches sit across Sector 07: three contact, three frag and three stinking, in addition to the fourteen medkit caches and eight weapon caches. The weapon caches are two Vibe Lances, two Akimbo Rifles, two Vibe SMGs, one Heavy Cannon and one Rocket Launcher. Grenade caches use distinct orange-red, olive and green supply artworks, share the contested-pickup and respawn rules, and disappear for every client when collected. Weapon caches use their equipped weapon artwork, a sky-blue or copper beam and a 25-second respawn. The one-of-a-kind Heavy Cannon and Rocket Launcher sit on contested elevated routes.

Online bots carry the same three-grenade loadout, use medkits when injured, seek nearby supplies through a short-range supply goal, throw conservative server-owned grenades and steer away from nearby toxic clouds. They still use the existing A* movement, rifle combat and targeting systems.

## What is playable

- Accelerated horizontal movement with grounded and airborne friction.
- Jumping, gravity, coyote-time jumping and fuel-limited jetpack flight.
- Independent 360-degree aiming with a separate weapon layer.
- Automatic rifle, seven-pellet shotgun and precision two-shot rail weapon.
- Online three-slot weapon ownership, an empty starter slot, eight authored weapon caches and explicit `E` replacement swaps.
- Hostile eliminations drop one weapon, one medkit and one grenade with server-authoritative scatter, proximity collection, a 12-second lifetime and a per-room entity cap.
- A short voxel cube burst and a clear three-item reveal on every server-confirmed elimination.
- Terrain collisions for the player, bots and projectiles.
- Health, delayed regeneration, damage, eliminations, deaths and respawns.
- Fourteen fixed medkit caches across ground routes and elevated platforms. Online players carry up to two, use them with `H`, and heal 50 HP without exceeding maximum health.
- Nine grenade caches with orange-red contact, olive frag and green stinking identities. Players carry up to three grenades total and throw with `G`.
- Eight authored weapon caches: two Vibe Lances, two Akimbo Rifles, two Vibe SMGs, one Heavy Cannon and one Rocket Launcher, with server-owned collection and 25-second respawn.
- Server-authoritative Akimbo Rifles, Vibe SMG, Heavy Cannon and Rocket Launcher with distinct models, projectiles, recoil, muzzle effects and blast feedback.
- Server-authoritative contact, frag and stinking grenades with gravity, terrain bouncing, swept collision, five-second frag fuses and toxic clouds.
- Toxic clouds apply server-owned 24 HP/s damage in 250 ms ticks, respect invulnerability, stop when a combatant leaves, block behind solid terrain, and use a deterministic one-cloud-per-tick stacking policy.
- Online bots collect medkits and grenade supplies, use medkits when injured, throw finite server-owned grenades and avoid nearby toxic clouds.
- Bots can acquire advanced weapons from eligible static caches or dynamic loot, respect ammo and reload time, and drop their actual carried weapon on death.
- Generic pickup collection, 20 to 25-second respawn timers and per-room supply state.
- Three local bot drones with pathfinding, terrain collision, line-of-sight fire, burst fire and vertical thruster movement.
- Online bots use distinct validated Viber cutouts, PlayerVisuals weapon and jetpack layers, BOT callsign labels, valid rifle or advanced weapon projectiles and the same character-sized damage hitbox as humans.
- Bot-versus-bot combat. Every participant can score on every other participant.
- Fair respawn pad selection using threat distance, cover and recent death position.
- Live leaderboard, match clock, kill feed, elimination toast, score limit and final results.
- Weapon selector HUD, ammo counters, reload progress and distinct weapon silhouettes.
- Replay without reloading the page.
- Responsive camera follow and debug overlays for platforms, bodies, projectiles, aim and bot paths.

## Online multiplayer

The `/online` route adds a Colyseus lobby and independent free-for-all rooms. The local route at `/` remains available and does not depend on the game server.

- Create a room, quick match into an open room, browse live rooms, or open an invite link.
- New rooms count down before combat. The HUD, lobby card and room metadata share the same countdown and phase state.
- Quick Match uses server-side matchmaking. It filters to open rooms, sorts by the most connected humans, and creates a new room when existing rooms fill.
- Full-room and ended-room races retry before falling back to a fresh room, so simultaneous joins are not stranded.
- Rooms run concurrently with their own simulation, clock, leaderboard, bots, projectiles, grenades, toxic clouds, pickups, dynamic elimination loot and results.
- The Node server owns movement, health, weapon ownership, ammunition, grenade flight and fuses, explosions, toxic clouds, medkit inventory, pickup and loot collection, bot supplies and grenade decisions, the match clock and the outcome.
- Browsers send input frames only. They never send positions, hit confirmations or scores.
- The server ticks at 60 Hz and broadcasts snapshots at 20 Hz. Input is capped at 45 messages per second per client.
- Online bots share the human character renderer. They show the equipped Vibe Rifle, 360-degree aim, muzzle flash, recoil, jetpack exhaust, health bars, damage reactions, spawn shields and death/respawn presentation.
- The server assigns stable `skinId` values from ten validated official Viber assets. Bots prefer unique non-default skins within a room, keep them through death and respawn, and receive a valid skin after disconnect backfill.
- The online lobby has a keyboard-accessible ten-card character picker with a large selected preview. Every official Viber is unlocked immediately.
- The selected `skinId` is stored locally and sent on Quick Match, Create Room, Join Room and invite-link joins. The server validates it against the official roster and falls back to VIBER-010 for invalid, removed or corrupted values.
- The selected character is server-authoritative in snapshots, persists through death, respawn and replay, and cannot be changed during a live match.
- The online HUD portrait, identity name and in-world body all use the selected character.
- Bot damage and projectile speed remain on the existing server tuning, so the current burst balance is preserved while the presentation matches a player weapon.
- The local human is predicted with the shared AABB movement model and softly reconciled against authoritative snapshots.
- Remote combatants are interpolated, and projectiles are extrapolated between snapshots.
- The session bar shows room ping and the latest server tick duration.
- Full rooms report `ROOM FULL // Eight human players are already connected.` Ended rooms report a replay error instead of silently joining a dead match.

Guest callsigns are temporary and stored in local storage. There are no accounts or wallets. Progression is a device-bound guest profile stored in PostgreSQL or SQLite.

## Bot navigation

Bots use a 64-pixel navigation grid built from the Sector 07 platform rectangles. The grid inflates solid surfaces by the drone clearance radius and runs A* with diagonal corner checks and line-of-sight path smoothing.

Movement layers:

- A grid path routes around platforms and cover.
- Arcade Physics colliders prevent the bots from phasing through terrain.
- Vertical thruster movement handles climbs and blocked lanes, with visible exhaust.
- Stuck detection forces a new path and a vertical nudge.
- Line-of-sight checks still gate firing.
- Combat positioning keeps a standoff distance and strafes when a clear direct lane exists.

The debug overlay draws each bot's active navigation path.

## Character fidelity

The playable operator is `VIBER-010`, prepared from the original `vibe-vibers-viber-10.png` artwork.

The background was removed with a deterministic, edge-connected matte. Interior artwork pixels are copied unchanged. No generative model, redraw, restyle or reconstruction was used.

Files:

- Original artwork, archived unchanged: `assets/source/vibe-vibers/viber-010-original.png`
- Transparent game sprite: `public/sprites/viber-010/viber-010-cutout.png`
- HUD portrait: `public/sprites/viber-010/viber-010-avatar.png`
- Contrast previews: `public/sprites/viber-010/previews/`
- Machine-readable cutout report and checksums: `public/sprites/viber-010/cutout-report.json`
- Reproducible processing script: `scripts/prepare_character.py`

The cutout is 728 x 962 with transparent corners, no near-background remnant pixels and no square backdrop. The original sharp-edged render is preserved.

P2.5 adds ten validated official online skins: VIBER-006, VIBER-010, VIBER-031, VIBER-123, VIBER-141, BUREAU-023, BUREAU 01-07, BUREAU 09-03, BUREAU 25-07 and BUREAU 28-02. Each cutout has transparent corners, zero near-background pixels and a clean six-background contrast preview. The runtime manifest is `src/game/characters/roster.json`.

Regenerate and validate the full roster:

```bash
npm run prepare:roster
```

Important limitation: the NFT artwork is a 3/4 frontal voxel portrait, not a side-view animation sheet. It has no independent limbs or side profile. The game keeps the authored pose as a static body and renders the weapon, muzzle flash, jetpack exhaust, shield and damage effects as separate layers. No missing character animation is invented.

More detail: [`docs/character-fidelity.md`](docs/character-fidelity.md).

## Arena

Sector 07 is a 3600 x 1500 arena.

- Ground-level combat lane with crates and cover.
- Left tiered route for jetpack traversal.
- Center bridge and high perch.
- Right-side elevated route and far perch.
- Floating slabs at multiple heights.
- Fourteen respawn pads across the ground and elevated routes.
- Hard world bounds and a debug overlay for every collider.

The art is generated from primitives at runtime and baked into static textures so the scene stays at 60 fps without a large asset download. No external tileset is required.

## Architecture

```text
src/
  app/                     Next.js routes for local and online modes
  components/game/         React HUD, touch controls, audio settings, results
  components/online/       Lobby, profile panel, room browser, invite join
  game/
    ai/                    navigation grid and A* pathfinding
    arena/                 arena data, renderer, 2D collision helpers
    audio/                 original Web Audio synthesis and persistent settings
    characters/            validated roster manifest and texture lookup
    config/                movement, jetpack, weapons, bots, match tuning
    core/                  pure rules: jetpack, weapon, combat, match, spawn
    entities/              player, shared player visuals, local bot drone
    input/                 shared touch input state
    multiplayer/           protocol, shared movement, authoritative simulation
    online/                online Phaser scene and combatant views
    progression/           XP curve, cosmetics, profile types, pure tests
    scenes/                local Phaser arena scene and match flow
    systems/               input, projectiles, effects, textures
    bridge.ts              typed HUD snapshot and command bridge
    GameApp.ts             local Phaser 4 configuration
  lib/guestProfile.ts      browser guest token and profile API client
server/
  config.ts                environment validation and production guards
  index.ts                 Colyseus bootstrap, guest/profile API, health and readiness
  FFARoom.ts               countdown, reconnect grace, XP settlement, metadata
  log.ts                   structured JSON logging
  persistence/             SQLite and PostgreSQL stores, migrations, repository contract
scripts/                   asset preparation and browser verification
Dockerfile                 persistent game-server image
docker-compose.yml         single-host persistent deployment
DEPLOYMENT.md              environment, Neon, WSS, backup, restore and scaling notes
BETA_TESTING.md           15-20 player beta plan, pass criteria and privacy rules
```

Game rules and pathfinding are free of Phaser imports. The local scene owns presentation and Arcade Physics. Online matches use the shared headless simulation in `src/game/multiplayer/GameSimulation.ts`, which runs in Node and uses the same arena, weapon definitions, movement model, bot navigation and match rules as local mode.

## Verification

Run the static checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Run the browser suites while Next and the game server are running. Set `BASE_URL` for a non-default client port, `COLYSEUS_URL` for a non-default server URL, and `CHROME_PATH` if Chrome is in a non-standard location.

```bash
npm run verify:browser
npm run verify:online:countdown
npm run verify:online:matchmaking
npm run verify:online:characters
npm run verify:online:bots
npm run verify:online:match
npm run verify:online:pickups
npm run verify:online:grenades
npm run verify:online:stinking
npm run verify:online:loot
npm run verify:online:arsenal
npm run verify:online:p4
npm run verify:online:p5
npm run verify:ux
npm run verify:online:grenade-perf
npm run verify:online:rooms
npm run verify:online:perf
HEADED=1 npm run verify:online:perf
HEADED=1 npm run verify:online:grenade-perf
```

`verify:browser` covers the local practice route. It verifies cutout transparency, four-combatant boot, all three weapons, movement and jetpack, scoring, bot navigation, player death and respawn, results and replay.

`verify:ux` covers the hub and mobile acceptance matrix. It captures 1280x720, 1366x768, 1440x900, 1920x1080, 844x390, 932x430, 915x412, 780x360, 360x780 and 1024x768, asserts no document scroll and a visible CTA, opens every hub drawer, checks the practice mode and difficulty switch, checks phone practice camera and thumb separation, checks the focused online lobby, reload recovery to the same room and seat, a recovered authoritative input path, a second human join, explicit leave and a measured frame rate. Screenshots and `ux-report.json` are written under `ARTIFACT_DIR`.

`verify:online:countdown` creates one room, checks the countdown HUD and clock, opens a second lobby tab and checks the room card, then waits for bots to fill the seats and verifies the live HUD and lobby card.

`verify:online:matchmaking` checks the most-populated-room preference, launches 15 concurrent Quick Match joins, verifies the 8 + 7 split, waits for the second room to count down and fill its bot, then checks the next joins and an independent Create Room.

`verify:online:characters` checks all ten cards, every selection, keyboard arrow navigation, mobile layout, refresh persistence and corrupt-storage fallback. It creates a room with BUREAU-023, invite-joins with VIBER-123, Quick Matches with another skin, verifies cross-client agreement and bot variety, checks eight independent human choices, confirms selected skins through death and respawn, and rejects arbitrary server skin IDs.

`verify:online:bots` opens a live room with one human and seven bots, checks that all eight views use distinct validated roster textures, waits for bot projectiles, player damage, bot-versus-bot eliminations, bot death and respawn, verifies BOT labels and damaged health bars, checks that death and respawn retain the same skin, joins a second browser to verify identical skin assignments and bot replacement, reconnects a bot after disconnect, and fills all eight seats to confirm no bot visuals remain.

`verify:online:match` opens two independent Chromium contexts with different selected skins in one room, fills the other six seats with SDK clients, waits for the 90-second clock, checks identical results on both browsers, then clicks replay and checks both clients return to a live match with reset scores and their original character selections.

`verify:online:pickups` joins two browsers to one room, compares all thirty-one supply caches, walks a player onto a medkit, checks both clients hide the collected pickup and the HUD reports the carried count, verifies late-join inventory isolation, confirms a concurrent room keeps its own pickup active, verifies the 20-second respawn cycle, then waits for bot damage and verifies `H` consumes a medkit, heals without exceeding 100 HP, shows the HUD feedback and rejects a duplicate use during cooldown.

`verify:online:grenades` joins two browsers to one room, checks all thirty-one supply caches and the three-grenade HUD inventory, selects contact and frag with `4` and `5`, throws a frag with `G`, confirms both clients see the same server-owned fuse and warning indicator, verifies detonation after about five seconds of server simulation time, tops up from a medkit, then chases a clear-line bot and verifies a contact grenade consumes one item, eliminates the bot, credits the kill and appears in the kill feed. A second room confirms grenade and pickup state isolation.

`verify:online:stinking` fills a room with eight humans so self-exposure is deterministic, selects the stinking grenade with `6`, verifies the canister and cloud snapshots on both clients, confirms 6 HP toxic ticks, self-elimination without kill credit, the configured respawn loadout, a late join seeing an active cloud, and an SDK opponent receiving toxic damage and a correctly attributed toxic elimination. It also checks the green cache artwork and a second room's independent pickup state.

`verify:online:loot` joins two real browser clients to one live room and checks the starter loadout and empty third slot, a hostile bot elimination producing one weapon, medkit and grenade from the victim's actual equipped weapon, matching loot ids and Phaser views on both clients, authoritative ammo on pickup, the full-loadout `E` swap prompt and a Vibe Lance swap, duplicate-free replacement, a late joiner receiving remaining loot, a two-client medkit contest awarding one item, server-clock expiry, a human death dropping the actual equipped weapon, starter loadout restoration after respawn, match-end cleanup and replay reset. It requires `VIBE_MILITIA_TEST_HOOKS=1` for deterministic placement.

`verify:online:arsenal` joins two real browser clients to one live room and verifies all four advanced weapons through authored caches and full-loadout swaps, the Akimbo dual-layer presentation and server barrel alternation, SMG high-rate fire and reload, the Heavy Cannon 60-damage direct hit and impact, rocket flight, explosion and single falloff damage, advanced elimination loot, authoritative ammo and respawn reset. A gated elimination hook creates an eight-combatant mixed-weapon lineup for visual and HUD verification. It requires `VIBE_MILITIA_TEST_HOOKS=1`.

`verify:online:p4` covers the complete P4 journey. It creates a guest profile, checks audio persistence, completes three real server-awarded matches, verifies XP, level-up, duplicate prevention and replay records, reconnects during combat, countdown and after grace expiry, fills a room to test reserved-seat capacity, runs multi-touch movement, aim, fire and jetpack simultaneously, and exercises touch reload, weapon selection, grenade throw and cache swap. Run it against a disposable database with `VIBE_MILITIA_TEST_HOOKS=1 MATCH_COUNTDOWN_MS=4000 RECONNECT_GRACE_SECONDS=5 XP_MIN_PARTICIPATION_MS=0`.

`verify:online:p5` covers mobile fidelity and Neon-backed play. It checks 16:9, 19.5:9, 20:9 and compact landscape viewports, confirms the frame, Phaser canvas and camera all fill the viewport, checks control overlap and thumb reach, runs simultaneous CDP multi-touch movement, thrust, aim and auto-fire, switches to FIRE-button mode, sends anonymous feedback, verifies the portrait rotation guard, and confirms desktop keeps the centered 16:9 frame. Run it with `VIBE_MILITIA_TEST_HOOKS=1 MATCH_COUNTDOWN_MS=0 RECONNECT_GRACE_SECONDS=5 XP_MIN_PARTICIPATION_MS=0`.

`verify:online:grenade-perf` measures one human with seven bots, then fills the room with seven SDK humans, arms them with all four advanced weapons, holds fire, throws all three grenade types and creates dynamic loot while a second room stays live. It reports client FPS, average/p95/max server tick, active grenade and cloud counts, maximum cloud overlap, pickup and peak loot counts, advanced weapon counts and snapshot byte size. Use `HEADED=1` for the client frame-rate number.

`verify:online:rooms` creates two concurrent rooms, checks state isolation, rejects a ninth human with the full-room message, releases a seat and rejoins, then waits for an independent match to end and checks the replay error.

`verify:online:perf` measures render rate, ping and sampled server tick time. Headless Chrome may pace WebGL below the display refresh rate, so use `HEADED=1` for the gameplay frame-rate number.

Last verification against the production build:

- `npm run typecheck`: pass
- `npm test`: 179 tests pass across 23 files, with 7 Neon PostgreSQL tests skipped when `TEST_DATABASE_URL` is absent
- `npm run test:postgres`: 7/7 pass on the rerun against the disposable test branch after one transient Neon connection failure
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks pass on the final rerun against `/practice`
- `npm run verify:online:countdown`: 16/16 checks pass
- `npm run verify:online:matchmaking`: 11/11 checks pass on a clean server
- `npm run verify:online:characters`: 34/35 on the final timing-sensitive run; the one miss was a late human joining after bot skin assignment, a documented collision case. All other character checks passed.
- `npm run verify:online:bots`: 32/32 checks pass
- `npm run verify:online:match`: 25/25 checks pass
- `npm run verify:online:pickups`: 28/28 checks pass
- `npm run verify:online:grenades`: 28/28 checks pass
- `npm run verify:online:stinking`: 25/25 checks pass
- `npm run verify:online:loot`: 41/41 checks pass
- `npm run verify:online:p4`: 35/35 checks pass
- `npm run verify:online:arsenal`: 26/26 checks pass
- `npm run verify:online:rooms`: 16/16 checks pass
- `npm run verify:online:p5`: 42/42 checks pass across four landscape shapes plus portrait guard and desktop
- `npm run verify:ux`: 49/49 checks pass against the public production site with zero browser errors across ten viewport shapes, drawer interactions, practice, reload recovery and a two-human room
- `npm run verify:production`: 50/50 checks pass against the public beta, including PostgreSQL, two browser contexts, countdown joins, a live round, replay, reconnect, XP settlement and the mobile landscape guard
- `npm run verify:online:perf`: 6/6 checks pass on the final headed run, 46 fps, 1.77 ms average tick and 5.20 ms p95 under concurrent local test load
- `npm run verify:online:grenade-perf`: 15/15 checks pass
- P0-P4 browser suites were run against a clean SQLite server with `MATCH_COUNTDOWN_MS=10000` to remove host and database latency from their tight timing assumptions. P4 and P5 were run against Neon PostgreSQL.
- Neon PostgreSQL tests cover guest creation, token hashing, duplicate concurrent match writes, concurrent distinct rewards, reward-delivery idempotency, cosmetics validation, anonymous feedback storage and the `/ready` backend.
- SQLite-to-PostgreSQL migration validation used a fixture with 2 players, 1 weapon stat, 1 match and 8 cosmetics. Target counts matched and the migrated player retained XP and match count. The SQLite source was not modified or deleted.
- Mobile verification used Chromium mobile emulation at 1280x720, 844x390, 915x412 and 740x360 with `hasTouch`, real CDP multi-touch events, safe-area CSS and all touch controls. The hub matrix additionally covers 932x430, 780x360, 360x780 portrait and 1024x768 tablet landscape. Physical iOS and Android hardware were not available in this environment.
- Reload recovery was verified against the public site: the same room and session ID returned, authoritative ammo was preserved, a second tab could not redeem the first tab's seat, and a 30-second grace expiry returned the player to matchmaking.
- Original source PNGs, archived NFT sources and the VIBER-010 cutout hash are unchanged. All ten cutouts remain validated.

## Known limitations

- Reconnect survives network loss and brief socket drops inside the same page. It does not survive a full page reload or a game-server process restart. A reload returns the player to the lobby.
- The client predicts local movement and renders remote interpolation, but there is no historical lag compensation for hit registration. High-latency shots can feel inconsistent.
- A disconnected body stays in the arena and can be damaged. It receives no extra invulnerability, which avoids a disconnect exploit but makes a long disconnect risky.
- Ended rooms stay ended until a current occupant starts a replay. New players need to join or create another room.
- Room discovery uses the Colyseus lobby and in-memory room metadata. It is not a persistent matchmaking service and does not survive a server restart.
- Combat input is frozen during the pre-match countdown. Players can aim but cannot move, fire, use the jetpack or use a medkit until the clock starts.
- Medkits are consumed on respawn. A player who dies loses carried medkits, and pickup respawn timers keep running only while the round is live.
- Grenade inventory resets to one contact, one frag and one stinking grenade on death and respawn. Grenades and clouds still active when a match ends are cleared.
- Bot supply decisions are lightweight range-based heuristics. Bots seek nearby medkits when injured and nearby grenade caches when low, but do not plan multi-cache routes or coordinate supplies.
- Bot grenade decisions use a conservative cooldown and range gate. They can throw all three types, but do not coordinate grenade timing with each other.
- Bot toxic-cloud avoidance is a short local repulsion with upward thrust, not full pathfinding around hazard zones.
- Solid terrain fully blocks toxic-cloud damage. The cloud does not seep around corners or through thin platforms.
- Overlapping toxic clouds use a deterministic one-cloud-per-tick policy. Damage does not stack from multiple clouds.
- If a toxic cloud owner disconnects, the kill feed preserves their name, but there is no live standing entry left to update.
- Toxic clouds use lightweight layered circles and bubbles, not volumetric smoke or full-screen particles.
- Pickup cache positions are fixed authored spawns. Dynamic loot comes only from hostile eliminations and is not a random world spawn system.
- Bots collect medkits, grenade caches and eligible dynamic loot, but their decisions are short-range heuristics rather than coordinated loot routing. A bot only takes an advanced weapon when curiosity is enabled and it can use that weapon.
- The replaced weapon in a full-loadout `E` swap is scrapped. It is not dropped back into the world, which is the anti-duplication rule.
- Dynamic loot settles on the first platform top below the death point. The outward scatter is a client animation over the final server position.
- Dynamic loot expires permanently after 12 seconds and is capped at 48 active entities per room. There is no persistence across matches.
- Blast cover uses a consistent 55 percent damage reduction when a platform blocks the blast line. It does not model partial occlusion or destructible cover.
- Grenade damage is not included in the weapon accuracy percentage. Each grenade and cloud has a stable ID and owner for kill attribution.
- Under extreme simultaneous contention, Quick Match can fall back to creating a fresh room after repeated seat races.
- Character selection is only available in the lobby. A player cannot switch skins during a live match.
- Humans may choose the same character. Human selections take priority at bot assignment time, but bots keep their existing skins if a late human joins with the same appearance.
- Bots share the same weapon and PlayerVisuals presentation as humans and differ by official character skin, callsign and BOT label. Bots use a valid rifle or advanced weapon projectile depending on what they carry. Per-skin loadouts are not implemented.
- Bot navigation still uses the compact movement body while damage uses the character-sized hitbox. This preserves A* traversal, but a character can visually overlap tight cover more than the navigation body does.
- If the validated roster ever drops below the number of combatants, bot skin assignment safely reuses entries rather than inventing assets.
- The character body is static because the NFT is a 3/4 portrait. Weapon and effects are separate layers.
- Guest profiles are device-bound. Clearing browser storage loses access until account linking exists, and there is no email, wallet or password recovery.
- PostgreSQL is the durable backend. SQLite remains a single-process fallback. Colyseus room state is still process-local, so multiple game-server replicas need a shared room directory or sticky matchmaking before horizontal scaling.
- XP, levels, titles, badges, elimination variants and jetpack trails are cosmetic only. There is no ranked mode, matchmaking skill rating or paid content.
- The audio system uses original synthesis. There is no licensed music, voice acting, 3D positional mix or dynamic soundtrack.
- Mobile controls were verified with Chromium mobile emulation, CDP multi-touch and real touch event handling at four landscape shapes. Physical iOS and Android hardware were not available in this environment.
- Mobile play is landscape-only by design. Portrait shows a rotation guard. Very small or unusual aspect ratios may still need per-device tuning after physical testing.
- Anonymous feedback and client errors are stored in `client_events`. There is no analytics dashboard, funnel tracking or session replay.
- No public deployment was performed because no persistent game-server host was explicitly authorized. No live URL is claimed.
- The real-player beta has not started. `BETA_TESTING.md` is the runbook.
- There is no gamepad support or full keyboard remapping.
- Touch controls are part of the online match UI. Local P1 mode remains keyboard and mouse.
- The arena uses runtime-baked primitive art, not a final authored tileset.

## Out of scope for P5

- New maps, game modes or non-official characters.
- Accounts, wallets and blockchain integration.
- Ranked matchmaking, skill ratings or paid progression.
- Voice chat, spectator tools or tournaments.
- Final character animation. The source NFT perspective does not support it without new authored art.

## Next steps

1. P5 code and automated verification are complete. The next milestone is the real-player beta in `BETA_TESTING.md`, starting with physical iOS and Android devices.
2. Deploy the frontend and persistent game server to explicitly authorized infrastructure, then verify external guest creation, room joins and WSS.
3. Add account linking so guest profiles can move between devices.
4. Add server-side lag compensation and a configurable latency test harness.
5. Add licensed or original music, voice and a richer audio mix.
6. Add gamepad support and remapping.
7. Replace runtime-baked arena primitives with authored tilesets once the level design is locked.

## Credits

Original Vibe Vibers artwork belongs to the VibeVibe ecosystem. This is a non-commercial gameplay prototype built around that artwork.
