# Left Off

## Current task

P0 playable combat prototype is implemented, verified and committed at `78c4263`. Ready for review.

## Done

- Prepared VIBER-010 cutout with deterministic matte, original archive, previews and report.
- Built Sector 07 arena with collidable platforms, elevated routes, crates, hazard bounds and baked art.
- Implemented movement, jump, jetpack, 360 aiming, rifle fire, reload, health, regen, damage, death and respawn.
- Implemented three local training drones with orbit behavior, line-of-sight fire, health and respawn.
- Implemented weapon/effect layers separate from the character sprite.
- Implemented React HUD matching the design system, boot and death overlays, damage vignette.
- Implemented F1/HUD debug collision view.
- Added pure rule tests, typecheck, lint, production build and a browser smoke test.
- Added README and character fidelity documentation.

## Verified

- Browser smoke test: 16/16 checks against the production build on port 3102.
- Manual: F1 keyboard toggle, 360 aiming quadrants, manual respawn CTA, drone kill, reload, death overlay, cutout crop against sky.
- Performance after texture baking: game loop approximately 60 fps at 1440 x 810 in headless Chrome with Intel Iris Xe.

## Next

1. Add a git remote before pushing. The repository currently has no remote configured.
2. User review of the static NFT pose and arena look.
3. Future work: authored side-view character art plus fidelity review, audio, mobile touch controls, server-authoritative simulation.
