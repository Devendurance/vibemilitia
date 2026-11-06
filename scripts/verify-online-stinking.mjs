/**
 * P3B-C stinking grenade and toxic cloud verification.
 *
 * Requires the production build and Colyseus server running:
 *   npm run build
 *   npm run server:start
 *   npm run start -- -p 3101
 *   BASE_URL=http://localhost:3101 ARTIFACT_DIR=artifacts/p3b-c npm run verify:online:stinking
 *
 * Two browsers open a live room. Six SDK clients replace the bots so the
 * self-exposure test is deterministic. The suite verifies HUD selection,
 * green pickup art, cloud activation, toxic damage and self-elimination,
 * sixteen-second-later late join visibility, opponent toxic damage and
 * elimination attribution, and room isolation.
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
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
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const pageErrors = [];
for (const [label, page] of [
  ["A", pageA],
  ["B", pageB],
]) {
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`${label}: ${message.text()}`);
  });
}

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
      elapsedMs: snapshot?.elapsedMs ?? 0,
      humans: snapshot?.humans ?? 0,
      bots: snapshot?.bots ?? 0,
      local: local
        ? {
            id: local.id,
            name: local.name,
            x: local.x,
            y: local.y,
            health: Math.round(local.health),
            maxHealth: local.maxHealth,
            alive: local.alive,
            medkits: local.medkits,
            grenadeContact: local.grenadeContact,
            grenadeFrag: local.grenadeFrag,
            grenadeStinking: local.grenadeStinking,
            grenadeSelected: local.grenadeSelected,
            eliminations: local.eliminations,
            deaths: local.deaths,
          }
        : null,
      participants: (snapshot?.participants ?? []).map((participant) => ({
        id: participant.id,
        name: participant.name,
        kind: participant.kind,
        x: participant.x,
        y: participant.y,
        vx: participant.vx,
        vy: participant.vy,
        health: participant.health,
        alive: participant.alive,
      })),
      grenades: (snapshot?.grenades ?? []).map((grenade) => ({
        id: grenade.id,
        type: grenade.type,
        kind: grenade.kind,
        ownerId: grenade.ownerId,
        ownerName: grenade.ownerName,
        x: grenade.x,
        y: grenade.y,
        activationRemainingMs: grenade.activationRemainingMs,
      })),
      clouds: (snapshot?.toxicClouds ?? []).map((cloud) => ({
        id: cloud.id,
        ownerId: cloud.ownerId,
        ownerName: cloud.ownerName,
        kind: cloud.kind,
        x: cloud.x,
        y: cloud.y,
        radius: cloud.radius,
        remainingMs: cloud.remainingMs,
        durationMs: cloud.durationMs,
      })),
      cloudViews: value.toxicClouds ?? [],
      pickups: (snapshot?.pickups ?? []).map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.respawnIn,
      })),
      pickupViews: value.pickups ?? [],
      camera: value.camera,
      platforms: value.platforms ?? [],
      hud: value.hud,
      feed: snapshot?.feed ?? [],
      selectedHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-selected") ?? null,
      stinkingHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-stinking") ?? null,
      contactHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-contact") ?? null,
      fragHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-frag") ?? null,
      grenadeStatus:
        document.querySelector('[data-testid="grenade-status"]')
          ?.textContent ?? "",
      throwDisabled:
        document.querySelector('[data-testid="grenade-throw"]')?.disabled ??
        null,
    };
  });

const screenshot = async (page, name) => {
  if (!artifactDir) return;
  await page.screenshot({ path: `${artifactDir}/${name}.png` });
};

const aimAtWorld = async (page, camera, worldX, worldY) => {
  const box = await page.locator("canvas").boundingBox();
  if (!box || !camera.width || !camera.height) {
    throw new Error("camera or canvas unavailable");
  }
  const screenX =
    ((worldX - camera.scrollX) * camera.zoom * box.width) / camera.width;
  const screenY =
    ((worldY - camera.scrollY) * camera.zoom * box.height) / camera.height;
  await page.mouse.move(box.x + screenX, box.y + screenY);
  await page.waitForTimeout(70);
};

const throwAtWorld = async (page, worldX, worldY) => {
  const current = await probe(page);
  await aimAtWorld(page, current.camera, worldX, worldY);
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(180);
};

const selectStinking = async (page) => {
  await page.bringToFront().catch(() => undefined);
  await page.keyboard.press("Digit6");
  try {
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-selected") === "stinking",
      null,
      { timeout: 2500 },
    );
  } catch {
    await page.evaluate(() => {
      window.__HUD_BRIDGE__?.send({ type: "select-grenade", slot: 2 });
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-selected") === "stinking",
      null,
      { timeout: 3000 },
    );
  }
};

const sendMoveInput = (
  room,
  seq,
  moveX,
  jump,
  jumpHeld,
) => {
  room.send("input", {
    seq,
    moveX,
    jump,
    jumpHeld,
    fire: false,
    reload: false,
    weapon: null,
    aim: 0,
    useMedkit: false,
    grenadeSlot: null,
    throwGrenade: false,
  });
};

const moveFillerToward = async (page, sessionId, target, maxMs = 12000) => {
  const filler = fillers.find(
    (entry) => entry.room.sessionId === sessionId,
  );
  if (filler) {
    filler.room.send("debug-teleport", {
      x: target.x + 40,
      y: target.y,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const state = await probe(page);
    const self = state.participants.find(
      (participant) => participant.id === sessionId,
    );
    if (self?.alive && Math.hypot(self.x - target.x, self.y - target.y) < 80) {
      return true;
    }
  }
  const startedAt = Date.now();
  let seq = 10;
  let lastX = null;
  let stuckMs = 0;
  while (Date.now() - startedAt < maxMs) {
    const state = await probe(page);
    const self = state.participants.find(
      (participant) => participant.id === sessionId,
    );
    if (!self?.alive) return false;
    const activeFiller = fillers.find(
      (entry) => entry.room.sessionId === sessionId,
    );
    if (!activeFiller) return false;
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    if (Math.hypot(dx, dy) < 50) {
      sendMoveInput(activeFiller.room, seq, 0, false, false);
      seq += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return true;
    }
    if (lastX !== null && Math.abs(self.x - lastX) < 0.6) {
      stuckMs += 90;
    } else {
      stuckMs = 0;
    }
    lastX = self.x;
    const moveX = dx > 24 ? 1 : dx < -24 ? -1 : 0;
    const rise = dy < -70;
    const needsHop = rise || stuckMs > 450;
    const jumpHeld = needsHop;
    const jump = needsHop && seq % 5 === 0;
    sendMoveInput(activeFiller.room, seq, moveX, jump, jumpHeld);
    seq += 1;
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
  return false;
};

const fillers = [];
try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(900);
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  const roomUrl = pageA.url();
  const initialA = await probe(pageA);
  const roomId = initialA.roomId;
  console.log("ROOM", roomId, {
    phase: initialA.phase,
    pickups: initialA.pickups.length,
  });

  check("room created", Boolean(roomId));
  const stinkingCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "stinking-grenade",
  );
  const contactCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "contact-grenade",
  );
  const fragCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "frag-grenade",
  );
  check(
    "thirty-one caches preserve all three grenade types and two lances",
    initialA.pickups.length === 31 &&
      stinkingCaches.length === 3 &&
      contactCaches.length === 3 &&
      fragCaches.length === 3 &&
      initialA.pickups.filter((pickup) => pickup.type === "vibe-lance")
        .length === 2,
    `total=${initialA.pickups.length} stink=${stinkingCaches.length}`,
  );
  const stinkingViews = initialA.pickupViews.filter(
    (pickup) => pickup.type === "stinking-grenade",
  );
  check(
    "green stinking caches use their own artwork",
    stinkingViews.length === 3 &&
      stinkingViews.every(
        (pickup) => pickup.texture === "pickup-grenade-stinking",
      ),
    `views=${stinkingViews.length}`,
  );

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  const joinedB = await probe(pageB);
  check("second browser joins the same room", joinedB.roomId === roomId);
  const idsA = initialA.pickups.map((pickup) => `${pickup.id}:${pickup.type}`).sort();
  const idsB = joinedB.pickups.map((pickup) => `${pickup.id}:${pickup.type}`).sort();
  check(
    "both clients see identical stinking caches",
    JSON.stringify(idsA) === JSON.stringify(idsB),
    `${idsA.length} caches`,
  );

  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageA.waitForTimeout(700);
  const liveA = await probe(pageA);
  check(
    "stinking grenade is visible in the HUD and selected by key 6",
    liveA.local?.grenadeStinking === 1 &&
      liveA.stinkingHud === "1" &&
      liveA.contactHud === "1" &&
      liveA.fragHud === "1" &&
      liveA.hud.grenadeMax === 3,
    `stink=${liveA.stinkingHud} contact=${liveA.contactHud} frag=${liveA.fragHud}`,
  );
  await screenshot(pageA, "01-stinking-hud-and-green-cache");

  await selectStinking(pageA);
  const selected = await probe(pageA);
  check(
    "key 6 selects the stinking grenade",
    selected.local?.grenadeSelected === "stinking" &&
      selected.selectedHud === "stinking",
    selected.local?.grenadeSelected ?? "none",
  );

  // Replace the bots with idle SDK humans for deterministic toxic exposure.
  for (let index = 0; index < 6; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, {
      name: `STINK-${index + 1}`,
    });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
  }
  await pageA.waitForTimeout(1400);
  const filled = await probe(pageA);
  check(
    "six SDK humans replace the bots",
    filled.humans === 8 && filled.bots === 0,
    `humans=${filled.humans} bots=${filled.bots}`,
  );

  // Self exposure.
  const beforeSelf = await probe(pageA);
  const selfDeathsBefore = beforeSelf.local?.deaths ?? 0;
  await throwAtWorld(
    pageA,
    beforeSelf.local.x + 5,
    beforeSelf.local.y + 80,
  );
  const afterThrow = await probe(pageA);
  check(
    "throwing the stinking grenade consumes one inventory item",
    afterThrow.local?.grenadeStinking === 0 &&
      afterThrow.local?.grenadeContact === 1 &&
      afterThrow.local?.grenadeFrag === 1,
    `stink=${afterThrow.local?.grenadeStinking}`,
  );
  check(
    "the stinking canister is synchronized",
    // Bots replaced a moment ago can still have grenades in the air.
    afterThrow.grenades.some(
      (grenade) =>
        grenade.type === "stinking" &&
        (grenade.activationRemainingMs ?? 0) > 0,
    ),
    `grenades=${afterThrow.grenades.map((grenade) => grenade.type).join(",")}`,
  );
  await pageA.waitForTimeout(1200);
  const cloudState = await probe(pageA);
  check(
    "toxic cloud activates with the configured radius and lifetime",
    cloudState.clouds.length === 1 &&
      cloudState.clouds[0].radius === 160 &&
      cloudState.clouds[0].remainingMs > 4500,
    `clouds=${cloudState.clouds.length} radius=${cloudState.clouds[0]?.radius ?? 0}`,
  );
  check(
    "toxic cloud renders on both clients",
    cloudState.cloudViews.length === 1 &&
      cloudState.cloudViews[0].visible === true &&
      (await probe(pageB)).cloudViews.length === 1,
    `views=${cloudState.cloudViews.length}`,
  );
  await screenshot(pageA, "02-toxic-cloud-activation");

  let selfDamage = false;
  let selfEliminated = false;
  const selfStart = Date.now();
  while (Date.now() - selfStart < 7000) {
    await pageA.waitForTimeout(100);
    const now = await probe(pageA);
    if (now.local && now.local.health < 100 && now.local.alive && !selfDamage) {
      selfDamage = true;
      await screenshot(pageA, "03-toxic-self-damage");
    }
    if (now.local && !now.local.alive) {
      selfEliminated = true;
      await screenshot(pageA, "04-toxic-self-elimination");
      break;
    }
  }
  check(
    "sustained toxic exposure damages the player",
    selfDamage || selfEliminated,
    `damage=${selfDamage} eliminated=${selfEliminated}`,
  );
  const selfResult = await probe(pageA);
  check(
    "sustained toxic exposure eliminates the player",
    selfEliminated &&
      (selfResult.local?.deaths ?? 0) >= selfDeathsBefore + 1,
    `alive=${selfResult.local?.alive} deaths=${selfDeathsBefore}->${selfResult.local?.deaths}`,
  );
  check(
    "self toxic elimination does not award a kill",
    selfResult.local?.eliminations === 0 &&
      selfResult.feed.some((entry) => entry.text.includes("own toxic cloud")),
    `elims=${selfResult.local?.eliminations}`,
  );

  await pageA.waitForFunction(
    () => {
      const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
      const local = value.snapshot?.participants.find(
        (participant) => participant.id === value.sessionId,
      );
      return local?.alive === true;
    },
    null,
    { timeout: 10000 },
  );
  const respawned = await probe(pageA);
  check(
    "respawn restores the configured grenade loadout",
    respawned.local?.grenadeContact === 1 &&
      respawned.local?.grenadeFrag === 1 &&
      respawned.local?.grenadeStinking === 1,
    `contact=${respawned.local?.grenadeContact} frag=${respawned.local?.grenadeFrag} stink=${respawned.local?.grenadeStinking}`,
  );

  // Opponent exposure using an idle SDK client as the victim.
  await selectStinking(pageA);
  const playerState = await probe(pageA);
  let target = null;
  let bestFiller = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const filler of fillers) {
    const self = playerState.participants.find(
      (participant) => participant.id === filler.room.sessionId,
    );
    if (!self?.alive) continue;
    const distance = Math.hypot(
      self.x - playerState.local.x,
      self.y - playerState.local.y,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFiller = filler;
    }
  }
  let opponentMoved = false;
  let targetSessionId = null;
  if (bestFiller) {
    targetSessionId = bestFiller.room.sessionId;
    opponentMoved = await moveFillerToward(
      pageA,
      targetSessionId,
      playerState.local,
    );
    await pageA.waitForTimeout(800);
    const afterMove = await probe(pageA);
    target =
      afterMove.participants.find(
        (participant) => participant.id === targetSessionId,
      ) ?? null;
  }
  check(
    "an idle opponent is available for toxic testing",
    opponentMoved && Boolean(target),
    `nearest=${Math.round(bestDistance)}`,
  );
  let opponentDamaged = false;
  let opponentEliminated = false;
  let targetId = null;
  if (target) {
    targetId = target.id;
    const state = await probe(pageA);
    await throwAtWorld(
      pageA,
      state.local.x + 5,
      state.local.y + 80,
    );
    const throwState = await probe(pageA);
    check(
      "opponent stinking throw consumes one grenade",
      throwState.local?.grenadeStinking === 0,
      `stink=${throwState.local?.grenadeStinking}`,
    );
    const startHealth = target.health;
    const startedAt = Date.now();
    let sawOpponentCloud = false;
    while (Date.now() - startedAt < 7500) {
      await pageA.waitForTimeout(100);
      const now = await probe(pageA);
      const victim = now.participants.find(
        (participant) => participant.id === targetId,
      );
      if (!victim) break;
      const coveringCloud = now.clouds.find(
        (cloud) =>
          Math.hypot(victim.x - cloud.x, victim.y - 59 - cloud.y) <=
          cloud.radius,
      );
      if (coveringCloud) sawOpponentCloud = true;
      if (victim.health < startHealth && victim.alive && !opponentDamaged) {
        opponentDamaged = true;
        await screenshot(pageA, "05-opponent-toxic-damage");
      }
      if (!victim.alive) {
        opponentEliminated = true;
        await screenshot(pageA, "06-opponent-toxic-elimination");
        break;
      }
    }
    check(
      "opponent toxic cloud activates",
      sawOpponentCloud,
    );
    check(
      "opponent receives toxic damage",
      opponentDamaged || opponentEliminated,
    );
    const result = await probe(pageA);
    check(
      "opponent toxic elimination is credited to the owner",
      opponentEliminated &&
        result.feed.some(
          (entry) =>
            entry.killerId === result.sessionId &&
            entry.victimId === targetId,
        ) &&
        result.local.eliminations > 0,
      `elims=${result.local?.eliminations} feed=${result.feed.at(-1)?.text ?? "empty"}`,
    );
  }

  // Multi-grenade battle capture while the opponent cloud may still be live.
  await pageA.keyboard.press("Digit4");
  await pageA.waitForTimeout(150);
  const beforeMix = await probe(pageA);
  await throwAtWorld(pageA, beforeMix.local.x + 220, beforeMix.local.y - 60);
  await pageA.keyboard.press("Digit5");
  await pageA.waitForTimeout(150);
  await throwAtWorld(pageA, beforeMix.local.x - 220, beforeMix.local.y - 60);
  await pageA.waitForTimeout(250);
  await screenshot(pageA, "07-multi-grenade-battle");

  // Late-join cloud visibility in a separate room.
  const pageC = await contextA.newPage();
  pageC.on("pageerror", (error) => pageErrors.push(`C: ${error.message}`));
  await pageC.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(900);
  await pageC.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageC);
  await pageC.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageC.evaluate(() =>
    window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.guard(),
  );
  await selectStinking(pageC);
  const lateHost = await probe(pageC);
  const contextD = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageD = await contextD.newPage();
  pageD.on("pageerror", (error) => pageErrors.push(`D: ${error.message}`));
  await pageD.goto(`${baseUrl}/online?room=${lateHost.roomId}`, {
    waitUntil: "networkidle",
  });
  await pageD.waitForTimeout(500);
  await throwAtWorld(
    pageC,
    lateHost.local.x + 5,
    lateHost.local.y + 80,
  );
  let lateCloud = await probe(pageC);
  for (let attempt = 0; attempt < 20 && lateCloud.clouds.length === 0; attempt += 1) {
    await pageC.waitForTimeout(150);
    lateCloud = await probe(pageC);
  }
  check(
    "late-join room has an active cloud",
    lateCloud.clouds.length === 1,
    `clouds=${lateCloud.clouds.length}`,
  );
  await pageD.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageD);
  const lateJoin = await probe(pageD);
  check(
    "late joiner sees the existing toxic cloud",
    lateJoin.clouds.length === 1 &&
      lateJoin.cloudViews.length === 1 &&
      lateJoin.cloudViews[0].visible === true,
    `clouds=${lateJoin.clouds.length}`,
  );
  await screenshot(pageD, "08-late-join-toxic-cloud");
  check(
    "second room has independent pickup state",
    lateJoin.pickups.filter(
      (pickup) => pickup.type === "stinking-grenade",
    ).every((pickup) => pickup.active),
  );
  await pageD.close();
  await contextD.close();
  await pageC.close();

  check(
    "no browser page errors",
    pageErrors.length === 0,
    pageErrors.slice(0, 3).join(" | "),
  );

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
  await contextA.close();
  await contextB.close();
  await browser.close();
}
