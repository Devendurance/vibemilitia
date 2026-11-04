/**
 * P3B-C grenade stress performance check.
 *
 * Requires a production build and server:
 *   HEADED=1 BASE_URL=http://localhost:3101 npm run verify:online:grenade-perf
 *
 * Phase 1 measures one browser human with seven bots. Phase 2 fills the room
 * with seven idle SDK humans, throws all three grenade types, and measures
 * while multiple stinking clouds and grenades are active. A second concurrent
 * room stays live throughout to measure the combined server load.
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const executablePath = process.env.CHROME_PATH;
const headed = process.env.HEADED === "1";
const artifactDir = process.env.ARTIFACT_DIR ?? "";

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const waitOnlineReady = async (page) => {
  await page.waitForFunction(
    () => Boolean(window.__VIBE_MILITIA_ONLINE__),
    null,
    { timeout: 30000 },
  );
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
};

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const snapshot = value.snapshot;
    const local = snapshot?.participants.find(
      (participant) => participant.id === value.sessionId,
    );
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: snapshot?.phase ?? null,
      humans: snapshot?.humans ?? 0,
      bots: snapshot?.bots ?? 0,
      local: local
        ? {
            x: local.x,
            y: local.y,
            alive: local.alive,
            health: local.health,
            grenadeContact: local.grenadeContact,
            grenadeFrag: local.grenadeFrag,
            grenadeStinking: local.grenadeStinking,
          }
        : null,
      grenades: snapshot?.grenades ?? [],
      clouds: snapshot?.toxicClouds ?? [],
      pickups: snapshot?.pickups ?? [],
      loot: snapshot?.loot ?? [],
      serverTickMs: snapshot?.serverTickMs ?? 0,
      snapshotBytes: snapshot ? JSON.stringify(snapshot).length : 0,
    };
  });

const measureFps = (page, durationMs) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = (now) => {
          frames += 1;
          if (now - start < duration) {
            requestAnimationFrame(step);
          } else {
            resolve((frames * 1000) / (now - start));
          }
        };
        requestAnimationFrame(step);
      }),
    durationMs,
  );

const collectTicks = async (page, samples) => {
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    await page.waitForTimeout(100);
    const state = await probe(page);
    if (state.serverTickMs > 0) values.push(state.serverTickMs);
  }
  values.sort((left, right) => left - right);
  return {
    average:
      values.reduce((total, value) => total + value, 0) /
      Math.max(1, values.length),
    p95: values[Math.floor(values.length * 0.95)] ?? 0,
    max: values[values.length - 1] ?? 0,
    samples: values.length,
  };
};

const maxOverlap = (clouds) => {
  let maximum = 0;
  for (const cloud of clouds) {
    let count = 0;
    for (const other of clouds) {
      if (
        Math.hypot(cloud.x - other.x, cloud.y - other.y) <=
        cloud.radius + other.radius
      ) {
        count += 1;
      }
    }
    maximum = Math.max(maximum, count);
  }
  return maximum;
};

const sendInput = (room, seq, aim, slot, throwGrenade) => {
  room.send("input", {
    seq,
    moveX: 0,
    jump: false,
    jumpHeld: false,
    fire: false,
    reload: false,
    weapon: null,
    aim,
    useMedkit: false,
    grenadeSlot: slot,
    throwGrenade,
  });
};

const throwStinkingAt = (room, snapshot, targetId) => {
  const own = snapshot?.participants?.find(
    (participant) => participant.id === room.sessionId,
  );
  const target = snapshot?.participants?.find(
    (participant) => participant.id === targetId,
  );
  if (!own || !target) return false;
  const originX = own.x + 28;
  const originY = own.y - 58;
  const targetY = target.y - 59;
  const speed = 760;
  const gravity = 1400;
  const flight = Math.max(
    0.12,
    Math.hypot(target.x - originX, targetY - originY) / speed,
  );
  const aimX = target.x;
  const aimY = targetY - 0.5 * gravity * flight * flight;
  const aim = Math.atan2(aimY - originY, aimX - originX);
  sendInput(room, 1, aim, 2, true);
  setTimeout(() => sendInput(room, 2, aim, 2, false), 60);
  return true;
};

const browserEliminate = async (page, count) => {
  return page.evaluate((targetCount) => {
    const value = window.__VIBE_MILITIA_ONLINE__;
    const probe = value?.getProbe();
    const snapshot = probe?.snapshot;
    if (!value || !probe || !snapshot) return 0;
    const victims = snapshot.participants
      .filter(
        (participant) =>
          participant.alive && participant.id !== value.sessionId,
      )
      .slice(0, targetCount);
    for (const victim of victims) {
      probe.testHooks.eliminate(victim.id, "grenade");
    }
    return victims.length;
  }, count);
};

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: !headed,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const secondContext = await browser.newContext({
  viewport: { width: 1200, height: 800 },
});
const secondPage = await secondContext.newPage();
const fillers = [];

try {
  await page.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(page);
  const roomA = await probe(page);
  check(
    "phase one has one human and seven bots",
    roomA.humans === 1 && roomA.bots === 7,
    `humans=${roomA.humans} bots=${roomA.bots}`,
  );

  const baselineVictims = await browserEliminate(page, 2);
  await page.waitForTimeout(650);
  await page.waitForTimeout(1200);
  const baselineTicks = await collectTicks(page, 20);
  const baselineFps = await measureFps(page, 2500);
  const baselineState = await probe(page);
  check(
    "dynamic loot is active during the baseline measurement",
    baselineState.loot.length >= 3,
    `victims=${baselineVictims} loot=${baselineState.loot.length}`,
  );

  await secondPage.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await secondPage.waitForTimeout(800);
  await secondPage.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(secondPage);
  const roomB = await probe(secondPage);
  check("second concurrent room is live", roomB.phase === "live");

  for (let index = 0; index < 7; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomA.roomId, {
      name: `STRESS-${index + 1}`,
    });
    const filler = { client, room, snapshot: null };
    room.onMessage("snapshot", (snapshot) => {
      filler.snapshot = snapshot;
    });
    room.onMessage("events", () => undefined);
    fillers.push(filler);
  }
  await page.waitForTimeout(1600);
  const filled = await probe(page);
  check(
    "phase two has eight humans and no bots",
    filled.humans === 8 && filled.bots === 0,
    `humans=${filled.humans} bots=${filled.bots}`,
  );

  const stressVictims = await browserEliminate(page, 2);
  await page.waitForTimeout(500);
  const lootState = await probe(page);
  check(
    "the stress room carries dynamic elimination loot",
    lootState.loot.length >= 3,
    `victims=${stressVictims} loot=${lootState.loot.length}`,
  );

  // Browser player: one of each grenade, with contact and frag near the feet.
  await page.keyboard.press("Digit6");
  await page.waitForTimeout(120);
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(720);
  await page.keyboard.press("Digit4");
  await page.waitForTimeout(120);
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(720);
  await page.keyboard.press("Digit5");
  await page.waitForTimeout(120);
  await page.keyboard.press("KeyG");

  for (const filler of fillers) {
    if (!filler.snapshot) {
      filler.snapshot = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500);
        const handler = (snapshot) => {
          clearTimeout(timer);
          resolve(snapshot);
        };
        filler.room.onMessage("snapshot", handler);
      });
    }
    throwStinkingAt(filler.room, filler.snapshot, roomA.sessionId);
  }

  await page.waitForTimeout(250);
  const flightState = await probe(page);
  const peakGrenades = flightState.grenades.length;
  await page.waitForTimeout(1050);
  const stressState = await probe(page);
  const activeGrenades = stressState.grenades.length;
  const activeClouds = stressState.clouds.length;
  const overlap = maxOverlap(stressState.clouds);
  const peakLoot = Math.max(
    baselineState.loot.length,
    lootState.loot.length,
    flightState.loot.length,
    stressState.loot.length,
  );
  console.log("STRESS ENTITIES", {
    participants: stressState.humans + stressState.bots,
    peakGrenades,
    grenades: activeGrenades,
    clouds: activeClouds,
    maxOverlap: overlap,
    pickups: stressState.pickups.length,
    loot: stressState.loot.length,
    peakLoot,
    snapshotBytes: stressState.snapshotBytes,
  });

  if (artifactDir) {
    await page.screenshot({
      path: `${artifactDir}/09-grenade-stress-battle.png`,
    });
  }

  await page.bringToFront();
  const stressFps = await measureFps(page, 4000);
  const stressTicks = await collectTicks(page, 40);
  const finalState = await probe(page);

  check(
    "the stress scene has several active grenades",
    peakGrenades >= 2,
    `peak=${peakGrenades}`,
  );
  check(
    "the stress scene has active grenades or clouds",
    activeGrenades + activeClouds > 0,
    `grenades=${activeGrenades} clouds=${activeClouds}`,
  );
  check(
    "the stress scene has overlapping toxic clouds",
    overlap >= 2,
    `maxOverlap=${overlap} clouds=${activeClouds}`,
  );
  check(
    "dynamic loot remains bounded during the stress scene",
    peakLoot >= 3 && stressState.loot.length <= 48,
    `peakLoot=${peakLoot} active=${stressState.loot.length}`,
  );
  check(
    "client keeps a playable frame rate",
    (headed ? stressFps >= 45 : stressFps >= 25),
    `${Math.round(stressFps)} fps`,
  );
  check(
    "average server tick stays under 8 ms",
    stressTicks.average < 8,
    `${stressTicks.average.toFixed(2)} ms`,
  );
  check(
    "p95 server tick stays under 16 ms",
    stressTicks.p95 < 16,
    `${stressTicks.p95.toFixed(2)} ms`,
  );
  check(
    "both rooms remain live",
    finalState.phase === "live" &&
      (await probe(secondPage)).phase === "live",
  );
  check(
    "no browser page errors",
    pageErrors.length === 0,
    pageErrors.slice(0, 3).join(" | "),
  );

  console.log("PERF BASE", {
    fps: Math.round(baselineFps),
    tickAverage: Number(baselineTicks.average.toFixed(3)),
    tickP95: Number(baselineTicks.p95.toFixed(3)),
    tickMax: Number(baselineTicks.max.toFixed(3)),
    humans: baselineState.humans,
    bots: baselineState.bots,
    grenades: baselineState.grenades.length,
    clouds: baselineState.clouds.length,
    loot: baselineState.loot.length,
    snapshotBytes: baselineState.snapshotBytes,
  });
  console.log("PERF STRESS", {
    fps: Math.round(stressFps),
    tickAverage: Number(stressTicks.average.toFixed(3)),
    tickP95: Number(stressTicks.p95.toFixed(3)),
    tickMax: Number(stressTicks.max.toFixed(3)),
    humans: finalState.humans,
    bots: finalState.bots,
    peakGrenades,
    grenades: activeGrenades,
    clouds: activeClouds,
    maxOverlap: overlap,
    peakLoot,
    loot: stressState.loot.length,
    snapshotBytes: stressState.snapshotBytes,
    samples: stressTicks.samples,
  });

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.log("FAILURES:", failed.map((entry) => entry.name).join(", "));
    process.exitCode = 1;
  }
} finally {
  for (const filler of fillers) {
    try {
      await filler.room.leave();
    } catch {
      // ignore cleanup errors
    }
  }
  await context.close();
  await secondContext.close();
  await browser.close();
}
