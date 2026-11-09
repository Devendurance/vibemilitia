# Beta Testing Plan

This plan covers the first real-player beta for Vibe Militia: 15 to 20 participants across desktop, phone and tablet browsers, with server-authoritative rooms, Neon PostgreSQL progression and anonymous feedback capture.

## Goals

1. Confirm that real players can join, play and finish matches without blocking bugs.
2. Validate the twin-stick touch model, landscape fit and thumb reach on actual phones.
3. Confirm XP, profiles and cosmetic state survive reloads and server restarts.
4. Confirm reconnect behavior on real networks.
5. Measure acceptable latency, frame rate and server tick under 2 to 3 concurrent rooms.
6. Collect lightweight, non-sensitive feedback and client errors.

This is a gameplay beta, not a marketing launch. Ranked mode, new maps, wallets and accounts are out of scope.

## Readiness gate

Do not invite players until all of these are true:

- [ ] Production frontend is deployed over HTTPS.
- [ ] Game server is a persistent Node.js process reachable over WSS.
- [ ] `ALLOWED_ORIGINS` contains only the production frontend origin.
- [ ] `VIBE_MILITIA_TEST_HOOKS` is unset.
- [ ] `/ready` returns `ok: true` and `database.backend: "postgres"`.
- [ ] Neon branch backups or point-in-time recovery are available.
- [ ] A recent logical backup exists.
- [ ] `POST /api/guest`, `GET /api/profile`, `POST /api/client-error` and `POST /api/feedback` work from the production origin.
- [ ] A two-browser smoke test completes a match and awards XP once.
- [ ] A mobile landscape smoke test can move, fly, aim and fire at the same time.
- [ ] The build version and release commit are recorded.

## Participants

Target 15 to 20 players. Recruit a mix:

- 7 to 9 desktop keyboard and mouse players, on at least two browsers.
- 5 to 7 landscape phone players.
- 3 to 4 tablet players, including at least one iPad and one Android tablet under about USD 250.
- At least two iOS Safari devices and two Android Chrome devices.
- At least one player on a slower or higher-latency connection.
- Players from at least two broad regions (for example West Africa and Europe). Ask only for the region, never a city or address.
- A facilitator who is not playing and can watch `/ready`, logs and room count.

Run two or three sessions of 45 to 60 minutes. Keep each room at eight or fewer humans. With 15 to 20 players, expect two or three concurrent rooms.

## Session structure

### 0 to 10 minutes: onboarding

- Open the production URL.
- Complete guest creation and the onboarding guide.
- Choose a character.
- Set audio and touch preferences.
- Join a room with the facilitator.

### 10 to 35 minutes: core match loop

Each participant should complete at least two full matches.

- Quick Match and Create Room both work.
- Countdown reaches live play.
- Movement, jump, jetpack, aim and fire work.
- All three starter weapons can be equipped and fired.
- Advanced weapons can be picked up from caches and elimination loot.
- Contact, frag and stinking grenades can be selected and thrown.
- Medkits can be collected, carried and used.
- Weapon swaps work when all three slots are occupied.
- Death, respawn and the results screen work.
- Replay starts a new match with reset scores.

### 35 to 50 minutes: persistence and reconnect

- Finish a match and note XP, level and recent match.
- Reload the page and confirm the same profile and XP.
- Drop the network for 3 to 5 seconds and confirm the reconnect overlay, then the same seat.
- Drop for longer than the configured grace period and confirm a clean return to the lobby.
- Open the same guest profile in a second tab and confirm it does not create a duplicate combatant.

### 50 to 60 minutes: mobile-specific pass

- Rotate from portrait to landscape and back.
- Confirm the portrait guard replaces the match with rotation guidance.
- Enter browser fullscreen and confirm the game fills the screen.
- Confirm sticks and buttons stay inside safe areas on notched and rounded devices.
- Confirm left-stick up engages thrust while the right stick aims.
- Confirm right-stick auto-fire works and can be disabled for FIRE-button mode.
- Confirm two thumbs can move, fly, aim and fire together.
- Confirm no page scroll, pinch zoom, text selection or stuck fire after interruptions.

## Device and performance pass

Everyone on a phone or tablet does this once, with settings open from the gear icon:

