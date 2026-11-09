# Left Off

## Current task

Tablet performance and beta stabilization is merged to `main` (frontend-only release). The hub soundtrack (PR #1) is also on `main`.

## Done

- Tablet benchmark: `TABLET=1 node scripts/measure-playability.mjs`, A/B with `scripts/ab-tablet.sh` and `scripts/compare-tablet.mjs`. Results in `artifacts/playability/ab2-*.json`.
- Diagnosis: 4x CPU is main-thread bound at any resolution. Old adaptive cut resolution for nothing, then settled. Frames over 250 ms were ignored.
- `AdaptiveQuality`, quality budgets, floor rounding, off-camera cull, MSAA off, local-only HUD forcing, quality changes deferred while a thumb is down.
- Auto, Sharp, Smooth quality and a hidden performance overlay with a copyable summary.
- Gameplay fix: presses latched while dead fired after respawn.
- Flaky suites root-caused and fixed. Grenades, stinking, loot and countdown each passed 4 of 4 completed final trials. Pickups 3 of 3, playability 109 of 109.
- `BETA_TESTING.md` covers tablets, regions, the overlay summary and satisfaction questions.
- Hub soundtrack: Seth_Makes_Sounds CC0 `Fun Music Loop` (Freesound 688623), trimmed to 120.080 s, with a hub-session token guard.
- README, gallery, MIT `LICENSE` (code only), `ASSET_RIGHTS.md` and favicons from the hub mark.

## Next

0. Owner: physical iPhone, Android phone and tablet test with SHOW PERFORMANCE on. Paste the summaries.
1. Root-cause the tap double shot (below).
2. Owner: confirm the `LICENSE` copyright name, artwork rights in `ASSET_RIGHTS.md`, and whether the leaderboard should be opt-in.
3. Route decision for the tunnel latency (see `DEPLOYMENT.md`), then the 15-20 player beta from `BETA_TESTING.md`.

## Known issues

- A 25 ms touch tap sometimes fires two rifle shots about 108 ms apart. Baseline 3 of 6 runs, this branch 2 of 6. Predates this work. The tap check prints server shot times.
- This machine is shared and its speed drifts between hours. Absolute FPS here is not a device number.
- Weak and capable GPU lists are untested on real devices. Adaptive quality corrects a wrong start.
- Feedback form can attach the guest ID. The README says so, and the owner may want that changed.
- README mermaid diagram is not rendered by GitHub's markdown API here. Check it on GitHub.
