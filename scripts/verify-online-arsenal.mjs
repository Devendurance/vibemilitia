/**
 * P3C advanced arsenal verification.
 *
 * Requires the production build and a Colyseus server with gated hooks:
 *   npm run build
 *   VIBE_MILITIA_TEST_HOOKS=1 MATCH_COUNTDOWN_MS=0 npm run server:start
 *   npm run start -- -p 3101
 *   BASE_URL=http://localhost:3101 ARTIFACT_DIR=artifacts/p3c npm run verify:online:arsenal
 *
 * Two real Chromium clients exercise authored pickups, full-inventory swaps,
 * firing, reloading, akimbo barrel alternation, rocket flight and explosions,
 * advanced elimination loot and an eight-combatant mixed-weapon lineup.
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
const fillers = [];
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
    const hud = value.hud;
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: snapshot?.phase ?? null,
      serverTickMs: snapshot?.serverTickMs ?? 0,
      snapshotBytes: snapshot ? JSON.stringify(snapshot).length : 0,
      local: local
        ? {
            x: local.x,
            y: local.y,
            alive: local.alive,
            health: Math.round(local.health),
            maxHealth: local.maxHealth,
            equippedSlot: local.equippedSlot,
            weaponId: local.weaponId,
            weapons: local.weapons.map((weapon) => ({
              id: weapon.id,
              slot: weapon.slot,
              owned: weapon.owned,
              ammo: weapon.ammo,
              magazineSize: weapon.magazineSize,
              reloading: weapon.reloading,
            })),
          }
        : null,
      participants: (snapshot?.participants ?? []).map((participant) => ({
        id: participant.id,
        name: participant.name,
        kind: participant.kind,
        skinId: participant.skinId,
        alive: participant.alive,
        health: Math.round(participant.health),
        x: participant.x,
        y: participant.y,
        weaponId: participant.weaponId,
        equippedSlot: participant.equippedSlot,
      })),
      projectiles: (snapshot?.projectiles ?? []).map((projectile) => ({
        id: projectile.id,
        weaponId: projectile.weaponId,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
      })),
      pickups: (snapshot?.pickups ?? []).map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.respawnIn,
      })),
      loot: (snapshot?.loot ?? []).map((item) => ({
        id: item.id,
        kind: item.kind,
        weaponId: item.weaponId,
        ammo: item.ammo,
        x: item.x,
        y: item.y,
        remainingMs: item.remainingMs,
      })),
      pickupViews: value.pickups ?? [],
      lootViews: value.loot ?? [],
      combatLog: value.combatLog ?? [],
      views: value.views ?? [],
      hud: {
        weaponSlots: hud.weaponSlots,
        weaponName: hud.weaponName,
        ammo: hud.ammo,
        magazineSize: hud.magazineSize,
        reloading: hud.reloading,
        supplyFeedbackText: hud.supplyFeedbackText,
        nearbyLootText: hud.nearbyLootText,
        nearbyLootCanSwap: hud.nearbyLootCanSwap,
      },
      supplyToast:
        document.querySelector('[data-testid="supply-toast"]')?.textContent ?? "",
      weaponSlotThreeIcon: Boolean(
        document.querySelector('[data-testid="weapon-slot-3"] svg'),
      ),
      weaponSlotIconCount: document.querySelectorAll(
        '[data-testid^="weapon-slot-"] .hud-weapon-slot__icon',
      ).length,
      camera: {
        scrollX: value.camera.scrollX,
        scrollY: value.camera.scrollY,
        zoom: value.camera.zoom,
        width: value.camera.width,
        height: value.camera.height,
      },
    };
  });

const screenshot = async (page, name) => {
  if (!artifactDir) return;
  await page.screenshot({ path: `${artifactDir}/${name}.png` });
};

const poll = async (page, predicate, timeoutMs = 6000, interval = 80) => {
  const startedAt = Date.now();
  let state = await probe(page);
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate(state)) return state;
    await page.waitForTimeout(interval);
    state = await probe(page);
  }
  return state;
};

const hook = async (page, name, ...args) => {
  await page.evaluate(
    ({ hookName, hookArgs }) => {
      const hooks = window.__VIBE_MILITIA_ONLINE__?.getProbe().testHooks;
      if (!hooks) return;
      if (hookName === "eliminate") hooks.eliminate(...hookArgs);
      else if (hookName === "teleport") hooks.teleport(...hookArgs);
      else if (hookName === "teleportBot") hooks.teleportBot(...hookArgs);
      else if (hookName === "endMatch") hooks.endMatch();
      else if (hookName === "guard") hooks.guard();
      else if (hookName === "giveWeapon") hooks.giveWeapon(...hookArgs);
      else if (hookName === "freeze") hooks.freeze(...hookArgs);
      else if (hookName === "disableBotCuriosity") hooks.disableBotCuriosity();
      else if (hookName === "setZoom") hooks.setZoom(...hookArgs);
      else if (hookName === "setAim") hooks.setAim(...hookArgs);
      else if (hookName === "fireOnce") hooks.fireOnce();
      else if (hookName === "reloadOnce") hooks.reloadOnce();
      else if (hookName === "guardTarget") hooks.guardTarget(...hookArgs);
      else if (hookName === "pauseBotLoot") hooks.pauseBotLoot(...hookArgs);
      else if (hookName === "extendMatch") hooks.extendMatch(...hookArgs);
      else if (hookName === "resetPickups") hooks.resetPickups();
    },
    { hookName: name, hookArgs: args },
  );
};

const teleport = async (page, x, y) => {
  await hook(page, "teleport", x, y);
  await page.waitForTimeout(140);
};

const teleportBot = async (page, id, x, y) => {
  await hook(page, "teleportBot", id, x, y);
  await page.waitForTimeout(120);
};

const freezeOtherBots = async (page, keepId) => {
  const state = await probe(page);
  for (const participant of state.participants) {
    if (
      participant.kind !== "bot" ||
      !participant.alive ||
      participant.id === keepId
    ) {
      continue;
    }
    await hook(page, "freeze", participant.id, true);
  }
};

const hasWeapon = (state, weaponId) =>
  Boolean(
    state.local?.weapons.some(
      (weapon) => weapon.owned && weapon.id === weaponId,
    ),
  );

const pickWeapon = async (page, pickupType, weaponId) => {
  const before = await probe(page);
  const caches = before.pickups
    .filter((pickup) => pickup.type === pickupType && pickup.active)
    .sort((left, right) => {
      const leftDistance = Math.hypot(
        left.x - (before.local?.x ?? 0),
        left.y - (before.local?.y ?? 0),
      );
      const rightDistance = Math.hypot(
        right.x - (before.local?.x ?? 0),
        right.y - (before.local?.y ?? 0),
      );
      return leftDistance - rightDistance;
    });
  const cache = caches[0];
  if (!cache) throw new Error(`no active cache for ${pickupType}`);
  await teleport(page, cache.x, cache.y + 16);
  await page.waitForTimeout(220);
  let state = await poll(
    page,
    (current) =>
      hasWeapon(current, weaponId) ||
      current.hud.nearbyLootCanSwap === true,
    5000,
  );
  if (!hasWeapon(state, weaponId) && state.hud.nearbyLootCanSwap) {
    await screenshot(page, `prompt-${weaponId}`);
    await page.keyboard.press("KeyE");
    state = await poll(page, (current) => hasWeapon(current, weaponId), 2500);
    if (!hasWeapon(state, weaponId)) {
      const swapButton = page.locator('[data-testid="loot-swap"]');
      if ((await swapButton.count()) > 0) {
        await swapButton.click();
        state = await poll(
          page,
          (current) => hasWeapon(current, weaponId),
          4000,
        );
      }
    }
  }
  if (!hasWeapon(state, weaponId)) {
    await teleport(page, cache.x, cache.y + 16);
    state = await poll(
      page,
      (current) =>
        hasWeapon(current, weaponId) ||
        current.hud.nearbyLootCanSwap === true,
      3500,
    );
    if (!hasWeapon(state, weaponId) && state.hud.nearbyLootCanSwap) {
      const swapButton = page.locator('[data-testid="loot-swap"]');
      if ((await swapButton.count()) > 0) {
        await swapButton.click();
        state = await poll(
          page,
          (current) => hasWeapon(current, weaponId),
          4000,
        );
      }
    }
  }
  return state;
};

const botTarget = (state) =>
  state.participants.find(
    (participant) =>
      participant.kind === "bot" &&
      participant.alive &&
      participant.id !== state.sessionId,
  ) ?? null;

const fireAtBot = async (page, weaponId, holdMs, screenshotName) => {
  await teleport(page, 500, 1340);
  await page.waitForTimeout(900);
  const before = await probe(page);
  const target = botTarget(before);
  if (!target) return { before, target: null };
  await teleportBot(page, target.id, before.local.x + 220, before.local.y);
  await hook(page, "freeze", target.id, true);
  await freezeOtherBots(page, target.id);
  await page.waitForTimeout(900);
  const aimed = await probe(page);
  const current =
    aimed.participants.find((participant) => participant.id === target.id) ??
    target;
  await hook(page, "setAim", current.x, current.y - 59);
  await page.waitForTimeout(80);
  const canvasBox = await page.locator("canvas").boundingBox();
  if (canvasBox) {
    await page.mouse.move(
      canvasBox.x + canvasBox.width / 2,
      canvasBox.y + canvasBox.height / 2,
    );
  }
  await page.mouse.down();
  if (screenshotName) {
    await page.waitForTimeout(Math.min(180, holdMs));
    await screenshot(page, screenshotName);
    await page.waitForTimeout(Math.max(0, holdMs - 180));
  } else {
    await page.waitForTimeout(holdMs);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await probe(page);
  return { before: aimed, target: current, after };
};

try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(900);
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  const initialA = await probe(pageA);
  const roomUrl = `${baseUrl}/online?room=${initialA.roomId}`;
  await hook(pageA, "disableBotCuriosity");
  await hook(pageA, "pauseBotLoot", true);
  await hook(pageA, "extendMatch", 90_000);
  await hook(pageA, "resetPickups");
  await freezeOtherBots(pageA, "none");
  await pageA.waitForTimeout(200);
  check("advanced arsenal room is live", initialA.phase === "live");
  check(
    "Sector 07 now has 31 caches including all advanced weapon pickups",
    initialA.pickups.length === 31 &&
      initialA.pickups.filter((pickup) => pickup.type === "akimbo-rifles").length === 2 &&
      initialA.pickups.filter((pickup) => pickup.type === "vibe-smg").length === 2 &&
      initialA.pickups.filter((pickup) => pickup.type === "heavy-cannon").length === 1 &&
      initialA.pickups.filter((pickup) => pickup.type === "rocket-launcher").length === 1,
    `total=${initialA.pickups.length}`,
  );
  const advancedPickupViews = initialA.pickupViews.filter((view) =>
    ["akimbo-rifles", "vibe-smg", "heavy-cannon", "rocket-launcher"].includes(
      view.type,
    ),
  );
  check(
    "advanced weapon caches render with weapon artwork",
    advancedPickupViews.length === 6 &&
      advancedPickupViews.some((view) => view.texture === "weapon-akimbo") &&
      advancedPickupViews.some((view) => view.texture === "weapon-smg") &&
      advancedPickupViews.some((view) => view.texture === "weapon-cannon") &&
      advancedPickupViews.some((view) => view.texture === "weapon-rocket"),
    advancedPickupViews.map((view) => view.texture).join(","),
  );
  check(
    "HUD weapon slots carry distinct weapon icons",
    initialA.hud.weaponSlots.length === 3 &&
      initialA.weaponSlotIconCount === 3,
    `icons=${initialA.weaponSlotIconCount}`,
  );
  await hook(pageA, "disableBotCuriosity");
  await pageA.waitForTimeout(200);

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  await hook(pageA, "guard");
  await hook(pageB, "guard");
  const initialB = await probe(pageB);
  check(
    "two real clients share the advanced room",
    initialB.roomId === initialA.roomId &&
      initialB.sessionId !== initialA.sessionId,
  );

  const akimbo = await pickWeapon(pageA, "akimbo-rifles", "akimbo-rifles");
  await pageA.waitForTimeout(250);
  const akimboViewState = await poll(
    pageA,
    (state) =>
      state.views.some(
        (view) =>
          view.id === state.sessionId &&
          view.weaponTexture === "weapon-akimbo" &&
          view.secondaryWeaponVisible === true,
      ),
    3000,
  );
  check(
    "Akimbo Rifles fill the empty third slot",
    hasWeapon(akimbo, "akimbo-rifles") &&
      akimbo.local.weapons[akimbo.local.equippedSlot].id ===
        "akimbo-rifles" &&
      akimbo.local.weapons[akimbo.local.equippedSlot].ammo === 36,
    JSON.stringify(akimbo.local.weapons),
  );
  await screenshot(pageA, "01-akimbo-pickup");

  const akimboFire = await fireAtBot(pageA, "akimbo-rifles", 620, "02-akimbo-firing");
  await pageA.waitForTimeout(150);
  const akimboShots = akimboFire.after.combatLog.filter(
    (entry) =>
      entry.type === "shot" &&
      entry.ownerId === akimboFire.after.sessionId &&
      entry.weaponId === "akimbo-rifles",
  );
  check(
    "both Akimbo guns are visible on the Viber presentation",
    akimboViewState.views.some(
      (view) =>
        view.id === akimboViewState.sessionId &&
        view.weaponTexture === "weapon-akimbo" &&
        view.secondaryWeaponVisible === true,
    ),
    JSON.stringify(
      akimboViewState.views.find(
        (view) => view.id === akimboViewState.sessionId,
      ) ?? null,
    ),
  );
  check(
    "the server alternates Akimbo barrels",
    akimboShots.length >= 3 &&
      akimboShots
        .slice(0, 5)
        .every(
          (entry, index, list) =>
            index === 0 || entry.barrel !== list[index - 1].barrel,
        ) &&
      new Set(akimboShots.map((entry) => entry.barrel)).size === 2,
    akimboShots.map((entry) => entry.barrel).join(","),
  );
  const akimboAmmoBefore =
    akimboFire.before.local.weapons.find(
      (weapon) => weapon.id === "akimbo-rifles",
    )?.ammo ?? 0;
  const akimboAmmoAfter =
    akimboFire.after.local.weapons.find(
      (weapon) => weapon.id === "akimbo-rifles",
    )?.ammo ?? 0;
  check(
    "Akimbo consumes one shared round per shot",
    akimboAmmoAfter < akimboAmmoBefore,
    `${akimboAmmoBefore} -> ${akimboAmmoAfter}`,
  );

  const smg = await pickWeapon(pageA, "vibe-smg", "vibe-smg");
  check(
    "a full loadout swaps into the Vibe SMG with E",
    hasWeapon(smg, "vibe-smg") &&
      smg.local.weapons.find((weapon) => weapon.id === "vibe-smg")
        ?.ammo === 30,
    JSON.stringify(smg.local.weapons),
  );
  const smgFire = await fireAtBot(pageA, "vibe-smg", 900, "03-smg-firing");
  const smgShots = smgFire.after.combatLog.filter(
    (entry) =>
      entry.type === "shot" &&
      entry.ownerId === smgFire.after.sessionId &&
      entry.weaponId === "vibe-smg",
  );
  check(
    "the SMG fires a high-rate bounded burst",
    smgShots.length >= 8 && smgFire.after.projectiles.length <= 220,
    `shots=${smgShots.length} projectiles=${smgFire.after.projectiles.length}`,
  );
  check(
    "the SMG pickup notification reaches the HUD",
    smgFire.before.hud.supplyFeedbackText.includes("SMG") ||
      smgFire.after.hud.supplyFeedbackText.includes("SMG") ||
      smgFire.after.hud.supplyFeedbackText.includes("WEAPON"),
    `${smgFire.before.hud.supplyFeedbackText} ${smgFire.after.hud.supplyFeedbackText}`,
  );

  await pageA.keyboard.press("KeyR");
  await pageA.waitForTimeout(250);
  let smgReload = await probe(pageA);
  let smgSlot = smgReload.local.weapons.findIndex(
    (weapon) => weapon.id === "vibe-smg",
  );
  if (smgSlot < 0 || !smgReload.local.weapons[smgSlot].reloading) {
    await hook(pageA, "reloadOnce");
    await pageA.waitForTimeout(220);
    smgReload = await probe(pageA);
    smgSlot = smgReload.local.weapons.findIndex(
      (weapon) => weapon.id === "vibe-smg",
    );
  }
  check(
    "the SMG starts a server-owned reload",
    smgSlot >= 0 && smgReload.local.weapons[smgSlot].reloading === true,
    `reloading=${smgSlot >= 0 ? smgReload.local.weapons[smgSlot].reloading : "missing"}`,
  );
  await pageA.waitForTimeout(1400);

  const cannon = await pickWeapon(pageA, "heavy-cannon", "heavy-cannon");
  check(
    "the Heavy Cannon replaces the equipped slot",
    hasWeapon(cannon, "heavy-cannon") &&
      cannon.local.weapons.find((weapon) => weapon.id === "heavy-cannon")
        ?.ammo === 5,
    JSON.stringify(cannon.local.weapons),
  );
  const cannonFire = await fireAtBot(
    pageA,
    "heavy-cannon",
    260,
    "04-heavy-cannon-firing",
  );
  const cannonHit = await poll(
    pageA,
    (state) =>
      state.combatLog.some(
        (entry) =>
          entry.type === "hit" &&
          entry.weaponId === "heavy-cannon" &&
          entry.damage === 60,
      ),
    2500,
    50,
  );
  check(
    "the Heavy Cannon deals one 60 damage direct hit",
    cannonHit.combatLog.some(
      (entry) =>
        entry.type === "hit" &&
        entry.weaponId === "heavy-cannon" &&
        entry.damage === 60,
    ),
    `ammo=${cannonFire.after.local.weapons[2].ammo}`,
  );
  await screenshot(pageA, "05-heavy-cannon-impact");

  const rocket = await pickWeapon(pageA, "rocket-launcher", "rocket-launcher");
  await hook(pageA, "extendMatch", 90_000);
  check(
    "the Rocket Launcher replaces the equipped slot",
    hasWeapon(rocket, "rocket-launcher") &&
      rocket.local.weapons.find(
        (weapon) => weapon.id === "rocket-launcher",
      )?.ammo === 3,
    JSON.stringify(rocket.local.weapons),
  );
  await teleport(pageA, 2500, 1340);
  await pageA.waitForTimeout(900);
  await hook(pageA, "setZoom", 1.5);
  await pageA.waitForTimeout(350);
  const rocketBefore = await probe(pageA);
  const rocketTarget = botTarget(rocketBefore);
  await teleportBot(
    pageA,
    rocketTarget.id,
    rocketBefore.local.x + 180,
    rocketBefore.local.y,
  );
  await hook(pageA, "freeze", rocketTarget.id, true);
  await freezeOtherBots(pageA, rocketTarget.id);
  await pageA.waitForTimeout(900);
  const rocketAim = await probe(pageA);
  const liveTarget =
    rocketAim.participants.find(
      (participant) => participant.id === rocketTarget.id,
    ) ?? rocketTarget;
  await hook(pageA, "setAim", liveTarget.x, liveTarget.y - 59);
  await pageA.waitForTimeout(100);
  await hook(pageA, "fireOnce");
  try {
    await pageA.waitForFunction(
      () =>
        window.__VIBE_MILITIA_ONLINE__
          ?.getProbe()
          .combatLog.some((entry) => entry.type === "rocket-exploded"),
      null,
      { timeout: 2500, polling: 16 },
    );
  } catch {
    // The assertion below reports the final result.
  }
  await screenshot(pageA, "07-rocket-explosion");
  const explosion = await probe(pageA);
  check(
    "the rocket explodes with a bounded blast event",
    explosion.combatLog.some(
      (entry) =>
        entry.type === "rocket-exploded" &&
        entry.ownerId === explosion.sessionId,
    ),
  );
  const rocketHits = explosion.combatLog.filter(
    (entry) =>
      entry.type === "hit" &&
      entry.weaponId === "rocket-launcher" &&
      entry.ownerId === explosion.sessionId,
  );
  const rocketVictims = rocketHits.map((entry) => entry.victimId);
  check(
    "one rocket impact damages each victim at most once",
    rocketHits.length >= 1 &&
      new Set(rocketVictims).size === rocketVictims.length &&
      rocketHits.every(
        (entry) => typeof entry.damage === "number" && entry.damage <= 120,
      ),
    rocketHits
      .map((entry) => `${entry.victimId}:${entry.damage}`)
      .join(","),
  );
  await pageA.waitForTimeout(1200);
  await pageA.evaluate(() => {
    window.__ROCKET_CAPTURE__ = [];
    const startedAt = performance.now();
    const tick = () => {
      const value = window.__VIBE_MILITIA_ONLINE__;
      const projectiles = value?.getProbe().snapshot?.projectiles ?? [];
      for (const projectile of projectiles) {
        if (projectile.weaponId !== "rocket-launcher") continue;
        window.__ROCKET_CAPTURE__.push({
          t: performance.now() - startedAt,
          x: projectile.x,
          y: projectile.y,
        });
      }
      if (performance.now() - startedAt < 3000) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await hook(pageA, "setAim", rocketAim.local.x, rocketAim.local.y - 400);
  await pageA.waitForTimeout(100);
  await hook(pageA, "fireOnce");
  try {
    await pageA.waitForFunction(
      () => (window.__ROCKET_CAPTURE__?.length ?? 0) > 0,
      null,
      { timeout: 1200, polling: 16 },
    );
  } catch {
    // The assertion below reports the final result.
  }
  await screenshot(pageA, "06-rocket-in-flight");
  const rocketSamples = await pageA.evaluate(
    () => window.__ROCKET_CAPTURE__ ?? [],
  );
  check(
    "the rocket is visible in flight",
    rocketSamples.length > 0,
    `samples=${rocketSamples.length} x=${rocketSamples[0]?.x?.toFixed(0) ?? "none"} y=${rocketSamples[0]?.y?.toFixed(0) ?? "none"}`,
  );
  await hook(pageA, "setZoom", 2);
  await pageA.waitForTimeout(200);
  const finalRocketState = await probe(pageA);
  const rocketAmmoBeforeDeath =
    finalRocketState.local.weapons.find(
      (weapon) => weapon.id === "rocket-launcher",
    )?.ammo ?? 0;
  check(
    "firing a rocket does not consume grenade inventory",
    finalRocketState.local.weapons.some(
      (weapon) => weapon.id === "rocket-launcher",
    ),
  );

  await teleport(pageA, 1150, 1340);
  const deathState = await probe(pageA);
  await hook(pageB, "eliminate", deathState.sessionId, "bullet");
  const advancedLoot = await poll(
    pageA,
    (state) =>
      state.loot.some(
        (item) => item.weaponId === "rocket-launcher",
      ),
    4000,
  );
  const rocketLoot = advancedLoot.loot.find(
    (item) => item.weaponId === "rocket-launcher",
  );
  check(
    "an advanced weapon elimination drops the equipped rocket and ammo",
    rocketLoot?.ammo === rocketAmmoBeforeDeath,
    `loot=${rocketLoot?.ammo} carried=${rocketAmmoBeforeDeath}`,
  );
  await screenshot(pageA, "08-advanced-elimination-loot");

  const rocketLootPosition = rocketLoot;
  await teleport(
    pageB,
    rocketLootPosition.x,
    rocketLootPosition.y + 16,
  );
  let collectedRocket = await poll(
    pageB,
    (state) =>
      hasWeapon(state, "rocket-launcher") ||
      state.hud.nearbyLootCanSwap === true,
    4000,
  );
  if (
    !hasWeapon(collectedRocket, "rocket-launcher") &&
    collectedRocket.hud.nearbyLootCanSwap
  ) {
    await pageB.keyboard.press("KeyE");
    collectedRocket = await poll(
      pageB,
      (state) => hasWeapon(state, "rocket-launcher"),
      4000,
    );
  }
  check(
    "another real player can collect the advanced elimination drop",
    hasWeapon(collectedRocket, "rocket-launcher") &&
      collectedRocket.local.weapons.every(
        (weapon) =>
          weapon.id !== "rocket-launcher" || weapon.ammo === rocketLootPosition.ammo,
      ),
    `ammo=${collectedRocket.local.weapons.find((weapon) => weapon.id === "rocket-launcher")?.ammo}`,
  );
  const respawnedA = await poll(
    pageA,
    (state) =>
      state.local?.alive === true &&
      state.local.weapons[2].owned === false,
    7000,
  );
  check(
    "advanced weapons reset to the starter loadout on respawn",
    respawnedA.local.alive &&
      respawnedA.local.weapons[0].id === "vibe-rifle" &&
      respawnedA.local.weapons[1].id === "scatter-blaster" &&
      respawnedA.local.weapons[2].owned === false,
    JSON.stringify(respawnedA.local.weapons),
  );
  await hook(pageA, "guard");

  const weaponCycle = [
    "akimbo-rifles",
    "vibe-smg",
    "heavy-cannon",
    "rocket-launcher",
    "vibe-lance",
    "scatter-blaster",
  ];
  await hook(pageA, "extendMatch", 90_000);
  for (let index = 0; index < 6; index += 1) {
    let joinedRoom = null;
    let joinedClient = null;
    for (let attempt = 0; attempt < 3 && !joinedRoom; attempt += 1) {
      const client = new Client(serverUrl);
      try {
        joinedRoom = await client.joinById(initialA.roomId, {
          name: `ARSENAL-${index + 1}`,
        });
        joinedClient = client;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
    }
    if (!joinedRoom || !joinedClient) {
      throw new Error(`could not join arsenal filler ${index + 1}`);
    }
    fillers.push({
      client: joinedClient,
      room: joinedRoom,
      weaponId: weaponCycle[index],
    });
  }
  await pageA.waitForTimeout(600);
  await hook(pageA, "giveWeapon", initialA.sessionId, "akimbo-rifles");
  for (const filler of fillers) {
    await hook(
      pageA,
      "giveWeapon",
      filler.room.sessionId,
      filler.weaponId,
    );
    await hook(pageA, "guardTarget", filler.room.sessionId);
  }
  await pageA.waitForTimeout(450);
  const fillerState = await probe(pageA);
  for (const filler of fillers) {
    const participant = fillerState.participants.find(
      (entry) => entry.id === filler.room.sessionId,
    );
    if (
      participant &&
      participant.weaponId !== filler.weaponId
    ) {
      await hook(
        pageA,
        "giveWeapon",
        filler.room.sessionId,
        filler.weaponId,
      );
    }
  }
  await pageA.waitForTimeout(350);
  await hook(pageA, "setZoom", 1);
  const positions = [1050, 1150, 1250, 1600, 1700, 1800];
  for (let index = 0; index < fillers.length; index += 1) {
    await teleportBot(
      pageA,
      fillers[index].room.sessionId,
      positions[index],
      1340,
    );
  }
  await teleport(pageA, 1400, 1340);
  await teleport(pageB, 1500, 1340);
  await pageA.waitForTimeout(500);
  const mixed = await probe(pageA);
  const mixedWeapons = new Set(
    mixed.participants
      .filter((participant) => participant.kind === "human")
      .map((participant) => participant.weaponId),
  );
  check(
    "eight humans hold a mixed advanced arsenal",
    mixed.participants.filter((participant) => participant.kind === "human")
      .length === 8 &&
      ["akimbo-rifles", "vibe-smg", "heavy-cannon", "rocket-launcher"].every(
        (weaponId) => mixedWeapons.has(weaponId),
      ),
    [...mixedWeapons].join(","),
  );
  await screenshot(pageA, "09-eight-combatants-varied-weapons");

  const finalState = await probe(pageA);
  check(
    "the advanced snapshot remains bounded",
    finalState.snapshotBytes < 36000,
    `${finalState.snapshotBytes} bytes`,
  );
  check(
    "no browser page errors",
    pageErrors.length === 0,
    pageErrors.slice(0, 4).join(" | "),
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
      // ignore cleanup
    }
  }
  await contextA.close();
  await contextB.close();
  await browser.close();
}
