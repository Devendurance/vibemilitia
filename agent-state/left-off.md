# Left Off

## Current task

P2.5 Slice A is implemented and verified. Slice B has not started and waits for explicit approval.

## Done

- Added a server-owned pre-match countdown. Default is 10 seconds, configurable with `MATCH_COUNTDOWN_MS`.
- New rooms wait during countdown, accept more humans, then fill empty seats with bots and start the 90-second clock.
- Eight humans start immediately.
- Humans joining a live room still replace bots without resetting the match.
- Quick Match now uses Colyseus `joinOrCreate` with an `open` metadata filter and `clients: -1` ordering.
- Quick Match retries seat races and falls back to a new room if needed.
- Room metadata now includes `open`, `phase`, `countdownMs` and `remainingMs`.
- Enabled realtime FFA listing so lobby cards update after the lobby already exists.
- HUD shows START IN countdown, STARTING pill, and switches to live when the match starts.
- Added countdown and matchmaking browser/SDK verification suites.
- Updated README, project state and memory.

## Verified

- `npm run typecheck`: pass
- `npm test`: 46 tests pass
- `npm run lint`: pass
- `npm run build`: pass
- `npm run verify:browser`: 37/37
- `npm run verify:online:countdown`: 16/16
- `npm run verify:online:matchmaking`: 11/11
- `npm run verify:online:match`: 22/22
- `npm run verify:online:rooms`: 16/16
- `HEADED=1 npm run verify:online:perf`: 58 fps, 0.74 ms average server tick, 1.52 ms p95
- 15 concurrent Quick Match clients joined in under a second as 8 + 7 humans across two rooms
- The 7-human room counted down, filled one bot and started live
- `MATCH_COUNTDOWN_MS=2500` produced a 2.5-second countdown and a live match with seven bots
- Production P1 local mode remains 37/37

## Next

1. Stop here and report Slice A evidence.
2. Await explicit approval before Slice B: Viber character visuals and player-style weapons for online bots.
3. After Slice B, consider reconnect/resume and lag compensation.

## Checkpoint

P2.5 Slice A code and verification are committed on `main`. This file receives the checkpoint hash in the follow-up state commit.
