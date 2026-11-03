# Project State

## What this is

Vibe Militia P0: a playable local side-view arena shooter built with Next.js 16, React 19, Phaser 4.2.1 and TypeScript. The first operator is VIBER-010, prepared from the original Vibe Vibers NFT artwork.

## Current build

- One arena: Sector 07, 3600 x 1500, ground lane, tiered left route, center bridge, right elevated route and floating perches.
- Player: accelerated movement, jump, fuel-limited jetpack, 360 aim, Vibe Rifle, reload, damage, death, auto respawn, invulnerability shield.
- Enemies: three local hover drones with orbit AI, line-of-sight gating, burst fire, health bars and respawn.
- Rendering: player cutout, separate weapon, muzzle flash, jet exhaust, shield, shadows, particles, damage numbers, camera shake.
- HUD: identity, health, jetpack, ammo, reload, score, uptime, controls, debug, death overlay, boot overlay.
- Debug: F1 and HUD button draw platform AABBs, player and drone bodies, active bullets and aim vector.
- Browser test API: `window.__VIBE_MILITIA__.getProbe()` and `.send(command)` for local verification.

## Architecture

- `src/game/core`: pure TypeScript rules and Vitest coverage for jetpack, weapon and combat.
- `src/game/config`: tuning constants.
- `src/game/arena`: arena data, collision helpers, baked visual builder.
- `src/game/entities`: Player, PlayerVisuals, Drone.
- `src/game/systems`: input adapter, projectile groups, effects, generated textures.
- `src/game/scenes/ArenaScene.ts`: Phaser orchestration and local physics.
- `src/game/bridge.ts`: typed HUD snapshot and command transport.
- `src/components/game`: React shell, canvas mount, HUD.
- `scripts/prepare_character.py`: deterministic cutout pipeline.
- `scripts/verify-browser.mjs`: Playwright browser smoke test.

## Key decisions

- Static authored NFT pose is intentional. The source is 3/4 frontal and has no side-view rig. Weapon and effects are separate layers. No generative reconstruction was used.
- Static arena art is baked to GPU textures. This moved the measured game loop from about 12 fps to about 60 fps at 1440 x 810 in headless Chrome.
- Rules remain free of Phaser imports so a future server simulation can reuse them. Arcade Physics and projectile simulation are still client-side.
- HUD follows `DESIGN.md` tokens: graphite panels, lime signal color, mono telemetry, Archivo display type.
- Local browser smoke test is committed but requires Chrome and a running server.

## Known limitations

- Drone movement ignores terrain collision, though firing uses line of sight.
- Character body does not animate or mirror. It is the authored 3/4 pose.
- No audio.
- No networking, accounts, wallets, progression or full roster.

## Verification

- `npm run typecheck`: pass
- `npm test`: 18 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 16/16 checks pass against production build
- Manual checks: F1 toggle, four-quadrant aiming, manual respawn button, drone kill, reload, cutout crop, death overlay.
