/**
 * Art budget measurement. Compares a build's frame rate, tick cost, texture
 * memory and art download size, on the same machine and settings.
 *
 *   node scripts/build-test-frontend.mjs
 *   LABEL=baseline RUNS=3 node scripts/measure-art.mjs
 *
 * FPS, p95 and tick come from verify-online-perf with HEADED=1. It takes no
 * screenshots, and neither does this script. Output: artifacts/art/<LABEL>.json
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack, TEST_PORTS } from "./lib/test-stack.mjs";

const label = process.env.LABEL ?? "run";
const runs = Number(process.env.RUNS ?? 3);
mkdirSync("artifacts/art", { recursive: true });

const perfRun = (baseUrl) =>
  new Promise((resolve) => {
    const child = spawn("node", ["scripts/verify-online-perf.mjs"], {
      env: {
        ...process.env,
        HEADED: "1",
        BASE_URL: baseUrl,
        NEXT_PUBLIC_GAME_SERVER_URL: `http://localhost:${TEST_PORTS.proxy}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.on("close", () => {
      const line = output.split("\n").find((entry) => entry.startsWith("PERF_JSON "));
      resolve(line ? JSON.parse(line.slice("PERF_JSON ".length)) : { failed: output.slice(-600) });
    });
  });

const perf = [];
for (let run = 0; run < runs; run += 1) {
  const stack = await startStack({ countdownMs: 0 });
  const result = await perfRun(stack.baseUrl);
  await stack.stop();
  perf.push(result);
  console.log("RUN", run + 1, JSON.stringify(result));
}

const stack = await startStack({ countdownMs: 0 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});

const isArt = (url) => /\/(sprites|brand)\/|_next\/image/.test(url);
const load = async (route, enter) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  const page = await context.newPage();
  const sizes = new Map();
  page.on("response", async (response) => {
    const url = response.url();
    if (!isArt(url) || response.status() >= 300) return;
    const body = await response.body().catch(() => null);
    if (body) sizes.set(url, body.length);
  });
  await page.goto(`${stack.baseUrl}${route}`, { waitUntil: "load" });
  await enter(page);
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const textures = await page.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().textureMemory());
  await context.close();
  const bytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  return { route, artFiles: sizes.size, artBytes: bytes, ...textures };
};

const online = await load("/online", async (page) => {
  await page.waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 30_000 });
  await page.waitForTimeout(400);
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  await page.locator('[data-testid="create-room"]').click();
});
const practice = await load("/practice?difficulty=normal", async () => undefined);
await browser.close();
await stack.stop();

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const good = perf.filter((entry) => entry.fps);
const summary = {
  label,
  at: new Date().toISOString(),
  runs: perf,
  fpsMean: Number(mean(good.map((entry) => entry.fpsExact)).toFixed(2)),
  p95FrameMean: Number(mean(good.map((entry) => entry.p95FrameMs)).toFixed(2)),
  tickMean: Number(mean(good.map((entry) => entry.serverTickAverageMs)).toFixed(3)),
  online,
  practice,
};
writeFileSync(`artifacts/art/${label}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, runs: undefined }, null, 1));
process.exit(0);
