/**
 * Repeatable playability measurement. Runs the same keyboard path on the same
 * hardware under several RTT/jitter profiles and reports what a player feels:
 * local motion smoothness, rubber-banding, camera steadiness, remote-player
 * smoothness, frame times, main-thread cost and socket health.
 *
 * It relies only on the long-standing online probe, so it can be run against an
 * older build for a true before/after.
 *
 *   node scripts/build-test-frontend.mjs
 *   LABEL=before node scripts/measure-playability.mjs
 *
 * Output: artifacts/playability/<LABEL>.json
 *
 * Tablet benchmark, sustained play on four landscape tablets, Practice and
 * Online, on the real GPU and on a software GPU:
 *
 *   TABLET=1 LABEL=tablet-before RUNS=3 node scripts/measure-playability.mjs
 *
 * This machine cannot throttle a GPU, so the software renderer stands in for a
 * fill-rate-limited one: its cost grows with pixels, as a weak tablet's does.
 * Neither mode is a physical device, and reports must say so.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const label = process.env.LABEL ?? "run";
const headed = process.env.HEADED === "1";
const profiles = (process.env.PROFILES ?? "0/0,100/20,250/50,550/80")
  .split(",")
  .map((entry) => {
    const [rttMs, jitterMs] = entry.split("/").map(Number);
    return { rttMs, jitterMs };
  });
const outDir = "artifacts/playability";
mkdirSync(outDir, { recursive: true });

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const stddev = (values) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};
const round = (value, digits = 2) => Number(value.toFixed(digits));

async function launchBrowser(gpu = "hardware") {
  return chromium.launch({
    channel: "chrome",
    headless: !headed,
    args: [
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      gpu === "software" ? "--use-angle=swiftshader" : "--use-angle=d3d11",
      ...(gpu === "software" ? ["--enable-unsafe-swiftshader"] : ["--enable-gpu-rasterization"]),
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
}

async function joinRoom(page, baseUrl) {
  // The older build can hang on a lost lobby handshake, so reload if it does.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${baseUrl}/online`, { waitUntil: "load" });
    const ready = await page
      .waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (ready) break;
    console.log("lobby stall, reloading");
  }
  await page.waitForTimeout(600);
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 30_000 });
}

async function prepareLane(page) {
  await page.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    probe.testHooks.guard();
    probe.testHooks.extendMatch(600_000);
    // Longest unobstructed run: the widest platform with nothing standing on it.
    const lane = [...probe.platforms].sort((a, b) => b.width - a.width)[0];
    const blockers = probe.platforms
      .filter((p) => p !== lane && p.y < lane.y && p.y + p.height >= lane.y - 118)
      .map((p) => [p.x, p.x + p.width])
      .sort((a, b) => a[0] - b[0]);
    let best = [lane.x, lane.x];
    let cursor = lane.x;
    for (const [from, to] of [...blockers, [lane.x + lane.width, lane.x + lane.width]]) {
      if (from - cursor > best[1] - best[0]) best = [cursor, from];
      cursor = Math.max(cursor, to);
    }
    window.__laneSpan = best;
    // Start near the left end so the camera has room to travel too.
    probe.testHooks.teleport(best[0] + 60, lane.y);
  });
  await page.waitForTimeout(1200);
}

async function installSampler(page) {
  await page.evaluate(() => {
    const samples = [];
    const keys = [];
    const onKey = (event) => {
      if (event.repeat) return;
      keys.push({ t: performance.now(), code: event.code, down: event.type === "keydown" });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    let running = true;
    const sessionId = window.__VIBE_MILITIA_ONLINE__.getProbe().sessionId;
    const step = (t) => {
      if (!running) return;
      const probe = window.__VIBE_MILITIA_ONLINE__?.getProbe();
      if (probe) {
        const local = probe.views.find((view) => view.id === sessionId);
        const auth = probe.snapshot?.participants.find((p) => p.id === sessionId);
        samples.push({
          t,
          x: local?.x ?? 0,
          y: local?.y ?? 0,
          ax: auth?.x ?? 0,
          ay: auth?.y ?? 0,
          cx: probe.camera.scrollX,
          cy: probe.camera.scrollY,
          bots: probe.views
            .filter((view) => view.kind === "bot" && view.alive)
            .map((view) => [view.id, view.x, view.y]),
        });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    window.__stopSampler = () => {
      running = false;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      return { samples, keys };
    };
  });
}

function analyseSegments(samples, keys) {
  const holds = [];
  for (const code of ["KeyD", "KeyA"]) {
    let down = null;
    for (const key of keys.filter((entry) => entry.code === code)) {
      if (key.down) down = key.t;
      else if (down !== null) {
        holds.push({ code, dir: code === "KeyD" ? 1 : -1, down, up: key.t });
        down = null;
      }
    }
  }
  holds.sort((a, b) => a.down - b.down);
  const speeds = [];
  const stepPx = [];
  const cameraSpeeds = [];
  let reversals = 0;
  let cameraReversals = 0;
  let frames = 0;
  const inputToMotion = [];
  const backtrack = [];
  const settle = [];
  for (const [holdIndex, hold] of holds.entries()) {
    const before = samples.filter((s) => s.t <= hold.down).at(-1);
    if (!before) continue;
    const first = samples.find((s) => s.t > hold.down && Math.abs(s.x - before.x) > 1);
    if (first) inputToMotion.push(first.t - hold.down);
    const steady = samples.filter((s) => s.t >= hold.down + 450 && s.t <= hold.up);
    for (let index = 1; index < steady.length; index += 1) {
      const a = steady[index - 1];
      const b = steady[index];
      const dt = Math.max(1, b.t - a.t);
      const dx = b.x - a.x;
      frames += 1;
      if (Math.sign(dx) === -hold.dir && Math.abs(dx) > 0.25) reversals += 1;
      speeds.push((dx * hold.dir * 1000) / dt);
      stepPx.push(Math.abs(dx));
      const dc = b.cx - a.cx;
      cameraSpeeds.push((dc * 1000) / dt);
      if (Math.sign(dc) === -hold.dir && Math.abs(dc) > 0.25) cameraReversals += 1;
    }
    // Rubber band: the furthest travel in the hold direction, against where
    // the player finally came to rest after the input stopped.
    const nextDown = holds[holdIndex + 1]?.down ?? Infinity;
    const tail = samples.filter((s) => s.t >= hold.up && s.t < Math.min(hold.up + 1100, nextDown));
    if (tail.length > 4) {
      const rest = tail.at(-1).x;
      const extreme = tail.reduce(
        (best, s) => (hold.dir > 0 ? Math.max(best, s.x) : Math.min(best, s.x)),
        tail[0].x,
      );
      backtrack.push(Math.abs(extreme - rest));
      const settled = tail.find((s, index) =>
        tail.slice(index).every((later) => Math.abs(later.x - rest) < 2),
      );
      if (settled) settle.push(settled.t - hold.up);
    }
  }
  return {
    holds: holds.length,
    frames,
    inputToMotionMs: round(mean(inputToMotion)),
    runSpeedMean: round(mean(speeds)),
    runSpeedStd: round(stddev(speeds)),
    runSpeedP05: round(percentile(speeds, 0.05)),
    maxFrameStepPx: round(Math.max(0, ...stepPx)),
    backwardFrames: reversals,
    backwardFramePct: round((reversals / Math.max(1, frames)) * 100),
    cameraSpeedStd: round(stddev(cameraSpeeds)),
    cameraBackwardFrames: cameraReversals,
    stopBacktrackPxMean: round(mean(backtrack)),
    stopBacktrackPxMax: round(Math.max(0, ...backtrack)),
    stopSettleMsMean: round(mean(settle)),
  };
}

function analyseRemotes(samples) {
  const tracks = new Map();
  for (const sample of samples) {
    for (const [id, x, y] of sample.bots) {
      if (!tracks.has(id)) tracks.set(id, []);
      tracks.get(id).push({ t: sample.t, x, y });
    }
  }
  const cvs = [];
  for (const points of tracks.values()) {
    const speeds = [];
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const dt = Math.max(1, b.t - a.t);
      speeds.push((Math.hypot(b.x - a.x, b.y - a.y) * 1000) / dt);
    }
    // Windows where the bot is really moving, judged over ~200ms, so a stopped
    // bot does not count as jitter.
    const moving = [];
    for (let index = 12; index < speeds.length - 12; index += 1) {
      const window = speeds.slice(index - 12, index + 12);
      if (mean(window) > 80) moving.push(stddev(window) / mean(window));
    }
    if (moving.length) cvs.push(percentile(moving, 0.5));
  }
  return { remoteSpeedCvMedian: round(percentile(cvs, 0.5), 3), remoteTracks: cvs.length };
}

async function measureProfile(browser, stack, profile) {
  stack.proxy.set(profile);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  const socket = { closed: 0, frames: [], sent: 0, sentBytes: 0 };
  cdp.on("Network.webSocketFrameReceived", (event) => {
    socket.frames.push({
      t: event.timestamp * 1000,
      bytes: Math.floor((event.response.payloadData.length * 3) / 4),
    });
  });
  cdp.on("Network.webSocketFrameSent", (event) => {
    socket.sent += 1;
    socket.sentBytes += Math.floor((event.response.payloadData.length * 3) / 4);
  });
  cdp.on("Network.webSocketClosed", () => {
    socket.closed += 1;
  });
  await joinRoom(page, stack.baseUrl);
  await prepareLane(page);
  const box = await page.locator("canvas").first().boundingBox();
  if (box) await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.35);
  socket.frames.length = 0;
  socket.sent = 0;
  socket.sentBytes = 0;
  const metricsBefore = (await cdp.send("Performance.getMetrics")).metrics;
  await installSampler(page);
  const started = Date.now();
  for (let pass = 0; pass < 3; pass += 1) {
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(1000 + profile.rttMs);
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(1000 + profile.rttMs);
  }
  const samplesPreview = process.env.DUMP === "1";
  await page.keyboard.press("Space");
  await page.keyboard.down("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1200 + profile.rttMs);
  const durationSeconds = (Date.now() - started) / 1000;
  const metricsAfter = (await cdp.send("Performance.getMetrics")).metrics;
  const { samples, keys } = await page.evaluate(() => window.__stopSampler());
  const value = (list, name) => list.find((metric) => metric.name === name)?.value ?? 0;
  const perSecond = (name) =>
    round(((value(metricsAfter, name) - value(metricsBefore, name)) * 1000) / durationSeconds, 1);
  if (samplesPreview) {
    writeFileSync(
      `${outDir}/${label}-trace-${profile.rttMs}.json`,
      JSON.stringify({ keys, lane: await page.evaluate(() => window.__laneSpan), samples: samples.map((sample) => ({ ...sample, bots: undefined })) }),
    );
  }
  const frameMs = samples.slice(1).map((s, index) => s.t - samples[index].t);
  const big = socket.frames.filter((frame) => frame.bytes > 300);
  const gaps = big.slice(1).map((frame, index) => frame.t - big[index].t);
  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  await context.close();
  return {
    profile,
    renderer,
    durationSeconds: round(durationSeconds, 1),
    frames: {
      fps: round(1000 / Math.max(1, mean(frameMs)), 1),
      p50Ms: round(percentile(frameMs, 0.5)),
      p95Ms: round(percentile(frameMs, 0.95)),
      p99Ms: round(percentile(frameMs, 0.99)),
    },
    mainThreadMsPerSecond: {
      task: perSecond("TaskDuration"),
      script: perSecond("ScriptDuration"),
      layout: perSecond("LayoutDuration"),
      style: perSecond("RecalcStyleDuration"),
    },
    motion: analyseSegments(samples, keys),
    remotes: analyseRemotes(samples),
    socket: {
      closes: socket.closed,
      snapshotsPerSecond: round(big.length / durationSeconds, 1),
      snapshotBytesP50: percentile(big.map((frame) => frame.bytes), 0.5),
      downKBps: round(
        socket.frames.reduce((sum, frame) => sum + frame.bytes, 0) / 1024 / durationSeconds,
        1,
      ),
      upMessagesPerSecond: round(socket.sent / durationSeconds, 1),
      upKBps: round(socket.sentBytes / 1024 / durationSeconds, 1),
      snapshotGapP50Ms: round(percentile(gaps, 0.5)),
      snapshotGapP95Ms: round(percentile(gaps, 0.95)),
      snapshotGapP99Ms: round(percentile(gaps, 0.99)),
    },
    pageErrors: errors,
  };
}

async function measureLoad({
  browser,
  stack,
  name,
  url,
  viewport,
  deviceScaleFactor = 1,
  isMobile = false,
  cpuThrottle = 1,
  join = false,
}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch: isMobile,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (join) {
    stack.proxy.set({ rttMs: 0, jitterMs: 0 });
    await joinRoom(page, stack.baseUrl);
    await prepareLane(page);
  } else {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("canvas", { timeout: 30_000 });
    // Past the countdown and first-use shader compilation, so this is steady play.
    await page.waitForTimeout(12_000);
  }
  if (cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  await page.waitForTimeout(join ? 6000 : 800);
  const before = (await cdp.send("Performance.getMetrics")).metrics;
  const started = Date.now();
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const step = (now) => {
          times.push(now);
          if (now - start < 8000) requestAnimationFrame(step);
          else resolve(times);
        };
        requestAnimationFrame(step);
      }),
  );
  const seconds = (Date.now() - started) / 1000;
  const after = (await cdp.send("Performance.getMetrics")).metrics;
  const value = (list, key) => list.find((metric) => metric.name === key)?.value ?? 0;
  const perSecond = (key) =>
    round(((value(after, key) - value(before, key)) * 1000) / seconds, 1);
  const frameMs = frames.slice(1).map((t, index) => t - frames[index]);
  const canvas = await page.evaluate(() => {
    const element = document.querySelector("canvas");
    return element ? { width: element.width, height: element.height } : null;
  });
  await context.close();
  return {
    name,
    canvas,
    viewport,
    deviceScaleFactor,
    cpuThrottle,
    fps: round(1000 / Math.max(1, mean(frameMs)), 1),
    p50Ms: round(percentile(frameMs, 0.5)),
    p95Ms: round(percentile(frameMs, 0.95)),
    p99Ms: round(percentile(frameMs, 0.99)),
    longFrames: frameMs.filter((ms) => ms > 33).length,
    mainThreadMsPerSecond: {
      task: perSecond("TaskDuration"),
      script: perSecond("ScriptDuration"),
      layout: perSecond("LayoutDuration"),
      style: perSecond("RecalcStyleDuration"),
    },
  };
}

const TABLETS = [
  { name: "1024x600", width: 1024, height: 600 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1366x768", width: 1366, height: 768 },
];

/**
 * One sustained run. The player stands guarded mid-arena so the camera sees the
 * same place every run, while the bots keep fighting. Touch layout comes from
 * the same emulated tablet flags a real one reports.
 */
