/**
 * P3B-B grenade verification.
 *
 * Requires the production build and Colyseus server running:
 *   npm run build
 *   npm run server:start
 *   npm run start -- -p 3101
 *   BASE_URL=http://localhost:3101 ARTIFACT_DIR=artifacts/p3b-b npm run verify:online:grenades
 *
 * Two independent Chromium contexts join one room. The test checks grenade
 * caches, HUD inventory and selection, a five-second frag fuse, a contact
 * explosion, and a real contact-grenade elimination. A second room confirms
 * grenade and pickup state isolation.
 */

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { createFailureLog } from "./lib/failure-diagnostics.mjs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const artifactDir = process.env.ARTIFACT_DIR ?? "";
const executablePath = process.env.CHROME_PATH;

const checks = [];
const failureLog = createFailureLog(artifactDir, {});
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!condition) failureLog.capture(name, detail);
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
failureLog.pages.A = pageA;
failureLog.pages.B = pageB;
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
      remainingMs: Math.round(snapshot?.remainingMs ?? 0),
      local: local
        ? {
            x: local.x,
            y: local.y,
            vx: local.vx,
            vy: local.vy,
            health: Math.round(local.health),
            maxHealth: local.maxHealth,
            alive: local.alive,
            medkits: local.medkits,
            grenadeContact: local.grenadeContact,
            grenadeFrag: local.grenadeFrag,
            grenadeStinking: local.grenadeStinking,
            grenadeSelected: local.grenadeSelected,
            grenadeCooldownMs: local.grenadeCooldownMs,
            eliminations: local.eliminations,
          }
        : null,
      bots: (snapshot?.participants ?? [])
        .filter((participant) => participant.kind === "bot")
        .map((bot) => ({
          id: bot.id,
          x: bot.x,
          y: bot.y,
          vx: bot.vx,
          vy: bot.vy,
          health: bot.health,
          alive: bot.alive,
        })),
      grenades: (snapshot?.grenades ?? []).map((grenade) => ({
        id: grenade.id,
        type: grenade.type,
        ownerId: grenade.ownerId,
        x: grenade.x,
        y: grenade.y,
        fuseRemainingMs: grenade.fuseRemainingMs,
        armed: grenade.armed,
      })),
      grenadeViews: value.grenades ?? [],
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
      contactHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-contact") ?? null,
      fragHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-frag") ?? null,
      stinkingHud:
        document
          .querySelector('[data-testid="hud-grenades"]')
          ?.getAttribute("data-stinking") ?? null,
      grenadeStatus:
        document.querySelector('[data-testid="grenade-status"]')
          ?.textContent ?? "",
      throwDisabled:
        document.querySelector('[data-testid="grenade-throw"]')?.disabled ??
        null,
      supplyToast:
        document.querySelector('[data-testid="supply-toast"]')
          ?.textContent ?? "",
    };
  });

const screenshot = async (page, name) => {
  if (!artifactDir) return;
  await page.screenshot({ path: `${artifactDir}/${name}.png` });
};

const hook = async (page, name, ...args) => {
  await page.evaluate(
    ([hookName, hookArgs]) =>
      window.__VIBE_MILITIA_ONLINE__?.getProbe().testHooks?.[hookName]?.(...hookArgs),
    [name, args],
  );
};

/**
 * Bots throw grenades, chase pickups and can end the match on score, and the
 * timer is 90 seconds of real time. Frozen bots and a long clock leave only the
 * client under test acting, on any machine speed.
 */
/** Bots join a frame or two after the live snapshot, so wait for every seat. */
const waitForBots = async (page) => {
  await page.waitForFunction(
    () =>
      // Bots fill every seat humans leave, eight in all.
      (window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.participants ?? []).length >= 8,
    null,
    { timeout: 15000 },
  );
};

const poll = async (page, predicate, timeoutMs = 6000) => {
  const startedAt = Date.now();
  let state = await probe(page);
  while (Date.now() - startedAt < timeoutMs && !predicate(state)) {
    await page.waitForTimeout(90);
    state = await probe(page);
  }
  return state;
};

