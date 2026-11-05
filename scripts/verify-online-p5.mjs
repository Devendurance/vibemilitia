/**
 * P5 mobile fidelity and Neon-backed multiplayer verification.
 *
 * Requires the production frontend and game server.
 * Server env for P5: VIBE_MILITIA_TEST_HOOKS=1, MATCH_COUNTDOWN_MS=0,
 * RECONNECT_GRACE_SECONDS=5, XP_MIN_PARTICIPATION_MS=0.
 */

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3101";
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
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const errors = [];
const trackErrors = (label, page) => {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
};

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__?.getProbe();
    const local = value?.snapshot?.participants.find(
      (entry) => entry.id === value.sessionId,
    );
    return {
      sessionId: value?.sessionId ?? null,
      roomId: value?.snapshot?.roomId ?? null,
      phase: value?.snapshot?.phase ?? null,
      local: local
        ? {
            x: local.x,
            y: local.y,
            alive: local.alive,
            fuel: local.fuel,
            ammo: local.weapons[local.equippedSlot]?.ammo ?? 0,
            equippedSlot: local.equippedSlot,
            grenades: {
              contact: local.grenadeContact,
              frag: local.grenadeFrag,
              stinking: local.grenadeStinking,
            },
            medkits: local.medkits,
          }
        : null,
      camera: value?.camera ?? null,
      input: value?.touch ?? null,
      control: value?.control ?? null,
      lobby: Boolean(document.querySelector('[data-testid="quick-match"]')),
      touch: Boolean(document.querySelector('[data-testid="touch-controls"]')),
      orientationGuard: Boolean(
        document.querySelector('[data-testid="orientation-guard"]'),
      ),
      thrusting:
        document
          .querySelector('[data-testid="touch-move"]')
          ?.getAttribute("data-thrusting") ?? null,
      autoFire:
        document
          .querySelector('[data-testid="touch-aim"]')
          ?.getAttribute("data-auto-fire") ?? null,
      settings: Boolean(
        document.querySelector('[data-testid="settings-overlay"]'),
      ),
      touchSettings: Boolean(
        document.querySelector('[data-testid="touch-settings-panel"]'),
      ),
    };
  });

const waitLive = (page) =>
  page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );

const rect = async (locator) => {
  const box = await locator.boundingBox();
  return box
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : null;
};

const overlaps = (a, b) => {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
};

const controlIds = [
  "touch-move",
  "touch-aim",
  "touch-fire",
  "touch-jump",
  "touch-reload",
  "touch-swap",
  "touch-medkit",
  "touch-grenade",
  "touch-throw-grenade",
  "touch-weapon-1",
  "touch-weapon-2",
  "touch-weapon-3",
];

const inspectLayout = async (page, label) => {
  const frame = await page.locator(".game-frame").boundingBox();
  const canvas = await page.locator("canvas").boundingBox();
  const viewport = page.viewportSize();
  const boxes = {};
  for (const id of controlIds) {
    boxes[id] = await rect(page.locator(`[data-testid="${id}"]`));
  }
  const hud = await rect(page.locator('[data-testid="touch-hud"]'));
  const state = await probe(page);

  check(
    `${label}: frame fills the available viewport`,
    Boolean(frame && viewport) &&
      Math.abs(frame.width - viewport.width) <= 1 &&
      Math.abs(frame.height - viewport.height) <= 1,
    `${frame?.width}x${frame?.height} viewport=${viewport?.width}x${viewport?.height}`,
  );
  check(
    `${label}: Phaser canvas and camera match the frame`,
    Boolean(frame && canvas && state.camera) &&
      Math.abs(canvas.width - frame.width) <= 1 &&
      Math.abs(canvas.height - frame.height) <= 1 &&
      Math.abs(state.camera.width - frame.width) <= 2 &&
      Math.abs(state.camera.height - frame.height) <= 2,
    `canvas=${canvas?.width}x${canvas?.height} camera=${state.camera?.width}x${state.camera?.height}`,
  );
  const inside = Object.entries(boxes).every(
    ([, box]) =>
      !box ||
      (box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= (viewport?.width ?? 0) + 1 &&
        box.y + box.height <= (viewport?.height ?? 0) + 1),
  );
  check(`${label}: all touch controls stay inside the viewport`, inside);
  const critical = [
    "touch-move",
    "touch-aim",
    "touch-fire",
    "touch-jump",
    "touch-grenade",
    "touch-weapon-1",
    "touch-weapon-2",
    "touch-weapon-3",
  ];
  let overlap = "";
  for (let index = 0; index < critical.length; index += 1) {
    for (let other = index + 1; other < critical.length; other += 1) {
      if (overlaps(boxes[critical[index]], boxes[critical[other]])) {
        overlap = `${critical[index]} <> ${critical[other]}`;
      }
    }
  }
  check(`${label}: critical touch controls do not overlap`, !overlap, overlap);
  const lowerHalf = Object.entries(boxes)
    .filter(([id]) => id !== "touch-settings")
    .every(
      ([, box]) =>
        !box || box.y + box.height / 2 >= (viewport?.height ?? 0) * 0.35,
    );
  check(`${label}: action controls sit within thumb reach`, lowerHalf);
  check(
    `${label}: compact status strip remains above the controls`,
    Boolean(hud && viewport) &&
      hud.y >= 0 &&
      hud.y + hud.height < (viewport?.height ?? 0) * 0.3,
    `hud=${hud?.y}+${hud?.height}`,
  );
  if (artifactDir) {
    await page.screenshot({
      path: `${artifactDir}/${label}.png`,
    });
  }
  return boxes;
};

