/**
 * P3C-A elimination loot and weapon inventory verification.
 *
 * Requires the production build and a Colyseus server with deterministic
 * verification hooks enabled:
 *   npm run build
 *   VIBE_MILITIA_TEST_HOOKS=1 MATCH_COUNTDOWN_MS=0 npm run server:start
 *   npm run start -- -p 3101
 *   BASE_URL=http://localhost:3101 ARTIFACT_DIR=artifacts/p3c-a npm run verify:online:loot
 *
 * Two browser clients share one live room. A third client joins late. The
 * suite uses the gated debug hooks only to place combatants, force a valid
 * hostile elimination and end the match. All inventory, loot, collection,
 * expiry and replay state remains server-authoritative.
 */

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
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

const waitLive = async (page) => {
  await page.waitForFunction(
    () =>
      window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
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
    const loot = snapshot?.loot ?? [];
    const hud = value.hud;
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: snapshot?.phase ?? null,
      elapsedMs: snapshot?.elapsedMs ?? 0,
      serverTickMs: snapshot?.serverTickMs ?? 0,
      snapshotBytes: snapshot ? JSON.stringify(snapshot).length : 0,
      local: local
        ? {
            x: local.x,
            y: local.y,
            alive: local.alive,
            health: Math.round(local.health),
            medkits: local.medkits,
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
      bots: (snapshot?.participants ?? [])
        .filter((participant) => participant.kind === "bot")
        .map((bot) => ({
          id: bot.id,
          x: bot.x,
          y: bot.y,
          alive: bot.alive,
        })),
      participantIds: (snapshot?.participants ?? []).map(
        (participant) => participant.id,
      ),
      loot: loot.map((item) => ({
        id: item.id,
        kind: item.kind,
        weaponId: item.weaponId,
        weaponName: item.weaponName,
        ammo: item.ammo,
        grenadeType: item.grenadeType,
        x: item.x,
        y: item.y,
        eliminationId: item.eliminationId,
        remainingMs: item.remainingMs,
      })),
      lootViews: value.loot ?? [],
      pickups: (snapshot?.pickups ?? []).map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.respawnIn,
      })),
      hud: {
        weaponSlots: hud.weaponSlots,
        weaponName: hud.weaponName,
        ammo: hud.ammo,
        magazineSize: hud.magazineSize,
        medkits: hud.medkits,
        nearbyLootText: hud.nearbyLootText,
        nearbyLootCanSwap: hud.nearbyLootCanSwap,
        supplyFeedbackText: hud.supplyFeedbackText,
      },
      supplyToast:
        document.querySelector('[data-testid="supply-toast"]')?.textContent ?? "",
      prompt:
        document.querySelector('[data-testid="loot-prompt"]')?.textContent ?? "",
      promptCanSwap:
        document.querySelector('[data-testid="loot-prompt"]')
          ?.getAttribute("data-can-swap") ?? "",
      weaponSlotThree:
        document.querySelector('[data-testid="weapon-slot-3"]')?.textContent ??
        "",
      resultsVisible:
        document.querySelector('[data-testid="results-overlay"]')
          ?.className ?? "",
    };
  });

const screenshot = async (page, name) => {
  if (!artifactDir) return;
  await page.screenshot({ path: `${artifactDir}/${name}.png` });
};

const poll = async (page, predicate, timeoutMs = 6000) => {
  const startedAt = Date.now();
  let state = await probe(page);
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate(state)) return state;
    await page.waitForTimeout(90);
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
    },
    { hookName: name, hookArgs: args },
  );
};

const teleport = async (page, x, y) => {
  await hook(page, "teleport", x, y);
  await page.waitForTimeout(120);
};

const teleportBot = async (page, id, x, y) => {
  await hook(page, "teleportBot", id, x, y);
  await page.waitForTimeout(120);
};

const placeBot = async (page, id, x, y) => {
  await teleportBot(page, id, x, y);
  return poll(
    page,
    (state) => {
      const bot = state.bots.find((candidate) => candidate.id === id);
      return Boolean(
        bot && Math.abs(bot.x - x) < 24 && Math.abs(bot.y - y) < 24,
      );
    },
    1800,
  );
};

