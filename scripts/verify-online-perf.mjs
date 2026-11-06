/**
 * Basic online performance check for P2.
 *
 * Requires Next and Colyseus to be running:
 *   BASE_URL=http://localhost:3101 npm run verify:online:perf
 *   HEADED=1 BASE_URL=http://localhost:3101 npm run verify:online:perf
 *
 * Measures browser requestAnimationFrame rate while moving and firing, reads
 * the session bar ping and the server's last tick duration from a snapshot.
 *
 * Headless Chrome can pace WebGL frames below the display refresh rate. Run
 * with HEADED=1 for the gameplay frame-rate number; the default headless run
 * checks that the render loop is not stalled.
 */

import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.CHROME_PATH;
const headed = process.env.HEADED === "1";

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: !headed,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1800);

  const canvas = await page.locator("canvas").boundingBox();
  if (canvas) {
    await page.mouse.move(
      canvas.x + canvas.width * 0.75,
      canvas.y + canvas.height * 0.3,
    );
  }
  await page.keyboard.down("KeyD");
  await page.mouse.down();
  const { rate: fps, p95: p95FrameMs } = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        let last = 0;
        const deltas = [];
        const start = performance.now();
        const step = (now) => {
          frames += 1;
          if (last) deltas.push(now - last);
          last = now;
          if (now - start < 4000) {
            requestAnimationFrame(step);
          } else {
            deltas.sort((a, b) => a - b);
            resolve({
              rate: (frames * 1000) / (now - start),
              p95: deltas[Math.floor(deltas.length * 0.95)] ?? 0,
            });
          }
        };
        requestAnimationFrame(step);
      }),
  );
  await page.mouse.up();
  await page.keyboard.up("KeyD");

  const tickSamples = [];
  for (let sample = 0; sample < 30; sample += 1) {
    await page.waitForTimeout(100);
    const tick = await page.evaluate(
      () => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot?.serverTickMs ?? 0,
    );
    if (tick > 0) tickSamples.push(tick);
  }
  tickSamples.sort((a, b) => a - b);
  const averageTick =
    tickSamples.reduce((sum, value) => sum + value, 0) / tickSamples.length;
  const p95Tick = tickSamples[Math.floor(tickSamples.length * 0.95)] ?? 0;
  const maxTick = tickSamples[tickSamples.length - 1] ?? 0;
  const metrics = await page.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    return {
      humans: probe.snapshot?.humans ?? null,
      bots: probe.snapshot?.bots ?? null,
      phase: probe.snapshot?.phase ?? null,
      sessionBar:
        document.querySelector(".online-session-bar__ping")?.textContent?.trim() ??
        "",
    };
  });
  const roundedFps = Math.round(fps);
  console.log(
    `PERF_JSON ${JSON.stringify({
      fps: roundedFps,
      fpsExact: Number(fps.toFixed(2)),
      p95FrameMs: Number(p95FrameMs.toFixed(2)),
      serverTickAverageMs: Number(averageTick.toFixed(3)),
    })}`,
  );
  console.log("PERF", {
    mode: headed ? "headed" : "headless",
    fps: roundedFps,
    p95FrameMs: Number(p95FrameMs.toFixed(2)),
    serverTickAverageMs: Number(averageTick.toFixed(3)),
    serverTickP95Ms: Number(p95Tick.toFixed(3)),
    serverTickMaxMs: Number(maxTick.toFixed(3)),
    serverTickSamples: tickSamples.length,
    sessionBar: metrics.sessionBar,
    humans: metrics.humans,
    bots: metrics.bots,
  });
  check(
    headed
      ? "headed browser sustains at least 45 fps"
      : "headless render loop is not stalled",
    fps >= (headed ? 45 : 25),
    `${roundedFps} fps`,
  );
  check(
    "average server tick stays under 8ms",
    tickSamples.length > 0 && averageTick < 8,
    `${averageTick.toFixed(2)}ms`,
  );
  check(
    "p95 server tick stays under 16ms",
    p95Tick < 16,
    `${p95Tick.toFixed(2)}ms`,
  );
  check("session bar reports ping and tick", metrics.sessionBar.includes("PING") && metrics.sessionBar.includes("TICK"), metrics.sessionBar);
  check("online match stays live during measurement", metrics.phase === "live");
  check("no browser page errors", pageErrors.length === 0, `${pageErrors.length} errors`);
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