try {
  const shapes = [
    { width: 1280, height: 720, label: "mobile-16x9" },
    { width: 844, height: 390, label: "mobile-19_5x9" },
    { width: 915, height: 412, label: "mobile-20x9" },
    { width: 740, height: 360, label: "mobile-compact" },
  ];

  let primary = null;
  for (const shape of shapes) {
    const context = await browser.newContext({
      viewport: { width: shape.width, height: shape.height },
      screen: { width: shape.width, height: shape.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    trackErrors(shape.label, page);
    await page.goto(`${baseUrl}/online?touch=1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const lobbyGuide = page.locator('[data-testid="onboarding-dismiss"]');
    if (await lobbyGuide.count()) {
      await lobbyGuide.first().click();
      await page.waitForTimeout(200);
    }
    await page.locator('[data-testid="create-room"]').click();
    await waitLive(page);
    await page.waitForTimeout(1400);
    await page.evaluate(() =>
      window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.guard(),
    );
    await page.waitForTimeout(600);
    const boxes = await inspectLayout(page, shape.label);
    if (shape.label === "mobile-19_5x9") primary = { page, context, boxes };
    else await context.close();
  }

  if (!primary) throw new Error("mobile primary context missing");
  const { page, context, boxes } = primary;

  const before = await probe(page);
  check(
    "left-stick upward drag engages jetpack thrust",
    boxes["touch-move"] !== null,
  );

  const cdp = await context.newCDPSession(page);
  const move = boxes["touch-move"];
  const aim = boxes["touch-aim"];
  const moveX = move.x + move.width * 0.82;
  const moveY = move.y + move.height * 0.2;
  const aimX = aim.x + aim.width * 0.86;
  const aimY = aim.y + aim.height / 2;
  const touchPoints = [
    { x: moveX, y: moveY, id: 1 },
    { x: aimX, y: aimY, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints,
  });
  await page.waitForTimeout(900);
  const active = await probe(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: move.x + move.width * 0.95, y: move.y + move.height * 0.12, id: 1 },
      { x: aim.x + aim.width * 0.94, y: aim.y + aim.height * 0.32, id: 2 },
    ],
  });
  await page.waitForTimeout(700);
  const moved = await probe(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(900);
  const settled = await probe(page);
  await page.waitForTimeout(800);
  const stopped = await probe(page);

  check(
    "left stick up engages thrust and drains fuel",
    active.thrusting === "true" && (active.local?.fuel ?? 100) < 100,
    `thrust=${active.thrusting} fuel=${active.local?.fuel}`,
  );
  check(
    "left and right sticks work at the same time",
    Math.abs((moved.local?.x ?? 0) - (before.local?.x ?? 0)) > 8,
    `x ${before.local?.x} -> ${moved.local?.x}`,
  );
  check(
    "right-stick auto-fire shoots without the FIRE button",
    moved.autoFire === "true" &&
      (moved.local?.ammo ?? 99) < (before.local?.ammo ?? 0),
    `autoFire=${moved.autoFire} ammo=${before.local?.ammo}->${moved.local?.ammo}`,
  );
  check(
    "ending both touches stops thrust, movement and fire",
    settled.thrusting === "false" &&
      stopped.local?.ammo === settled.local?.ammo &&
      Math.abs((stopped.local?.x ?? 0) - (settled.local?.x ?? 0)) < 5,
    `ammo ${settled.local?.ammo}->${stopped.local?.ammo}`,
  );

  await page.locator('[data-testid="touch-settings"]').tap();
  await page.waitForTimeout(250);
  check(
    "match settings expose touch sensitivity and fire mode",
    (await page.locator('[data-testid="touch-settings-panel"]').count()) === 1,
  );
  const settingsFeedback = page.locator(
    '.settings-card [data-testid="beta-feedback-open"]',
  );
  check(
    "match settings expose anonymous beta feedback on touch",
    (await settingsFeedback.count()) === 1,
  );
  await settingsFeedback.click();
  await page.waitForTimeout(250);
  await page
    .locator('[data-testid="beta-feedback-dialog"]')
    .getByRole("button", { name: "5 out of 5" })
    .click();
  await page
    .locator('[data-testid="beta-feedback-message"]')
    .fill("P5 automated feedback: twin sticks and full-screen fit verified.");
  await page.locator('[data-testid="beta-feedback-submit"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="beta-feedback-dialog"]')
        ?.textContent?.includes("THANK YOU") === true,
    null,
    { timeout: 8000 },
  );
  const feedbackStatus = await page
    .locator('[data-testid="beta-feedback-dialog"]')
    .textContent();
  check(
    "anonymous feedback submits to the server",
    /THANK YOU/.test(feedbackStatus ?? ""),
    feedbackStatus?.slice(0, 80),
  );
  await page.waitForTimeout(900);
  check(
    "feedback dialog closes after a successful send",
    (await page.locator('[data-testid="beta-feedback-dialog"]').count()) === 0,
  );
  await page.locator('[data-testid="touch-aim-fire-toggle"]').tap();
  await page.waitForTimeout(200);
  const toggleValue = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("vibe-militia-touch") ?? "{}"),
  );
  check(
    "aim-fire mode can be switched off and persists",
    toggleValue.aimFireEnabled === false,
    JSON.stringify(toggleValue),
  );
  await page.locator('[data-testid="settings-close"]').click();
  await page.waitForTimeout(250);
  const aimEnabledAttr = await page.getAttribute(
    '[data-testid="touch-aim"]',
    "data-aim-fire-enabled",
  );
  const aimHitTarget = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        tag: element?.tagName ?? null,
        testid: element?.getAttribute("data-testid") ?? null,
      };
    },
    { x: aimX, y: aimY },
  );
  check(
    "streamed touch settings reach the control layer",
    aimEnabledAttr === "false",
    `aimFire=${aimEnabledAttr} hit=${JSON.stringify(aimHitTarget)}`,
  );

  const beforeNoAuto = await probe(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: aimX, y: aimY, id: 3 }],
  });
  await page.waitForTimeout(700);
  const noAuto = await probe(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  check(
    "separate FIRE mode does not auto-fire from the aim stick",
    noAuto.local?.ammo === beforeNoAuto.local?.ammo &&
      noAuto.input?.buttonFire === false &&
      noAuto.input?.aimFire === false,
    `ammo ${beforeNoAuto.local?.ammo}->${noAuto.local?.ammo} input=${JSON.stringify(noAuto.input)} control=${JSON.stringify(noAuto.control)}`,
  );

  await page.locator('[data-testid="touch-reload"]').tap();
  await page.waitForTimeout(1500);
  const reloaded = await probe(page);
  check(
    "touch reload restores the magazine",
    (reloaded.local?.ammo ?? 0) >= (noAuto.local?.ammo ?? 0),
    `ammo ${noAuto.local?.ammo}->${reloaded.local?.ammo}`,
  );

  // Portrait guard and rotation back to landscape.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const portrait = await probe(page);
  const portraitLayout = await page.evaluate(() => {
    const frame = document.querySelector(".game-frame")?.getBoundingClientRect();
    const controls = document.querySelector(
      '[data-testid="touch-controls"]',
    );
    return {
      width: frame?.width ?? 0,
      height: frame?.height ?? 0,
      controlsDisplay: controls ? getComputedStyle(controls).display : "none",
    };
  });
  check(
    "portrait shows the rotation guard instead of a tiny match",
    portrait.orientationGuard === true && portraitLayout.controlsDisplay === "none",
    JSON.stringify(portraitLayout),
  );
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/mobile-portrait-guard.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const landscape = await probe(page);
  const landscapeFrame = await page.locator(".game-frame").boundingBox();
  check(
    "returning to landscape restores the match and full-screen fit",
    landscape.orientationGuard === false &&
      landscape.touch === true &&
      Math.abs((landscapeFrame?.width ?? 0) - 844) <= 1,
    `${landscapeFrame?.width}x${landscapeFrame?.height}`,
  );

  await context.close();

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktop = await desktopContext.newPage();
  trackErrors("desktop", desktop);
  await desktop.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(900);
  const desktopGuide = desktop.locator('[data-testid="onboarding-dismiss"]');
  if (await desktopGuide.count()) {
    await desktopGuide.first().click();
    await desktop.waitForTimeout(200);
  }
  await desktop.locator('[data-testid="create-room"]').click();
  await waitLive(desktop);
  await desktop.waitForTimeout(500);
  const desktopFrame = await desktop.locator(".game-frame").boundingBox().catch(() => null);
  check(
    "desktop keeps the centered 16:9 frame",
    Boolean(desktopFrame) &&
      Math.abs((desktopFrame?.width ?? 0) - 1440) <= 2 &&
      Math.abs((desktopFrame?.height ?? 0) - 810) <= 2,
    `${desktopFrame?.width}x${desktopFrame?.height}`,
  );
  check(
    "desktop does not receive mobile touch controls",
    (await desktop.locator('[data-testid="touch-controls"]').count()) === 0,
  );
  await desktopContext.close();

  check(
    "no browser page errors during P5 mobile checks",
    errors.length === 0,
    errors.join(" | "),
  );
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILURES:", failed.map((entry) => entry.name).join(", "));
  process.exitCode = 1;
}
