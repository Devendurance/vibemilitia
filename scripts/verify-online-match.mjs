/**
 * Full online match verification for P2.
 *
 * Requires the Next dev server and Colyseus server to be running:
 *   npm run dev -- -p 3101
 *   npm run server:dev
 *   BASE_URL=http://localhost:3101 npm run verify:online:match
 *
 * Two independent Chromium contexts join the same room. Six headless SDK
 * clients fill the remaining seats so the match cannot end on the bot score
 * limit. The test waits for the 90 second clock, checks results on both
 * clients, clicks replay, and checks that both clients return to a live match.
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const artifactDir = process.env.ARTIFACT_DIR ?? "";
const executablePath = process.env.CHROME_PATH;

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

if (artifactDir) await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const pageErrors = [];
for (const [label, page] of [
  ["A", pageA],
  ["B", pageB],
]) {
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`${label}: ${message.text()}`);
  });
}

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
      remainingMs: Math.round(value.snapshot?.remainingMs ?? 0),
      winnerName: value.snapshot?.winnerName ?? null,
      humans: value.snapshot?.humans ?? 0,
      bots: value.snapshot?.bots ?? 0,
      serverTickMs: value.snapshot?.serverTickMs ?? 0,
      standings: (value.snapshot?.standings ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        score: entry.score,
        deaths: entry.deaths,
        placement: entry.placement,
      })),
      overlayVisible: document
        .querySelector('[data-testid="results-overlay"]')
        ?.classList.contains("is-visible") ?? false,
      resultText:
        document.querySelector('[data-testid="results-overlay"]')?.textContent ?? "",
    };
  });

const fillers = [];
try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(900);
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  const roomUrl = pageA.url();
  const initialA = await probe(pageA);
  const roomId = initialA.roomId;
  console.log("ROOM", roomId, roomUrl);
  check("host creates a live room", initialA.phase === "live");

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  const joinedB = await probe(pageB);
  check("second browser joins the same room", joinedB.roomId === roomId);
  check("two humans replace two bots", joinedB.humans >= 2 && joinedB.bots <= 6);

  // Fill remaining seats with headless SDK clients so bots cannot reach the
  // score limit before the clock. Six clients + two browsers = eight seats.
  for (let index = 0; index < 6; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, {
      name: `FILL-${index + 1}`,
    });
    // Filler clients only hold seats. Register no-op handlers so the SDK does
    // not warn for every broadcast snapshot and event.
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
  }
  await pageA.waitForTimeout(1200);
  const filled = await probe(pageA);
  console.log("FILLED", {
    humans: filled.humans,
    bots: filled.bots,
    phase: filled.phase,
  });
  check("eight human seats are enforced", filled.humans === 8, `humans=${filled.humans}`);
  check("all bot seats are replaced", filled.bots === 0, `bots=${filled.bots}`);

  let lastA = null;
  let lastB = null;
  let tickSamples = 0;
  let tickTotal = 0;
  const deadline = Date.now() + 118000;
  while (Date.now() < deadline) {
    [lastA, lastB] = await Promise.all([probe(pageA), probe(pageB)]);
    if (lastA.serverTickMs > 0) {
      tickTotal += lastA.serverTickMs;
      tickSamples += 1;
    }
    if (lastA.phase === "ended" && lastB.phase === "ended") break;
    await pageA.waitForTimeout(1000);
  }

  console.log("END", {
    phaseA: lastA?.phase,
    phaseB: lastB?.phase,
    reasonA: lastA?.endReason,
    reasonB: lastB?.endReason,
    remainingA: lastA?.remainingMs,
    remainingB: lastB?.remainingMs,
    winnerA: lastA?.winnerName,
    winnerB: lastB?.winnerName,
  });
  check("match reaches an ended phase on both clients", lastA?.phase === "ended" && lastB?.phase === "ended");
  check("match ends on the 90 second clock", lastA?.endReason === "time", `reason=${lastA?.endReason}`);
  check("remaining clock is exhausted", (lastA?.remainingMs ?? 1) < 1000, `${lastA?.remainingMs}ms`);
  check("both clients report the same winner", lastA?.winnerName === lastB?.winnerName, `${lastA?.winnerName}`);
  check("results overlay appears on host", lastA?.overlayVisible === true);
  check("results overlay appears on guest", lastB?.overlayVisible === true);
  check(
    "results text says time expired",
    (lastA?.resultText ?? "").includes("TIME EXPIRED"),
  );
  check(
    "standings agree between clients",
    JSON.stringify(lastA?.standings) === JSON.stringify(lastB?.standings),
  );
  if (artifactDir) {
    await pageA.screenshot({ path: `${artifactDir}/online-results-a.png`, fullPage: true });
    await pageB.screenshot({ path: `${artifactDir}/online-results-b.png`, fullPage: true });
  }

  await pageA.bringToFront();
  await pageA.locator('[data-testid="results-replay"]').click();
  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 10000 },
  );
  await pageB.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 10000 },
  );
  const replayA = await probe(pageA);
  const replayB = await probe(pageB);
  console.log("REPLAY", {
    phaseA: replayA.phase,
    phaseB: replayB.phase,
    remainingA: replayA.remainingMs,
    remainingB: replayB.remainingMs,
    humans: replayA.humans,
    bots: replayA.bots,
    topScore: replayA.standings[0]?.score,
  });
  check("replay returns host to a live match", replayA.phase === "live");
  check("replay returns guest to a live match", replayB.phase === "live");
  check("replay resets the match clock", replayA.remainingMs > 85000, `${replayA.remainingMs}ms`);
  check("replay resets scores", replayA.standings.every((entry) => entry.score === 0));
  check("results overlay closes after replay", replayA.overlayVisible === false);
  check(
    "replay keeps all eight human seats",
    replayA.humans === 8 && replayA.bots === 0,
    `humans=${replayA.humans} bots=${replayA.bots}`,
  );

  const averageTick = tickSamples > 0 ? tickTotal / tickSamples : 0;
  console.log("PERF", {
    averageServerTickMs: Number(averageTick.toFixed(3)),
    samples: tickSamples,
  });
  check("server tick stays under 8ms", averageTick > 0 && averageTick < 8, `${averageTick.toFixed(2)}ms`);

  if (pageErrors.length > 0) {
    console.log("PAGE ERRORS", pageErrors.slice(0, 10));
  }
  check("no browser page errors", pageErrors.length === 0, `${pageErrors.length} errors`);
} finally {
  for (const filler of fillers) {
    await filler.room.leave().catch(() => undefined);
  }
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
