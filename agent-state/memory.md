# Memory

## Project facts

- Stack: Next.js 16.4.5 App Router, React 19, Tailwind v4, Phaser 4.2.1, TypeScript strict, Vitest 5.
- Multiplayer stack: Colyseus 0.18.10, `@colyseus/sdk` 0.18.9, `@colyseus/schema` 5.x, Node 24, `tsx` runtime dependency.
- Routes: `/` is P1 local mode. `/online` is the Colyseus lobby and match route.
- Game server: port `2567`, health at `/health`, lobby room `lobby`, match room `ffa`.
- Operator asset id: `viber-010`. Source: `public/brand/vibe_vibers_characters/vibe-vibers-viber-10.png`.
- Cutout: `public/sprites/viber-010/viber-010-cutout.png`, 728 x 962, binary alpha, 26.4 percent transparent.
- Original archived: `assets/source/vibe-vibers/viber-010-original.png`.
- Design system: `DESIGN.md`. Graphite `#16181C`, lime `#D7FF2E`, cream `#F5F3EC`, copper `#C7692F`, red `#E5484D`, sky `#9BD8F2`.
- Match: 90 seconds, score limit 10. Local has four combatants. Online has eight seats with bots filling unused seats.
- Player weapons: `vibe-rifle`, `scatter-blaster`, `vibe-lance`.
- Local bots: `NULL-7`, `GLITCH-3`, `SCRAP-9`; 100 HP, 3-shot burst, 7 damage per round. Online rooms reuse the same bot definitions and add more callsigns.

## Multiplayer facts

- `src/game/multiplayer/GameSimulation.ts` is authoritative and headless. It owns humans, bots, projectiles, scoring, respawns, timer, rematch and events.
- `src/game/multiplayer/humanMovement.ts` is the shared AABB movement model used by the server and client prediction. It does not import Phaser.
- Server tick is 60 Hz. Snapshots broadcast at 20 Hz. Clients send input every 33 ms, capped at 45 messages per second.
- Clients send `{ seq, moveX, jump, jumpHeld, fire, reload, weapon, aim }` only. No positions or hit confirmations.
- Online snapshots include participants, projectiles, standings, feed, room metadata and `serverTickMs`.
- Prediction seeds from the first snapshot, steps every rendered frame, lightly corrects toward the authoritative position, and snaps on large errors.
- Remote humans and bots interpolate. Bullets extrapolate from their last snapshot velocity.
- `FFARoom.onAuth` rejects ended rooms with `MATCH_ENDED`. Colyseus returns a 522 on a full matchmake join and the client maps it to the full-room message.
- Bots fill the room on the first human join. A later human removes one bot. A human disconnect creates one bot if below eight combatants.
- Replay restarts the same room and keeps its humans. Everyone can click replay.
- `tsx` must stay in `dependencies` because `server:start` runs TypeScript directly.

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

- Always measure production, not the dev server.
- Headless Chrome can pace WebGL at 30 fps regardless of scene cost. Use `HEADED=1` for real gameplay frame rate.
- Production headed Chrome measured 52 to 60 fps at 1440 x 810 with eight combatants while moving and firing.
- Server tick averaged 0.06 to 0.57 ms in verification. Occasional 8 to 10 ms spikes are GC or scheduler noise, not sustained load.
- Static arena and background layers are baked. Local A* recomputes on an 850 ms cadence. Online bot repath uses `DRONE_CONFIG.repathMs`.

## Next.js gotchas

- `next/font/google` variable fonts cannot combine `axes` with fixed `weight`. Omit `weight` when using `axes: ["wdth"]`.
- `next dev` appends a "This is NOT the Next.js you know" block to `AGENTS.md`; keep it committed to avoid a dirty tree.
- Phaser is dynamically imported inside the client effect in `GameCanvas.tsx`, so SSR never evaluates it.
- `next build` must stay clean after adding server-only files. TypeScript checks `server/` through the root tsconfig.

## Commands

- `npm run server:dev` (Colyseus watch server)
- `npm run server:start` (Colyseus production-style server)
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run verify:browser` after a client server is running
- `npm run verify:online:match`
- `npm run verify:online:rooms`
- `npm run verify:online:perf` (add `HEADED=1` for real frame rate)
- `npm run prepare:character`

## Repo conventions

- No em dashes in prose.
- Preserve original NFT artwork. The game must never regenerate or restyle the character without a fidelity review.
- Keep game rules in `src/game/core`, AI navigation in `src/game/ai` and shared multiplayer rules in `src/game/multiplayer` free of Phaser imports.
- Commit and push meaningful checkpoints. `origin` is `https://github.com/Devendurance/vibemilitia.git` and `main` tracks `origin/main`.
