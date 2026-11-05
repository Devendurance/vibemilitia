# Left Off

## Current task

UX overhaul milestone: hub, onboarding/leaderboard, practice difficulty, focused online lobby, mobile v2 controls, 30s reload recovery, production deploy and verification. P6 not started.

## Done

- `/` is now the Sector 07 game hub. `/practice?difficulty=...` is the local P1 drill. `/online` is the focused matchmaking lobby.
- Hub has hero Viber, compact profile, online/practice switch, four difficulties, starter loadout preview, character/profile/rankings/settings/loadout drawers and SVG Sector 07 backdrop.
- Onboarding captures editable callsign, optional self-declared X handle and leaderboard opt-in. No name uniqueness claim, no X verification claim.
- Server schema v3 adds `x_handle`, `x_public`, `leaderboard_visible`. `GET /api/leaderboard` is server-derived and opt-in. Guest limit is 30/min.
- Local practice bots have four real tuning profiles. Practice never touches XP, profiles or leaderboard.
- Mobile v2 thin HUD, 4-way left pad with thrust, round aim/fire pad, compact grenade/throw/reload/weapon/medkit/pickup, fullscreen via settings, portrait guard, camera zoom `height/680`.
- Reconnect: `RECONNECT_GRACE_SECONDS` defaults 30. Tab-scoped single-use resume handle + `POST /api/resume`; P4 35/35 and browser reload/expiry verified.
- P5 41/42 on last run; only feedback close race failed, fixed by 700ms close. Rerun pending.
- `verify:ux` script added: 49/51 on dev; remaining two were test formula issues (local camera width fields) and headless FPS threshold, both patched.
- Single global stylesheet: `globals.css` now contains hub/online/touch styles. Do not add a second global CSS import; Turbopack dropped the first sheet.

## Next

1. Rerun P5, P1 browser, characters, match, and `verify:ux` on a production build.
2. Commit/push to `origin/main`.
3. Deploy backend to `endy-vps` release dir, update env `RECONNECT_GRACE_SECONDS=30`, restart only `vibe-militia.service`.
4. Deploy frontend (inspect/fix Vercel Git; manual `vercel --prod` fallback).
5. Run `npm run verify:production`, update docs/state and final report.

## Known issues

- Physical iOS/Android hardware not available. Mobile evidence is emulated Chromium.
- Practice local P1 has no grenades/medkits/pickups and uses drone bots; online uses full Viber bots and all utilities.
- Vercel automatic Git deploys need inspection; manual production deploy is available.
- Headless Chrome FPS is 23-30; use HEADED=1 for the real performance number.
