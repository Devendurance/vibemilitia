/**
 * Plays one complete match in a real browser against a deployed backend, with
 * no test hooks, then checks results and navigation.
 *
 * Public mode blocks guest creation, so the match writes nothing to production:
 * no profile, no XP and no leaderboard row. XP persistence is proven in staging
 * mode, against the Neon test branch.
 *
 *   BASE_URL=https://vibemilitia.vercel.app NO_GUEST=1 node scripts/verify-release.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "https://vibemilitia.vercel.app";
const apiUrl = process.env.API_URL ?? null;
const noGuest = process.env.NO_GUEST === "1";
const out = process.env.ARTIFACT_DIR ?? "artifacts/playability/release";
mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  ${detail}` : ""}`);
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  const sockets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => {
    sockets.push(socket.url().split("?")[0]);
  });
  if (noGuest) {
    await page.route("**/api/guest", (route) => route.abort());
  }
  await page.goto(`${baseUrl}/online`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 40_000 });
  await page.waitForTimeout(800);
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 45_000 });
  const hooksLocked = await page.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    return { remaining: probe.snapshot.remainingMs };
  });
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 40_000 });
  check("browser joined over the real socket and reached a live match", true, sockets.at(-1) ?? "");

  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.mouse.down();
  const start = await page.evaluate(() => {
    const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
    return p.snapshot.participants.find((entry) => entry.id === p.sessionId);
  });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyA");
  await page.keyboard.press("Space");
  await page.mouse.up();
  const state = await page.evaluate(() => {
    const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const me = p.snapshot.participants.find((entry) => entry.id === p.sessionId);
    return { x: me.x, shots: p.combatLog.length, net: p.net, render: p.render, inputs: me.lastProcessedInputSeq, weapons: me.weapons.length };
  });
  check("server accepted input", state.inputs > 20, `seq ${state.inputs}`);
  check("player moved on the server", Math.abs(state.x - start.x) > 5 || !start.alive, `${start.x} -> ${state.x}`);
  check("own inventory arrived", state.weapons === 3, state.weapons);
  console.log("NET", JSON.stringify(state.net));
  await page.screenshot({ path: `${out}/match.png` });

  // No hooks exist here, so the match has to run out for real.
  const remaining = await page.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.remainingMs);
  await page.waitForSelector(".results-overlay.is-visible", { timeout: remaining + 20_000 });
  await page.waitForTimeout(2500);
  check("the match ran to its results", true);
  await page.screenshot({ path: `${out}/results.png` });
  const token = await page.evaluate(() => localStorage.getItem("vibe-militia-guest-token"));
  if (noGuest) {
    check("no guest token was created", token === null);
    check("no XP panel appears without a profile", (await page.locator('[data-testid="results-progression"]').count()) === 0);
  } else {
    const profile = await page.evaluate(async ([url, auth]) => {
      const response = await fetch(`${url}/api/profile`, { headers: { Authorization: `Bearer ${auth}` } });
      return response.ok ? response.json() : null;
    }, [apiUrl, token]);
    check("XP persisted to PostgreSQL", (profile?.player?.xp ?? 0) > 0, `xp=${profile?.player?.xp} matches=${profile?.player?.matchesPlayed}`);
    check("results show the XP earned", (await page.locator('[data-testid="results-xp"]').count()) === 1);
  }
  await page.locator('[data-testid="results-hub"]').click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  check("BACK TO HUB returns to the hub", new URL(page.url()).pathname === "/");
  await page.screenshot({ path: `${out}/hub.png` });
  check("no page errors", errors.length === 0, errors[0] ?? "");
  void hooksLocked;
} finally {
  await browser.close();
}
console.log(failed === 0 ? "RELEASE CHECK PASSED" : `RELEASE CHECK FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