const newestBundle = (state) => {
  if (state.loot.length === 0) return [];
  const maxElimination = Math.max(
    ...state.loot.map((item) => item.eliminationId),
  );
  return state.loot.filter((item) => item.eliminationId === maxElimination);
};

const checkStarter = (state, label) => {
  const slots = state.hud.weaponSlots;
  check(
    `${label} HUD shows rifle, scatter and an empty third slot`,
    slots.length === 3 &&
      slots[0].owned &&
      slots[0].id === "vibe-rifle" &&
      slots[1].owned &&
      slots[1].id === "scatter-blaster" &&
      !slots[2].owned &&
      slots[2].name === "EMPTY",
    slots.map((slot) => `${slot.id || "EMPTY"}:${slot.ammo}/${slot.magazineSize}`).join(" "),
  );
  check(
    `${label} third slot renders as empty in the DOM`,
    state.weaponSlotThree.includes("EMPTY"),
    state.weaponSlotThree.trim(),
  );
};

try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(900);
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  await waitLive(pageA);
  const initialA = await probe(pageA);
  const roomUrl = `${baseUrl}/online?room=${initialA.roomId}`;
  check("room created and live", Boolean(initialA.roomId) && initialA.phase === "live");
  checkStarter(initialA, "host");

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  await waitLive(pageB);
  const initialB = await probe(pageB);
  check(
    "guest joins the same live room",
    initialB.roomId === initialA.roomId && initialB.sessionId !== initialA.sessionId,
    `${initialA.roomId}`,
  );
  checkStarter(initialB, "guest");
  await hook(pageA, "guard");
  await hook(pageB, "guard");
  await pageA.waitForTimeout(200);

  const lanceCaches = initialA.pickups.filter(
    (pickup) => pickup.type === "vibe-lance",
  );
  check(
    "Sector 07 authors two Vibe Lance pickups and keeps 23 supplies",
    initialA.pickups.length === 25 && lanceCaches.length === 2,
    `total=${initialA.pickups.length} lance=${lanceCaches.length}`,
  );
  check(
    "both clients agree on the authored pickup state",
    initialB.pickups.length === initialA.pickups.length &&
      initialB.pickups.filter((pickup) => pickup.type === "vibe-lance").length === 2,
  );

  const botState = await probe(pageA);
  const firstBot = botState.bots.find((bot) => bot.alive);
  check("a live bot is available for a real hostile elimination", Boolean(firstBot));
  await teleport(pageA, 1350, 1340);
  const placedFirst = await placeBot(pageA, firstBot.id, 1500, 1340);
  const placedFirstBot = placedFirst.bots.find((bot) => bot.id === firstBot.id);
  check(
    "the verified victim is placed at the test lane",
    Boolean(placedFirstBot && Math.abs(placedFirstBot.x - 1500) < 24),
    `x=${placedFirstBot?.x ?? "missing"}`,
  );
  await hook(pageA, "eliminate", firstBot.id, "bullet");
  await pageA.waitForTimeout(110);
  await screenshot(pageA, "01-elimination-burst");
  await pageA.waitForTimeout(2200);
  const droppedA = await poll(
    pageA,
    (state) => newestBundle(state).length === 3,
    4000,
  );
  await screenshot(pageA, "02-three-dropped-rewards");
  const droppedB = await probe(pageB);
  const bundleA = newestBundle(droppedA);
  const bundleB = newestBundle(droppedB);
  check(
    "a hostile elimination creates exactly one weapon, medkit and grenade",
    bundleA.length === 3 &&
      bundleA.map((item) => item.kind).sort().join(",") ===
        "grenade,medkit,weapon" &&
      bundleA[0].eliminationId > 0,
    bundleA.map((item) => `${item.kind}:${item.weaponId ?? item.grenadeType ?? ""}`).join(" "),
  );
  check(
    "the dropped weapon uses the victim's actual equipped rifle and ammo",
    bundleA.find((item) => item.kind === "weapon")?.weaponId === "vibe-rifle" &&
      bundleA.find((item) => item.kind === "weapon")?.ammo === 20,
    JSON.stringify(bundleA.find((item) => item.kind === "weapon") ?? null),
  );
  check(
    "both real browser clients receive the same loot ids",
    bundleB.length === 3 &&
      bundleB.map((item) => item.id).sort().join(",") ===
        bundleA.map((item) => item.id).sort().join(","),
    `A=${bundleA.length} B=${bundleB.length}`,
  );
  check(
    "every dropped item has a live Phaser view in both sessions",
    droppedA.lootViews.length >= 3 &&
      droppedB.lootViews.length >= 3 &&
      droppedA.lootViews.some((view) => view.texture === "weapon-player") &&
      droppedA.lootViews.some((view) => view.texture === "pickup-medkit") &&
      bundleA
        .filter((item) => item.kind === "grenade")
        .every((item) =>
          droppedA.lootViews.some(
            (view) => view.texture === `pickup-grenade-${item.grenadeType}`,
          ),
        ),
    droppedA.lootViews.map((view) => view.texture).join(","),
  );

  const weaponDrop = bundleA.find((item) => item.kind === "weapon");
  await teleport(pageA, weaponDrop.x, weaponDrop.y + 16);
  const pickupA = await poll(
    pageA,
    (state) => state.local?.weapons[2]?.owned === true,
    3000,
  );
  const pickupB = await probe(pageB);
  check(
    "a dropped weapon fills the empty third slot",
    pickupA.local.weapons[2].owned &&
      pickupA.local.weapons[2].id === "vibe-rifle" &&
      pickupA.local.equippedSlot === 2,
    JSON.stringify(pickupA.local.weapons),
  );
  check(
    "the collected weapon keeps the authoritative dropped ammo",
    pickupA.local.weapons[2].ammo === weaponDrop.ammo,
    `ammo=${pickupA.local.weapons[2].ammo}/${weaponDrop.ammo}`,
  );
  check(
    "the pickup toast confirms WEAPON ACQUIRED",
    pickupA.supplyToast.includes("WEAPON ACQUIRED"),
    pickupA.supplyToast.trim(),
  );
  check(
    "the guest sees the host's new weapon in the shared snapshot",
    pickupB.participantIds.includes(initialA.sessionId) &&
      pickupB.loot.some((item) => item.id === weaponDrop.id) === false,
    `remaining=${pickupB.loot.length}`,
  );
  await screenshot(pageA, "03-weapon-pickup");

  const lance = initialA.pickups.find((pickup) => pickup.type === "vibe-lance");
  await teleport(pageA, lance.x, lance.y + 16);
  const promptState = await poll(
    pageA,
    (state) => state.hud.nearbyLootCanSwap === true,
    2500,
  );
  check(
    "a full loadout shows the explicit E replacement prompt",
    promptState.hud.nearbyLootCanSwap &&
      promptState.hud.nearbyLootText.includes("SWAP") &&
      promptState.promptCanSwap === "true",
    promptState.hud.nearbyLootText,
  );
  await screenshot(pageA, "04-swap-prompt");
  await pageA.keyboard.press("KeyE");
  const swapped = await poll(
    pageA,
    (state) =>
      state.local?.weapons.some(
        (weapon) => weapon.owned && weapon.id === "vibe-lance",
      ) === true,
    3000,
  );
  const swappedB = await probe(pageB);
  check(
    "E swaps the equipped slot for the authored Vibe Lance",
    swapped.local.weapons.some(
      (weapon) => weapon.owned && weapon.id === "vibe-lance",
    ) && swapped.local.equippedSlot === 2,
    JSON.stringify(swapped.local.weapons),
  );
  check(
    "the swap does not duplicate the replaced rifle",
    swapped.local.weapons.filter((weapon) => weapon.id === "vibe-rifle").length <=
      1,
    JSON.stringify(swapped.local.weapons.map((weapon) => weapon.id)),
  );
  check(
    "the Vibe Lance world pickup is consumed for both clients",
    swappedB.loot.every((item) => item.kind === "weapon") ||
      swappedB.pickups.some(
        (pickup) => pickup.id === lance.id && pickup.active === false,
      ),
    `activeLance=${swappedB.pickups.filter((pickup) => pickup.type === "vibe-lance" && pickup.active).length}`,
  );
  check(
    "the swap toast confirms WEAPON SWAPPED or WEAPON ACQUIRED",
    swapped.supplyToast.includes("SWAPPED") ||
      swapped.supplyToast.includes("ACQUIRED") ||
      swapped.hud.supplyFeedbackText.includes("SWAPPED"),
    `${swapped.supplyToast} ${swapped.hud.supplyFeedbackText}`,
  );
  await screenshot(pageA, "05-inventory-swap");

  const secondBot = (await probe(pageA)).bots.find((bot) => bot.alive);
  const placedSecond = await placeBot(pageA, secondBot.id, 2600, 1340);
  const placedSecondBot = placedSecond.bots.find(
    (bot) => bot.id === secondBot.id,
  );
  check(
    "second verified victim is placed for the contest",
    Boolean(placedSecondBot && Math.abs(placedSecondBot.x - 2600) < 24),
  );
  await hook(pageA, "eliminate", secondBot.id, "grenade");
  const secondLoot = await poll(
    pageA,
    (state) => state.loot.filter((item) => item.kind === "medkit").length > 0,
    4000,
  );
  const contestMedkit = secondLoot.loot
    .filter((item) => item.kind === "medkit")
    .sort((left, right) => right.eliminationId - left.eliminationId)[0];
  check("a grenade elimination also produces a loot bundle", Boolean(contestMedkit));

  const contextC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageC = await contextC.newPage();
  pageC.on("pageerror", (error) => pageErrors.push(`C: ${error.message}`));
  await pageC.goto(roomUrl, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(500);
  await pageC.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageC);
  await waitLive(pageC);
  const late = await probe(pageC);
  check(
    "a late joiner receives the remaining uncollected loot",
    late.loot.some((item) => item.id === contestMedkit.id) &&
      late.loot.every((item) => item.remainingMs > 0),
    `loot=${late.loot.length}`,
  );
  checkStarter(late, "late joiner");
  const lateSession = late.sessionId;
  await contextC.close();
  const afterLateLeave = await poll(
    pageA,
    (state) => !state.participantIds.includes(lateSession),
    4000,
  );
  check(
    "a disconnected late joiner leaves the authoritative participant list",
    !afterLateLeave.participantIds.includes(lateSession),
    `participants=${afterLateLeave.participantIds.length}`,
  );

  const beforeContestA = await probe(pageA);
  const beforeContestB = await probe(pageB);
  await teleport(pageA, contestMedkit.x - 150, 1340);
  await teleport(pageB, contestMedkit.x + 150, 1340);
  await pageA.waitForTimeout(220);
  await screenshot(pageA, "06-loot-contested");
  const medkitsABefore = beforeContestA.local.medkits;
  const medkitsBBefore = beforeContestB.local.medkits;
  await Promise.all([
    hook(pageA, "teleport", contestMedkit.x, contestMedkit.y + 16),
    hook(pageB, "teleport", contestMedkit.x, contestMedkit.y + 16),
  ]);
  await pageA.waitForTimeout(600);
  const contestedA = await probe(pageA);
  const contestedB = await probe(pageB);
  const gainedA = contestedA.local.medkits - medkitsABefore;
  const gainedB = contestedB.local.medkits - medkitsBBefore;
  check(
    "two players contesting one medkit cannot both collect it",
    gainedA + gainedB === 1 &&
      !contestedA.loot.some((item) => item.id === contestMedkit.id) &&
      !contestedB.loot.some((item) => item.id === contestMedkit.id),
    `A+${gainedA} B+${gainedB}`,
  );
  check(
    "both clients agree the contested reward disappeared",
    contestedA.loot.length === contestedB.loot.length,
    `A=${contestedA.loot.length} B=${contestedB.loot.length}`,
  );

  const thirdBot = (await probe(pageA)).bots.find((bot) => bot.alive);
  await placeBot(pageA, thirdBot.id, 3000, 1340);
  await hook(pageA, "eliminate", thirdBot.id, "toxic");
  const expiring = await poll(
    pageA,
    (state) => state.loot.some((item) => item.eliminationId > 0),
    4000,
  );
  const expiringIds = expiring.loot.map((item) => item.id);
  check("toxic eliminations also create loot", expiringIds.length >= 3);
  await pageA.waitForTimeout(13000);
  const expiredA = await probe(pageA);
  const expiredB = await probe(pageB);
  check(
    "loot expires on the server simulation clock",
    expiringIds.every(
      (id) =>
        !expiredA.loot.some((item) => item.id === id) &&
        !expiredB.loot.some((item) => item.id === id) &&
        !expiredB.lootViews.some((view) => view.id === id),
    ),
    `tracked=${expiringIds.length} remaining=${expiredA.loot.length}`,
  );

  await teleport(pageA, 1150, 1340);
  const beforeDeath = await probe(pageA);
  await hook(pageB, "eliminate", beforeDeath.sessionId, "bullet");
  const deathLoot = await poll(
    pageA,
    (state) =>
      state.loot.some(
        (item) => item.kind === "weapon" && item.weaponId === "vibe-lance",
      ),
    4000,
  );
  check(
    "a human death drops the equipped Vibe Lance",
    deathLoot.loot.some(
      (item) => item.kind === "weapon" && item.weaponId === "vibe-lance",
    ),
    deathLoot.loot
      .filter((item) => item.kind === "weapon")
      .map((item) => item.weaponId)
      .join(","),
  );
  const respawned = await poll(
    pageA,
    (state) => state.local?.alive === true && state.local.weapons[2].owned === false,
    7000,
  );
  check(
    "death and respawn restore the starter loadout",
    respawned.local.alive &&
      respawned.local.weapons[0].id === "vibe-rifle" &&
      respawned.local.weapons[1].id === "scatter-blaster" &&
      respawned.local.weapons[2].owned === false &&
      respawned.local.equippedSlot === 0 &&
      respawned.local.weapons[0].ammo === 20,
    JSON.stringify(respawned.local.weapons),
  );
  check(
    "the respawned HUD marks the third slot empty again",
    respawned.hud.weaponSlots[2].owned === false &&
      respawned.weaponSlotThree.includes("EMPTY"),
    respawned.weaponSlotThree.trim(),
  );
  await hook(pageA, "guard");
  await hook(pageB, "guard");
  await screenshot(pageA, "07-respawn-loadout");

  const fourthBot = (await probe(pageA)).bots.find((bot) => bot.alive);
  await placeBot(pageA, fourthBot.id, 2000, 1340);
  await hook(pageA, "eliminate", fourthBot.id, "bullet");
  const beforeEnd = await poll(pageA, (state) => state.loot.length > 0, 4000);
  check("loot is present before match end", beforeEnd.loot.length > 0);
  await hook(pageA, "endMatch");
  const endedA = await poll(pageA, (state) => state.phase === "ended", 5000);
  const endedB = await probe(pageB);
  check(
    "match end clears every dynamic loot entity",
    endedA.loot.length === 0 && endedB.loot.length === 0,
    `A=${endedA.loot.length} B=${endedB.loot.length}`,
  );
  check(
    "match end shows the results overlay",
    endedA.resultsVisible.includes("is-visible"),
    endedA.resultsVisible.trim(),
  );
  await screenshot(pageA, "08-match-end-cleanup");

  await pageA.locator('[data-testid="results-replay"]').click();
  const replayA = await poll(pageA, (state) => state.phase === "live", 6000);
  const replayB = await probe(pageB);
  check(
    "replay clears loot and restores both starter loadouts",
    replayA.loot.length === 0 &&
      replayB.loot.length === 0 &&
      replayA.local.weapons[0].id === "vibe-rifle" &&
      replayA.local.weapons[2].owned === false &&
      replayB.local.weapons[0].id === "vibe-rifle" &&
      replayB.local.weapons[2].owned === false,
    `A=${replayA.local.weapons.map((weapon) => weapon.id).join(",")} B=${replayB.local.weapons.map((weapon) => weapon.id).join(",")}`,
  );
  await screenshot(pageA, "09-replay-reset");

  const perfState = await probe(pageA);
  const fps = await pageA.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = (now) => {
          frames += 1;
          if (now - start < duration) requestAnimationFrame(step);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(step);
      }),
    2000,
  );
  check(
    "client keeps a playable frame rate during loot play",
    fps >= 25,
    `${Math.round(fps)} fps`,
  );
  check(
    "snapshot payload stays bounded with dynamic loot",
    perfState.snapshotBytes < 30000,
    `${perfState.snapshotBytes} bytes`,
  );
  console.log("LOOT PERF", {
    fps: Math.round(fps),
    serverTickMs: Number(perfState.serverTickMs.toFixed(3)),
    snapshotBytes: perfState.snapshotBytes,
  });
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
  await contextA.close();
  await contextB.close();
  await browser.close();
}
