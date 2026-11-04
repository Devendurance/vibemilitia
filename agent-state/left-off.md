# Left Off

## Current task

P2.5 Slice C is implemented and verified. P3 has not started.

## Done

- Inspected all ten official source images and confirmed they are ten distinct single-character renders. No composites or duplicate views were included. No sources were rejected.
- Refactored `scripts/prepare_character.py` to process the full roster, validate alpha output and generate `src/game/characters/roster.json`.
- Added `npm run prepare:roster`.
- Added validated skins: `viber-010` (human default), `viber-006`, `viber-031`, `viber-123`, `viber-141`, `bureau-023`, `bureau-roll-01-07`, `bureau-roll-09-03`, `bureau-roll-25-07`, `bureau-roll-28-02`.
- Added transparent cutouts, avatars, alpha-contrast previews, game-scale previews and cutout reports under `public/sprites/`.
- Archived every original source unchanged under `assets/source/vibe-vibers/`.
- Added server-authoritative `skinId` to combatant snapshots.
- Bots choose deterministic unique non-default skins seeded from the room ID, retain them through death/respawn, and get valid unused skins after replacement and backfill.
- Humans remain VIBER-010. No selection UI was added.
- OnlineScene preloads all ten roster textures. CombatantView resolves the correct texture from `skinId`.
- Added a roster manifest test and expanded the production bot suite to 32 checks.
- Updated README, character fidelity docs, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 52 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:match`: 22/22
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 58 fps, 0.30 ms average server tick, 0.60 ms p95
- One human plus seven bots rendered eight distinct official skins
- All ten roster textures loaded in the production browser
- Bot skins persisted through death and respawn
- Late-joining clients saw identical assignments
- Human replacement preserved the six remaining bot skins
- Disconnect backfill added one valid unused skin
- Eight-human rooms showed no bot visuals
- Original public sources, archives and VIBER-010 cutout hash are unchanged
- Production screenshots inspected for distinct colors, weapon attachment, ground alignment, BOT labels, combat effects and matte artifacts

## Next

1. Stop here and report Slice C evidence.
2. Await approval before P3.
3. P3A can add the player-facing skin picker using the validated roster and `skinId` state.

## Checkpoint

P2.5 Slice C code, assets and verification are committed at `b30b623` on `main`. P3 has not started.
