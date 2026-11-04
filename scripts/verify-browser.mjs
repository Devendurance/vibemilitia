/**
 * Browser smoke test for the P1 free-for-all arena.
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

const probe = () => page.evaluate(() => window.__VIBE_MILITIA__.getProbe());
const waitForLive = async () => {
  await page.waitForFunction(
    () => window.__VIBE_MILITIA__?.getProbe().match.phase === "live",
    null,
    { timeout: 6000 },
  );
};

const findVisibleTarget = (snapshot) =>
  snapshot.drones
    .filter((drone) => drone.alive && drone.sight)
    .map((drone) => ({
      ...drone,
      screenX: (drone.x - snapshot.camera.scrollX) * snapshot.camera.zoom,
      screenY: (drone.y - snapshot.camera.scrollY) * snapshot.camera.zoom,
    }))
    .filter(
      (drone) =>
        drone.screenX > 60 &&
        drone.screenX < 1380 &&
        drone.screenY > 60 &&
        drone.screenY < 750,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - snapshot.player.x, a.y - snapshot.player.y) -
        Math.hypot(b.x - snapshot.player.x, b.y - snapshot.player.y),
    )[0] ?? null;

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
    await page.screenshot({ path: `${artifactDir}/p1-arena.png` });
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
      corners: [
        alphaAt(0, 0),
        alphaAt(canvas.width - 1, 0),
        alphaAt(0, canvas.height - 1),
        alphaAt(canvas.width - 1, canvas.height - 1),
      ],
    };
  });
  check("cutout is a real PNG", png.width > 500 && png.height > 500, `${png.width}x${png.height}`);
  check("cutout corners are transparent", png.corners.every((value) => value === 0), JSON.stringify(png.corners));
  check("cutout has substantial transparency", png.transparentRatio > 0.2, png.transparentRatio.toFixed(3));

  const initial = await probe();
  check(
    "arena boots with four FFA combatants",
    initial.drones.length === 3 &&
      initial.hud.standings.length === 4 &&
      initial.hud.matchPhase === "live",
  );
  check("all three weapons are present", initial.hud.weaponSlots.length === 3);
  check("match clock is running", initial.hud.matchTimeRemainingMs <= 90_000);

  const clockBefore = initial.hud.matchTimeRemainingMs;
  const perfWallStart = Date.now();
  const perfGameStart = initial.hud.uptimeMs;
  await page.waitForTimeout(1500);
  const perf = await probe();
  const clockAfter = perf.hud.matchTimeRemainingMs;
  const perfRatio = (perf.hud.uptimeMs - perfGameStart) / (Date.now() - perfWallStart);
  console.log(`INFO  game loop real-time ratio  ${perfRatio.toFixed(2)}`);
  check("match clock counts down", clockAfter < clockBefore, `${Math.round(clockBefore)} -> ${Math.round(clockAfter)}`);

  const x0 = initial.player.x;
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(220);
  const moved = await probe();
  check("horizontal movement", moved.player.x > x0 + 50, `${Math.round(x0)} -> ${Math.round(moved.player.x)}`);
  check("camera follows the player", moved.camera.scrollX >= 0 && moved.camera.scrollX < 3600);

  await page.keyboard.down("Space");
  await page.waitForTimeout(320);
  const airborne = await probe();
  await page.waitForTimeout(600);
  const thrusting = await probe();
  await page.keyboard.up("Space");
  check(
    "jump and jetpack respond",
    airborne.player.y < 1330 ||
      airborne.player.velocityY < 0 ||
      thrusting.player.fuel < 100,
    `fuel=${Math.round(thrusting.player.fuel)}`,
  );

  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw new Error("Canvas was not mounted");
  const aimSnapshot = await probe();
  const clearAimX = aimSnapshot.player.x + 28 - aimSnapshot.camera.scrollX;
  await page.mouse.move(canvas.x + clearAimX, canvas.y + 36);

  const weaponIds = ["vibe-rifle", "scatter-blaster", "vibe-lance"];
  for (let slot = 1; slot <= 3; slot += 1) {
    await page.keyboard.press(`Digit${slot}`);
    await page.waitForTimeout(160);
    const equipped = await probe();
    check(
      `weapon ${slot} equips`,
      equipped.player.weaponId === weaponIds[slot - 1] &&
        equipped.player.weaponSlot === slot,
      equipped.player.weaponId,
    );
    const ammoBefore = equipped.player.ammo;
    const shotsBefore = equipped.player.shotsFired;
    await page.mouse.down();
    await page.waitForTimeout(140);
    await page.mouse.up();
    await page.waitForTimeout(140);
    const fired = await probe();
    const pellets = fired.player.shotsFired - shotsBefore;
    check(
      `weapon ${slot} fires`,
      fired.player.ammo < ammoBefore,
      `${ammoBefore} -> ${fired.player.ammo}`,
    );
    if (slot === 2) {
      check(
        "scatter blaster fires a pellet spread",
        pellets === 7,
        `pellets=${pellets}`,
      );
    }
    if (slot === 3) {
      check(
        "vibe lance fires a single precision round",
        pellets === 1,
        `rounds=${pellets}`,
      );
    }
  }

  await page.keyboard.press("Digit1");
  await page.waitForTimeout(150);
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(1700);
  const reloaded = await probe();
  check(
    "reload restores the magazine",
    reloaded.player.ammo === 20 && reloaded.player.reloading === false,
  );

  let killedDroneId = null;
  let lastTargetId = null;
  let observedDeath = false;
  let deathKiller = null;
  let deathOverlaySeen = false;
  let respawnSpawn = null;
  let respawnMinDistance = null;

  for (let round = 0; round < 30 && !killedDroneId; round += 1) {
    const snapshot = await probe();
    if (snapshot.hud.playerEliminations > 0) {
      killedDroneId =
        lastTargetId ??
        snapshot.drones.find((drone) => !drone.alive)?.id ??
        "unknown";
      break;
    }
    if (snapshot.player.dead) {
      observedDeath = true;
      deathKiller = snapshot.hud.lastKillerName;
      deathOverlaySeen =
        (await page.locator(".death-overlay").getAttribute("class"))?.includes(
          "is-visible",
        ) ?? false;
      await page.waitForFunction(
        () => window.__VIBE_MILITIA__?.getProbe().player.dead === false,
        null,
        { timeout: 6000 },
      );
      const respawned = await probe();
      respawnSpawn = respawned.spawnPoints.find(
        (spawn) =>
          Math.abs(spawn.x - respawned.player.x) < 2 &&
          Math.abs(spawn.y - respawned.player.y) < 2,
      );
      respawnMinDistance = Math.min(
        ...respawned.drones
          .filter((drone) => drone.alive)
          .map((drone) =>
            Math.hypot(drone.x - respawned.player.x, drone.y - respawned.player.y),
          ),
      );
      continue;
    }
    if (snapshot.player.ammo === 0 || snapshot.player.reloading) {
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(1200);
      continue;
    }

    const target = findVisibleTarget(snapshot);
    if (!target) {
      await page.waitForTimeout(250);
      continue;
    }
    lastTargetId = target.id;

    let previous = {
      x: target.x,
      y: target.y,
      at: performance.now(),
    };
    let aimX = target.screenX;
    let aimY = target.screenY;
    await page.mouse.move(canvas.x + aimX, canvas.y + aimY);
    await page.mouse.down();
    for (let step = 0; step < 14; step += 1) {
      await page.waitForTimeout(80);
      const live = await probe();
      const tracked = live.drones.find((drone) => drone.id === target.id);
      if (!tracked?.alive) break;
      const now = performance.now();
      const elapsed = Math.max(1, now - previous.at) / 1000;
      const velocityX = (tracked.x - previous.x) / elapsed;
      const velocityY = (tracked.y - previous.y) / elapsed;
      const distance = Math.hypot(
        tracked.x - live.player.x,
        tracked.y - live.player.y,
      );
      const flightSeconds = distance / 1750;
      const predictedX = tracked.x + velocityX * flightSeconds;
      const predictedY = tracked.y + velocityY * flightSeconds;
      aimX = (predictedX - live.camera.scrollX) * live.camera.zoom;
      aimY = (predictedY - live.camera.scrollY) * live.camera.zoom;
      if (aimX > 20 && aimX < 1420 && aimY > 20 && aimY < 790) {
        await page.mouse.move(canvas.x + aimX, canvas.y + aimY);
      }
      previous = { x: tracked.x, y: tracked.y, at: now };
      if (live.player.ammo === 0) break;
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await probe();
    if (after.hud.playerEliminations > 0) {
      killedDroneId =
        lastTargetId ??
        after.drones.find((drone) => !drone.alive)?.id ??
        "unknown";
    }
  }

  const afterKill = await probe();
  check(
    "player scoring records an elimination",
    afterKill.hud.playerEliminations > 0,
    `eliminations=${afterKill.hud.playerEliminations}`,
  );
  const playerRow = afterKill.hud.standings.find((entry) => entry.isPlayer);
  check("leaderboard reflects the score", (playerRow?.score ?? 0) > 0);
  check(
    "hit confirmation counters advance",
    afterKill.counters.playerBulletHitsBot > 0,
    `hits=${afterKill.counters.playerBulletHitsBot}`,
  );
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/p1-combat.png` });
  }

  let botRespawned = false;
  if (killedDroneId && killedDroneId !== "unknown") {
    for (let step = 0; step < 18; step += 1) {
      await page.waitForTimeout(350);
      const snapshot = await probe();
      const drone = snapshot.drones.find((entry) => entry.id === killedDroneId);
      if (drone?.alive) {
        botRespawned = true;
        break;
      }
    }
  }
  check("eliminated bots respawn into the match", botRespawned);

  let terrainOverlaps = 0;
  let pathingObserved = false;
  let thrustObserved = false;
  for (let step = 0; step < 20; step += 1) {
    await page.waitForTimeout(220);
    const snapshot = await probe();
    for (const drone of snapshot.drones) {
      if (drone.thrusting) thrustObserved = true;
      if (drone.pathLength > 0) pathingObserved = true;
      if (!drone.alive) continue;
      for (const platform of snapshot.platforms) {
        const overlapX =
          Math.min(drone.bodyX + drone.bodyWidth, platform.x + platform.width) -
          Math.max(drone.bodyX, platform.x);
        const overlapY =
          Math.min(drone.bodyY + drone.bodyHeight, platform.y + platform.height) -
          Math.max(drone.bodyY, platform.y);
        if (overlapX > 4 && overlapY > 4) {
          terrainOverlaps += 1;
        }
      }
    }
    if (snapshot.player.dead && !observedDeath) {
      observedDeath = true;
      deathKiller = snapshot.hud.lastKillerName;
      deathOverlaySeen =
        (await page.locator(".death-overlay").getAttribute("class"))?.includes(
          "is-visible",
        ) ?? false;
      await page.waitForFunction(
        () => window.__VIBE_MILITIA__?.getProbe().player.dead === false,
        null,
        { timeout: 6000 },
      );
      const respawned = await probe();
      respawnSpawn = respawned.spawnPoints.find(
        (spawn) =>
          Math.abs(spawn.x - respawned.player.x) < 2 &&
          Math.abs(spawn.y - respawned.player.y) < 2,
      );
      respawnMinDistance = Math.min(
        ...respawned.drones
          .filter((drone) => drone.alive)
          .map((drone) =>
            Math.hypot(drone.x - respawned.player.x, drone.y - respawned.player.y),
          ),
      );
    }
  }
  check("bots do not phase through platforms", terrainOverlaps === 0, `overlaps=${terrainOverlaps}`);
  check("bots use navigation paths", pathingObserved);
  check("bots use vertical thrusters", thrustObserved);

  if (!observedDeath) {
    // A stationary player can sit behind cover with no bot line of sight.
    // Close distance with the nearest live bot so the death path is exercised
    // under normal combat instead of relying on the previous kill position.
    for (let step = 0; step < 70; step += 1) {
      const snapshot = await probe();
      if (snapshot.player.dead) {
        observedDeath = true;
        deathKiller = snapshot.hud.lastKillerName;
        deathOverlaySeen =
          (await page.locator(".death-overlay").getAttribute("class"))?.includes(
            "is-visible",
          ) ?? false;
        break;
      }
      const nearest = snapshot.drones
        .filter((drone) => drone.alive)
        .sort(
          (a, b) =>
            Math.hypot(a.x - snapshot.player.x, a.y - snapshot.player.y) -
            Math.hypot(b.x - snapshot.player.x, b.y - snapshot.player.y),
        )[0];
      if (!nearest) {
        await page.waitForTimeout(250);
        continue;
      }
      const horizontal = nearest.x > snapshot.player.x ? "KeyD" : "KeyA";
      await page.keyboard.down(horizontal);
      const climb = nearest.y < snapshot.player.y - 120;
      if (climb) await page.keyboard.down("Space");
      await page.waitForTimeout(300);
      await page.keyboard.up(horizontal);
      if (climb) await page.keyboard.up("Space");
      await page.waitForTimeout(80);
    }
  }
  check("player death is reachable", observedDeath, `killer=${deathKiller ?? "none"}`);
  check("death overlay is visible", deathOverlaySeen);
  if (observedDeath) {
    await page.waitForFunction(
      () => window.__VIBE_MILITIA__?.getProbe().player.dead === false,
      null,
      { timeout: 6000 },
    );
    const respawned = await probe();
    respawnSpawn =
      respawnSpawn ??
      respawned.spawnPoints.find(
        (spawn) =>
          Math.abs(spawn.x - respawned.player.x) < 2 &&
          Math.abs(spawn.y - respawned.player.y) < 2,
      );
    respawnMinDistance =
      respawnMinDistance ??
      Math.min(
        ...respawned.drones
          .filter((drone) => drone.alive)
          .map((drone) =>
            Math.hypot(drone.x - respawned.player.x, drone.y - respawned.player.y),
          ),
      );
  }
  check("player respawns into a valid pad", Boolean(respawnSpawn), respawnSpawn?.id ?? "none");
  check(
    "respawn avoids live opponents",
    (respawnMinDistance ?? 0) > 120,
    `distance=${Math.round(respawnMinDistance ?? 0)}`,
  );

  await page.evaluate(() => window.__VIBE_MILITIA__.send({ type: "force-match-end" }));
  await page.waitForTimeout(500);
  const ended = await probe();
  check("match reaches an end state", ended.match.phase === "ended" && ended.hud.matchPhase === "ended");
  check("match produces a winner", Boolean(ended.hud.winnerName), ended.hud.winnerName ?? "none");
  check("results expose all four standings", ended.hud.standings.length === 4);
  const resultsClass = await page.locator('[data-testid="results-overlay"]').getAttribute("class");
  check("results overlay is visible", resultsClass?.includes("is-visible") === true);
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/p1-results.png` });
  }

  await page.locator('[data-testid="results-replay"]').click();
  await waitForLive();
  await page.waitForTimeout(500);
  const replay = await probe();
  check("replay resets the match", replay.match.phase === "live" && replay.hud.matchTimeRemainingMs > 85_000);
  check(
    "replay resets scores and health",
    replay.hud.playerEliminations === 0 && replay.player.health === 100,
  );
  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/p1-replay.png` });
  }

  check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

const failures = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
process.exit(failures.length > 0 ? 1 : 0);
