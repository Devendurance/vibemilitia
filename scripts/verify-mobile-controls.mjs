/**
 * Mobile control, viewport and countdown acceptance. Real Chromium, real CDP
 * multi-touch through the real pads, a real local server behind a latency proxy.
 *
 *   node scripts/build-test-frontend.mjs
 *   node scripts/verify-mobile-controls.mjs
 *   ONLY=twinstick,viewport node scripts/verify-mobile-controls.mjs
 *
 * Results and traces: artifacts/playability/mobile/
 * This is emulation. It proves events, geometry and timing logic, never how a
 * physical phone feels or what iOS Safari does.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const out = "artifacts/playability/mobile";
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");
const results = [];
const traces = {};
const check = (name, condition, detail = "") => {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  ${detail}` : ""}`);
};
const section = async (name, run) => {
  if (only && !only.includes(name)) return;
  console.log(`\n## ${name}`);
  try {
    await run();
  } catch (error) {
    check(`${name} completed`, false, error.message.slice(0, 700));
  }
};

const stack = await startStack({ countdownMs: 9000, reconnectGraceSeconds: 30 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=d3d11",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

const PHONE = { width: 844, height: 390 };
const ALL_WEAPONS = [...readFileSync("src/game/config/gameplay.ts", "utf8").matchAll(/^\s+id: "([a-z-]+)",\n\s+slot: \d/gm)].map((match) => match[1]);
const newPage = async (viewport = PHONE, dpr = 3, screen = viewport) => {
  const context = await browser.newContext({
    viewport,
    screen,
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, errors };
};

const phase = (name, timeout = 30_000) => (page) =>
  page.waitForFunction(
    (wanted) => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === wanted,
    name,
    { timeout },
  );
const waitLive = phase("live");
const hook = (page, name, ...args) =>
  page.evaluate(
    ([hookName, values]) =>
      window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks[hookName](...values),
    [name, args],
  );
const state = (page) =>
  page.evaluate(() => {
    const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const me = p.snapshot.participants.find((entry) => entry.id === p.sessionId);
    const view = p.views.find((entry) => entry.id === p.sessionId);
    return {
      id: p.sessionId,
      x: view?.x ?? me.x,
      y: view?.y ?? me.y,
      serverX: me.x,
      serverY: me.y,
      thrusting: me.thrusting,
      ammo: me.weapons[me.equippedSlot]?.ammo ?? 0,
      reloading: me.weapons[me.equippedSlot]?.reloading ?? false,
      weaponId: me.weaponId,
      aim: p.localAim,
      viewAim: view?.aim,
      fire: p.control?.fire ?? false,
      touch: p.touch,
      camera: p.camera,
      viewport: p.viewport,
      input: p.input,
      projectiles: p.snapshot.projectiles.filter((entry) => entry.ownerId === p.sessionId),
    };
  });
const box = async (page, id) => {
  const rect = await page.locator(`[data-testid="${id}"]`).boundingBox();
  return { ...rect, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, r: rect.width / 2 };
};
const touch = (cdp, type, points) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id })),
  });
const onPad = (pad, angle, reach, id) => ({
  x: pad.x + Math.cos(angle) * pad.r * reach,
  y: pad.y + Math.sin(angle) * pad.r * reach,
  id,
});
const angleGap = (a, b) => {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
};

/** One sample per rendered frame, taken in the page rather than over CDP. */
const startTrace = (page) =>
  page.evaluate(() => {
    const trace = [];
    window.__trace = trace;
    window.__tracing = true;
    const step = () => {
      if (!window.__tracing) return;
      const p = window.__VIBE_MILITIA_ONLINE__?.getProbe();
      const me = p?.snapshot?.participants.find((entry) => entry.id === p.sessionId);
      const view = p?.views.find((entry) => entry.id === p.sessionId);
      if (me) {
        trace.push({
          t: performance.now(),
          fire: p.control?.fire ?? false,
          thumb: p.touch.aimFire,
          aim: p.localAim,
          viewAim: view?.aim ?? null,
          x: view?.x ?? me.x,
          y: view?.y ?? me.y,
          moveX: p.touch.moveX,
          thrust: me.thrusting,
          ammo: me.weapons[me.equippedSlot]?.ammo ?? 0,
          apparent: p.viewport.apparentScale,
          scrollX: p.camera.scrollX,
        });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
const stopTrace = (page, label) =>
  page
    .evaluate(() => {
      window.__tracing = false;
      return window.__trace;
    })
    .then((trace) => {
      traces[label] = trace;
      return trace;
    });
const shotsIn = (trace) => {
  let shots = 0;
  for (let index = 1; index < trace.length; index += 1) {
    const drop = trace[index - 1].ammo - trace[index].ammo;
    if (drop > 0) shots += drop;
  }
  return shots;
};

const startPractice = async (page, difficulty = "easy") => {
  await page.goto(`${stack.baseUrl}/practice?difficulty=${difficulty}`, { waitUntil: "load" });
  await waitLive(page);
  await hook(page, "guard");
  await page.waitForTimeout(300);
  await hook(page, "teleport", 1800, 1340);
  await page.waitForTimeout(500);
};
const startOnline = async (page, waitForLive = true) => {
  await page.goto(`${stack.baseUrl}/online`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 30_000 });
  await page.waitForTimeout(400);
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 30_000 });
  if (waitForLive) {
    await waitLive(page);
    await hook(page, "guard");
    await page.waitForTimeout(300);
  }
};
const refill = async (page) => {
  const { id, weaponId } = await state(page);
  await hook(page, "giveWeapon", id, weaponId);
  await page.waitForTimeout(120);
};

async function twinStick(label, throttle) {
  const { context, page, cdp, errors } = await newPage();
  await startPractice(page);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const move = await box(page, "touch-move");
  const aim = await box(page, "touch-aim");
  const left = (angle, reach = 0.9) => onPad(move, angle, reach, 1);
  const right = (angle, reach = 0.8) => onPad(aim, angle, reach, 2);

  // 1, 9. Run right, hold fire.
  await refill(page);
  await startTrace(page);
  await touch(cdp, "touchStart", [left(0)]);
  await page.waitForTimeout(250);
  await touch(cdp, "touchStart", [left(0), right(-0.4)]);
  await page.waitForTimeout(900);
  await touch(cdp, "touchEnd", [right(-0.4)]);
  await page.waitForTimeout(100);
  await touch(cdp, "touchEnd", []);
  let trace = await stopTrace(page, `${label}-run-fire`);
  let firing = trace.filter((frame) => frame.thumb);
  check(`${label}: 1 running right and holding fire moves the player`, firing.at(-1).x - firing[0].x > 60, `${(firing.at(-1).x - firing[0].x).toFixed(0)} world px`);
  check(`${label}: 1, 9 shots leave while running`, shotsIn(firing) >= 3, `${shotsIn(firing)} shots`);
  check(`${label}: 1 fire stayed down on every frame of the hold`, firing.every((frame) => frame.fire), `${firing.length} frames`);

  // 2. Run left, aim and fire right.
  await refill(page);
  await startTrace(page);
  await touch(cdp, "touchStart", [left(Math.PI)]);
  await page.waitForTimeout(200);
  await touch(cdp, "touchStart", [left(Math.PI), right(0)]);
  await page.waitForTimeout(800);
  await touch(cdp, "touchEnd", []);
  trace = await stopTrace(page, `${label}-backpedal`);
  firing = trace.filter((frame) => frame.thumb).slice(10);
  check(`${label}: 2 moves left while aiming right`, firing.at(-1).x < firing[0].x - 30 && firing.every((frame) => frame.moveX < 0 && Math.abs(frame.aim) < 0.3), `dx=${(firing.at(-1).x - firing[0].x).toFixed(0)} aim=${firing.at(-1).aim.toFixed(2)}`);
  check(`${label}: 2 shots leave while backpedalling`, shotsIn(firing) >= 3, `${shotsIn(firing)} shots`);

  // 3. Jetpack, aim and fire.
  await refill(page);
  await startTrace(page);
  await touch(cdp, "touchStart", [left(-Math.PI / 2)]);
  await page.waitForTimeout(150);
  await touch(cdp, "touchStart", [left(-Math.PI / 2), right(2.4)]);
  await page.waitForTimeout(700);
  const air = await state(page);
  await touch(cdp, "touchEnd", []);
  trace = await stopTrace(page, `${label}-jet-fire`);
  firing = trace.filter((frame) => frame.thumb);
  check(`${label}: 3 flying, aiming and firing together`, air.thrusting && firing.at(-1).y < firing[0].y - 20 && shotsIn(firing) >= 3 && angleGap(air.aim, 2.4) < 0.25, `thrust=${air.thrusting} climb=${(firing[0].y - firing.at(-1).y).toFixed(0)} shots=${shotsIn(firing)}`);
  await page.waitForTimeout(900);

  // 4. Rapid aim changes while firing.
  await hook(page, "teleport", 1800, 1340);
  await refill(page);
  await page.waitForTimeout(300);
  await startTrace(page);
  await touch(cdp, "touchStart", [right(0)]);
  let spin = 0;
  for (let step = 0; step < 48; step += 1) {
    spin += 0.55;
    await touch(cdp, "touchMove", [right(spin)]);
    await page.waitForTimeout(12);
  }
  await touch(cdp, "touchEnd", []);
  trace = await stopTrace(page, `${label}-spin`);
  firing = trace.filter((frame) => frame.thumb);
  const jumps = firing.slice(1).map((frame, index) => angleGap(frame.aim, firing[index].aim));
  check(`${label}: 4 fire held through rapid aim changes`, firing.every((frame) => frame.fire), `${firing.length} frames`);
  check(`${label}: 4 aim moved through the sweep`, new Set(firing.map((frame) => frame.aim.toFixed(1))).size > 8, `${jumps.length} steps`);
  check(`${label}: 10 rendered weapon matches local aim on every frame`, firing.every((frame) => angleGap(frame.viewAim, frame.aim) < 0.01), "");

  // 5. Across the center, both ways, and resting on it.
  await refill(page);
  await startTrace(page);
  await touch(cdp, "touchStart", [right(0)]);
  for (const direction of [1, -1, 1]) {
    for (let step = 0; step <= 24; step += 1) {
      const offset = aim.r * 0.8 * direction * (1 - (2 * step) / 24);
      await touch(cdp, "touchMove", [{ x: aim.x + offset, y: aim.y, id: 2 }]);
      await page.waitForTimeout(12);
    }
  }
  await touch(cdp, "touchMove", [{ x: aim.x, y: aim.y, id: 2 }]);
  await page.waitForTimeout(250);
  await touch(cdp, "touchEnd", []);
  trace = await stopTrace(page, `${label}-center`);
  firing = trace.filter((frame) => frame.thumb);
  const dropped = firing.filter((frame) => !frame.fire).length;
  check(`${label}: 5 crossing the center never interrupts fire`, dropped === 0 && firing.length > 30, `${dropped} dropped of ${firing.length}`);

  // 6. Tap.
  await page.waitForTimeout(250);
  await refill(page);
  const retained = (await state(page)).aim;
  const tapBefore = (await state(page)).ammo;
  const taps = 5;
  for (let tap = 0; tap < taps; tap += 1) {
    await touch(cdp, "touchStart", [right(1.2)]);
    await page.waitForTimeout(25);
    await touch(cdp, "touchEnd", []);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(150);
  const tapAfter = await state(page);
  // A throttled main thread can deliver the release a frame late, which the
  // server rightly treats as a longer press. One extra shot is the limit.
  const tapSlack = throttle > 1 ? 1 : 0;
  const tapShots = tapBefore - tapAfter.ammo;
  check(`${label}: 6 each tap fires exactly one shot`, tapShots >= taps && tapShots <= taps + tapSlack, `${tapShots} shots from ${taps} taps`);
  check(`${label}: 6 tap keeps the retained aim`, angleGap(tapAfter.aim, retained) < 0.02, `${retained.toFixed(2)} -> ${tapAfter.aim.toFixed(2)}`);

  // 7. Legal cadence on an automatic and on a slow weapon.
  for (const [weaponId, intervalMs, tolerance] of [["vibe-rifle", 108, 3], ["scatter-blaster", 720, 1]]) {
    const { id } = await state(page);
    await hook(page, "giveWeapon", id, weaponId);
    await page.waitForTimeout(150);
    const equipped = (await state(page)).weaponId;
    await startTrace(page);
    await touch(cdp, "touchStart", [right(0.2)]);
    await page.waitForTimeout(1500);
    await touch(cdp, "touchEnd", []);
    await page.waitForTimeout(150);
    trace = await stopTrace(page, `${label}-cadence-${weaponId}`);
    const expected = Math.floor(1500 / intervalMs) + 1;
    const shots = shotsIn(trace);
    check(`${label}: 7 ${equipped} holds at its legal cadence`, shots <= expected + 1 && shots >= expected - tolerance, `${shots} shots, about ${expected} expected`);
  }

  // 8. Release.
  const { id } = await state(page);
  await hook(page, "giveWeapon", id, "vibe-rifle");
  await page.waitForTimeout(200);
  await touch(cdp, "touchStart", [right(0.2)]);
  await page.waitForTimeout(350);
  await touch(cdp, "touchEnd", []);
  const released = await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      if (!p.control.fire) resolve(performance.now() - start);
      else if (performance.now() - start > 500) resolve(-1);
      else requestAnimationFrame(step);
    };
    step();
  }));
  await page.waitForTimeout(120);
  const stopAmmo = (await state(page)).ammo;
  await page.waitForTimeout(450);
  const stopLater = await state(page);
  check(`${label}: 8 release stops fire at once`, released >= 0 && released < 120, `${released.toFixed(0)} ms`);
  check(`${label}: 8 no shots after release`, stopLater.ammo === stopAmmo, `${stopAmmo} -> ${stopLater.ammo}`);
  check(`${label}: 8 nothing stuck`, !stopLater.touch.fire && !stopLater.touch.aimActive && !stopLater.touch.fireLatch && stopLater.touch.moveX === 0);

  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  check(`${label}: no page errors`, errors.length === 0, errors[0] ?? "");
  const latency = await state(page);
  await context.close();
  return latency.input;
}

