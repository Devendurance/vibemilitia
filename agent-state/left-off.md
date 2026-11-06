# Left Off

## Current task

Playability rescue is deployed. Next is physical phone testing and a real-player beta.

## Done

- Backend release `af205b9` on `~/apps/vibe-militia-releases/af205b9`, live on loopback 2767. Rollback: point the symlink at `eebd97b` and restart `vibe-militia.service`.
- Frontend `dpl_7tm9h71jGNk7RCHo7ftYe3AVLG6P` from `e3c4f28`. Previous code deployment: `dpl_FDvQ89MUKGketaeBWfuYpRaQRNHt`.
- Before/after data: `artifacts/playability/{before,after}.json`, printed by `scripts/compare-playability.mjs`.
- Gates: unit 206 pass, 7 skipped; `verify:playability` 109/109; 16 browser suites pass, with three known test races below. XP proven on Neon `p5-test` through a staged release. Public match passed with guest creation blocked, so nothing was written to production.

## Next

1. Test on physical iOS and Android. Everything mobile so far is Chromium emulation.
2. Decide the route. From Nigeria the tunnel measures p50 467 ms against 201 ms direct to the VPS, because traffic detours through NBO or JNB. Options, needing owner approval: a direct TLS hostname on the VPS, then a London or Frankfurt server if players are mostly in Africa or Europe. Player locations are not yet known.
3. Run the 15-20 player beta from `BETA_TESTING.md`.

## Known issues

- Test races, none in product code: four of 14 respawn pads sit within 90 px of a weapon cache, so loot's "empty third slot" check fails about 1 run in 7. `verify:ux` can fail its reload check if bots kill the unguarded player. `verify:browser` legacy drill timing failed once in eight runs.
- Lobby timeout and retry is defensive. The stall that prompted it came from a bug in the test proxy, not from a proven production fault.
- Old HUD CSS in `globals.css` is dead weight, overridden by the block at the end of the file.
- `/practice?engine=legacy` keeps the old drone drill for the P1 suite only.
