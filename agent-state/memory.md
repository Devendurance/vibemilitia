# Memory

## Project facts

- Stack: Next.js 16.4.5 App Router, React 19, Tailwind v4, Phaser 4.2.1, TypeScript strict, Vitest 5.
- Main route `/` is the game. No separate menu.
- Operator asset id: `viber-010`. Source: `public/brand/vibe_vibers_characters/vibe-vibers-viber-10.png`.
- Cutout: `public/sprites/viber-010/viber-010-cutout.png`, 728 x 962, binary alpha, 26.4 percent transparent.
- Original archived: `assets/source/vibe-vibers/viber-010-original.png`.
- Design system: `DESIGN.md`. Graphite `#16181C`, lime `#D7FF2E`, cream `#F5F3EC`, copper `#C7692F`, red `#E5484D`, sky `#9BD8F2`.
- P1 match: 90 seconds, score limit 10, four FFA combatants, automatic respawns.
- Player weapons: `vibe-rifle`, `scatter-blaster`, `vibe-lance`.
- Bots: `NULL-7`, `GLITCH-3`, `SCRAP-9`; 100 HP, 3-shot burst, 7 damage per round.

## Phaser 4 gotchas

- Collision callback argument order can reverse when a group is paired with a sprite or array. Identify projectiles by their `bullet` data payload, never by argument position.
- `setTintFill(color)` is removed. Use `setTint(color).setTintMode(Phaser.TintModes.FILL)`.
- Static `Graphics` with hundreds of commands is expensive. Bake static layers with `generateTexture` and use images.
- Phaser graphics generated textures persist in the texture manager, so scene restarts should check `textures.exists`.
- Group `add` can reset body settings. Avoid adding pre-configured bodies to a physics group unless the settings are reapplied.
- Phaser 4 uses `this.add.particles(x, y, texture, config)` and emitter `emitting` booleans.
- Fast key taps can begin and end between frames. Buffer reload, jump, weapon and debug presses from `Key` down events instead of polling `JustDown` alone.

## P1 systems

- Match timer and ranking are pure in `src/game/core/match.ts`.
- Safe respawn scoring is pure in `src/game/core/spawn.ts`.
- Bot pathfinding is pure in `src/game/ai/navigation.ts`, tested against the real arena.
- Bots collide with platforms and each other. Their thruster movement and paths are exposed in F1 debug.
- Scene restart drives replay. Reset match fields at the top of `ArenaScene.create`.
- Projectiles carry `ownerId`, `ownerKind`, `weaponId` and `weaponName`; bot bullets can damage other bots.
- `force-match-end` is a debug/test command used by the browser smoke test.

## Performance

- Always measure production, not the dev server. The dev server can show 18 fps while the production build runs at 60 fps.
- Static arena + background layers are baked. A* is recomputed on an 850 ms cadence, not every frame.
- Browser smoke measured a real-time ratio around 0.9 under active automation.

## Next.js gotchas

- `next/font/google` variable fonts cannot combine `axes` with fixed `weight`. Omit `weight` when using `axes: ["wdth"]`.
- `next dev` appends a "This is NOT the Next.js you know" block to `AGENTS.md`; keep it committed to avoid a dirty tree.
- Phaser is dynamically imported inside the client effect in `GameCanvas.tsx`, so SSR never evaluates it.

## Commands

- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run verify:browser` after a server is running
- `npm run prepare:character`

## Repo conventions

- No em dashes in prose.
- Preserve original NFT artwork. The game must never regenerate or restyle the character without a fidelity review.
- Keep game rules in `src/game/core` and AI navigation in `src/game/ai` free of Phaser imports.
- Commit and push meaningful checkpoints when a remote exists. This repo currently has no configured remote.