try {
  await section("twinstick", async () => {
    const normal = await twinStick("normal", 1);
    const throttled = await twinStick("throttled 4x", 4);
    const stats = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { n: sorted.length, p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)] };
    };
    traces.latency = {
      normal: { aim: stats(normal.aimLatencyMs), fire: stats(normal.fireLatencyMs) },
      throttled: { aim: stats(throttled.aimLatencyMs), fire: stats(throttled.fireLatencyMs) },
    };
    console.log("LATENCY", JSON.stringify(traces.latency));
  });

  await section("direction", async () => {
    const { context, page, cdp } = await newPage();
    await startPractice(page);
    const aim = await box(page, "touch-aim");
    // Upward and level. A downward shot hits the platform before a snapshot sees it.
    for (const angle of [0, -0.5, -1.2, -2, -2.5]) {
      await refill(page);
      // Starts just off the target, then drags onto it, as a thumb does. The very
      // first shot of a press belongs to the retained aim.
      await touch(cdp, "touchStart", [onPad(aim, angle + 0.3, 0.8, 2)]);
      await page.waitForTimeout(30);
      await touch(cdp, "touchMove", [onPad(aim, angle, 0.8, 2)]);
      await page.waitForTimeout(170);
      let seen = null;
      for (let wait = 0; wait < 40 && !seen; wait += 1) {
        await page.waitForTimeout(16);
        const now = await state(page);
        const shot = now.projectiles.at(-1);
        const flight = shot ? Math.atan2(shot.vy, shot.vx) : null;
        if (shot && angleGap(flight, angle) < 0.2) seen = { shot: flight, weapon: now.viewAim };
      }
      await touch(cdp, "touchEnd", []);
      check(`10 projectile leaves along the shown weapon at ${angle}`, seen && angleGap(seen.shot, seen.weapon) < 0.08 && angleGap(seen.weapon, angle) < 0.1, seen ? `shot ${seen.shot.toFixed(3)} weapon ${seen.weapon.toFixed(3)}` : "no shot");
      await page.waitForTimeout(150);
    }
    await context.close();
  });

  await section("latency", async () => {
    stack.proxy.set({ rttMs: 550, jitterMs: 80 });
    const { context, page, cdp } = await newPage();
    await startOnline(page);
    await hook(page, "teleport", 1800, 1340);
    await page.waitForTimeout(1500);
    const move = await box(page, "touch-move");
    const aim = await box(page, "touch-aim");
    await refill(page);
    await page.waitForTimeout(900);
    await startTrace(page);
    await touch(cdp, "touchStart", [onPad(move, 0, 0.9, 1)]);
    await page.waitForTimeout(120);
    await touch(cdp, "touchStart", [onPad(move, 0, 0.9, 1), onPad(aim, 1, 0.8, 2)]);
    for (let step = 0; step < 50; step += 1) {
      await touch(cdp, "touchMove", [onPad(move, 0, 0.9, 1), onPad(aim, 1 + step * 0.2, 0.8, 2)]);
      await page.waitForTimeout(16);
    }
    await touch(cdp, "touchEnd", []);
    const trace = await stopTrace(page, "online-550-dual");
    const firing = trace.filter((frame) => frame.thumb);
    const after = await state(page);
    check("550 ms: weapon tracks the thumb on every frame", firing.every((frame) => angleGap(frame.viewAim, frame.aim) < 0.01), `${firing.length} frames`);
    check("550 ms: local fire feedback does not wait for the network", after.input.fireLatencyMs.length > 0 && after.input.fireLatencyMs.at(-1) < 120, `${after.input.fireLatencyMs.at(-1)} ms`);
    await page.waitForTimeout(1200);
    const settled = await state(page);
    check("550 ms: server confirms a sustained burst", shotsIn(trace) >= 10, `${shotsIn(trace)} shots`);
    check("550 ms: predicted shots all confirmed or expired", settled.input.unconfirmedShots <= 1, settled.input.unconfirmedShots);
    traces.online550 = { aim: after.input.aimLatencyMs.slice(-60), fire: after.input.fireLatencyMs.slice(-20) };
    await context.close();
    stack.proxy.set({ rttMs: 0, jitterMs: 0 });
  });

  await section("viewport", async () => {
    const { context, page, cdp, errors } = await newPage(PHONE, 3, PHONE);
    await startPractice(page);
    const aim = await box(page, "touch-aim");
    const base = (await state(page)).viewport;
    await page.screenshot({ path: `${out}/viewport-start.png` });

    // 11
    await startTrace(page);
    await touch(cdp, "touchStart", [onPad(aim, 0, 0.8, 2)]);
    await page.waitForTimeout(700);
    await touch(cdp, "touchMove", [onPad(aim, Math.PI, 0.8, 2)]);
    await page.waitForTimeout(700);
    await touch(cdp, "touchEnd", []);
    let trace = await stopTrace(page, "look-ahead");
    const apparent = trace.map((frame) => frame.apparent);
    const steps = trace.slice(1).map((frame, index) => Math.abs(frame.scrollX - trace[index].scrollX));
    check("11 look-ahead moves the camera", Math.max(...trace.map((f) => f.scrollX)) - Math.min(...trace.map((f) => f.scrollX)) > 100);
    check("11 look-ahead never changes world scale", Math.max(...apparent) - Math.min(...apparent) < 0.002, `${Math.min(...apparent).toFixed(4)}..${Math.max(...apparent).toFixed(4)}`);
    check("P3 camera never snaps on reversal", Math.max(...steps) < 70, `max ${Math.max(...steps).toFixed(1)} px/frame at render scale`);

    // 12: every step, including the one that used to stick at 1x.
    const seen = [];
    for (const scale of [1.75, 1.5, 1.25, 1, 1.25, 2]) {
      await hook(page, "setRenderScale", scale);
      await page.waitForTimeout(250);
      const now = (await state(page)).viewport;
      seen.push({ scale, apparent: now.apparentScale, css: now.canvasCss, backing: now.canvasBacking });
      if (scale === 1) await page.screenshot({ path: `${out}/viewport-render-1x.png` });
    }
    traces.renderScale = seen;
    check("12 render scale steps keep world scale", seen.every((entry) => Math.abs(entry.apparent - base.apparentScale) < 0.003), seen.map((entry) => entry.apparent.toFixed(4)).join(" "));
    check("12 canvas box stays the frame size at every scale", seen.every((entry) => Math.abs(entry.css.width - 844) < 1 && Math.abs(entry.css.height - 390) < 1), seen.map((entry) => `${entry.css.width}x${entry.css.height}`).join(" "));
    check("12 backing resolution really changed", new Set(seen.map((entry) => entry.backing.width)).size >= 4, seen.map((entry) => entry.backing.width).join(" "));

    // 13: toolbars come and go.
    const toolbar = [];
    for (const height of [340, 390, 335, 360, 390]) {
      await page.setViewportSize({ width: 844, height });
      await page.waitForTimeout(350);
      const now = await state(page);
      const pad = await box(page, "touch-aim");
      toolbar.push({ height, apparent: now.viewport.apparentScale, backing: now.viewport.canvasBacking.height, padBottom: pad.y + pad.r, pad: pad.r * 2 });
    }
    traces.toolbar = toolbar;
    const afterToolbar = (await state(page)).viewport;
    check("13 toolbar changes do not change world scale", toolbar.every((entry) => Math.abs(entry.apparent - base.apparentScale) < 0.003), toolbar.map((entry) => entry.apparent.toFixed(3)).join(" "));
    check("13 toolbar changes do not resize the canvas", new Set(toolbar.map((entry) => entry.backing)).size === 1, toolbar.map((entry) => entry.backing).join(" "));
    check("13 controls stay inside the shorter viewport", toolbar.every((entry) => entry.padBottom <= entry.height), toolbar.map((entry) => `${Math.round(entry.padBottom)}/${entry.height}`).join(" "));
    check("13 pad size does not change with toolbars", new Set(toolbar.map((entry) => Math.round(entry.pad))).size === 1, toolbar.map((entry) => Math.round(entry.pad)).join(" "));
    check("13 world zoom never changed", afterToolbar.zoomChanges === 0, afterToolbar.zoomChanges);

    // Rotation is a genuine change and must still land correctly.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    check("portrait shows the rotate guard", await page.locator('[data-testid="orientation-guard"]').isVisible());
    await page.setViewportSize(PHONE);
    await page.waitForTimeout(600);
    const rotated = (await state(page)).viewport;
    check("rotating back restores the same world scale", Math.abs(rotated.apparentScale - base.apparentScale) < 0.003, rotated.apparentScale.toFixed(4));
    check("rotating back fills the frame", Math.abs(rotated.canvasCss.width - 844) < 1 && rotated.canvasCss.height >= 390, `${rotated.canvasCss.width}x${rotated.canvasCss.height}`);

    await cdp.send("Input.synthesizePinchGesture", { x: 422, y: 195, scaleFactor: 2, gestureSourceType: "touch" }).catch(() => undefined);
    await page.waitForTimeout(400);
    const pinched = (await state(page)).viewport;
    check("two-finger pinch does not zoom the page", pinched.visual.scale === 1, pinched.visual.scale);
    const box2 = await page.evaluate(() => ({ scrollX, scrollY, overflow: document.documentElement.scrollWidth - innerWidth }));
    check("no document scroll or horizontal overflow in a match", box2.scrollX === 0 && box2.scrollY === 0 && box2.overflow <= 0, JSON.stringify(box2));
    const selectable = await page.evaluate(() => getComputedStyle(document.body).userSelect);
    check("no text selection in a match", selectable === "none", selectable);
    check("no page errors", errors.length === 0, errors[0] ?? "");
    await context.close();

    // Page zoom carried in from the hub.
    const carried = await newPage(PHONE, 3, PHONE);
    await carried.page.goto(`${stack.baseUrl}/`, { waitUntil: "load" });
    await carried.page.waitForTimeout(800);
    const skip = carried.page.locator('[data-testid="onboarding-skip"]');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await carried.page.locator('[data-testid="hub-mode-practice"]').click();
    await carried.cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.4 });
    await carried.page.waitForTimeout(250);
    await carried.page.evaluate(() => document.querySelector('[data-testid="hub-play"]').click());
    await waitLive(carried.page);
    await carried.page.waitForTimeout(300);
    const zoomed = (await state(carried.page)).viewport;
    const pad = await box(carried.page, "touch-aim");
    check("page zoom from the hub is dropped in a match", zoomed.visual.scale === 1, zoomed.visual.scale);
    check("aim pad is inside the visible area after that", pad.x + pad.r <= zoomed.visual.width + zoomed.visual.offsetLeft, `${Math.round(pad.x + pad.r)} of ${zoomed.visual.width}`);
    await carried.context.close();

    const seekPage = await newPage(PHONE, 3, PHONE);
    await seekPage.page.goto(`${stack.baseUrl}/`, { waitUntil: "load" });
    await seekPage.page.waitForTimeout(500);
    const hubMeta = await seekPage.page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
    check("the hub keeps browser zoom", hubMeta.includes("maximum-scale=5"), hubMeta);
    await seekPage.context.close();
  });

  await section("layout", async () => {
    const screens = [
      ["16:9", 640, 360, 2],
      ["16:9", 667, 375, 2],
      ["19.5:9", 844, 390, 3],
      ["19.5:9", 932, 430, 3],
      ["20:9", 800, 360, 3],
      ["20:9", 915, 412, 2.625],
      ["short", 568, 320, 2],
      ["short", 720, 320, 1.5],
      ["tablet", 1024, 600, 2],
    ];
    const ids = ["touch-move", "touch-aim", "touch-jump", "touch-fire", "touch-reload", "touch-grenade", "touch-throw-grenade", "touch-medkit", "touch-swap", "touch-weapon-1", "touch-weapon-2", "touch-weapon-3", "touch-settings"];
    for (const [ratio, width, height, dpr] of screens) {
      for (const safe of [false, true]) {
        const { context, page, cdp } = await newPage({ width, height }, dpr);
        if (safe) {
          await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, left: 47, right: 47, bottom: 21 } });
        }
        await startPractice(page);
        const label = `${ratio} ${width}x${height}@${dpr}${safe ? " notch" : ""}`;
        const audit = await page.evaluate((list) => {
          const found = {};
          for (const id of list) {
            const element = document.querySelector(`[data-testid="${id}"]`);
            if (!element) { found[id] = null; continue; }
            const rect = element.getBoundingClientRect();
            const hits = [[0.5, 0.5], [0.22, 0.5], [0.78, 0.5], [0.5, 0.22], [0.5, 0.78]].filter(([a, b]) => {
              const hit = document.elementFromPoint(rect.left + rect.width * a, rect.top + rect.height * b);
              return hit && (hit === element || element.contains(hit));
            }).length;
            found[id] = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, hits, shown: getComputedStyle(element).visibility !== "hidden" && getComputedStyle(element).display !== "none" };
          }
          return found;
        }, ids);
        const problems = [];
        const rects = Object.entries(audit);
        for (const [id, rect] of rects) {
          if (!rect) { problems.push(`${id} missing`); continue; }
          if (!rect.shown || rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height) problems.push(`${id} clipped`);
          if (rect.hits < 5) problems.push(`${id} blocked ${rect.hits}/5`);
          if (id !== "touch-settings" && Math.min(rect.width, rect.height) < 44) problems.push(`${id} ${Math.round(rect.width)}px`);
        }
        const aim = audit["touch-aim"];
        for (const [id, rect] of rects) {
          if (id === "touch-aim" || !rect) continue;
          if (rect.left < aim.right && rect.right > aim.left && rect.top < aim.bottom && rect.bottom > aim.top) problems.push(`${id} over aim pad`);
        }
        const center = await box(page, "touch-aim");
        await touch(cdp, "touchStart", [onPad(center, 0.6, 0.85, 2)]);
        await page.waitForTimeout(120);
        const live = await state(page);
        await touch(cdp, "touchEnd", []);
        if (!live.touch.aimActive || !live.fire) problems.push("aim pad did not take a real touch");
        check(`14 ${label}: every control visible, tappable, clear of the aim pad`, problems.length === 0, problems.join(", ") || `aim ${Math.round(aim.width)}px at ${Math.round(aim.left)},${Math.round(aim.top)}`);
        if (!safe) await page.screenshot({ path: `${out}/layout-${width}x${height}.png` });
        await context.close();
      }
    }
  });

  await section("portrait", async () => {
    for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932]]) {
      const { context, page, cdp } = await newPage({ width, height }, 3);
      await page.goto(`${stack.baseUrl}/`, { waitUntil: "load" });
      await page.waitForTimeout(700);
      const skip = page.locator('[data-testid="onboarding-skip"]');
      const onboarding = await skip.isVisible().catch(() => false);
      if (onboarding) {
        const reachable = await page.evaluate(() => {
          const form = document.querySelector('[data-testid="onboarding-save"]');
          form?.scrollIntoView({ block: "center" });
          const rect = form?.getBoundingClientRect();
          return rect ? rect.bottom <= innerHeight && rect.top >= 0 : false;
        });
        check(`15 ${width}x${height}: onboarding save is reachable`, reachable);
        await page.screenshot({ path: `${out}/portrait-${width}x${height}-onboarding.png` });
        await skip.scrollIntoViewIfNeeded();
        await skip.click();
        await page.waitForTimeout(300);
      }
      const audit = await page.evaluate(() => {
        const hub = document.querySelector(".hub");
        return {
          scrollHeight: hub.scrollHeight,
          clientHeight: hub.clientHeight,
          overflowY: getComputedStyle(hub).overflowY,
          horizontal: Math.max(hub.scrollWidth - hub.clientWidth, document.documentElement.scrollWidth - innerWidth),
          bodyOverflow: getComputedStyle(document.body).overflowY,
        };
      });
      check(`15 ${width}x${height}: no horizontal overflow`, audit.horizontal <= 0, audit.horizontal);
      const ids = ["hub-mode-online", "hub-mode-practice", "hub-online-quick", "hub-online-create", "hub-play", "hub-edit-profile", "hub-tab-rankings", "hub-settings"];
      const hidden = [];
      for (const id of ids) {
        const element = page.locator(`[data-testid="${id}"]`).first();
        if (!(await element.count())) { hidden.push(`${id} absent`); continue; }
        await element.scrollIntoViewIfNeeded().catch(() => hidden.push(`${id} no scroll`));
        const rect = await element.boundingBox();
        if (!rect || rect.y < -1 || rect.y + rect.height > height + 1) hidden.push(`${id} off screen`);
        else if (Math.min(rect.height, rect.width) < 24) hidden.push(`${id} tiny`);
        else {
          const covered = await element.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return !(hit && (hit === node || node.contains(hit)));
          });
          if (covered) hidden.push(`${id} covered`);
        }
      }
      check(`15 ${width}x${height}: every section can be reached`, hidden.length === 0, hidden.join(", ") || `content ${audit.scrollHeight}, view ${audit.clientHeight}`);
      if (audit.scrollHeight > audit.clientHeight) {
        const hubBefore = await page.evaluate(() => { const hub = document.querySelector(".hub"); hub.scrollTop = 0; return hub.scrollTop; });
        await page.waitForTimeout(100);
        await touch(cdp, "touchStart", [{ x: width / 2, y: height * 0.7, id: 1 }]);
        for (let step = 1; step <= 12; step += 1) {
          await touch(cdp, "touchMove", [{ x: width / 2, y: height * 0.7 - step * 16, id: 1 }]);
          await page.waitForTimeout(16);
        }
        await touch(cdp, "touchEnd", []);
        await page.waitForTimeout(350);
        const scrolled = await page.evaluate(() => document.querySelector(".hub").scrollTop);
        const reach = Math.min(40, audit.scrollHeight - audit.clientHeight - 2);
        check(`15 ${width}x${height}: a real finger drag scrolls the hub`, scrolled >= hubBefore + reach, `scrollTop ${scrolled} of ${audit.scrollHeight - audit.clientHeight}`);
      }
      await page.screenshot({ path: `${out}/portrait-${width}x${height}.png` });
      await page.goto(`${stack.baseUrl}/online`, { waitUntil: "load" });
      await page.waitForTimeout(900);
      const dismiss = page.locator('[data-testid="onboarding-dismiss"]');
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
      const create = page.locator('[data-testid="create-room"]');
      await create.scrollIntoViewIfNeeded().catch(() => undefined);
      const rect = await create.boundingBox();
      check(`15 ${width}x${height}: online lobby reaches its button`, rect && rect.y + rect.height <= height + 1 && rect.y >= -1, rect ? `${Math.round(rect.y)}` : "none");
      await page.screenshot({ path: `${out}/portrait-${width}x${height}-lobby.png` });
      await context.close();
    }
  });

  const recordCountdown = (page) =>
    page.addInitScript(() => {
      window.__cd = [];
      const log = (entry) => window.__cd.push({ at: Date.now(), t: performance.now(), ...entry });
      let lastKey = "";
      let lastPhase = "";
      const step = () => {
        const element = document.querySelector('[data-testid="match-countdown"]');
        const key = element ? `${element.dataset.stage}:${element.dataset.digit ?? ""}` : "none";
        if (key !== lastKey) {
          lastKey = key;
          log({ stage: element?.dataset.stage ?? null, digit: element?.dataset.digit ?? null });
        }
        const phase = window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase ?? "";
        if (phase !== lastPhase) {
          lastPhase = phase;
          log({ phase });
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  const judgeCountdown = (label, log) => {
    const digits = log.filter((entry) => entry.stage === "count");
    const order = digits.map((entry) => entry.digit).join(",");
    check(`16 ${label}: final seconds run 3, 2, 1`, order.endsWith("3,2,1"), order);
    const gaps = digits.slice(-3).slice(1).map((entry, index) => entry.t - digits.slice(-3)[index].t);
    check(`16 ${label}: digits are one second apart`, gaps.length === 2 && gaps.every((gap) => Math.abs(gap - 1000) < 170), gaps.map((gap) => gap.toFixed(0)).join(" "));
    const go = log.find((entry) => entry.stage === "go");
    const live = log.find((entry) => entry.phase === "live");
    check(`17 ${label}: GO lands on the authoritative live transition`, go && live && Math.abs(go.t - live.t) < 120, go && live ? `${(go.t - live.t).toFixed(0)} ms` : "missing");
    const lastDigit = digits.at(-1);
    check(`17 ${label}: no dead pause between 1 and GO`, go && lastDigit && go.t - lastDigit.t < 1250, go && lastDigit ? `${(go.t - lastDigit.t).toFixed(0)} ms` : "missing");
    const after = log[log.indexOf(go) + 1];
    check(`16 ${label}: GO clears`, after && after.stage === null, after ? `${(after.t - go.t).toFixed(0)} ms` : "stuck");
    traces[`countdown-${label}`] = log;
  };

  await section("countdown", async () => {
    // Practice.
    {
      const { context, page, cdp, errors } = await newPage();
      await recordCountdown(page);
      await page.goto(`${stack.baseUrl}/practice?difficulty=easy`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 30_000 });
      await page.waitForSelector('[data-testid="match-countdown"][data-stage="count"]', { timeout: 15_000 });
      const move = await box(page, "touch-move");
      const aim = await box(page, "touch-aim");
      // A tap before GO is a queued action and must be dropped.
      await touch(cdp, "touchStart", [onPad(aim, 0.2, 0.8, 5)]);
      await page.waitForTimeout(40);
      await touch(cdp, "touchEnd", []);
      await page.waitForSelector('[data-testid="match-countdown"][data-digit="2"]', { timeout: 5000 });
      const backdrop = await page.evaluate(() => {
        const element = document.querySelector('[data-testid="match-backdrop"]');
        const elementCss = element ? getComputedStyle(element) : null;
        const scrim = document.querySelector(".match-countdown");
        return { present: Boolean(element), pixels: element ? element.width * element.height : 0, filter: elementCss?.filter, pointer: getComputedStyle(scrim).pointerEvents };
      });
      check("16 practice: backdrop is one cached low-resolution frame", backdrop.present && backdrop.pixels < 12_000 && backdrop.filter === "none", JSON.stringify(backdrop));
      check("16 overlay never takes pointer events", backdrop.pointer === "none");
      // Thumb already holding left stick before GO.
      await touch(cdp, "touchStart", [onPad(move, 0, 0.9, 1)]);
      const before = await state(page);
      await startTrace(page);
      await waitLive(page);
      await page.waitForTimeout(950);
      await touch(cdp, "touchEnd", []);
      const trace = await stopTrace(page, "countdown-hold-move");
      const log = await page.evaluate(() => window.__cd);
      judgeCountdown("practice", log);
      const liveAt = log.find((entry) => entry.phase === "live").t;
      const firstMove = trace.find((frame) => Math.abs(frame.x - before.x) > 0.5);
      check("18 practice: no movement before GO", firstMove && firstMove.t >= liveAt - 20, firstMove ? `${(firstMove.t - liveAt).toFixed(0)} ms after live` : "never moved");
      check("18 practice: a held stick moves on the first live frames", firstMove && firstMove.t - liveAt < 120, firstMove ? `${(firstMove.t - liveAt).toFixed(0)} ms` : "never moved");
      const firedAfterGo = trace.filter((frame) => frame.t >= liveAt && frame.fire).length;
      check("P4 pre-match tap did not fire at GO", firedAfterGo === 0, `${firedAfterGo} frames`);
      const backdropGone = await page.locator('[data-testid="match-backdrop"]').count();
      check("16 backdrop removed on GO", backdropGone === 0);
      check("practice countdown has no page errors", errors.length === 0, errors[0] ?? "");
      await context.close();

      // Screenshots stall the page, so they get their own run.
      const shots = await newPage();
      await shots.page.goto(`${stack.baseUrl}/practice?difficulty=easy`, { waitUntil: "load" });
      await shots.page.waitForSelector('[data-testid="match-countdown"][data-digit="2"]', { timeout: 15_000 });
      await shots.page.screenshot({ path: `${out}/countdown-practice-2.png` });
      await shots.page.waitForSelector('[data-testid="match-countdown"][data-stage="go"]', { timeout: 5000 });
      await shots.page.screenshot({ path: `${out}/countdown-practice-go.png` });
      await shots.context.close();
    }
    // Online, two clients, one room, at real-world latency.
    {
      stack.proxy.set({ rttMs: 300, jitterMs: 40 });
      const a = await newPage();
      const b = await newPage();
      await recordCountdown(a.page);
      await recordCountdown(b.page);
      await startOnline(a.page, false);
      const roomId = await a.page.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().roomId);
      await b.page.goto(`${stack.baseUrl}/online?room=${roomId}`, { waitUntil: "load" });
      await b.page.waitForTimeout(600);
      const dismiss = b.page.locator('[data-testid="onboarding-dismiss"]');
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
      const join = b.page.locator('[data-testid="join-invite-room"]');
      await join.waitFor({ timeout: 8000 }).catch(() => undefined);
      if (await join.isVisible().catch(() => false)) await join.click();
      await a.page.waitForSelector('[data-testid="match-countdown"][data-stage="waiting"]', { timeout: 15_000 });
      await a.page.screenshot({ path: `${out}/countdown-online-waiting.png` });
      await a.page.waitForSelector('[data-testid="match-countdown"][data-digit="3"]', { timeout: 15_000 });
      await a.page.screenshot({ path: `${out}/countdown-online-3.png` });
      await a.page.waitForSelector('[data-testid="match-countdown"][data-digit="1"]', { timeout: 5000 });
      await a.page.screenshot({ path: `${out}/countdown-online-1.png` });
      await waitLive(a.page);
      await a.page.waitForSelector('[data-testid="match-countdown"][data-stage="go"]', { timeout: 2000 });
      await a.page.screenshot({ path: `${out}/countdown-online-go.png` });
      await a.page.waitForTimeout(1500);
      const { id } = await state(a.page);
      const aim = await box(a.page, "touch-aim");
      await touch(a.cdp, "touchStart", [onPad(aim, 0.3, 0.8, 2)]);
      await a.page.waitForTimeout(1100);
      await touch(a.cdp, "touchEnd", []);
      await a.page.waitForTimeout(500);
      const online = await state(a.page);
      check("18 online: firing works right after GO", online.ammo < 20 && id, `ammo ${online.ammo}`);
      await a.context.close();
      await b.context.close();

      // Timing pass with no screenshots, which stall the whole browser's GPU.
      const c = await newPage();
      const d = await newPage();
      await recordCountdown(c.page);
      await recordCountdown(d.page);
      await startOnline(c.page, false);
      const room = await c.page.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().roomId);
      await d.page.goto(`${stack.baseUrl}/online?room=${room}`, { waitUntil: "load" });
      await d.page.waitForTimeout(600);
      const skipGuide = d.page.locator('[data-testid="onboarding-dismiss"]');
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      const joinRoom = d.page.locator('[data-testid="join-invite-room"]');
      await joinRoom.waitFor({ timeout: 8000 }).catch(() => undefined);
      if (await joinRoom.isVisible().catch(() => false)) await joinRoom.click();
      await waitLive(c.page);
      await waitLive(d.page);
      await c.page.waitForTimeout(1500);
      const logC = await c.page.evaluate(() => window.__cd);
      const logD = await d.page.evaluate(() => window.__cd);
      judgeCountdown("online 300 ms", logC);
      const goC = logC.find((entry) => entry.stage === "go");
      const goD = logD.find((entry) => entry.stage === "go");
      check("P4 two clients show GO together", goD && Math.abs(goC.at - goD.at) < 200, goD ? `${Math.abs(goC.at - goD.at)} ms apart` : "second client saw no GO");
      await c.context.close();
      await d.context.close();
      stack.proxy.set({ rttMs: 0, jitterMs: 0 });
    }
  });

  await section("reconnect", async () => {
    const { context, page, cdp, errors } = await newPage();
    await recordCountdown(page);
    await startOnline(page, false);
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true, null, { timeout: 30_000 });
    await page.waitForSelector('[data-testid="match-countdown"]', { timeout: 5000 });
    check("19 reload during countdown resumes the countdown", true);
    await page.waitForSelector('[data-testid="match-countdown"][data-digit="1"]', { timeout: 15_000 });
    await waitLive(page);
    await page.waitForSelector('[data-testid="match-countdown"][data-stage="go"]', { timeout: 3000 });
    check("19 resumed client still gets GO", true);
    await hook(page, "guard");
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "load" });
    await waitLive(page);
    await page.waitForTimeout(1200);
    const aim = await box(page, "touch-aim");
    const before = (await state(page)).ammo;
    await touch(cdp, "touchStart", [onPad(aim, 0.3, 0.8, 2)]);
    await page.waitForTimeout(600);
    await touch(cdp, "touchEnd", []);
    await page.waitForTimeout(300);
    const after = await state(page);
    check("19 controls work after a live reconnect", after.ammo < before || after.reloading, `${before} -> ${after.ammo}`);
    check("19 no page errors", errors.length === 0, errors[0] ?? "");
    await context.close();
  });

  await section("arsenal", async () => {
    const { context, page, cdp, errors } = await newPage();
    await startPractice(page);
    const aim = await box(page, "touch-aim");
    const { id } = await state(page);
    const weapons = ALL_WEAPONS;
    let fired = 0;
    for (const weaponId of weapons) {
      await hook(page, "giveWeapon", id, weaponId);
      await page.waitForTimeout(250);
      const before = await state(page);
      await touch(cdp, "touchStart", [onPad(aim, 0.3, 0.8, 2)]);
      await page.waitForTimeout(120);
      await touch(cdp, "touchEnd", []);
      await page.waitForTimeout(250);
      const after = await state(page);
      if (after.ammo < before.ammo) fired += 1;
      else console.log("NO SHOT", weaponId, before.weaponId, before.ammo, after.ammo);
    }
    check("20 touch pad fires every tested weapon", fired === weapons.length, `${fired}/${weapons.length}`);
    const grenades = await page.evaluate(() => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return { contact: p.hud.grenadeContact, frag: p.hud.grenadeFrag, stinking: p.hud.grenadeStinking };
    });
    const total = () => page.evaluate(() => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return p.hud.grenadeContact + p.hud.grenadeFrag + p.hud.grenadeStinking;
    });
    const beforeThrow = await total();
    if (beforeThrow > 0) {
      await page.locator('[data-testid="touch-grenade"]').tap();
      await page.waitForTimeout(200);
      await page.locator('[data-testid="touch-throw-grenade"]').tap();
      await page.waitForTimeout(500);
      check("20 grenade selection and throw work beside the pads", (await total()) < beforeThrow, JSON.stringify(grenades));
    }
    check("20 no page errors", errors.length === 0, errors[0] ?? "");
    await context.close();
  });

  await section("stress", async () => {
    const { context, page, cdp, errors } = await newPage();
    await startPractice(page, "merciless");
    const move = await box(page, "touch-move");
    const aim = await box(page, "touch-aim");
    await startTrace(page);
    for (let round = 0; round < 60; round += 1) {
      const a = round * 1.3;
      const left = onPad(move, a, 0.9, 1);
      const right = onPad(aim, -a, 0.8, 2);
      await touch(cdp, "touchStart", [left]);
      await touch(cdp, "touchStart", [left, right]);
      await page.waitForTimeout(40);
      await touch(cdp, "touchMove", [onPad(move, a + 1, 0.5, 1), onPad(aim, a * 2, 0.3, 2)]);
      await page.waitForTimeout(40);
      if (round % 7 === 0) {
        await touch(cdp, "touchCancel", []);
      } else {
        if (round % 3 === 0) await touch(cdp, "touchEnd", [left]);
        await touch(cdp, "touchEnd", []);
      }
    }
    await page.waitForTimeout(250);
    const trace = await stopTrace(page, "stress");
    const final = await state(page);
    const held = trace.slice(-5);
    check("P6 no stuck pointer state after 60 grips", !final.touch.fire && !final.touch.aimActive && final.touch.moveX === 0 && !final.touch.jumpHeld, JSON.stringify(final.touch));
    check("P6 stress run had no frame with stale fire", held.every((frame) => !frame.fire));
    check("P6 no page errors", errors.length === 0, errors[0] ?? "");
    await context.close();
  });
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  writeFileSync(`${out}/traces.json`, JSON.stringify(traces));
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  for (const entry of failed) console.log(`FAILED  ${entry.name}  ${entry.detail}`);
  await browser.close();
  await stack.stop();
  process.exit(failed.length ? 1 : 0);
}
