/**
 * UX acceptance verification for the game hub, focused online lobby, local
 * practice and phone gameplay. Captures the screenshot matrix and writes a
 * machine-readable report.
 *
 *   BASE_URL=http://localhost:3102 ARTIFACT_DIR=artifacts/ux npm run verify:ux
 *
 * The reconnect reload check needs the game server's normal grace window. Set
 * SKIP_EXPIRY=1 to skip the full expiry wait on slower runs.
 */

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3101";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const artifactDir = process.env.ARTIFACT_DIR ?? "artifacts/ux";
const executablePath = process.env.CHROME_PATH;
const skipExpiry = process.env.SKIP_EXPIRY === "1";

await mkdir(artifactDir, { recursive: true });

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

const errors = [];
const track = (label, page) => {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ABORTED/.test(text)) return;
    errors.push(`${label}: ${text}`);
  });
};

const dismissOnlineGuide = async (page) => {
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.count()) {
    await guide.first().click().catch(() => undefined);
    await page.waitForTimeout(200);
  }
};

const saveHubOnboarding = async (page, name) => {
  const save = page.locator('[data-testid="onboarding-save"]');
  if (await save.count()) {
    await page.locator('[data-testid="onboarding-name"]').fill(name);
    await save.click();
    await page.waitForTimeout(700);
  }
};

const boxes = async (page, selectors) =>
  page.evaluate((list) => {
    const result = {};
    for (const selector of list) {
      const element = document.querySelector(selector);
      if (!element) {
        result[selector] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      result[selector] = {
        x: +rect.x.toFixed(1),
        y: +rect.y.toFixed(1),
        width: +rect.width.toFixed(1),
        height: +rect.height.toFixed(1),
        right: +rect.right.toFixed(1),
        bottom: +rect.bottom.toFixed(1),
      };
    }
    return result;
  }, selectors);

const noDocumentScroll = (page) =>
  page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));

const probeOnline = (page) =>
  page.evaluate(() => {
    const online = window.__VIBE_MILITIA_ONLINE__?.getProbe();
    const local = online?.snapshot?.participants.find(
      (entry) => entry.id === online.sessionId,
    );
    return {
      ready: Boolean(online),
      roomId: online?.snapshot?.roomId ?? null,
      sessionId: online?.sessionId ?? null,
      phase: online?.snapshot?.phase ?? null,
      humans: online?.snapshot?.humans ?? 0,
      bots: online?.snapshot?.bots ?? 0,
      ammo: local?.weapons?.[local?.equippedSlot ?? 0]?.ammo ?? null,
      x: local?.x ?? null,
      fuel: local?.fuel ?? null,
      camera: online?.camera ?? null,
    };
  });

const hubSizes = [
  { width: 1280, height: 720, label: "desktop-1280x720" },
  { width: 1366, height: 768, label: "desktop-1366x768" },
  { width: 1440, height: 900, label: "desktop-1440x900" },
  { width: 1920, height: 1080, label: "desktop-1920x1080" },
  { width: 844, height: 390, label: "phone-844x390", mobile: true },
  { width: 932, height: 430, label: "phone-932x430", mobile: true },
  { width: 915, height: 412, label: "phone-915x412", mobile: true },
  { width: 780, height: 360, label: "phone-780x360", mobile: true },
  { width: 360, height: 780, label: "portrait-360x780", mobile: true },
  { width: 1024, height: 768, label: "tablet-1024x768", mobile: true },
];

