# Vibe Militia

A playable side-view free-for-all arena shooter built with Phaser 4, TypeScript, Next.js and Colyseus. The local build is a complete 90-second match against three navigation-capable bot drones. The online build adds server-authoritative rooms for up to eight combatants, a ten-character picker and ten validated official Viber skins. Online bots use the same Vibe Rifle and PlayerVisuals layers as human players.

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

Open `http://localhost:3000` for P1 local mode, or `http://localhost:3000/online` for multiplayer.

For a production check:

```bash
npm run build
npm run server:start
npm start
```

The Colyseus server listens on port `2567` by default. Set `PORT` for the server and `NEXT_PUBLIC_COLYSEUS_URL` at build time when the client and server do not share the default local URL.

New rooms use a 10-second pre-match countdown. Override it with `MATCH_COUNTDOWN_MS` on the game server. The value is clamped from 0 to 60000 milliseconds.

## Match rules

- Local mode starts with four combatants: VIBER-010 and three bot drones.
- Online rooms hold eight combatant slots. A new room starts a short countdown. Humans can join during the countdown, and Viber-presented bots fill every empty seat when it expires. If all eight human seats fill, the match starts immediately.
- Before the countdown ends, combat input is held and the 90-second clock has not started.
- Humans joining a live room replace a bot without resetting the match. A disconnect returns a bot to the empty seat.
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
| `1` / `2` / `3` | Equip the rifle, scatter blaster or vibe lance |
| `4` / `5` / `6` | Select the contact, frag or stinking grenade |
| `G` | Throw the selected grenade |
| `H` | Use a carried medkit in online matches |
| `R` | Reload |
| `F1` | Toggle physics, navigation and collision debug |
| `Enter` | Replay after the results screen |

The input layer samples a plain `ControlFrame` object. A future virtual joystick can write the same fields without changing movement, weapons or rendering.

## Weapons

| Weapon | Slot | Damage | Magazine | Cadence | Reload | Role |
| --- | --- | --- | --- | --- | --- | --- |
| Vibe Rifle | 1 | 14 | 20 | 108 ms | 1.10 s | Full auto, mid range |
| Scatter Blaster | 2 | 9 x 7 pellets | 6 | 720 ms | 1.80 s | Close range burst |
| Vibe Lance | 3 | 50 | 4 | 650 ms | 1.65 s | Precision, two-shot kill |

Each weapon has its own magazine state, weapon texture, projectile texture, muzzle colour, spread, recoil and crosshair size. Switching preserves the other magazines. Reload progress belongs to the equipped weapon.

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

Nine grenade caches sit across Sector 07: three contact, three frag and three stinking, in addition to the fourteen medkit caches. Grenade caches use distinct orange-red, olive and green supply artworks, share the contested-pickup and respawn rules, and disappear for every client when collected.

Online bots carry the same three-grenade loadout, use medkits when injured, seek nearby supplies through a short-range supply goal, throw conservative server-owned grenades and steer away from nearby toxic clouds. They still use the existing A* movement, rifle combat and targeting systems.

## What is playable

