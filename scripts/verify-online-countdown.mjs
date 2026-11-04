/**
 * Countdown and lobby synchronization verification for P2.5 Slice A.
 *
 * Requires Next and Colyseus to be running:
 *   BASE_URL=http://localhost:3101 npm run verify:online:countdown
 */

import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
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
const pageErrors = [];
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
for (const [label, page] of [["A", pageA], ["B", pageB]]) {
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`${label}: ${message.text()}`);
  });
}

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const hud = document.querySelector(".hud-root");
    return {
      roomId: value.roomId,
      phase: value.snapshot?.phase ?? null,
      humans: value.snapshot?.humans ?? 0,
      bots: value.snapshot?.bots ?? 0,
      countdownMs: Math.round(value.snapshot?.countdownRemainingMs ?? 0),
      countdownDurationMs: Math.round(value.snapshot?.countdownDurationMs ?? 0),
      remainingMs: Math.round(value.snapshot?.remainingMs ?? 0),
      hudPhase: hud?.getAttribute("data-hud-phase"),
      hudCountdown: Number(hud?.getAttribute("data-hud-countdown") ?? -1),
      clockText:
        document.querySelector('[data-testid="match-clock-value"]')?.textContent?.trim() ??
        "",
      identityText:
        document.querySelector(".hud-identity__meta .hud-pill")?.textContent?.trim() ??
        "",
    };
  });

try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(700);
  await pageA.locator('[data-testid="create-room"]').click();
  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true,
    null,
    { timeout: 30000 },
  );
  const initial = await probe(pageA);
  console.log("COUNTDOWN", initial);
  check("new room starts in countdown", initial.phase === "countdown", initial.phase ?? "none");
  check(
    "countdown has a positive configured duration",
    initial.countdownMs > 0 && initial.countdownDurationMs >= initial.countdownMs,
    `${initial.countdownMs}/${initial.countdownDurationMs}ms`,
  );
  check("combat clock stays at 90 seconds", initial.remainingMs === 90_000, `${initial.remainingMs}ms`);
  check("no bots occupy seats during countdown", initial.bots === 0, `bots=${initial.bots}`);
  check(
    "HUD exposes countdown state",
    initial.hudPhase === "countdown" && initial.hudCountdown > 0,
    `phase=${initial.hudPhase} countdown=${initial.hudCountdown}`,
  );
  check(
    "HUD clock shows the countdown",
    initial.clockText.includes("START IN") && /\d{2}:\d{2}/.test(initial.clockText),
    initial.clockText,
  );
  check("HUD identity pill says STARTING", initial.identityText.includes("STARTING"), initial.identityText);

  await pageA.waitForTimeout(1200);
  const ticked = await probe(pageA);
  check(
    "countdown decrements in real time",
    ticked.countdownMs < initial.countdownMs - 500,
    `${initial.countdownMs} -> ${ticked.countdownMs}`,
  );

  const roomId = initial.roomId;
  await pageB.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  const roomCard = pageB.locator(`[data-room-id="${roomId}"]`);
  await roomCard.waitFor({ timeout: 15000 });
  const cardDuring = {
    phase: await roomCard.getAttribute("data-room-phase"),
    countdown: Number(await roomCard.getAttribute("data-room-countdown")),
    text: (await roomCard.innerText()).replace(/\s+/g, " ").trim(),
  };
  console.log("LOBBY CARD", cardDuring);
  check(
    "lobby room card shows countdown",
    cardDuring.phase === "countdown" &&
      cardDuring.countdown > 0 &&
      cardDuring.text.includes("STARTING"),
    cardDuring.text,
  );

  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  const live = await probe(pageA);
  console.log("LIVE", live);
  check("countdown expires into a live match", live.phase === "live", live.phase ?? "none");
  check(
    "bots fill the empty slots at start",
    live.humans === 1 && live.bots === 7,
    `humans=${live.humans} bots=${live.bots}`,
  );
  check("countdown reaches zero", live.countdownMs === 0, `${live.countdownMs}ms`);
  check(
    "HUD switches from countdown to live",
    live.hudPhase === "live" && live.identityText.includes("LIVE"),
    `phase=${live.hudPhase} pill=${live.identityText}`,
  );
  check(
    "match clock starts at 90 seconds",
    live.remainingMs > 88_000,
    `${live.remainingMs}ms`,
  );

  const lobbyDeadline = Date.now() + 5000;
  let cardLive = null;
  while (Date.now() < lobbyDeadline) {
    cardLive = {
      phase: await roomCard.getAttribute("data-room-phase"),
      text: (await roomCard.innerText()).replace(/\s+/g, " ").trim(),
    };
    if (cardLive.phase === "live") break;
    await pageB.waitForTimeout(250);
  }
  console.log("LOBBY LIVE", cardLive);
  check(
    "lobby room card switches to live",
    cardLive?.phase === "live" &&
      cardLive.text.includes("OPEN") &&
      cardLive.text.includes("7 BOT"),
    cardLive?.text ?? "none",
  );
  check("no browser page errors", pageErrors.length === 0, `${pageErrors.length} errors`);
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