1. Choose SHOW PERFORMANCE. The overlay stays hidden unless a player turns it on.
2. Play one Practice match on Normal, then one Online match, both on AUTO quality.
3. In the last 20 seconds of each match, press COPY SUMMARY and paste it into the feedback form.
4. If the game feels slow on AUTO, repeat one match on SMOOTH and paste that summary too.

The summary holds frame times, resolution, quality, GPU name, screen size, ping and snapshot gap. It has no names, guest IDs, tokens or location. Practice has no network, so a gap between Practice and Online on one device points at the connection or the server. Slow in both points at the device.

## What to record

Use the in-game BETA FEEDBACK panel for a 1 to 5 rating and a short note. Client errors are captured automatically and anonymously.

Record only:

- Device class, browser and operating system.
- Connection type or rough latency.
- Room code and approximate time.
- What the player expected and what happened.
- Whether the issue repeated.
- A screenshot or short recording when useful.

Do not collect names, email addresses, phone numbers, IP addresses, wallet addresses or other personal data. Do not ask players to paste tokens or connection strings.

Compare by device class and by region, never as one average. A good desktop average can hide a tablet that is unplayable.

Ask every player three questions after their last match, on a 1 to 5 scale:

- How smooth did it feel?
- How well did controls respond?
- How likely are you to play again tomorrow?

## Metrics

Collect these from the facilitator's notes, `/ready`, server logs and the test harness results:

- Join success rate.
- Match completion rate.
- Crash or page-error rate.
- Reconnect success rate.
- Duplicate XP or duplicate match records.
- Average and p95 server tick.
- Client FPS on desktop and mobile.
- Input-to-render latency feel, reported as a 1 to 5 rating.
- Number of rooms and peak concurrent humans.
- Number of feedback reports by rating.

## Pass criteria

The beta is healthy enough to continue if:

- At least 95 percent of join attempts succeed.
- At least 90 percent of started matches reach a result or a deliberate leave.
- No duplicate XP or duplicate match reward is observed.
- No guest token or connection string appears in logs or client responses.
- Reconnect succeeds in at least 80 percent of short network drops.
- The game server average tick stays under 8 ms and p95 stays under 16 ms on the beta host.
- Desktop stays at or above 50 FPS and mobile stays at or above 30 FPS on supported devices.
- Every tested device can move, aim and fire at the same time.
- No blocker prevents a player from finishing a match and seeing results.

Stop the beta and roll back if:

- Players lose progression or see another player's profile.
- Duplicate XP is confirmed.
- A server error prevents most joins.
- A security issue exposes tokens or credentials.
- The game server crashes repeatedly under normal room load.

## Failure triage

1. Capture the approximate time, room code and browser.
2. Check `/ready` and the JSON logs.
3. Check whether the issue reproduces in a second room.
4. Check whether it affects one device, one browser or all players.
5. Preserve logs and database state before restarting.
6. Roll back the frontend if the issue is client-only.
7. Roll back the game server if the issue is server-only.
8. Use Neon point-in-time recovery or the latest logical backup for data loss.
9. Record the incident and the rollback decision.

## Privacy and safety

- Guest profiles are device-bound and store no email, phone, wallet or real name.
- Feedback stores kind, message, route, app version, optional guest ID and rating.
- Feedback does not store IP addresses or user agents.
- Error capture is rate-limited and anonymous.
- Do not enable test hooks in production.
- Do not publish database credentials in chat, screenshots or issue reports.

## Exit report template

```text
Build:
Commit:
Beta window:
Participants:
Devices:
Rooms:
Matches started / completed:
Join success:
Reconnect success:
Crash-free rate:
Duplicate XP observed:
Average / p95 server tick:
Desktop FPS:
Phone FPS / 1% low / p95 (by device):
Tablet FPS / 1% low / p95 (by device):
Practice vs Online frame time (same device):
Ping by broad region:
Reconnects and accidental exits:
Smoothness / controls / replay scores:
Top three issues:
Blocking issues:
Decision: continue / fix first / roll back
```

## Current status

- Beta plan: ready.
- Automated pre-beta verification: complete on local production builds, on emulated devices.
- Real-player beta: not started. Nothing in this file proves real-player behavior.
- Physical iOS, Android and tablet testing: pending. The first beta session provides the first real-device evidence, through the performance summaries above.