- Accelerated horizontal movement with grounded and airborne friction.
- Jumping, gravity, coyote-time jumping and fuel-limited jetpack flight.
- Independent 360-degree aiming with a separate weapon layer.
- Automatic rifle, seven-pellet shotgun and precision two-shot rail weapon.
- Terrain collisions for the player, bots and projectiles.
- Health, delayed regeneration, damage, eliminations, deaths and respawns.
- Fourteen fixed medkit caches across ground routes and elevated platforms. Online players carry up to two, use them with `H`, and heal 50 HP without exceeding maximum health.
- Nine grenade caches with orange-red contact, olive frag and green stinking identities. Players carry up to three grenades total and throw with `G`.
- Server-authoritative contact, frag and stinking grenades with gravity, terrain bouncing, swept collision, five-second frag fuses and toxic clouds.
- Toxic clouds apply server-owned 24 HP/s damage in 250 ms ticks, respect invulnerability, stop when a combatant leaves, block behind solid terrain, and use a deterministic one-cloud-per-tick stacking policy.
- Online bots collect medkits and grenade supplies, use medkits when injured, throw finite server-owned grenades and avoid nearby toxic clouds.
- Generic pickup collection, 20 to 22-second respawn timers and per-room supply state.
- Three local bot drones with pathfinding, terrain collision, line-of-sight fire, burst fire and vertical thruster movement.
- Online bots use distinct validated Viber cutouts, PlayerVisuals weapon and jetpack layers, BOT callsign labels, Vibe Rifle projectiles and the same character-sized damage hitbox as humans.
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
- Rooms run concurrently with their own simulation, clock, leaderboard, bots, projectiles, grenades, toxic clouds, pickups and results.
- The Node server owns movement, health, ammunition, grenade flight and fuses, explosions, toxic clouds, medkit inventory, pickup collection, bot supplies and grenade decisions, the match clock and the outcome.
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

Guest callsigns are temporary and stored in local storage. There are no accounts, wallets, progression or persistent stats.

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
  components/game/         React HUD, results, boot state, canvas mount
  components/online/       Lobby, room browser, invite join, online session
  game/
    ai/                    navigation grid and A* pathfinding
    arena/                 arena data, renderer, 2D collision helpers
    characters/            validated roster manifest and texture lookup
    config/                movement, jetpack, weapons, bots, match tuning
    core/                  pure rules: jetpack, weapon, combat, match, spawn
    entities/              player, shared player visuals, local bot drone
    multiplayer/           protocol, shared movement, authoritative simulation
    online/                online Phaser scene and combatant views
    scenes/                local Phaser arena scene and match flow
    systems/               input, projectiles, effects, textures
    bridge.ts              typed HUD snapshot and command bridge
    GameApp.ts             local Phaser 4 configuration
server/
  index.ts                 Colyseus bootstrap, lobby, matchmaking order, health route
  FFARoom.ts               countdown, input limits, bot seats, live metadata
