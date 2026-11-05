/**
 * P3B-A online pickup verification.
 *
 * Requires the production build and Colyseus server running:
 *   npm run build
 *   npm run server:start
 *   npm run start -- -p 3101
 *   BASE_URL=http://localhost:3101 ARTIFACT_DIR=artifacts/p3b-a npm run verify:online:pickups
 *
 * Two independent Chromium contexts join the same room. The test verifies
 * synchronized pickups, proximity collection, cross-client disappearance,
 * medkit healing and the world respawn timer, then checks a second room keeps
 * independent pickup state.
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

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const local = value.snapshot?.participants.find(
      (participant) => participant.id === value.sessionId,
    );
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: value.snapshot?.phase ?? null,
      remainingMs: Math.round(value.snapshot?.remainingMs ?? 0),
      health: Math.round(local?.health ?? 0),
      maxHealth: local?.maxHealth ?? 100,
      medkits: local?.medkits ?? 0,
      alive: local?.alive ?? false,
      x: Math.round(local?.x ?? 0),
      y: Math.round(local?.y ?? 0),
      pickups: (value.snapshot?.pickups ?? []).map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.respawnIn,
      })),
      pickupViews: value.pickups ?? [],
      hudMedkits: value.hud.medkits,
      hudMaxMedkits: value.hud.maxMedkits,
      toast: document.querySelector('[data-testid="medkit-toast"]')?.textContent ?? "",
      hudCounter:
        document.querySelector('[data-testid="hud-medkits"]')?.getAttribute("data-medkits") ??
        null,
    };
  });

const screenshot = async (page, name) => {
  if (!artifactDir) return;
  await page.screenshot({ path: `${artifactDir}/${name}.png` });
};

const press = async (page, code, holdMs = 0) => {
  await page.keyboard.down(code);
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await page.keyboard.up(code);
};

const collectNearest = async (page, expectedBefore) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = await probe(page);
    if (!before.alive) {
      await page.waitForTimeout(600);
      continue;
    }
    const candidates = before.pickups
      .filter(
        (pickup) => pickup.active && pickup.type === "medkit",
      )
      .sort((left, right) => {
        const leftScore =
          Math.abs(left.y - before.y) * 4 + Math.abs(left.x - before.x);
        const rightScore =
          Math.abs(right.y - before.y) * 4 + Math.abs(right.x - before.x);
        return leftScore - rightScore;
      });
    if (candidates.length === 0) return null;
    const target = candidates[0];
    const key = target.x >= before.x ? "KeyD" : "KeyA";
    const startX = before.x;
    await page.keyboard.down(key);
    let collected = false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 4200) {
      await page.waitForTimeout(45);
      const now = await probe(page);
      if (now.medkits > expectedBefore) {
        collected = true;
        break;
      }
      if (!now.alive) break;
      const traveled = Math.abs(now.x - startX);
      const remaining = Math.abs(target.x - now.x);
      if (traveled > 40 && remaining < 20) {
        await page.waitForTimeout(120);
      }
      if (
        (key === "KeyD" && now.x > target.x + 70) ||
        (key === "KeyA" && now.x < target.x - 70)
      ) {
        break;
      }
    }
    await page.keyboard.up(key);
    if (collected) return target;
    const backKey = key === "KeyD" ? "KeyA" : "KeyD";
    await page.keyboard.down(backKey);
    await page.waitForTimeout(220);
    await page.keyboard.up(backKey);
  }
  return null;
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
  const medkitsA = initialA.pickups.filter(
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
    "fourteen medkit pickups spawn in Sector 07",
    medkitsA.length === 14 && medkitsA.every((pickup) => pickup.active),
    `count=${medkitsA.length}`,
  );
  check(
    "contact, frag and stinking caches spawn",
    contactCaches.length === 3 &&
      fragCaches.length === 3 &&
      stinkingCaches.length === 3 &&
      contactCaches.every((pickup) => pickup.active) &&
      fragCaches.every((pickup) => pickup.active) &&
      stinkingCaches.every((pickup) => pickup.active) &&
      initialA.pickups.length === 31,
    `contact=${contactCaches.length} frag=${fragCaches.length} stink=${stinkingCaches.length} total=${initialA.pickups.length}`,
  );
  check(
    "all pickups have rendered world views",
    initialA.pickupViews.length === initialA.pickups.length &&
      initialA.pickupViews.every((pickup) => Boolean(pickup.texture)),
    `views=${initialA.pickupViews.length}`,
  );

  await pageB.goto(roomUrl, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  const joinedB = await probe(pageB);
  check("second browser joins the same room", joinedB.roomId === roomId);

  const idsA = initialA.pickups.map((pickup) => pickup.id).sort();
  const idsB = joinedB.pickups.map((pickup) => pickup.id).sort();
  const positionsA = initialA.pickups
    .map((pickup) => `${pickup.id}:${pickup.x}:${pickup.y}`)
    .sort()
    .join("|");
  const positionsB = joinedB.pickups
    .map((pickup) => `${pickup.id}:${pickup.x}:${pickup.y}`)
    .sort()
    .join("|");
  check(
    "both clients see identical pickup IDs",
    JSON.stringify(idsA) === JSON.stringify(idsB),
    `${idsA.length} ids`,
  );
  check(
    "both clients see identical pickup positions",
    positionsA === positionsB,
  );
  check(
    "clients start with no carried medkits",
    initialA.medkits === 0 && joinedB.medkits === 0,
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
  await pageA.waitForTimeout(400);
  await screenshot(pageA, "01-pickups-spawn");

  const preCollect = await probe(pageA);
  const collected = await collectNearest(pageA, preCollect.medkits);
  check("a player can reach and collect a medkit", Boolean(collected), collected?.id ?? "none");
  await pageA.waitForTimeout(500);
  const afterCollectA = await probe(pageA);
  const afterCollectB = await probe(pageB);
  const collectedId = collected?.id ?? "";
  check(
    "collector keeps one medkit",
    afterCollectA.medkits === 1,
    `medkits=${afterCollectA.medkits}`,
  );
  check(
    "collected pickup is inactive on the collector",
    afterCollectA.pickups.find((pickup) => pickup.id === collectedId)?.active === false,
  );
  check(
    "collected pickup disappears for the other client too",
    afterCollectB.pickups.find((pickup) => pickup.id === collectedId)?.active === false,
  );
  check(
    "rendered pickup view is hidden on both clients",
    afterCollectA.pickupViews.find((pickup) => pickup.id === collectedId)?.visible === false &&
      afterCollectB.pickupViews.find((pickup) => pickup.id === collectedId)?.visible === false,
  );
  check(
    "online HUD shows the carried medkit",
    afterCollectA.hudMedkits === 1 &&
      afterCollectA.hudCounter === "1" &&
      afterCollectA.hudMaxMedkits === 2,
    `hud=${afterCollectA.hudMedkits}/${afterCollectA.hudMaxMedkits}`,
  );
  await screenshot(pageA, "02-medkit-collected");

  const preFullUse = await probe(pageA);
  if (
    preFullUse.alive &&
    preFullUse.medkits > 0 &&
    preFullUse.health >= preFullUse.maxHealth
  ) {
    await pageA.keyboard.press("KeyH");
    await pageA.waitForTimeout(450);
    const afterFullUse = await probe(pageA);
    check(
      "server rejects a medkit at full health",
      afterFullUse.medkits === preFullUse.medkits &&
        afterFullUse.health === afterFullUse.maxHealth,
      `health=${afterFullUse.health} medkits=${afterFullUse.medkits}`,
    );
  }

  const contextD = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageD = await contextD.newPage();
  pageD.on("pageerror", (error) => pageErrors.push(`D: ${error.message}`));
  await pageD.goto(roomUrl, { waitUntil: "networkidle" });
  await pageD.waitForTimeout(500);
  await pageD.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageD);
  await pageD.waitForTimeout(400);
  const lateJoin = await probe(pageD);
  check(
    "late join sees the already-collected pickup inactive",
    lateJoin.pickups.find((pickup) => pickup.id === collectedId)?.active === false,
  );
  check(
    "late join starts with no inventory duplication",
    lateJoin.medkits === 0 && lateJoin.hudMedkits === 0,
    `medkits=${lateJoin.medkits}`,
  );
  await pageD.close();
  await contextD.close();

  // Move away so the collected pickup can respawn without being re-collected.
  const escapeKey = afterCollectA.x > 1800 ? "KeyA" : "KeyD";
  await press(pageA, escapeKey, 900);

  const pageC = await contextA.newPage();
  pageC.on("pageerror", (error) => pageErrors.push(`C: ${error.message}`));
  await pageC.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(900);
  await pageC.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageC);
  const secondRoom = await probe(pageC);
  check("second room has a different ID", secondRoom.roomId !== roomId);
  check(
    "second room keeps the same pickup active",
    secondRoom.pickups.find((pickup) => pickup.id === collectedId)?.active === true,
  );
  check(
    "second room has no carried medkits from room one",
    secondRoom.medkits === 0,
  );
  await pageC.close();

  // Wait for the medkit pickup to respawn. Bots can collect the respawned
  // cache, so accept either an active cache or a reset 20-second timer.
  const respawnStartedAt = Date.now();
  let respawnCycleSeen = false;
  let previousRespawnIn = null;
  while (Date.now() - respawnStartedAt < 28000) {
    await pageA.waitForTimeout(100);
    const now = await probe(pageA);
    const pickup = now.pickups.find((entry) => entry.id === collectedId);
    if (!pickup) continue;
    if (pickup.active) {
      respawnCycleSeen = true;
      break;
    }
    if (
      previousRespawnIn !== null &&
      previousRespawnIn <= 1.25 &&
      pickup.respawnIn >= 15
    ) {
      respawnCycleSeen = true;
      break;
    }
    previousRespawnIn = pickup.respawnIn;
  }
  const respawnA = await probe(pageA);
  const respawnB = await probe(pageB);
  const pickupA = respawnA.pickups.find((pickup) => pickup.id === collectedId);
  const pickupB = respawnB.pickups.find((pickup) => pickup.id === collectedId);
  check(
    "pickup respawns for both clients",
    respawnCycleSeen &&
      Boolean(pickupA) &&
      Boolean(pickupB) &&
      (pickupA?.active === true || (pickupA?.respawnIn ?? 0) >= 15) &&
      (pickupB?.active === true || (pickupB?.respawnIn ?? 0) >= 15),
    `active=${pickupA?.active} respawnIn=${Math.round(pickupA?.respawnIn ?? 0)}`,
  );
  check(
    "rendered pickup view returns after respawn",
    pickupA?.active === true
      ? Boolean(
          respawnA.pickupViews.find(
            (pickup) =>
              pickup.id === collectedId &&
              pickup.active === true &&
              Boolean(pickup.texture),
          ),
        )
      : true,
    `active=${pickupA?.active} views=${respawnA.pickupViews.length}`,
  );
  if (pickupA?.active === true) {
    await screenshot(pageA, "03-pickup-respawned");
  }

  // Wait for a live damage window while keeping a medkit in the inventory.
  let damaged = null;
  const damageStartedAt = Date.now();
  while (Date.now() - damageStartedAt < 45000) {
    const now = await probe(pageA);
    if (!now.alive) {
      await pageA.waitForTimeout(400);
      continue;
    }
    if (now.medkits <= 0) {
      const target = await collectNearest(pageA, 0);
      if (!target) await pageA.waitForTimeout(500);
      continue;
    }
    if (now.health < now.maxHealth) {
      damaged = now;
      break;
    }
    await pageA.waitForTimeout(150);
  }
  if (damaged) {
    const beforeHealth = damaged.health;
    const beforeMedkits = damaged.medkits;
    await pageA.keyboard.press("KeyH");
    await pageA.waitForTimeout(300);
    const healed = await probe(pageA);
    check(
      "H consumes one medkit and restores health",
      healed.medkits === beforeMedkits - 1 &&
        (healed.health > beforeHealth ||
          healed.toast.includes("HP") ||
          healed.health === healed.maxHealth),
      `health ${beforeHealth} -> ${healed.health}, medkits ${beforeMedkits} -> ${healed.medkits}`,
    );
    check(
      "health never exceeds the maximum",
      healed.health <= healed.maxHealth,
      `${healed.health}/${healed.maxHealth}`,
    );
    check(
      "medkit feedback appears in the online HUD",
      healed.toast.includes("MEDKIT") && healed.toast.includes("HP"),
      healed.toast.replace(/\s+/g, " ").trim(),
    );
    const healMatch = healed.toast.match(/\+(\d+)\s*HP/);
    check(
      "reported heal stays within the medkit budget",
      Boolean(healMatch) &&
        Number(healMatch?.[1] ?? 0) > 0 &&
        Number(healMatch?.[1] ?? 0) <= 50,
      healMatch?.[0] ?? "no heal amount",
    );
    await screenshot(pageA, "04-medkit-heal");

    await pageA.keyboard.press("KeyH");
    await pageA.waitForTimeout(350);
    const duplicate = await probe(pageA);
    check(
      "duplicate use is rejected without consuming another medkit",
      duplicate.medkits === healed.medkits &&
        duplicate.health <= duplicate.maxHealth,
      `medkits=${duplicate.medkits} health=${duplicate.health}`,
    );
  } else {
    check(
      "bot damage arrives for a live heal check",
      false,
      "no damage within 45s; authoritative heal is covered by unit tests",
    );
  }

  check(
    "match is still live after pickup verification",
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
  await contextA.close();
  await contextB.close();
  await browser.close();
}
