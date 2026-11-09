# Left Off

## Current task

Tablet performance and beta stabilization, branch `fix/tablet-beta-stabilization`. Frontend-only release. Backend changes are test hooks only and need no deploy.

## Done

- Tablet benchmark: `TABLET=1 node scripts/measure-playability.mjs`, A/B with `scripts/ab-tablet.sh` and `scripts/compare-tablet.mjs`. Results in `artifacts/playability/ab2-*.json`.
- Diagnosis: 4x CPU is main-thread bound at any resolution. Old adaptive cut resolution for nothing, then settled. Frames over 250 ms were ignored.
- `AdaptiveQuality`, quality budgets, floor rounding, off-camera cull, MSAA off, local-only HUD forcing, deferred quality changes while a thumb is down.
- Auto, Sharp, Smooth quality and hidden performance overlay with a copyable summary.
- Gameplay fix: presses latched while dead fired after respawn.
- Flaky suites root-caused and fixed. Grenades, stinking, loot and countdown each passed 4 of 4 completed final trials. Pickups 3 of 3, playability 109 of 109.
- `BETA_TESTING.md` covers tablets, regions, the overlay summary and satisfaction questions.

## Next

1. Owner: physical iPhone, Android phone and tablet test with SHOW PERFORMANCE on. Paste the summaries.
2. Root-cause the tap double shot (below).
3. Route decision, then the 15-20 player beta.

## Known issues

- A 25 ms touch tap sometimes fires two rifle shots about 108 ms apart. Baseline 3 of 6 runs, this branch 2 of 6. Predates this work. The tap check prints server shot times.
- This machine is shared and its speed drifts between hours. Absolute FPS here is not a device number.
- Weak and capable GPU lists are untested on real devices. Adaptive quality corrects a wrong start.
