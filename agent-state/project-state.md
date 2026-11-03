# Project State

## What this is

Vibe Militia P1: a complete local free-for-all arena shooter built with Next.js 16, React 19, Phaser 4.2.1 and TypeScript. The player operator is VIBER-010, preserved from the original Vibe Vibers NFT artwork. Three bot drones complete the four-operator match.

## Current build

- One arena: Sector 07, 3600 x 1500, with a ground lane, tiered left route, center bridge, right elevated route, floating perches and fourteen respawn pads.
- Match: 90 seconds, first to 10 eliminations, live leaderboard, kill feed, elimination toast, timed finish and results screen with replay.
- Player: accelerated movement, jump, fuel-limited jetpack, 360 aim, three weapons, reload, damage, delayed regeneration, automatic fair-pad respawn and 1.5 s spawn protection.
- Weapons: Vibe Rifle, Scatter Blaster (seven pellets), Vibe Lance (two-shot precision). Each has independent ammo, cadence, reload, recoil, projectile texture, weapon texture and HUD slot.
- Bots: three drones with A* navigation on a 64 px grid, platform colliders, path smoothing, line-of-sight burst fire, vertical thruster movement, stuck recovery, target hysteresis, bot-versus-bot combat and automatic respawns.
- Respawn: safe pad scoring uses enemy distance, line-of-sight cover, occupancy and last death position. All participants wait out their recovery timer; no manual skip.
- Visuals: static VIBER-010 cutout, separate weapon/effects layers, baked arena art, navigation debug paths, bot callsigns, health bars, shield rings and thruster exhaust.
- HUD: identity, health, jetpack, match clock, leaderboard, kill feed, weapon selector, ammo, reload, controls, debug, death overlay, results and boot overlay.
- Browser test API: `window.__VIBE_MILITIA__.getProbe()` and `.send(command)`.

## Architecture

- `src/game/core`: pure rules for jetpack, weapon, combat, match timer/ranking and spawn selection.
- `src/game/ai`: pure navigation grid and A* pathfinding.
- `src/game/config`: tuning for movement, weapons, bots and match.
- `src/game/arena`: arena data, baked visuals, collision helpers.
- `src/game/entities`: Player, PlayerVisuals, Drone (local bot).
- `src/game/systems`: input, projectile groups, effects, generated textures.
- `src/game/scenes/ArenaScene.ts`: Phaser orchestration, local AI, scoring and match flow.
- `src/game/bridge.ts`: typed HUD snapshot and command transport.
- `src/components/game`: game shell, canvas mount, match HUD, results and overlays.
- `scripts/prepare_character.py`: deterministic NFT cutout pipeline.
- `scripts/verify-browser.mjs`: Playwright production smoke test.

## Key decisions

- Static authored NFT pose is intentional. Weapon and effects remain separate layers.
- Auto-only respawns keep the recovery timer fair for the human and bots.
- Bots are full FFA combatants and can eliminate each other.
- A* plus colliders is the bot navigation contract. Bots do not phase through platforms.
- Static arena art is baked to GPU textures. Production measured about 60.5 fps at 1440 x 810.
- HUD follows `DESIGN.md`: graphite panels, lime signal color, mono telemetry, Archivo display type.

## Known limitations

- Bots use the same chassis and burst weapon. Their callsigns and AI behaviors are the only differentiation.
- Character body does not animate or mirror because the NFT is a 3/4 frontal portrait.
- No audio.
- Physics and match simulation are local. No networking, accounts, wallets, progression or full roster.

## Verification

- `npm run typecheck`: pass
- `npm test`: 36 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37 checks pass against the production build
- Natural 90-second bot match ended on the clock, produced a winner and replayed correctly.
- Production renderer: approximately 60.5 fps at 1440 x 810 in headless Chrome on Intel Iris Xe.
