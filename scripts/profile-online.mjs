/** Samples a CPU profile of a live local match and prints the top self-time functions. */
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const stack = await startStack({ countdownMs: 800 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await page.goto(`${stack.baseUrl}/${process.env.ROUTE ?? "online"}`, { waitUntil: "load" });
  if (!process.env.ROUTE) {
    await page.waitForSelector('[data-testid="create-room"]:not([disabled])');
    await page.waitForTimeout(600);
    await page.locator('[data-testid="create-room"]').click();
    await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 30000 });
    await page.evaluate(() => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      probe.testHooks.guard();
      probe.testHooks.extendMatch(600000);
    });
  }
  await page.waitForTimeout(2500);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  await page.waitForTimeout(8000);
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  for (let index = 0; index < profile.samples.length; index += 1) {
    const node = byId.get(profile.samples[index]);
    const dt = profile.timeDeltas[index] / 1000;
    const name = node.callFrame.functionName || "(anonymous)";
    const file = node.callFrame.url.split("/").pop();
    const key = `${name} @${file}:${node.callFrame.lineNumber}:${node.callFrame.columnNumber}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const total = [...self.values()].reduce((sum, value) => sum + value, 0);
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 30));
  console.log("total ms", total.toFixed(0));
  for (const [key, value] of rows) console.log(`${((value / 8000) * 1000).toFixed(1).padStart(7)} ms/s  ${key}`);
} finally {
  await browser.close();
  await stack.stop();
}
