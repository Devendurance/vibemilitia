/**
 * Quick Match and room placement verification for P2.5 Slice A.
 *
 * Requires a clean Colyseus server and Next client:
 *   BASE_URL=http://localhost:3101 npm run verify:online:matchmaking
 *
 * Verifies:
 * - Quick Match joins the most populated open room.
 * - 15 simultaneous Quick Match attempts land as 8 + 7 humans in two rooms.
 * - A full room starts immediately. A seven-human room counts down, then gets
 *   one bot and starts live.
 * - Further players fill the remaining seat or create a new room.
 * - Create Room always creates a separate room with its own countdown.
 */

import { Client } from "@colyseus/sdk";

const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const rooms = [];
const snapshots = new Map();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const track = (room) => {
  room.onMessage("snapshot", (snapshot) => snapshots.set(room.roomId, snapshot));
  room.onMessage("events", () => undefined);
  rooms.push(room);
  return room;
};

const quickMatch = async (name) => {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate("ffa", {
    name,
    roomName: "SECTOR 07",
    open: true,
  });
  return track(room);
};

const createRoom = async (name, roomName) => {
  const client = new Client(serverUrl);
  const room = await client.create("ffa", { name, roomName });
  return track(room);
};

const joinRoom = async (roomId, name) => {
  const client = new Client(serverUrl);
  const room = await client.joinById(roomId, { name });
  return track(room);
};

const waitForPhase = async (roomId, phase, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = snapshots.get(roomId);
    if (snapshot?.phase === phase) return snapshot;
    await wait(200);
  }
  return snapshots.get(roomId) ?? null;
};

try {
  // Controlled preference check: a five-human room must win over a two-human
  // room when both are open and counting down.
  const lowHost = await createRoom("LOW-HOST", "POP LOW");
  await joinRoom(lowHost.roomId, "LOW-TWO");
  const highHost = await createRoom("HIGH-HOST", "POP HIGH");
  for (let index = 1; index < 5; index += 1) {
    await joinRoom(highHost.roomId, `HIGH-${index + 1}`);
  }
  await wait(500);
  const preference = await quickMatch("PREFERENCE");
  const lowSize = rooms.filter((room) => room.roomId === lowHost.roomId).length;
  const highSize = rooms.filter((room) => room.roomId === highHost.roomId).length;
  console.log("PREFERENCE", {
    low: { id: lowHost.roomId, clients: lowSize },
    high: { id: highHost.roomId, clients: highSize },
    joined: preference.roomId,
  });
  check(
    "quick match prefers the most populated open room",
    preference.roomId === highHost.roomId && highSize > lowSize,
    `joined ${preference.roomId.slice(0, 8)} high=${highHost.roomId.slice(0, 8)}`,
  );

  for (const room of [...rooms]) {
    await room.leave().catch(() => undefined);
  }
  rooms.length = 0;
  snapshots.clear();
  await wait(1200);

  // Fifteen genuinely concurrent Quick Match attempts. No client should be
  // stranded and the first room should fill before a second is required.
  const startedAt = Date.now();
  const joined = await Promise.all(
    Array.from({ length: 15 }, (_, index) => quickMatch(`QUICK-${index + 1}`)),
  );
  await wait(800);
  const groups = new Map();
  for (const room of joined) {
    const group = groups.get(room.roomId) ?? [];
    group.push(room);
    groups.set(room.roomId, group);
  }
  const sizes = [...groups.values()].map((group) => group.length).sort((a, b) => b - a);
  console.log("QUICK MATCH", {
    clients: joined.length,
    rooms: sizes,
    elapsedMs: Date.now() - startedAt,
  });
  check("all fifteen quick-match clients join", joined.length === 15);
  check("fifteen clients are split across two rooms", sizes.length === 2 && sizes[0] === 8 && sizes[1] === 7, sizes.join(" + "));
  const uniqueSessions = new Set(joined.map((room) => room.sessionId));
  check("every quick-match client has a unique session", uniqueSessions.size === 15);

  const fullRoom = [...groups.entries()].find(([, group]) => group.length === 8);
  const countdownRoom = [...groups.entries()].find(([, group]) => group.length === 7);
  const fullRoomId = fullRoom?.[0] ?? "";
  const countdownRoomId = countdownRoom?.[0] ?? "";
  const fullSnapshot = snapshots.get(fullRoomId);
  const countdownSnapshot = snapshots.get(countdownRoomId);
  console.log("ROOM STATES", {
    full: {
      id: fullRoomId.slice(0, 8),
      phase: fullSnapshot?.phase,
      humans: fullSnapshot?.humans,
      bots: fullSnapshot?.bots,
    },
    countdown: {
      id: countdownRoomId.slice(0, 8),
      phase: countdownSnapshot?.phase,
      humans: countdownSnapshot?.humans,
      bots: countdownSnapshot?.bots,
      countdownMs: countdownSnapshot?.countdownRemainingMs,
    },
  });
  check(
    "an eight-human room starts immediately with no bots",
    fullSnapshot?.phase === "live" && fullSnapshot.humans === 8 && fullSnapshot.bots === 0,
  );
  check(
    "a seven-human room stays in countdown with no bots",
    countdownSnapshot?.phase === "countdown" &&
      countdownSnapshot.humans === 7 &&
      countdownSnapshot.bots === 0 &&
      countdownSnapshot.countdownRemainingMs > 0,
  );

  const countdownLive = countdownRoomId
    ? await waitForPhase(countdownRoomId, "live", 25000)
    : null;
  console.log("COUNTDOWN COMPLETE", {
    phase: countdownLive?.phase,
    humans: countdownLive?.humans,
    bots: countdownLive?.bots,
  });
  check(
    "countdown expiry fills the eighth seat with a bot",
    countdownLive?.phase === "live" &&
      countdownLive.humans === 7 &&
      countdownLive.bots === 1,
  );

  const sixteenth = await quickMatch("QUICK-16");
  await wait(300);
  const secondRoomId = countdownRoomId;
  const sixteenthSnapshot = snapshots.get(secondRoomId);
  check(
    "next quick match fills the remaining human seat",
    sixteenth.roomId === secondRoomId &&
      sixteenthSnapshot?.humans === 8 &&
      sixteenthSnapshot?.bots === 0,
    `room=${sixteenth.roomId.slice(0, 8)}`,
  );

  const seventeenth = await quickMatch("QUICK-17");
  await wait(300);
  const thirdSnapshot = snapshots.get(seventeenth.roomId);
  check(
    "a full pair of rooms creates a new countdown room",
    seventeenth.roomId !== fullRoomId &&
      seventeenth.roomId !== secondRoomId &&
      thirdSnapshot?.phase === "countdown" &&
      thirdSnapshot.humans === 1 &&
      thirdSnapshot.bots === 0,
    `room=${seventeenth.roomId.slice(0, 8)}`,
  );

  const manual = await createRoom("MANUAL-HOST", "PRIVATE ARENA");
  await wait(300);
  const manualSnapshot = snapshots.get(manual.roomId);
  check(
    "create room starts an independent countdown room",
    manual.roomId !== seventeenth.roomId &&
      manualSnapshot?.phase === "countdown" &&
      manualSnapshot.humans === 1 &&
      manualSnapshot.bots === 0,
    `room=${manual.roomId.slice(0, 8)}`,
  );

  check(
    "no room exceeds eight human seats",
    [...groups.values()].every((group) => group.length <= 8),
  );
} finally {
  for (const room of rooms) {
    await room.leave().catch(() => undefined);
  }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