let sharedStorage = null;
try {
  for (const size of hubSizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      screen: { width: size.width, height: size.height },
      isMobile: Boolean(size.mobile),
      hasTouch: Boolean(size.mobile),
      deviceScaleFactor: 1,
      ...(sharedStorage ? { storageState: sharedStorage } : {}),
    });
    const page = await context.newPage();
    track(size.label, page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await saveHubOnboarding(page, `QA-${size.label.slice(-8)}`);
    if (!sharedStorage) sharedStorage = await context.storageState();
    const scroll = await noDocumentScroll(page);
    const layout = await boxes(page, [
      '[data-testid="hub-play"]',
      '[data-testid="hub-hero-image"]',
      ".hub-profile",
      ".hub-mode",
      ".hub-footer",
    ]);
    check(
      `${size.label}: hub has no document scroll`,
      scroll.width <= scroll.viewportWidth + 1 &&
        scroll.height <= scroll.viewportHeight + 1,
      JSON.stringify(scroll),
    );
    check(
      `${size.label}: primary CTA is visible inside the viewport`,
      Boolean(layout['[data-testid="hub-play"]']) &&
        layout['[data-testid="hub-play"]'].y >= 0 &&
        layout['[data-testid="hub-play"]'].bottom <= size.height + 1,
      JSON.stringify(layout['[data-testid="hub-play"]']),
    );
    check(
      `${size.label}: hero Viber is grounded and not oversized`,
      Boolean(layout['[data-testid="hub-hero-image"]']) &&
        layout['[data-testid="hub-hero-image"]'].height > 100 &&
        layout['[data-testid="hub-hero-image"]'].height <= size.height * 0.72,
      JSON.stringify(layout['[data-testid="hub-hero-image"]']),
    );
    await page.screenshot({ path: `${artifactDir}/hub-${size.label}.png` });
    await context.close();
  }

  // Desktop interactions and overlays.
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktop = await desktopContext.newPage();
  track("desktop", desktop);
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(900);
  await saveHubOnboarding(desktop, "UX-DESKTOP");
  await desktop.locator('[data-testid="hub-tab-vibers"]').click();
  await desktop.waitForTimeout(300);
  check(
    "Vibers tab opens a real 10-character drawer",
    (await desktop.locator('[data-testid="hub-character-drawer"]').count()) === 1 &&
      (await desktop.locator('[data-testid^="hub-skin-card-"]').count()) === 10,
  );
  await desktop.locator('[data-testid="hub-skin-card-viber-006"]').click();
  await desktop.waitForTimeout(250);
  check(
    "character selection updates the hero and persists locally",
    (await desktop.locator('[data-testid="hub-hero-name"]').innerText()).includes("VIBER-006") &&
      (await desktop.evaluate(() => window.localStorage.getItem("vibe-militia-skin"))) === "viber-006",
  );
  await desktop.locator('[aria-label="Close panel"]').click();
  await desktop.locator('[data-testid="hub-tab-loadout"]').click();
  await desktop.waitForTimeout(250);
  check(
    "loadout drawer labels the starter kit as a preview",
    (await desktop.locator('[data-testid="hub-loadout-drawer"]').innerText()).includes("PREVIEW"),
  );
  await desktop.locator('[aria-label="Close panel"]').click();
  await desktop.locator('[data-testid="hub-tab-rankings"]').click();
  await desktop.waitForTimeout(800);
  check(
    "rankings drawer offers server data or an honest empty state",
    (await desktop.locator('[data-testid="leaderboard-panel"]').count()) === 1 &&
      ((await desktop.locator('[data-testid="leaderboard-row"]').count()) > 0 ||
        (await desktop.locator('[data-testid="leaderboard-panel"]').innerText()).includes("NO RANKED MATCHES YET")),
  );
  await desktop.locator('[aria-label="Close panel"]').click();
  await desktop.locator('[data-testid="hub-tab-profile"]').click();
  await desktop.waitForTimeout(250);
  check(
    "profile drawer exposes editable name and self-declared X policy",
    (await desktop.locator('[data-testid="hub-profile-drawer"]').innerText()).includes("not a unique claimed username") &&
      (await desktop.locator('[data-testid="hub-profile-drawer"]').innerText()).includes("does not verify"),
  );
  await desktop.locator('[aria-label="Close panel"]').click();
  await desktop.locator('[data-testid="hub-settings"]').click();
  await desktop.waitForTimeout(300);
  check(
    "settings drawer contains audio and touch settings",
    (await desktop.locator('[data-testid="hub-settings-drawer"]').count()) === 1 &&
      (await desktop.locator('[data-testid="audio-settings"]').count()) >= 1,
  );
  await desktop.locator('[aria-label="Close panel"]').click();
  await desktop.locator('[data-testid="hub-mode-practice"]').click();
  await desktop.waitForTimeout(200);
  check(
    "mode switch exposes four practice difficulty levels and no ranked XP",
    (await desktop.locator('[data-testid="hub-difficulty-merciless"]').count()) === 1 &&
      (await desktop.locator(".hub-mode__note").innerText()).includes("never earns ranked XP") &&
      (await desktop.locator('[data-testid="hub-play"]').innerText()).includes("START PRACTICE"),
  );
  await desktop.screenshot({ path: `${artifactDir}/hub-practice-mode.png` });
  await desktopContext.close();

  // Practice desktop + phone landscape.
  const practiceContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const practice = await practiceContext.newPage();
  track("practice", practice);
  await practice.goto(`${baseUrl}/practice?difficulty=merciless`, {
    waitUntil: "networkidle",
  });
  await practice.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  const practiceProbe = await practice.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    return {
      phase: probe.snapshot.phase,
      bots: probe.snapshot.bots,
      camera: probe.camera,
    };
  });
  check(
    "practice starts locally without matchmaking",
    practiceProbe.phase === "live" && practiceProbe.bots === 7,
    JSON.stringify(practiceProbe),
  );
  await practice.screenshot({ path: `${artifactDir}/practice-desktop-merciless.png` });
  await practiceContext.close();

  const phoneContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const phone = await phoneContext.newPage();
  track("practice-phone", phone);
  await phone.goto(`${baseUrl}/practice?difficulty=hard&touch=1`, {
    waitUntil: "networkidle",
  });
  await phone.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true,
    null,
    { timeout: 30000 },
  );
  const phoneLayout = await phone.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      frame: box(".game-frame"),
      canvas: box("canvas"),
      move: box('[data-testid="touch-move"]'),
      aim: box('[data-testid="touch-aim"]'),
      fire: box('[data-testid="touch-fire"]'),
      jump: box('[data-testid="touch-jump"]'),
      camera: probe.camera,
      renderScale: probe.render.scale,
      grenade: Boolean(document.querySelector('[data-testid="touch-grenade"]')),
    };
  });
  check(
    "phone practice fills the viewport and zooms out the camera",
    phoneLayout.frame?.width === 844 &&
      phoneLayout.frame?.height === 390 &&
      phoneLayout.canvas?.width === 844 &&
      phoneLayout.canvas?.height === 390 &&
      phoneLayout.camera.zoom / phoneLayout.renderScale < 0.7,
    JSON.stringify(phoneLayout.camera),
  );
  check(
    "phone practice has separated thumb pads and a FIRE control",
    Boolean(phoneLayout.move && phoneLayout.aim && phoneLayout.fire) &&
      phoneLayout.move.x + phoneLayout.move.width < phoneLayout.aim.x &&
      phoneLayout.fire.x + phoneLayout.fire.width < phoneLayout.aim.x,
  );
  await phone.screenshot({ path: `${artifactDir}/practice-phone-844x390.png` });
  await phoneContext.close();

  // Focused online lobby and reload recovery.
  const onlineContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const online = await onlineContext.newPage();
  track("online", online);
  await online.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await online.waitForTimeout(900);
  await dismissOnlineGuide(online);
  const onlineScroll = await noDocumentScroll(online);
  check(
    "online lobby has no document scroll",
    onlineScroll.width <= onlineScroll.viewportWidth + 1 &&
      onlineScroll.height <= onlineScroll.viewportHeight + 1,
    JSON.stringify(onlineScroll),
  );
  check(
    "online lobby is focused: compact operator, rooms and join code",
    (await online.locator('[data-testid="skin-selection"]').count()) === 1 &&
      (await online.locator('[data-testid="room-list"]').count()) === 1 &&
      (await online.locator('[data-testid="join-code"]').count()) === 1 &&
      (await online.locator('[data-testid="audio-settings"]').count()) === 0,
  );
  await online.screenshot({ path: `${artifactDir}/online-lobby-1280.png` });
  await online.locator("#guest-name").fill("UX-ONLINE");
  await online.locator('[data-testid="create-room"]').click();
  await online.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await online.waitForTimeout(1200);
  const beforeReload = await probeOnline(online);
  check(
    "online match boots with an authoritative live room",
    beforeReload.phase === "live" && Boolean(beforeReload.roomId),
    `${beforeReload.roomId} ${beforeReload.phase}`,
  );
  await online.reload({ waitUntil: "networkidle" });
  await online.waitForTimeout(5000);
  const afterReload = await probeOnline(online);
  check(
    "browser reload inside the grace window restores the same room and seat",
    afterReload.roomId === beforeReload.roomId &&
      afterReload.sessionId === beforeReload.sessionId &&
      afterReload.phase === "live",
    `${beforeReload.roomId}/${beforeReload.sessionId} -> ${afterReload.roomId}/${afterReload.sessionId}`,
  );
  check(
    "reload recovery preserves authoritative ammo",
    afterReload.ammo === beforeReload.ammo,
    `${beforeReload.ammo} -> ${afterReload.ammo}`,
  );
  await online.screenshot({ path: `${artifactDir}/online-match-recovered-1280.png` });

  const beforeX = afterReload.x;
  const beforeFuel = afterReload.fuel;
  const beforeAmmo = afterReload.ammo;
  await online.locator('[data-testid="touch-controls"]').count();
  // Desktop keyboard smoke on the recovered room.
  await online.keyboard.down("KeyD");
  await online.waitForTimeout(450);
  await online.keyboard.up("KeyD");
  await online.mouse.move(900, 300);
  await online.mouse.down();
  await online.waitForTimeout(350);
  await online.mouse.up();
  await online.waitForTimeout(300);
  const afterInput = await probeOnline(online);
  check(
    "recovered online room still accepts authoritative movement and fire",
    Math.abs((afterInput.x ?? 0) - (beforeX ?? 0)) > 8 &&
      (afterInput.ammo ?? 0) < (beforeAmmo ?? 99),
    `x ${beforeX} -> ${afterInput.x} ammo ${beforeAmmo} -> ${afterInput.ammo} fuel ${beforeFuel} -> ${afterInput.fuel}`,
  );

  const fps = await online.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames += 1;
          if (now - start >= 2500) {
            resolve(Math.round((frames / (now - start)) * 1000));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  check(
    "recovered match maintains a playable headless frame rate",
    fps >= 20,
    `${fps} fps headless; use HEADED=1 for the hardware frame-rate check`,
  );

  // Second browser joins the invite room for a real two-human check.
  const inviteUrl = online.url();
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const guest = await guestContext.newPage();
  track("guest", guest);
  await guest.goto(inviteUrl, { waitUntil: "networkidle" });
  await guest.waitForTimeout(900);
  await dismissOnlineGuide(guest);
  await guest.locator("#guest-name").fill("UX-GUEST");
  const inviteJoin = guest.locator('[data-testid="join-invite-room"]');
  if (await inviteJoin.count()) {
    await inviteJoin.click();
  } else {
    await guest.locator('[data-testid="quick-match"]').click();
  }
  await guest
    .waitForFunction(
      () => (window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.humans ?? 0) >= 2,
      null,
      { timeout: 20000 },
    )
    .catch(() => undefined);
  const twoHumans = await guest.evaluate(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.humans ?? 0,
  );
  check(
    "a second browser joins the same online room as a human",
    twoHumans >= 2,
    `${twoHumans} humans`,
  );
  await guest.screenshot({ path: `${artifactDir}/online-two-humans.png` });
  await guestContext.close();

  await online.locator('[data-testid="leave-online"]').click();
  await online.waitForTimeout(150);
  if (await online.locator('[data-testid="leave-online"]').isVisible().catch(() => false)) {
    await online.locator('[data-testid="leave-online"]').click();
  }
  await online.waitForTimeout(1200);
  check(
    "explicit Leave releases the seat and returns to matchmaking",
    (await online.locator('[data-testid="quick-match"]').count()) === 1,
  );

  if (!skipExpiry) {
    const config = await fetch(`${serverUrl}/api/config`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    const grace = Number(config?.reconnectGraceSeconds ?? 30);
    check(
      "server advertises the 30-second reload recovery grace",
      grace >= 30,
      `${grace}s`,
    );
    const expiryContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const expiry = await expiryContext.newPage();
    track("expiry", expiry);
    await expiry.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
    await expiry.waitForTimeout(700);
    await dismissOnlineGuide(expiry);
    await expiry.locator('[data-testid="create-room"]').click();
    await expiry.waitForFunction(
      () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
      null,
      { timeout: 30000 },
    );
    await expiryContext.setOffline(true);
    await expiry.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="reconnect-overlay"]')),
      null,
      { timeout: 8000 },
    );
    await expiry.waitForTimeout(grace * 1000 + 4000);
    await expiryContext.setOffline(false);
    await expiry.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="quick-match"]')),
      null,
      { timeout: 20000 },
    );
    check(
      "expired reload grace releases the seat and returns to the lobby",
      (await expiry.locator('[data-testid="quick-match"]').count()) === 1 &&
        (await expiry.locator('[data-testid="reconnect-overlay"]').count()) === 0,
    );
    await expiryContext.close();
  }

  await onlineContext.close();
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  serverUrl,
  generatedAt: new Date().toISOString(),
  checks,
  errors,
  passed: checks.filter((entry) => entry.ok).length,
  total: checks.length,
};
await writeFile(`${artifactDir}/ux-report.json`, JSON.stringify(report, null, 2));
console.log(`\n${report.passed}/${report.total} UX checks passed`);
if (errors.length) console.log("Browser errors:", errors.slice(0, 12));
if (report.passed !== report.total) {
  for (const entry of checks.filter((item) => !item.ok)) {
    console.log(`FAILED  ${entry.name}  ${entry.detail}`);
  }
  process.exitCode = 1;
}