/**
 * The longest stretch of the widest platform with nothing low overhead, the
 * same lane the playability benchmark uses. Fixed coordinates hit a ramp.
 */
const openLane = (state) => {
  const lane = [...state.platforms].sort((a, b) => b.width - a.width)[0];
  const blockers = state.platforms
    .filter((p) => p !== lane && p.y < lane.y && p.y + p.height >= lane.y - 260)
    .map((p) => [p.x, p.x + p.width])
    .sort((a, b) => a[0] - b[0]);
  let best = [lane.x, lane.x];
  let cursor = lane.x;
  for (const [from, to] of [...blockers, [lane.x + lane.width, lane.x + lane.width]]) {
    if (from - cursor > best[1] - best[0]) best = [cursor, from];
    cursor = Math.max(cursor, to);
  }
  return { x: best[0] + 80, y: lane.y };
};

const isolateMatch = async (page) => {
  await hook(page, "extendMatch", 600_000);
  await waitForBots(page);
  // Bots can kill the player in the moments before the freeze, and respawn
  // protection replaces the guard, so wait for life and guard again.
  await hook(page, "guard");
  const life = await poll(page, (state) => state.local?.alive === true, 9000);
  if (!life.local?.alive) throw new Error("player did not respawn before isolation");
  await hook(page, "guard");
  const state = await probe(page);
  for (const bot of state.bots) await hook(page, "freeze", bot.id, true);
  await page.waitForTimeout(150);
  // A grenade in the air before the freeze still has to land.
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline && (await probe(page)).grenades.length > 0) {
    await page.waitForTimeout(120);
  }
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

/** Input travels at 30 Hz to the server, so wait for the authoritative count. */
const throwAtWorld = async (page, worldX, worldY) => {
  const current = await probe(page);
  const held = (state) =>
    (state.local?.grenadeContact ?? 0) + (state.local?.grenadeFrag ?? 0) + (state.local?.grenadeStinking ?? 0);
  const before = held(current);
  await aimAtWorld(page, current.camera, worldX, worldY);
  await page.keyboard.press("KeyG");
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && held(await probe(page)) === before) {
    await page.waitForTimeout(40);
  }
};

const ballisticAim = (state, bot) => {
  const originX = state.local.x + 28;
  const originY = state.local.y - 58;
  const speed = 920;
  const gravity = 1500;
  let flight =
    Math.max(
      0.08,
      Math.hypot(bot.x - originX, bot.y - 59 - originY) / speed,
    );
  let targetX = bot.x + bot.vx * flight;
  let targetY = bot.y + bot.vy * flight - 59;
  flight = Math.max(
    0.08,
    Math.hypot(targetX - originX, targetY - originY) / speed,
  );
  targetX = bot.x + bot.vx * flight;
  targetY = bot.y + bot.vy * flight - 59;
  return {
    x: targetX,
    y: targetY - 0.85 * 0.5 * gravity * flight * flight,
  };
};

const chaseBot = async (page, target) => {
  const start = await probe(page);
  if (!start.local?.alive) return start;
  const key = target.x >= start.local.x ? "KeyD" : "KeyA";
  await page.keyboard.down(key);
  const startedAt = Date.now();
  let current = start;
  while (Date.now() - startedAt < 2000) {
    await page.waitForTimeout(55);
    current = await probe(page);
    if (!current.local?.alive || current.local.grenadeContact <= 0) break;
    const distance = Math.hypot(
      target.x - current.local.x,
      target.y - current.local.y,
    );
    if (distance < 280) break;
    if (Math.abs(current.local.y - start.local.y) > 140) break;
  }
  await page.keyboard.up(key);
  return current;
};

