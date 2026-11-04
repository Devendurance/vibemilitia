/**
 * Online room lifecycle verification for P2.
 *
 * Requires Next and Colyseus to be running:
 *   BASE_URL=http://localhost:3101 npm run verify:online:rooms
 *
 * Verifies:
 * - Two browser sessions can create independent concurrent rooms.
 * - Room state does not leak between rooms.
 * - A ninth human is rejected with a clear full-room error.
 * - A released seat can be joined immediately.
 * - An ended room rejects new humans with a clear match-ended error.
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const executablePath = process.env.CHROME_PATH;

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const contexts = [];
const fillers = [];
const pageErrors = [];
const consoleErrors = [];
const networkFailures = [];

const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  return page;
};

const waitOnlineReady = async (page) => {
  await page.waitForFunction(
    () => Boolean(window.__VIBE_MILITIA_ONLINE__),
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true,
    null,
    { timeout: 30000 },
  );
};

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: value.snapshot?.phase ?? null,
      endReason: value.snapshot?.endReason ?? null,
      humans: value.snapshot?.humans ?? 0,
      bots: value.snapshot?.bots ?? 0,
      countdownMs: Math.round(value.snapshot?.countdownRemainingMs ?? 0),
      tick: value.snapshot?.tick ?? 0,
      humansList: (value.snapshot?.participants ?? [])
        .filter((entry) => entry.kind === "human")
        .map((entry) => ({ id: entry.id, name: entry.name })),
      participants: (value.snapshot?.participants ?? []).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
      })),
    };
  });

const readRoomError = async (page) => {
  const error = page.locator(".online-error");
  await error.waitFor({ timeout: 15000 });
  return (await error.textContent())?.trim() ?? "";
};

const createRoom = async (page) => {
  await page.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(page);
  return probe(page);
};

const attemptInviteJoin = async (page, roomId) => {
  await page.goto(`${baseUrl}/online?room=${roomId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.locator('[data-testid="join-invite-room"]').click();
};

try {
  const pageA = await newPage();
  const pageB = await newPage();

  const roomA = await createRoom(pageA);
  const roomB = await createRoom(pageB);
  console.log("ROOMS", {
    a: { id: roomA.roomId, humans: roomA.humans, bots: roomA.bots },
    b: { id: roomB.roomId, humans: roomB.humans, bots: roomB.bots },
  });
  check("each browser owns a distinct room", roomA.roomId !== roomB.roomId);
  check(
    "each room starts a countdown with one human and no bots",
    roomA.phase === "countdown" &&
      roomA.countdownMs > 0 &&
      roomA.humans === 1 &&
      roomA.bots === 0 &&
      roomB.phase === "countdown" &&
      roomB.countdownMs > 0 &&
      roomB.humans === 1 &&
      roomB.bots === 0,
  );
  const overlap = roomA.humansList.filter((entry) =>
    roomB.humansList.some((other) => other.id === entry.id),
  );
  check("concurrent rooms share no human sessions", overlap.length === 0);
  const beforeB = await probe(pageB);
  await pageA.keyboard.down("KeyD");
  await pageA.waitForTimeout(700);
  await pageA.keyboard.up("KeyD");
  const afterA = await probe(pageA);
  const afterB = await probe(pageB);
  check("room A tick advances independently", afterA.tick > roomA.tick);
  check("room B tick advances independently", afterB.tick > beforeB.tick);
  check("room B combatants are unchanged by room A input", JSON.stringify(afterB.participants) === JSON.stringify(beforeB.participants));

  // Fill room A with seven SDK clients, then check the ninth human rejection.
  for (let index = 0; index < 7; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomA.roomId, {
      name: `SEAT-${index + 1}`,
    });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
  }
  await pageA.waitForTimeout(800);
  const full = await probe(pageA);
  console.log("FULL", { humans: full.humans, bots: full.bots, phase: full.phase });
  check(
    "room reaches eight human seats and starts immediately",
    full.humans === 8 && full.bots === 0 && full.phase === "live",
  );

  const countdownDeadline = Date.now() + 20000;
  let startedB = null;
  while (Date.now() < countdownDeadline) {
    startedB = await probe(pageB);
    if (startedB.phase === "live") break;
    await pageB.waitForTimeout(500);
  }
  console.log("COUNTDOWN START", {
    phase: startedB?.phase,
    humans: startedB?.humans,
    bots: startedB?.bots,
  });
  check(
    "countdown expiry fills bots and starts room B",
    startedB?.phase === "live" &&
      startedB.humans === 1 &&
      startedB.bots === 7,
  );

  const pageC = await newPage();
  await attemptInviteJoin(pageC, roomA.roomId);
  const fullError = await readRoomError(pageC);
  console.log("FULL ERROR", fullError);
  check(
    "ninth human sees a clear full-room error",
    fullError.includes("ROOM FULL") && fullError.includes("Eight human players"),
    fullError,
  );

  // Release one seat and retry from the same browser tab.
  await fillers.pop().room.leave();
  await pageA.waitForTimeout(800);
  const released = await probe(pageA);
  check("disconnect backfills a bot seat", released.humans === 7 && released.bots === 1, `humans=${released.humans} bots=${released.bots}`);
  await pageC.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageC);
  const rejoined = await probe(pageC);
  console.log("SEAT REUSE", { humans: rejoined.humans, bots: rejoined.bots });
  check("released seat accepts a new human", rejoined.roomId === roomA.roomId && rejoined.humans === 8 && rejoined.bots === 0);

  // Let the independent room B run to its score-limit or time end.
  let endedB = null;
  const deadline = Date.now() + 145000;
  while (Date.now() < deadline) {
    endedB = await probe(pageB);
    if (endedB.phase === "ended") break;
    await pageB.waitForTimeout(1000);
  }
  console.log("ENDED ROOM", {
    phase: endedB?.phase,
    reason: endedB?.endReason,
    humans: endedB?.humans,
    bots: endedB?.bots,
  });
  check("independent room reaches an ended phase", endedB?.phase === "ended");

  const pageD = await newPage();
  await attemptInviteJoin(pageD, roomB.roomId);
  const endedError = await readRoomError(pageD);
  console.log("ENDED ERROR", endedError);
  check(
    "ended room rejects a new human with a clear error",
    endedError.includes("MATCH ENDED"),
    endedError,
  );

  check(
    "full and ended errors are understandable",
    fullError.length > 10 && endedError.length > 10,
  );
  console.log("NETWORK FAILURES", networkFailures.slice(0, 6));
  check("no browser page errors", pageErrors.length === 0, `${pageErrors.length} errors`);
  check(
    "no unexpected console errors",
    consoleErrors.length === 0,
    `${consoleErrors.length} errors`,
  );
} finally {
  for (const filler of fillers) {
    await filler.room.leave().catch(() => undefined);
  }
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
