# Left Off

## Current task

Approved sprite art is on branch `feat/approved-sprite-art`, pushed and not merged or deployed. It waits on owner review and a physical phone test.

## Done

- Art: guns, akimbo layers, grenades, medkit, projectiles and HUD, hub and touch icons replace the procedural art. Medkit and grenade pickups have no dark tag, only the glow ring. 248 KB in `public/sprites/{loadout,projectiles,icons}`. Sources backed up in the ignored `artifacts/sprite-sources/`.
- Art measurement `npm run measure:art`, results in `artifacts/art/{baseline,after}.json`: no FPS or p95 change.
- Mobile correction on `main`: combined aim + fire, render scale split from world zoom, match viewport lock, animated authoritative countdown, portrait hub scrolling. Frontend only, so the backend stays on `af205b9`. No server, simulation or protocol file changed.
- Frontend `dpl_Bm2SdBeH83tKeyJZX5fx6T1LNRnu` from `65fa870`. Public practice smoke and `verify-release` with `NO_GUEST=1` passed.
- Gates: `verify:mobile` 129/129, `verify:playability` 109/109, unit 212 pass. Traces in `artifacts/playability/mobile/`.
- Backend release `af205b9` on `~/apps/vibe-militia-releases/af205b9`, live on loopback 2767. Rollback: point the symlink at `eebd97b` and restart `vibe-militia.service`.
- Frontend `dpl_7tm9h71jGNk7RCHo7ftYe3AVLG6P` from `e3c4f28`. Previous code deployment: `dpl_FDvQ89MUKGketaeBWfuYpRaQRNHt`.
- Before/after data: `artifacts/playability/{before,after}.json`, printed by `scripts/compare-playability.mjs`.
- Gates: unit 206 pass, 7 skipped; `verify:playability` 109/109; 16 browser suites pass, with three known test races below. XP proven on Neon `p5-test` through a staged release. Public match passed with guest creation blocked, so nothing was written to production.

## Next

0. Owner reviews the art branch, tests it on a physical phone, then merge and deploy. Frontend only.
1. Test on physical iOS and Android. Everything mobile so far is Chromium emulation.
2. Decide the route. From Nigeria the tunnel measures p50 467 ms against 201 ms direct to the VPS, because traffic detours through NBO or JNB. Options, needing owner approval: a direct TLS hostname on the VPS, then a London or Frankfurt server if players are mostly in Africa or Europe. Player locations are not yet known.
3. Run the 15-20 player beta from `BETA_TESTING.md`.

## Known issues

- `verify:mobile` countdown timing fails while this machine is under load, and fails the same on the build before the art. It passed 129/129 earlier on a quiet machine, so rerun it quiet after the art merge.
- Short guns stop before the server's bullet origin, 66 units from the pivot: SMG at 58, akimbo at 64. Bullets appear 8 and 2 units ahead of the visible muzzle.
- Grenade, stinking, arsenal, pickups and loot suites fail intermittently on `main` and on this work alike. `verify-online-grenades` failed 2 of 3 on `main`. Failures read as a throw not consumed or a dead player at a check, and appear to come from bots and timing in older multi-page suites. Not root-caused.
- iOS Safari is unverified. The carried page zoom cause of the missing right pad is reproduced only by forcing page scale in Chromium.
- Test races, none in product code: four of 14 respawn pads sit within 90 px of a weapon cache, so loot's "empty third slot" check fails about 1 run in 7. `verify:ux` can fail its reload check if bots kill the unguarded player. `verify:browser` legacy drill timing failed once in eight runs.
- Lobby timeout and retry is defensive. The stall that prompted it came from a bug in the test proxy, not from a proven production fault.
- Old HUD CSS in `globals.css` is dead weight, overridden by the block at the end of the file.
- `/practice?engine=legacy` keeps the old drone drill for the P1 suite only.
