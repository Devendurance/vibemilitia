# Vibe Militia

A playable side-view free-for-all arena shooter built with Phaser 4, TypeScript, Next.js and Colyseus. The local build is a complete 90-second match against three navigation-capable bot drones. The online build adds server-authoritative rooms for up to eight human and bot combatants.

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

## Match rules

- Local mode starts with four combatants: VIBER-010 and three bot drones.
- Online rooms hold eight combatant slots. The first human starts a room with seven bots. Each new human replaces one bot without resetting the match, and a disconnect returns a bot to the empty seat.
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

## What is playable

- Accelerated horizontal movement with grounded and airborne friction.
- Jumping, gravity, coyote-time jumping and fuel-limited jetpack flight.
- Independent 360-degree aiming with a separate weapon layer.
- Automatic rifle, seven-pellet shotgun and precision two-shot rail weapon.
- Terrain collisions for the player, bots and projectiles.
- Health, delayed regeneration, damage, eliminations, deaths and respawns.
- Three bot drones with pathfinding, terrain collision, line-of-sight fire, burst fire and vertical thruster movement.
- Bot-versus-bot combat. Every participant can score on every other participant.
- Fair respawn pad selection using threat distance, cover and recent death position.
- Live leaderboard, match clock, kill feed, elimination toast, score limit and final results.
- Weapon selector HUD, ammo counters, reload progress and distinct weapon silhouettes.
- Replay without reloading the page.
- Responsive camera follow and debug overlays for platforms, bodies, projectiles, aim and bot paths.

## Online multiplayer

The `/online` route adds a Colyseus lobby and independent free-for-all rooms. The local route at `/` remains available and does not depend on the game server.

- Create a room, quick match into an open room, browse live rooms, or open an invite link.
- Rooms run concurrently with their own simulation, clock, leaderboard, bots, projectiles and results.
- The Node server owns movement, health, ammunition, projectile flight, damage, eliminations, respawns, bots, the match clock and the outcome.
- Browsers send input frames only. They never send positions, hit confirmations or scores.
- The server ticks at 60 Hz and broadcasts snapshots at 20 Hz. Input is capped at 45 messages per second per client.
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

Important limitation: the NFT artwork is a 3/4 frontal voxel portrait, not a side-view animation sheet. It has no independent limbs or side profile. Both P0 and P1 keep the authored pose as a static body and render the weapon, muzzle flash, jetpack exhaust, shield and damage effects as separate layers. No missing character animation is invented.

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
    config/                movement, jetpack, weapons, bots, match tuning
    core/                  pure rules: jetpack, weapon, combat, match, spawn
    entities/              player, player visuals, bot drone
    multiplayer/           protocol, shared movement, authoritative simulation
    online/                online Phaser scene and combatant views
    scenes/                local Phaser arena scene and match flow
    systems/               input, projectiles, effects, textures
    bridge.ts              typed HUD snapshot and command bridge
    GameApp.ts             local Phaser 4 configuration
server/
  index.ts                 Colyseus bootstrap, lobby and health route
  FFARoom.ts               room lifecycle, input limits, bot seats, metadata
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
npm run verify:online:match
npm run verify:online:rooms
npm run verify:online:perf
HEADED=1 npm run verify:online:perf
```

`verify:browser` covers P1 local mode. It verifies cutout transparency, four-combatant boot, all three weapons, movement and jetpack, scoring, bot navigation, player death and respawn, results and replay.

`verify:online:match` opens two independent Chromium contexts in one room, fills the other six seats with SDK clients, waits for the 90-second clock, checks identical results on both browsers, then clicks replay and checks both clients return to a live match with reset scores.

`verify:online:rooms` creates two concurrent rooms, checks state isolation, rejects a ninth human with the full-room message, releases a seat and rejoins, then waits for an independent match to end and checks the replay error.

`verify:online:perf` measures render rate, ping and sampled server tick time. Headless Chrome may pace WebGL below the display refresh rate, so use `HEADED=1` for the gameplay frame-rate number.

Last verification against the production build:

- `npm run typecheck`: pass
- `npm test`: 44 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks pass
- `npm run verify:online:match`: 21/21 checks pass, 8 humans, time-limit result, identical standings, replay reset, 0.06 ms average server tick
- `npm run verify:online:rooms`: 15/15 checks pass, including full-room and ended-room errors
- `HEADED=1 npm run verify:online:perf`: 52 to 60 fps while moving and firing, 0.57 ms average server tick, 0.80 ms p95, 8.82 ms max
- Two-browser sync: both clients observed identical human positions at x 640 to x 1606, bots remained server-controlled, and each client saw the other human's projectiles
- Disconnect backfill: closing one browser left the other in a live match with one human and seven bots

## Known limitations

- Reconnect and mid-match resume are not implemented. A disconnect returns the player to the lobby while the server backfills the seat with a bot.
- The client predicts local movement and renders remote interpolation, but there is no historical lag compensation for hit registration. High-latency shots can feel inconsistent.
- Ended rooms stay ended until a current occupant starts a replay. New players need to join or create another room.
- Room discovery uses the Colyseus lobby and in-memory room metadata. It is not a persistent matchmaking service and does not survive a server restart.
- All bots share the same drone chassis and burst weapon. Their callsigns and scores differ, but their loadouts do not.
- The character body is static because the NFT is a 3/4 portrait. Weapon and effects are separate layers.
- There is no audio yet.
- The arena uses runtime-baked primitive art, not a final authored tileset.
- Guest names and room membership are temporary. There are no accounts, wallets, XP or persistent stats.

## Out of scope for P2

- Accounts, wallets and blockchain integration.
- XP, progression, unlocks or ranked matchmaking.
- New maps, characters or loadouts.
- Spectator tools, voice chat or tournaments.
- Final character animation. The source NFT perspective does not support it without new authored art.

## Next steps

1. Add reconnection tokens and mid-match resume.
2. Add server-side lag compensation and a configurable latency test harness.
3. Add audio and richer hit confirmation through the existing effects layer.
4. Give bots distinct loadouts and personalities using the existing weapon definitions.
5. Add deployment configuration for separate client and game-server hosts.
6. Replace runtime-baked arena primitives with authored tilesets once the level design is locked.

## Credits

Original Vibe Vibers artwork belongs to the VibeVibe ecosystem. This is a non-commercial gameplay prototype built around that artwork.