async function measureTablet({ browser, stack, tablet, mode, gpu, cpuThrottle, seconds }) {
  const context = await browser.newContext({
    viewport: { width: tablet.width, height: tablet.height },
    screen: { width: tablet.width, height: tablet.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  stack.proxy.set({ rttMs: 0, jitterMs: 0 });
  if (mode === "online") {
    await joinRoom(page, stack.baseUrl);
  } else {
    await page.goto(`${stack.baseUrl}/practice?difficulty=normal&touch=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live", null, { timeout: 60_000 });
  }
  await page.evaluate(() => {
    const hooks = window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks;
    hooks?.guard?.();
    hooks?.extendMatch?.(600_000);
    hooks?.teleport?.(1800, 1340);
  });
  // Past first-use shader compilation, so this is steady play.
  await page.waitForTimeout(5000);
  if (cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  await page.waitForTimeout(1500);
  const before = (await cdp.send("Performance.getMetrics")).metrics;
  const started = Date.now();
  const sampled = await page.evaluate(
    (durationMs) =>
      new Promise((resolve) => {
        const times = [];
        const load = [];
        const start = performance.now();
        let nextLoad = start;
        const step = (now) => {
          times.push(now);
          if (now >= nextLoad) {
            nextLoad = now + 1000;
            const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
            const renderLoad = probe.renderLoad?.();
            if (renderLoad) load.push({ ...renderLoad, phase: probe.snapshot?.phase });
          }
          if (now - start < durationMs) requestAnimationFrame(step);
          else resolve({ times, load });
        };
        requestAnimationFrame(step);
      }),
    seconds * 1000,
  );
  const elapsed = (Date.now() - started) / 1000;
  const after = (await cdp.send("Performance.getMetrics")).metrics;
  const value = (list, key) => list.find((metric) => metric.name === key)?.value ?? 0;
  const perSecond = (key) => round(((value(after, key) - value(before, key)) * 1000) / elapsed, 1);
  const frameMs = sampled.times.slice(1).map((t, index) => t - sampled.times[index]);
  const sorted = [...frameMs].sort((a, b) => b - a);
  const slowest = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
  const state = await page.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const viewport = probe.viewport;
    return {
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
      css: viewport.canvasCss,
      backing: viewport.canvasBacking,
      renderScale: viewport.renderScale,
      worldZoom: viewport.worldZoom,
      apparentScale: viewport.apparentScale,
      zoomChanges: viewport.zoomChanges,
      scaleEvents: viewport.history.map((event) => [event.reason, event.renderScale]),
      heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      textureMb: Math.round(probe.textureMemory().bytes / 1048576),
      snapshotGapMs: Math.round(probe.net.snapshotGapMs ?? 0),
    };
  });
  await context.close();
  const load = sampled.load.filter((entry) => entry.phase === "live");
  const peak = (key) => load.reduce((max, entry) => Math.max(max, entry[key] ?? 0), 0);
  return {
    tablet: tablet.name,
    mode,
    gpu,
    cpuThrottle,
    fps: round(1000 / Math.max(1, mean(frameMs))),
    onePercentLowFps: round(1000 / Math.max(1, mean(slowest))),
    p50Ms: round(percentile(frameMs, 0.5)),
    p95Ms: round(percentile(frameMs, 0.95)),
    p99Ms: round(percentile(frameMs, 0.99)),
    longFrames: frameMs.filter((ms) => ms > 33.4).length,
    frames: frameMs.length,
    mainThreadMsPerSecond: {
      task: perSecond("TaskDuration"),
      script: perSecond("ScriptDuration"),
      layout: perSecond("LayoutDuration"),
      style: perSecond("RecalcStyleDuration"),
    },
    load: {
      sprites: round(mean(load.map((entry) => entry.sprites)), 0),
      particlesPeak: peak("particles"),
      projectilesPeak: peak("projectiles"),
      objects: round(mean(load.map((entry) => entry.objects)), 0),
    },
    ...state,
    pixels: state.backing.width * state.backing.height,
    errors,
  };
}

async function runTablets() {
  const runs = Number(process.env.RUNS ?? 1);
  const seconds = Number(process.env.SECONDS ?? 30);
  const gpus = (process.env.GPUS ?? "hardware,software").split(",");
  const tablets = process.env.TABLETS
    ? TABLETS.filter((tablet) => process.env.TABLETS.split(",").includes(tablet.name))
    : TABLETS;
  const modes = (process.env.MODES ?? "practice,online").split(",");
  const cpuThrottle = Number(process.env.CPU ?? 4);
  const results = { label, at: new Date().toISOString(), emulated: true, runs: [] };
  const stack = await startStack({ countdownMs: 0 });
  try {
    for (const gpu of gpus) {
      const browser = await launchBrowser(gpu);
      for (let run = 0; run < runs; run += 1) {
        for (const tablet of tablets) {
          for (const mode of modes) {
            // A software GPU is the limit under test, so the CPU stays unthrottled there.
            const throttle = gpu === "software" ? 1 : cpuThrottle;
            const result = await measureTablet({ browser, stack, tablet, mode, gpu, cpuThrottle: throttle, seconds }).catch((error) => ({
              tablet: tablet.name,
              mode,
              gpu,
              failed: String(error).slice(0, 300),
            }));
            results.runs.push({ run, ...result });
            console.log(JSON.stringify({ run, ...result, scaleEvents: result.scaleEvents?.slice(-6) }));
            writeFileSync(`${outDir}/${label}.json`, JSON.stringify(results, null, 2));
          }
        }
      }
      await browser.close();
    }
  } finally {
    await stack.stop();
  }
}

if (process.env.TABLET === "1") {
  await runTablets();
  process.exit(0);
}

const stack = await startStack({ countdownMs: 800 });
const browser = await launchBrowser();
const results = { label, at: new Date().toISOString(), headed, network: [], loads: [] };
try {
  // A throwaway run warms the server JIT, which otherwise penalises the first profile.
  await measureProfile(browser, stack, { rttMs: 0, jitterMs: 0 });
  for (const profile of profiles) {
    const result = await measureProfile(browser, stack, profile);
    results.network.push(result);
    console.log(`\n=== ${profile.rttMs}ms RTT / ${profile.jitterMs}ms jitter`);
    console.log(JSON.stringify(result));
  }
  const desktop = { width: 1366, height: 768 };
  const phone = { width: 844, height: 390 };
  const loads = [
    { name: "practice-desktop", url: `${stack.baseUrl}/practice?difficulty=normal`, viewport: desktop },
    { name: "online-desktop", join: true, viewport: desktop },
    {
      name: "practice-phone-4xcpu",
      url: `${stack.baseUrl}/practice?difficulty=normal&touch=1`,
      viewport: phone,
      deviceScaleFactor: 3,
      isMobile: true,
      cpuThrottle: 4,
    },
    {
      name: "online-phone-4xcpu",
      join: true,
      viewport: phone,
      deviceScaleFactor: 3,
      isMobile: true,
      cpuThrottle: 4,
    },
  ];
  for (const load of loads) {
    const result = await measureLoad({ browser, stack, ...load });
    results.loads.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  writeFileSync(`${outDir}/${label}.json`, JSON.stringify(results, null, 2));
  await browser.close();
  await stack.stop();
}
