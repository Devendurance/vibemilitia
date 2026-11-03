/**
 * Browser smoke test for the P0 arena.
 *
 * The Next server must already be running. Example:
 *   npm run dev
 *   npm run verify:browser
 *
 * Optional environment variables:
 *   BASE_URL=http://localhost:3000
 *   CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
 *   ARTIFACT_DIR=artifacts
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const artifactDir = process.env.ARTIFACT_DIR ?? "";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__VIBE_MILITIA__), null, { timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelector(".boot-overlay")?.classList.contains("is-hidden"),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(350);

  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: `${artifactDir}/p0-arena.png` });
  }

  const png = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/sprites/viber-010/viber-010-cutout.png";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let visible = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) transparent += 1;
      else visible += 1;
    }
    const alphaAt = (x, y) => data[(y * canvas.width + x) * 4 + 3];
    return {
      width: canvas.width,
      height: canvas.height,
      transparentRatio: transparent / (transparent + visible),
      corners: [alphaAt(0, 0), alphaAt(canvas.width - 1, 0), alphaAt(0, canvas.height - 1), alphaAt(canvas.width - 1, canvas.height - 1)],
    };
  });
  check("cutout is a real PNG", png.width > 500 && png.height > 500, `${png.width}x${png.height}`);
  check("cutout corners are transparent", png.corners.every((value) => value === 0), JSON.stringify(png.corners));
  check("cutout has substantial transparency", png.transparentRatio > 0.2, png.transparentRatio.toFixed(3));

  const initial = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check("arena booted with three drones", initial.drones.length === 3 && initial.hud.ready === true);

  const x0 = initial.player.x;
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(200);
  const moved = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check("horizontal movement", moved.player.x > x0 + 60, `${Math.round(x0)} -> ${Math.round(moved.player.x)}`);
  check("camera follows the player", moved.camera.scrollX >= 0 && moved.camera.scrollX < 3600);

  await page.keyboard.down("Space");
  await page.waitForTimeout(350);
  const airborne = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  await page.waitForTimeout(700);
  const thrusting = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  await page.keyboard.up("Space");
  check("jump leaves the ground", airborne.player.y < 1330 || airborne.player.velocityY < 0, `y=${Math.round(airborne.player.y)}`);
  check("jetpack burns fuel", thrusting.player.fuel < 100 || airborne.player.fuel < 100, `fuel=${Math.round(thrusting.player.fuel)}`);

  await page.waitForTimeout(1400);
  await page.mouse.move(220, 160);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  const fired = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check("weapon consumes ammunition", fired.player.ammo < 20, `ammo=${fired.player.ammo}`);

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(1600);
  const reloaded = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check("reload restores the magazine", reloaded.player.ammo === 20 && reloaded.player.reloading === false);

  await page.locator('[data-testid="debug-toggle"]').click();
  await page.waitForTimeout(250);
  const debug = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check("debug boundaries toggle", debug.debugVisible === true);
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/p0-debug.png` });
  }

  let damaged = debug;
  for (let step = 0; step < 40; step += 1) {
    if (damaged.counters.droneBulletHitsPlayer > 0) break;
    await page.waitForTimeout(400);
    damaged = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  }
  check("drone fire damages the player", damaged.counters.droneBulletHitsPlayer > 0, `hits=${damaged.counters.droneBulletHitsPlayer}`);

  let dead = damaged;
  for (let step = 0; step < 80; step += 1) {
    if (dead.player.dead) break;
    await page.waitForTimeout(350);
    dead = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  }
  check("death state is reached", dead.player.dead === true, `health=${Math.round(dead.player.health)}`);
  const overlayClass = await page.locator(".death-overlay").getAttribute("class");
  check("death overlay is visible", overlayClass?.includes("is-visible") === true);
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/p0-death.png` });
  }

  await page.waitForFunction(
    () => window.__VIBE_MILITIA__?.getProbe().player.dead === false,
    null,
    { timeout: 6000 },
  );
  const respawned = await page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
  check(
    "respawn restores the operator",
    respawned.player.dead === false && respawned.player.health === 100 && respawned.player.visible === true,
    `health=${respawned.player.health}`,
  );

  check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failures = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length > 0) {
  process.exitCode = 1;
}
