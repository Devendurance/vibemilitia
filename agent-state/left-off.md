# Left Off

## Current task

P3A character selection is implemented and verified. P3B has not started.

## Done

- Added a keyboard-accessible ten-card character picker to `/online`, with prepared avatars, display names, selected state, large cutout preview and responsive 5/4/5/3/2-column layouts.
- Added native radio-group arrow-key selection and focus handling.
- Stored the selected `skinId` under `vibe-militia-skin`. Fresh profiles persist VIBER-010; invalid or removed IDs repair to VIBER-010.
- Sent `skinId` through Quick Match, Create Room, Join Room and invite joins.
- Added server validation in `FFARoom.onAuth` and `GameSimulation.addHuman`. Arbitrary URLs and unknown IDs fall back to VIBER-010.
- Stored the validated selection in `HumanRuntime` and authoritative combatant snapshots.
- Updated the online HUD portrait and identity name to use the selected skin.
- Preserved selected skins through death, respawn, match completion and replay.
- Kept selection lobby-only, with no mid-match skin change path.
- Bots avoid humans' selected appearances when assigning new skins and preserve existing bot skins when a human replaces a bot.
- Added `verify:online:characters` with 35 production checks.
- Extended `verify:online:match` to use VIBER-123 and BUREAU-023 and verify replay persistence.
- Updated README, character fidelity docs, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 53 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:characters`: 35/35
- `npm run verify:online:bots`: 32/32
- `npm run verify:online:match`: 25/25
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 59 fps, 0.23 ms average server tick, 0.46 ms p95
- All ten cards rendered and selected, keyboard arrows worked, mobile showed two columns with no horizontal overflow, refresh persisted the selection and corrupt storage fell back safely
- Create, invite and Quick Match all used selected skins; two and three clients agreed on shared appearances
- Eight human clients kept eight independent requested skins with no bots
- A selected human retained its skin while dead and after respawn
- The full match suite preserved VIBER-123 and BUREAU-023 across a 90-second match and replay
- A submitted arbitrary asset URL was rejected and fell back to VIBER-010
- Original sources, archives and VIBER-010 cutout hash remain unchanged

## Next

1. Stop here and report P3A evidence.
2. Await approval before beginning P3B.
3. Future: reconnect/resume and lag compensation remain unfinished.

## Checkpoint

P3A code, tests and docs are committed on `main`. This file receives the checkpoint hash in the follow-up state commit.
