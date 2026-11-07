/**
 * Captures the README gallery from a disposable local production stack.
 *
 * Run `node scripts/build-test-frontend.mjs` first. The stack uses SQLite in a
 * temp folder, so no synthetic data reaches Neon. Test hooks are enabled only
 * for this local capture, to place players and bots deterministically. They
 * change no rules: they teleport, grant a weapon or eliminate a target, and
 * the server still runs the normal simulation.
 *
 * Output: artifacts/readme-media/*.png (gitignored raw captures).
 * Then run `python scripts/optimize-readme-media.py` to write docs/media/*.webp.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const out = "artifacts/readme-media";
mkdirSync(out, { recursive: true });

const DESKTOP = { width: 1440, height: 810 };
const PHONE = { width: 844, height: 390 };
const only = process.env.ONLY?.split(",");
const wanted = (name) => !only || only.includes(name);

const stack = await startStack({ countdownMs: 800 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});

async function openPage(viewport, { touch = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { context, page, errors };
}

async function dismissOnboarding(page) {
  const dismiss = page.locator('[data-testid="onboarding-dismiss"]');
  const skip = page.getByRole("button", { name: /skip for now/i });
  for (const control of [dismiss, skip]) {
    if (await control.isVisible({ timeout: 1500 }).catch(() => false)) {
      await control.click();
      await page.waitForTimeout(400);
    }
  }
}

async function startOnlineMatch(page) {
  await page.goto(`${stack.baseUrl}/online`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 30000 });
  await page.waitForTimeout(500);
  await dismissOnboarding(page);
  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 45000 },
  );
}

/** Returns the ids of the local human and the bots in the live snapshot. */
async function combatantIds(page) {
  return page.evaluate(() => {
    const snapshot = window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot;
    const human = snapshot.participants.find((p) => p.kind === "human");
    const bots = snapshot.participants.filter((p) => p.kind === "bot");
    return { humanId: human?.id ?? null, botIds: bots.map((p) => p.id) };
  });
}

async function report(name, page, errors) {
  console.log(name, "browser errors:", errors.length, errors.slice(0, 3));
}

try {
  // 01 Hub: the selected Viber, navigation and the Online / Practice switch.
  if (wanted("hub")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await page.goto(`${stack.baseUrl}/`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    await dismissOnboarding(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/01-hub.png` });
    // 10 Character drawer: the official roster with the selected Viber.
    const change = page.locator('[data-testid="hub-change-viber"]');
    if (await change.isVisible({ timeout: 2000 }).catch(() => false)) {
      await change.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/10-hub-character-roster.png` });
    }
    await report("hub", page, errors);
    await context.close();
  }

  // 02 Online lobby: the official ten-Viber roster picker.
  if (wanted("lobby")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await page.goto(`${stack.baseUrl}/online`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="skin-selection"]', { timeout: 30000 });
    await page.waitForTimeout(800);
    await dismissOnboarding(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/02-online-lobby-roster.png` });
    await report("lobby", page, errors);
    await context.close();
  }

  // 03 Desktop online Free-for-All with bots engaging in combat.
  if (wanted("ffa")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await startOnlineMatch(page);
    await page.evaluate(() => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
    });
    await page.bringToFront();
    await page.mouse.move(DESKTOP.width * 0.7, DESKTOP.height * 0.45);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${out}/03-online-ffa-combat.png` });
    await page.mouse.up();
    await report("ffa", page, errors);
    await context.close();
  }

  // 04 Advanced weapon: Akimbo Rifles equipped from the third slot, firing.
  if (wanted("akimbo")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await startOnlineMatch(page);
    const { humanId } = await combatantIds(page);
    await page.evaluate((id) => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
      probe.testHooks.giveWeapon(id, "akimbo-rifles");
    }, humanId);
    await page.bringToFront();
    await page.keyboard.press("3");
    await page.waitForTimeout(300);
    await page.mouse.move(DESKTOP.width * 0.72, DESKTOP.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/04-akimbo-combat.png` });
    await page.mouse.up();
    await report("akimbo", page, errors);
    await context.close();
  }

  // 05 Grenade: a stinking cloud lands on a frozen bot near the human.
  if (wanted("stinking")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await startOnlineMatch(page);
    const { botIds } = await combatantIds(page);
    await page.evaluate((botId) => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
      probe.testHooks.teleportBot(botId, 1700, 960);
      probe.testHooks.freeze(botId, true);
    }, botIds[0]);
    await page.bringToFront();
    await page.keyboard.press("6");
    await page.waitForTimeout(150);
    await page.keyboard.press("g");
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${out}/05-stinking-cloud.png` });
    await report("stinking", page, errors);
    await context.close();
  }

  // 06 Elimination loot: a bot falls and drops its weapon, medkit and grenade.
  if (wanted("loot")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await startOnlineMatch(page);
    const { botIds } = await combatantIds(page);
    await page.evaluate((botId) => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
      probe.testHooks.teleportBot(botId, 1640, 960);
      probe.testHooks.eliminate(botId, "bullet");
    }, botIds[0]);
    await page.bringToFront();
    await page.waitForTimeout(1500);
    // Crop to the drop site: a cropped frame, not a changed one.
    await page.screenshot({
      path: `${out}/06-elimination-loot.png`,
      clip: { x: 360, y: 300, width: 900, height: 260 },
    });
    await page.screenshot({ path: `${out}/06b-elimination-loot-full.png` });
    await report("loot", page, errors);
    await context.close();
  }

  // 07 Match results after a real match ends.
  if (wanted("results")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await startOnlineMatch(page);
    const { botIds } = await combatantIds(page);
    await page.evaluate((botId) => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
      probe.testHooks.eliminate(botId, "bullet");
      probe.testHooks.endMatch();
    }, botIds[0]);
    await page.bringToFront();
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/07-match-results.png` });
    await report("results", page, errors);
    await context.close();
  }

  // 08 Mobile landscape twin-stick controls during a live match.
  if (wanted("mobile")) {
    const { context, page, errors } = await openPage(PHONE, { touch: true });
    await startOnlineMatch(page);
    await page.evaluate(() => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.teleport(1500, 960);
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/08-mobile-landscape.png` });
    await report("mobile", page, errors);
    await context.close();
  }

  // 09 Practice against bots at Normal difficulty.
  if (wanted("practice")) {
    const { context, page, errors } = await openPage(DESKTOP);
    await page.goto(`${stack.baseUrl}/practice?difficulty=normal`, { waitUntil: "load" });
    // Wait past the GO! splash so the frame shows combat, not the countdown.
    await page.waitForTimeout(7500);
    await page.bringToFront();
    await page.mouse.move(DESKTOP.width * 0.6, DESKTOP.height * 0.45);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/09-practice-normal.png` });
    await page.mouse.up();
    await report("practice", page, errors);
    await context.close();
  }
} finally {
  await browser.close();
  await stack.stop();
}