const collectMedkit = async (page) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await probe(page);
    if (!before.local?.alive) return false;
    if (before.local.medkits > 0) return true;
    const candidates = before.pickups
      .filter((pickup) => pickup.active && pickup.type === "medkit")
      .sort(
        (left, right) =>
          Math.hypot(left.x - before.local.x, left.y - before.local.y) -
          Math.hypot(right.x - before.local.x, right.y - before.local.y),
      );
    if (candidates.length === 0) return false;
    const target = candidates[0];
    if (
      Math.hypot(target.x - before.local.x, target.y - before.local.y) > 600
    ) {
      return false;
    }
    const key = target.x >= before.local.x ? "KeyD" : "KeyA";
    await page.keyboard.down(key);
    const startedAt = Date.now();
    let collected = false;
    while (Date.now() - startedAt < 4500) {
      await page.waitForTimeout(55);
      const now = await probe(page);
      if (!now.local?.alive) break;
      if (now.local.medkits > before.local.medkits) {
        collected = true;
        break;
      }
      if (
        (key === "KeyD" && now.local.x > target.x + 80) ||
        (key === "KeyA" && now.local.x < target.x - 80)
      ) {
        break;
      }
    }
    await page.keyboard.up(key);
    if (collected) return true;
  }
  return false;
};