scripts/                   asset preparation and browser verification
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
npm run verify:online:grenade-perf
npm run verify:online:rooms
npm run verify:online:perf
HEADED=1 npm run verify:online:perf
HEADED=1 npm run verify:online:grenade-perf
```

`verify:browser` covers P1 local mode. It verifies cutout transparency, four-combatant boot, all three weapons, movement and jetpack, scoring, bot navigation, player death and respawn, results and replay.

`verify:online:countdown` creates one room, checks the countdown HUD and clock, opens a second lobby tab and checks the room card, then waits for bots to fill the seats and verifies the live HUD and lobby card.

`verify:online:matchmaking` checks the most-populated-room preference, launches 15 concurrent Quick Match joins, verifies the 8 + 7 split, waits for the second room to count down and fill its bot, then checks the next joins and an independent Create Room.

`verify:online:characters` checks all ten cards, every selection, keyboard arrow navigation, mobile layout, refresh persistence and corrupt-storage fallback. It creates a room with BUREAU-023, invite-joins with VIBER-123, Quick Matches with another skin, verifies cross-client agreement and bot variety, checks eight independent human choices, confirms selected skins through death and respawn, and rejects arbitrary server skin IDs.

`verify:online:bots` opens a live room with one human and seven bots, checks that all eight views use distinct validated roster textures, waits for bot projectiles, player damage, bot-versus-bot eliminations, bot death and respawn, verifies BOT labels and damaged health bars, checks that death and respawn retain the same skin, joins a second browser to verify identical skin assignments and bot replacement, reconnects a bot after disconnect, and fills all eight seats to confirm no bot visuals remain.

`verify:online:match` opens two independent Chromium contexts with different selected skins in one room, fills the other six seats with SDK clients, waits for the 90-second clock, checks identical results on both browsers, then clicks replay and checks both clients return to a live match with reset scores and their original character selections.

`verify:online:pickups` joins two browsers to one room, compares all twenty-three supply caches, walks a player onto a medkit, checks both clients hide the collected pickup and the HUD reports the carried count, verifies late-join inventory isolation, confirms a concurrent room keeps its own pickup active, verifies the 20-second respawn cycle, then waits for bot damage and verifies `H` consumes a medkit, heals without exceeding 100 HP, shows the HUD feedback and rejects a duplicate use during cooldown.

`verify:online:grenades` joins two browsers to one room, checks all twenty-three supply caches and the three-grenade HUD inventory, selects contact and frag with `4` and `5`, throws a frag with `G`, confirms both clients see the same server-owned fuse and warning indicator, verifies detonation after about five seconds of server simulation time, tops up from a medkit, then chases a clear-line bot and verifies a contact grenade consumes one item, eliminates the bot, credits the kill and appears in the kill feed. A second room confirms grenade and pickup state isolation.

`verify:online:stinking` fills a room with eight humans so self-exposure is deterministic, selects the stinking grenade with `6`, verifies the canister and cloud snapshots on both clients, confirms 6 HP toxic ticks, self-elimination without kill credit, the configured respawn loadout, a late join seeing an active cloud, and an SDK opponent receiving toxic damage and a correctly attributed toxic elimination. It also checks the green cache artwork and a second room's independent pickup state.

`verify:online:grenade-perf` measures one human with seven bots, then fills the room with seven SDK humans and throws all three grenade types while a second room stays live. It reports client FPS, average/p95/max server tick, active grenade and cloud counts, maximum cloud overlap, pickup count and snapshot byte size. Use `HEADED=1` for the client frame-rate number.

`verify:online:rooms` creates two concurrent rooms, checks state isolation, rejects a ninth human with the full-room message, releases a seat and rejoins, then waits for an independent match to end and checks the replay error.

`verify:online:perf` measures render rate, ping and sampled server tick time. Headless Chrome may pace WebGL below the display refresh rate, so use `HEADED=1` for the gameplay frame-rate number.

Last verification against the production build:

- `npm run typecheck`: pass
- `npm test`: 102 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks pass
- `npm run verify:online:countdown`: 16/16 checks pass, including HUD and lobby card synchronization
- `npm run verify:online:matchmaking`: 11/11 checks pass
- `npm run verify:online:characters`: 35/35 checks pass against the production build
- `npm run verify:online:bots`: 32/32 checks pass against the production build
- All ten character cards render, every card is selectable, keyboard arrows change selection, mobile shows two readable columns, and refresh plus corrupt-storage fallback behave correctly.
- Create Room, invite join and Quick Match all use the selected skin. Two clients choosing different characters see the same assignments, and bots avoid those skins where possible.
- Eight human clients kept eight independently requested skins with no bot visuals.
- Selected humans retained their skin while dead, after respawn, and after replay.
- The server rejected an arbitrary asset URL and fell back to VIBER-010.
- 15 concurrent Quick Match clients joined in under a second as 8 + 7 humans across two rooms.
- `verify:online:match`: 25/25 checks pass, 8 humans, time-limit result, identical standings, replay reset, and preserved VIBER-123/BUREAU-023 selections.
- `verify:online:pickups`: 29/29 checks pass. Two clients saw the same twenty-three supply caches, a collected medkit disappeared for both, a late join saw no duplicated inventory, a second room kept independent pickup state, the respawn cycle completed, `H` healed without exceeding the cap, the HUD showed the heal amount, and a duplicate use consumed no extra medkit.
- `verify:online:grenades`: 29/29 checks pass. Both clients saw the same contact, frag and stinking caches and distinct artworks, key selection and the throw control worked, the frag detonated after about 5 seconds of server simulation time, a contact grenade eliminated a bot with correct kill-feed credit, self-damage did not award an opponent a kill, medkits still healed, and a second room had independent grenade and pickup state.
- `verify:online:stinking`: 25/25 checks pass. The cloud activated at 160 px for 6 seconds, applied 6 HP toxic ticks, eliminated the player without granting a kill, restored the one-of-each loadout on respawn, damaged and eliminated an idle opponent with owner credit, appeared to a late joiner, and left a second room's pickups independent.
- `verify:online:rooms`: 16/16 checks pass, including countdown auto-start, full-room and ended-room errors.
- `HEADED=1 npm run verify:online:perf`: 59 fps, 0.36 ms average server tick, 1.10 ms p95 on a clean server. An accumulated-server run measured 56 fps, 0.23 ms average and 0.50 ms p95.
- `HEADED=1 npm run verify:online:grenade-perf`: 11/11 checks pass with 8 humans, 8 peak in-flight grenades, 8 active toxic clouds, 2 overlapping clouds, 60 fps, 0.21 ms average tick, 0.27 ms p95, 5.04 ms max, 23 pickups and a 14,471-byte snapshot. A second concurrent room stayed live.
- Original source PNGs, archived NFT sources and the VIBER-010 cutout hash are unchanged. All ten cutouts remain validated.

## Known limitations

- Reconnect and mid-match resume are not implemented. A disconnect returns the player to the lobby while the server backfills the seat with a bot.
- The client predicts local movement and renders remote interpolation, but there is no historical lag compensation for hit registration. High-latency shots can feel inconsistent.
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
- Pickup positions are fixed authored caches. There is no dynamic or random supply spawning.
- Blast cover uses a consistent 55 percent damage reduction when a platform blocks the blast line. It does not model partial occlusion or destructible cover.
- Grenade damage is not included in the weapon accuracy percentage. Each grenade and cloud has a stable ID and owner for kill attribution.
- Under extreme simultaneous contention, Quick Match can fall back to creating a fresh room after repeated seat races.
- Character selection is only available in the lobby. A player cannot switch skins during a live match.
- Humans may choose the same character. Human selections take priority at bot assignment time, but bots keep their existing skins if a late human joins with the same appearance.
- Bots share the same Vibe Rifle presentation and differ by official character skin, callsign and BOT label. Per-skin loadouts are not implemented.
- Bot navigation still uses the compact movement body while damage uses the character-sized hitbox. This preserves A* traversal, but a character can visually overlap tight cover more than the navigation body does.
- If the validated roster ever drops below the number of combatants, bot skin assignment safely reuses entries rather than inventing assets.
- The character body is static because the NFT is a 3/4 portrait. Weapon and effects are separate layers.
- There is no audio yet.
- The arena uses runtime-baked primitive art, not a final authored tileset.
- Guest names and room membership are temporary. There are no accounts, wallets, XP or persistent stats.

## Out of scope for P3B-C

- Weapon drops from eliminated players, elimination loot and akimbo rifles.
- New primary weapons or a weapon inventory redesign.
- Accounts, wallets and blockchain integration.
- XP, progression, unlocks or ranked matchmaking.
- New non-official characters, maps or modes.
- Reconnect tokens or lag-compensation redesigns.
- Audio implementation.
- Spectator tools, voice chat or tournaments.
- Final character animation. The source NFT perspective does not support it without new authored art.

## Next steps

1. P3B is complete. Wait for a new P3C instruction before starting loot, new weapons or progression.
2. Add reconnection tokens and mid-match resume.
3. Add server-side lag compensation and a configurable latency test harness.
4. Add audio and richer hit confirmation through the existing effects layer.
5. Add deployment configuration for separate client and game-server hosts.
6. Replace runtime-baked arena primitives with authored tilesets once the level design is locked.

## Credits

Original Vibe Vibers artwork belongs to the VibeVibe ecosystem. This is a non-commercial gameplay prototype built around that artwork.
