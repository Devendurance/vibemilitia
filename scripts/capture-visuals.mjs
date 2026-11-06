/**
 * Captures the match at the acceptance viewports, online and practice.
 * Output: artifacts/playability/shots/<label>-*.png
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const label = process.env.LABEL ?? "after";
const out = "artifacts/playability/shots";
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "phone-844", width: 844, height: 390, touch: true },
  { name: "phone-932", width: 932, height: 430, touch: true },
  { name: "phone-780", width: 780, height: 360, touch: true },
  { name: "phone-20x9", width: 800, height: 360, touch: true },
];

const only = process.env.ONLY?.split(",");
const modes = (process.env.MODES ?? "practice,online").split(",");
const stack = await startStack({ countdownMs: 800 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
try {
  for (const viewport of VIEWPORTS) {
    if (only && !only.includes(viewport.name)) continue;
    for (const mode of modes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.touch ? 3 : 1,
        isMobile: Boolean(viewport.touch),
        hasTouch: Boolean(viewport.touch),
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      if (mode === "practice") {
        await page.goto(`${stack.baseUrl}/practice?difficulty=normal`, { waitUntil: "load" });
      } else {
        await page.goto(`${stack.baseUrl}/online`, { waitUntil: "load" });
        const dismiss = page.locator('[data-testid="onboarding-dismiss"]');
        await page.waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 30000 });
        await page.waitForTimeout(500);
        if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
        await page.locator('[data-testid="create-room"]').click();
      }
      await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 30000 });
      await page.evaluate(() => {
        const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
        probe.testHooks.guard();
        probe.testHooks.teleport(1500, 960);
      });
      await page.waitForTimeout(3200);
      await page.screenshot({ path: `${out}/${label}-${mode}-${viewport.name}.png` });
      const stats = await page.evaluate(() => {
        const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
        return { render: probe.render, camera: probe.camera, bots: probe.snapshot?.bots, canvas: document.querySelector("canvas")?.width };
      });
      console.log(mode, viewport.name, JSON.stringify(stats), errors.slice(0, 3));
      await context.close();
    }
  }
} finally {
  await browser.close();
  await stack.stop();
}
