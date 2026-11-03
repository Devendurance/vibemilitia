# Memory

## Project facts

- Stack: Next.js 16.4.5 App Router, React 19, Tailwind v4, Phaser 4.2.1, TypeScript strict, Vitest 5.
- Main route `/` is the game. No separate menu.
- Operator asset id: `viber-010`. Source: `public/brand/vibe_vibers_characters/vibe-vibers-viber-10.png`.
- Cutout: `public/sprites/viber-010/viber-010-cutout.png`, 728 x 962, binary alpha, 26.4 percent transparent.
- Original archived: `assets/source/vibe-vibers/viber-010-original.png`.
- Design system: `DESIGN.md`. Graphite `#16181C`, lime `#D7FF2E`, cream `#F5F3EC`, copper `#C7692F`, red `#E5484D`, sky `#9BD8F2`.

## Phaser 4 gotchas

- Collision callback argument order can reverse when a group is paired with a sprite or array. Identify projectiles by their `bullet` data payload, never by argument position.
- `setTintFill(color)` is removed. Use `setTint(color).setTintMode(Phaser.TintModes.FILL)`.
- Static `Graphics` with hundreds of commands is expensive. Bake static layers with `generateTexture` and use images.
- Phaser graphics generated textures persist in the texture manager, so scene restarts should check `textures.exists`.
- Group `add` can reset body settings. Avoid adding pre-configured bodies to a physics group unless the settings are reapplied.
- Phaser 4 uses `this.add.particles(x, y, texture, config)` and emitter `emitting` booleans.

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
- Keep game rules in `src/game/core` free of Phaser imports.
- Commit and push meaningful checkpoints when a remote exists. This repo currently has no configured remote.
