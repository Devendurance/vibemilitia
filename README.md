# Vibe Militia

A playable P0 side-view arena shooter built with Phaser 4, TypeScript and Next.js. The prototype uses the original Vibe Vibers artwork as the operator sprite and pairs it with a bright voxel-inspired training ground.

This is a local combat prototype. It is not the full game.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and play. The game boots into the arena automatically.

For a production check:

```bash
npm run build
npm start
```

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` | Move left and right |
| `Space` | Jump. Hold while airborne to fire the jetpack |
| Mouse | Aim the weapon in 360 degrees |
| Left mouse button | Fire |
| `R` | Reload |
| `F1` | Toggle physics and collision debug |
| `Enter` | Redeploy while the death overlay is visible |

The input layer samples a plain `ControlFrame` object. A future virtual joystick can write the same fields without changing movement, weapons or rendering.

## What is playable

- Accelerated horizontal movement with grounded and airborne friction.
- Jumping, gravity and coyote-time jumping.
- Fuel-limited jetpack with a delayed regeneration curve.
- Independent 360-degree aiming with a separate weapon layer.
- Automatic rifle fire, muzzle flash, recoil kick, tracers, impacts, screen shake and damage numbers.
- Magazine and reload state with HUD feedback.
- Terrain collisions against every platform, crate and boundary.
- Player health, damage, regeneration, death overlay and automatic respawn.
- Three local training drones with hover movement, line-of-sight checks, burst fire and respawn.
- Responsive camera follow with a deadzone and arena bounds.
- Debug mode with platform AABBs, player and drone bodies, active projectile markers and the aim vector.
- Bright voxel-inspired arena with parallax skyline, floating islands, blocky platforms, hazard edges, crates and a sector sign.

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

The cutout is 728 x 962 with transparent corners, no near-background remnant pixels and no square backdrop. The original sharp-edged render is preserved rather than feathered into a new silhouette.

Important limitation: the NFT artwork is a 3/4 frontal voxel portrait, not a side-view animation sheet. It has no independent limbs or side profile. P0 therefore keeps the authored pose as a static body and renders the weapon, muzzle flash, jetpack exhaust, shield and death effects as separate layers. No missing character animation is invented. A future animation set would need newly authored or rigged source art, followed by a separate visual-fidelity review.

More detail: [`docs/character-fidelity.md`](docs/character-fidelity.md).

## Arena

Sector 07 is a 3600 x 1500 training ground.

- Ground-level combat lane with crates and cover.
- Left tiered route for jetpack traversal.
- Center bridge and high perch.
- Right-side elevated route and far perch.
- Floating slabs at multiple heights.
- Hard world bounds and a debug overlay for every collider.

The art is generated from primitives at runtime and baked into static textures so the scene stays at 60 fps without a large asset download. No external tileset is required.

## Architecture

```text
src/
  app/                     Next.js page, fonts, design tokens
  components/game/         React HUD, boot state, canvas mount
  game/
    arena/                 arena data, renderer, 2D collision helpers
    config/                movement, jetpack, weapon, drone tuning
    core/                  pure rules: jetpack, weapon, combat, tests
    entities/              player, player visuals, drone
    scenes/                Phaser arena scene and orchestration
    systems/               input, projectiles, effects, textures
    bridge.ts              typed HUD snapshot and command bridge
    GameApp.ts             Phaser 4 configuration
scripts/                   asset preparation and browser smoke test
```

Game rules live in `src/game/core` and do not import Phaser. The Phaser scene owns presentation, Arcade Physics and local AI. This is the seam a future server-authoritative build can reuse. It is not a finished network simulation: projectile sweeping and terrain simulation would still need to move to the server.

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
- Boot, drone count, movement and camera follow.
- Jump and jetpack fuel consumption.
- Ammo consumption and reload.
- Debug toggle.
- Drone damage to the player.
- Death overlay and automatic respawn.
- Absence of browser page errors.

## Known P0 limitations

- Training drones are local AI. They ignore terrain collision when moving and use line-of-sight only to decide when they can fire. They can drift through a platform edge during an orbit.
- The character body is static because the NFT is a 3/4 portrait. Weapon and effects are separate layers. See `docs/character-fidelity.md`.
- There is no audio yet.
- The arena uses runtime-baked primitive art, not a final authored tileset.
- Physics remains local Arcade Physics. Networking is not implemented.

## Out of scope for P0

- Networking and server-authoritative multiplayer.
- Accounts, wallets and blockchain integration.
- XP, progression, unlocks or matchmaking.
- The full Vibe Vibers roster and character selection.
- Lobby, menus, seasons, store or spectator tools.
- Final character animation. The source NFT perspective does not support it without new authored art.

## Next steps

1. Author a side-view character sheet or rig from the Vibe Vibers identity, then run a visual-fidelity review before replacing the static body.
2. Add mobile touch controls that write into the existing `ControlFrame`.
3. Move projectile and terrain simulation into a shared fixed-step simulation for server authority.
4. Add audio, hit confirmation and a proper match loop.
5. Replace the runtime-baked arena primitives with authored tilesets once the level design is locked.

## Credits

Original Vibe Vibers artwork belongs to the VibeVibe ecosystem. This is a non-commercial gameplay prototype built around that artwork.