const collectGrenadePickup = async (page, grenadeType) => {  const wanted =
    grenadeType === "contact" ? "contact-grenade" : "frag-grenade";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await probe(page);
    if (!before.local?.alive) {
      await page.waitForTimeout(500);
      continue;
    }
    const candidates = before.pickups
      .filter((pickup) => pickup.active && pickup.type === wanted)
      .sort(
        (left, right) =>
          Math.hypot(left.x - before.local.x, left.y - before.local.y) -
          Math.hypot(right.x - before.local.x, right.y - before.local.y),
      );
    if (candidates.length === 0) return false;
    if (
      Math.hypot(
        candidates[0].x - before.local.x,
        candidates[0].y - before.local.y,
      ) > 700
    ) {
      return false;
    }
    const target = candidates[0];
    const key = target.x >= before.local.x ? "KeyD" : "KeyA";
    const beforeCount =
      wanted === "contact-grenade"
        ? before.local.grenadeContact
        : before.local.grenadeFrag;
    await page.keyboard.down(key);
    const startedAt = Date.now();
    let collected = false;
    while (Date.now() - startedAt < 5000) {
      if (target.y < before.local.y - 110 && Date.now() - startedAt < 1800) {
        await page.keyboard.down("Space");
      } else {
        await page.keyboard.up("Space");
      }
      await page.waitForTimeout(55);
      const now = await probe(page);
      if (!now.local?.alive) break;
      const nowCount =
        wanted === "contact-grenade"
          ? now.local.grenadeContact
          : now.local.grenadeFrag;
      if (nowCount > beforeCount) {
        collected = true;
        break;
      }
      if (
        (key === "KeyD" && now.local.x > target.x + 80) ||
        (key === "KeyA" && now.local.x < target.x - 80)
      ) {
        break;
      }
    }
    await page.keyboard.up("Space");
    await page.keyboard.up(key);
    if (collected) return true;
  }
  return false;
};

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
  const medkits = initialA.pickups.filter(
    (pickup) => pickup.type === "medkit",
  );
  const contactCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "contact-grenade",
  );
  const fragCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "frag-grenade",
  );
  const stinkingCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "stinking-grenade",
  );
  check(
    "thirty-one supply caches spawn with fourteen medkits",
    initialA.pickups.length === 31 &&
      initialA.pickups.filter((pickup) => pickup.type === "vibe-lance")
        .length === 2 &&
      medkits.length === 14,
    `total=${initialA.pickups.length} medkits=${medkits.length}`,
  );
  check(
    "three contact, three frag and three stinking caches spawn",
    contactCaches.length === 3 &&
      fragCaches.length === 3 &&
      stinkingCaches.length === 3,
    `contact=${contactCaches.length} frag=${fragCaches.length} stink=${stinkingCaches.length}`,
  );
  const contactViews = initialA.pickupViews.filter(
    (pickup) => pickup.type === "contact-grenade",
  );
  const fragViews = initialA.pickupViews.filter(
    (pickup) => pickup.type === "frag-grenade",
  );
  const stinkingViews = initialA.pickupViews.filter(
    (pickup) => pickup.type === "stinking-grenade",
  );
  check(
    "all three grenade caches use distinct artworks",
    contactViews.length === 3 &&
      fragViews.length === 3 &&
      stinkingViews.length === 3 &&
      contactViews.every(
        (pickup) => pickup.texture === "pickup-grenade-contact",
      ) &&
      fragViews.every(
        (pickup) => pickup.texture === "pickup-grenade-frag",
      ) &&
      stinkingViews.every(
        (pickup) => pickup.texture === "pickup-grenade-stinking",
      ),
    `contact=${contactViews.length} frag=${fragViews.length} stink=${stinkingViews.length}`,
  );

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  const joinedB = await probe(pageB);
  check("second browser joins the same room", joinedB.roomId === roomId);
  await hook(pageA, "guard");
  await hook(pageB, "guard");

  const idsA = initialA.pickups.map((pickup) => `${pickup.id}:${pickup.type}`).sort();
  const idsB = joinedB.pickups.map((pickup) => `${pickup.id}:${pickup.type}`).sort();
  check(
    "both clients see identical pickup identities",
    JSON.stringify(idsA) === JSON.stringify(idsB),
    `${idsA.length} caches`,
  );
  check(
    "all pickup views render with matching types",
    initialA.pickupViews.length === initialA.pickups.length &&
      initialA.pickupViews.length === 31,
    `views=${initialA.pickupViews.length}`,
  );

  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageB.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await isolateMatch(pageA);

  const liveA = await probe(pageA);
  check(
    "starting inventory is one of each grenade",
    liveA.local?.grenadeContact === 1 &&
      liveA.local?.grenadeFrag === 1 &&
      liveA.local?.grenadeStinking === 1 &&
      liveA.local?.grenadeSelected === "contact",
    `contact=${liveA.local?.grenadeContact} frag=${liveA.local?.grenadeFrag} stink=${liveA.local?.grenadeStinking}`,
  );
  check(
    "HUD shows all three grenade slots and the selected type",
    liveA.selectedHud === "contact" &&
      liveA.contactHud === "1" &&
      liveA.fragHud === "1" &&
      liveA.stinkingHud === "1" &&
      liveA.hud.grenadeMax === 3,
    `selected=${liveA.selectedHud} contact=${liveA.contactHud} frag=${liveA.fragHud} stink=${liveA.stinkingHud}`,
  );
  check(
    "throw control is available at match start",
    liveA.throwDisabled === false && liveA.grenadeStatus.includes("READY"),
    `disabled=${liveA.throwDisabled} status=${liveA.grenadeStatus}`,
  );
  await screenshot(pageA, "01-grenade-loadout-and-caches");

  await pageA.keyboard.press("Digit5");
  await pageA.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="hud-grenades"]')
        ?.getAttribute("data-selected") === "frag",
    null,
    { timeout: 6000 },
  );
  const fragSelected = await probe(pageA);
  check(
    "key 5 selects the frag grenade",
    fragSelected.local?.grenadeSelected === "frag" &&
      fragSelected.selectedHud === "frag",
    fragSelected.local?.grenadeSelected ?? "none",
  );

  await pageA.keyboard.press("Digit4");
  await pageA.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="hud-grenades"]')
        ?.getAttribute("data-selected") === "contact",
    null,
    { timeout: 6000 },
  );
  const contactSelected = await probe(pageA);
  check(
    "key 4 selects the contact grenade",
    contactSelected.local?.grenadeSelected === "contact" &&
      contactSelected.selectedHud === "contact",
    contactSelected.local?.grenadeSelected ?? "none",
  );

  // Frag fuse: throw up and away, verify the server-owned five second timer.
  await pageA.keyboard.press("Digit5");
  await pageA.waitForTimeout(120);
  const beforeFrag = await probe(pageA);
  await throwAtWorld(
    pageA,
    beforeFrag.local.x + 40,
    beforeFrag.local.y - 360,
  );
  const thrownAt = Date.now();
  const afterFrag = await probe(pageA);
  const fragStartElapsed = afterFrag.elapsedMs;
  check(
    "G consumes exactly one frag grenade",
    afterFrag.local?.grenadeFrag === 0 &&
      afterFrag.local?.grenadeContact === 1,
    `contact=${afterFrag.local?.grenadeContact} frag=${afterFrag.local?.grenadeFrag}`,
  );
  check(
    "the frag is synchronized with a live fuse",
    afterFrag.grenades.length === 1 &&
      afterFrag.grenades[0].type === "frag" &&
      (afterFrag.grenades[0].fuseRemainingMs ?? 0) > 4000,
    `grenades=${afterFrag.grenades.length} fuse=${Math.round(afterFrag.grenades[0]?.fuseRemainingMs ?? 0)}`,
  );
  check(
    "the frag warning indicator renders",
    afterFrag.grenadeViews.length === 1 &&
      afterFrag.grenadeViews[0].visible === true,
    `views=${afterFrag.grenadeViews.length}`,
  );
  await pageB.waitForTimeout(250);
  const fragB = await probe(pageB);
  check(
    "both clients see the same frag grenade and fuse",
    fragB.grenades.length === 1 &&
      fragB.grenades[0].id === afterFrag.grenades[0].id &&
      fragB.grenades[0].type === "frag" &&
      Math.abs(
        (fragB.grenades[0].fuseRemainingMs ?? 0) -
          (afterFrag.grenades[0].fuseRemainingMs ?? 0),
      ) < 1500,
    `B=${fragB.grenades.length}`,
  );
  await screenshot(pageA, "02-frag-thrown");

  await pageA.waitForTimeout(1600);
  const warning = await probe(pageA);
  check(
    "frag fuse keeps counting down on the server",
    warning.grenades.length === 1 &&
      (warning.grenades[0].fuseRemainingMs ?? 0) <
        (afterFrag.grenades[0].fuseRemainingMs ?? 0) - 1000,
    `fuse=${Math.round(warning.grenades[0]?.fuseRemainingMs ?? 0)}`,
  );
  await screenshot(pageA, "03-frag-fuse-warning");

  let fragGone = false;
  let fragDetonatedAt = null;
  let fragEndElapsed = null;
  for (let step = 0; step < 80; step += 1) {
    await pageA.waitForTimeout(100);
    const now = await probe(pageA);
    if (now.grenades.length === 0) {
      fragGone = true;
      fragDetonatedAt = Date.now();
      fragEndElapsed = now.elapsedMs;
      await screenshot(pageA, "04-frag-explosion");
      break;
    }
  }
  const fragElapsed = (fragDetonatedAt ?? Date.now()) - thrownAt;
  const fragServerElapsed =
    (fragEndElapsed ?? afterFrag.elapsedMs) - fragStartElapsed;
  check(
    "frag detonates after about five seconds of server time",
    fragGone && fragServerElapsed >= 4700 && fragServerElapsed <= 5700,
    `server=${Math.round(fragServerElapsed)}ms wall=${fragElapsed}ms`,
  );
  check(
    "frag does not explode twice",
    (await probe(pageA)).grenades.length === 0,
  );

  // Focus the remaining bots on the throwing client for the contact test.
  await pageB.close();
  await pageA.waitForTimeout(700);

  const medkitReady = await collectMedkit(pageA);
  const beforeMedkitHeal = await probe(pageA);
  if (
    medkitReady &&
    beforeMedkitHeal.local?.alive &&
    beforeMedkitHeal.local.health < beforeMedkitHeal.local.maxHealth &&
    beforeMedkitHeal.local.medkits > 0
  ) {
    await pageA.keyboard.press("KeyH");
    await pageA.waitForTimeout(450);
    const afterMedkitHeal = await probe(pageA);
    check(
      "medkits still heal before grenade combat",
      afterMedkitHeal.local.health > beforeMedkitHeal.local.health &&
        afterMedkitHeal.local.health <= afterMedkitHeal.local.maxHealth &&
        afterMedkitHeal.local.medkits ===
          beforeMedkitHeal.local.medkits - 1,
      `health ${beforeMedkitHeal.local.health} -> ${afterMedkitHeal.local.health}`,
    );
  }

  // Contact grenade against a real bot, placed in range on open ground.
  await pageA.keyboard.press("Digit4");
  await pageA.waitForTimeout(150);
  const contactState = await probe(pageA);
  const contactBot = contactState.bots.find((bot) => bot.alive);
  const lane = openLane(contactState);
  await hook(pageA, "guard");
  await hook(pageA, "teleport", lane.x, lane.y);
  await hook(pageA, "teleportBot", contactBot.id, lane.x + 240, lane.y);
  await pageA.waitForTimeout(500);
  let killDemonstrated = false;
  let contactAttempts = 0;
  let localDeaths = 0;
  let lastTargetId = null;
  const contactStartedAt = Date.now();

  while (Date.now() - contactStartedAt < 45000 && !killDemonstrated) {
    const state = await probe(pageA);
    if (!state.local?.alive) {
      localDeaths += 1;
      try {
        await pageA.waitForFunction(
          () => {
            const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
            return (
              value.snapshot?.participants.find(
                (participant) => participant.id === value.sessionId,
              )?.alive === true
            );
          },
          null,
          { timeout: 7000 },
        );
      } catch {
        // retry the outer loop
      }
      continue;
    }
    if (state.local.grenadeContact <= 0) {
      const collected = await collectGrenadePickup(pageA, "contact");
      if (!collected) {
        await pageA.waitForTimeout(500);
      }
      continue;
    }
    // Only the placed bot. Other frozen bots stand where the match left them.
    let target = state.bots.find((bot) => bot.id === contactBot.id && bot.alive) ?? null;
    if (target && Math.hypot(target.x - state.local.x, target.y - state.local.y) > 360) {
      await hook(pageA, "teleport", lane.x, lane.y);
      await hook(pageA, "teleportBot", contactBot.id, lane.x + 240, lane.y);
      await pageA.waitForTimeout(400);
      target = null;
    }
    if (!target) {
      await pageA.waitForTimeout(200);
      continue;
    }
    const chased = await chaseBot(pageA, target);
    if (!chased.local?.alive) {
      localDeaths += 1;
      await pageA.waitForTimeout(500);
      continue;
    }
    const latestTarget = chased.bots.find(
      (bot) => bot.id === target.id && bot.alive,
    );
    if (!latestTarget) {
      await pageA.waitForTimeout(150);
      continue;
    }
    const distance = Math.hypot(
      latestTarget.x - chased.local.x,
      latestTarget.y - chased.local.y,
    );
    if (distance > 360) {
      await pageA.waitForTimeout(180);
      continue;
    }
    const aim = ballisticAim(chased, latestTarget);
    const beforeElims = chased.local.eliminations;
    contactAttempts += 1;
    lastTargetId = latestTarget.id;
    console.log(
      "CONTACT THROW",
      latestTarget.id,
      `distance=${Math.round(distance)}`,
    );
    await throwAtWorld(pageA, aim.x, aim.y);
    const afterThrow = await probe(pageA);
    check(
      `contact throw ${contactAttempts} consumes one grenade`,
      afterThrow.local?.grenadeContact === chased.local.grenadeContact - 1,
      `contact=${afterThrow.local?.grenadeContact}`,
    );

    let exploded = false;
    for (let step = 0; step < 50; step += 1) {
      await pageA.waitForTimeout(80);
      const now = await probe(pageA);
      if (
        now.grenades.length === 0 &&
        (afterThrow.grenades.length > 0 || step > 1)
      ) {
        exploded = true;
        await screenshot(pageA, "05-contact-explosion");
      }
      const deadTarget = now.bots.find(
        (bot) => bot.id === latestTarget.id && !bot.alive,
      );
      if (
        now.local &&
        (now.local.eliminations > beforeElims || deadTarget)
      ) {
        killDemonstrated = true;
        break;
      }
      if (now.local && !now.local.alive) break;
    }
    if (!killDemonstrated && !exploded) {
      console.log("CONTACT ATTEMPT DID NOT DETONATE", latestTarget.id);
    }
  }

  const killState = await probe(pageA);
  check(
    "contact grenade eliminates a bot in the browser",
    killDemonstrated && killState.local.eliminations > 0,
    `attempts=${contactAttempts} elims=${killState.local?.eliminations ?? 0}`,
  );
  const matchingFeed = killState.feed.find(
    (entry) =>
      entry.killerId === killState.sessionId &&
      entry.victimId === lastTargetId,
  );
  check(
    "grenade elimination appears in the kill feed",
    Boolean(matchingFeed),
    matchingFeed?.text ?? killState.feed.at(-1)?.text ?? "empty",
  );
  if (killDemonstrated) {
    await screenshot(pageA, "06-contact-elimination");
  }

  // A guarded player never dies on its own, so death is forced to prove the reset.
  const beforeDeath = await probe(pageA);
  const deathsBefore = localDeaths;
  // Let any grenade still in the air land first, so nothing is thrown after respawn.
  await poll(pageA, (state) => state.grenades.length === 0, 6000);
  await hook(pageA, "eliminate", beforeDeath.sessionId, "bullet");
  await pageA.waitForFunction(
    () => {
      const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return value.snapshot?.participants.find((entry) => entry.id === value.sessionId)?.alive === false;
    },
    null,
    { timeout: 3000 },
  );
  await pageA.waitForFunction(
    () => {
      const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return value.snapshot?.participants.find((entry) => entry.id === value.sessionId)?.alive === true;
    },
    null,
    { timeout: 9000 },
  );
  await hook(pageA, "guard");
  const afterRespawn = await probe(pageA);
  check(
    "death and respawn reset the grenade inventory",
    afterRespawn.local?.alive &&
      afterRespawn.local.grenadeContact === 1 &&
      afterRespawn.local.grenadeFrag === 1 &&
      afterRespawn.local.grenadeStinking === 1,
    `deaths=${deathsBefore + 1} contact=${afterRespawn.local?.grenadeContact} frag=${afterRespawn.local?.grenadeFrag} stink=${afterRespawn.local?.grenadeStinking}`,
  );

  // Room isolation.
  const pageC = await contextA.newPage();
  pageC.on("pageerror", (error) => pageErrors.push(`C: ${error.message}`));
  await pageC.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(900);
  await pageC.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageC);
  const secondRoom = await probe(pageC);
  check("second room has a different ID", secondRoom.roomId !== roomId);
  const secondRoomIds = [secondRoom.sessionId, ...secondRoom.bots.map((bot) => bot.id)];
  check(
    "second room has no grenades from the first room",
    secondRoom.grenades.every((grenade) => secondRoomIds.includes(grenade.ownerId)),
    `grenades=${secondRoom.grenades.length}`,
  );
  check(
    "second room starts with a fresh grenade inventory",
    secondRoom.local?.grenadeContact === 1 &&
      secondRoom.local?.grenadeFrag === 1 &&
      secondRoom.local?.grenadeStinking === 1,
    `contact=${secondRoom.local?.grenadeContact} frag=${secondRoom.local?.grenadeFrag} stink=${secondRoom.local?.grenadeStinking}`,
  );
  check(
    "second room has all grenade caches active",
    secondRoom.pickups.filter(
      (pickup) =>
        pickup.type === "contact-grenade" ||
        pickup.type === "frag-grenade" ||
        pickup.type === "stinking-grenade",
    ).every((pickup) => pickup.active),
  );
  await pageC.close();

  check(
    "match is still live after grenade verification",
    (await probe(pageA)).phase === "live",
  );
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
  await failureLog.flush();
  await contextA.close();
  await contextB.close();
  await browser.close();
}
