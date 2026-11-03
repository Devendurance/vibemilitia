# Vibe Militia

A playable side-view free-for-all arena shooter built with Phaser 4, TypeScript and Next.js. The P1 build turns the P0 combat sandbox into a complete local match against three navigation-capable bot drones.

The operator is VIBER-010, prepared from the original Vibe Vibers NFT artwork.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The match boots into Sector 07 automatically.

For a production check:

```bash
npm run build
npm start
```

## Match rules

- Four combatants: VIBER-010 and three bot drones.
- 90-second match.
- First to 10 eliminations wins immediately.
- If the clock expires, the highest score wins. Ties break on fewer deaths.
- Respawns continue during the match and do not pause the clock.
- Respawn timing is automatic for the player and all bots, so no participant can skip the recovery window.
- Respawning uses a safe pad selection that avoids live enemies, their sightlines, and the last death location where possible.
- The results screen shows final placements, eliminations, deaths, accuracy and a replay button.

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
  app/                     Next.js page, fonts, design tokens
  components/game/         React HUD, results, boot state, canvas mount
  game/
    ai/                    navigation grid and A* pathfinding
    arena/                 arena data, renderer, 2D collision helpers
    config/                movement, jetpack, weapons, bots, match tuning
    core/                  pure rules: jetpack, weapon, combat, match, spawn
    entities/              player, player visuals, bot drone
    scenes/                Phaser arena scene, match flow and orchestration
    systems/               input, projectiles, effects, textures
    bridge.ts              typed HUD snapshot and command bridge
    GameApp.ts             Phaser 4 configuration
scripts/                   asset preparation and browser smoke test
```

Game rules and pathfinding are free of Phaser imports. The Phaser scene owns presentation, Arcade Physics and local bots. This remains the seam for a future server-authoritative build, but networking is not implemented.

## Verification

Run the local checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Run the browser smoke test while a server is running:

```bash
npm run dev
# in another terminal
npm run verify:browser
```

The smoke test uses installed Chrome through `playwright-core`. Set `BASE_URL` if the server uses another port, and `CHROME_PATH` if Chrome is in a non-standard location. It verifies:

- PNG transparency, including corner alpha and transparent area.
- Four-combatant FFA boot state, clock, leaderboard and all three weapons.
- Movement, camera follow, jump and jetpack.
- Equipping and firing all three weapons.
- Reload.
- Player elimination scoring, hit confirmation and leaderboard updates.
- Bot respawn after elimination.
- Bot navigation paths, vertical thrusters and zero platform penetration.
- Player death, killer attribution and death overlay.
- Safe respawn pad selection.
- Match end, winner, results overlay and full replay reset.
- Absence of browser page errors.

Last local verification:

- `npm run typecheck`: pass
- `npm test`: 36 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks pass against the production build
- A complete 90-second blind bot match ended naturally on the clock, produced a winner and replayed correctly.
- Production renderer measured approximately 60.5 fps at 1440 x 810 in headless Chrome with Intel Iris Xe graphics.

## Known limitations

- Bot drones are local. They path intelligently and respect terrain, but their combat tuning is not a substitute for human opponents.
- The character body is static because the NFT is a 3/4 portrait. Weapon and effects are separate layers.
- There is no audio yet.
- The arena uses runtime-baked primitive art, not a final authored tileset.
- Physics remains local Arcade Physics. Networking is not implemented.
- The three bots use the same drone chassis and weapon. Their callsigns and scores differ, but their loadouts do not.

## Out of scope for P1

- Networking and server-authoritative multiplayer.
- Accounts, wallets and blockchain integration.
- XP, progression, unlocks or matchmaking.
- The full Vibe Vibers roster and character selection.
- Lobby, seasons, store or spectator tools.
- Final character animation. The source NFT perspective does not support it without new authored art.

## Next steps

1. Add audio and richer hit confirmation through the existing effects layer.
2. Add mobile touch controls that write into the existing `ControlFrame`.
3. Move projectile, navigation and terrain simulation into a shared fixed-step simulation for server authority.
4. Give bots distinct loadouts and personalities using the existing weapon definitions.
5. Replace runtime-baked arena primitives with authored tilesets once the level design is locked.

## Credits

Original Vibe Vibers artwork belongs to the VibeVibe ecosystem. This is a non-commercial gameplay prototype built around that artwork.
