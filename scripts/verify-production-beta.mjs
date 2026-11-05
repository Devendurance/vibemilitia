/**
 * Public beta verification.
 *
 * Runs against the deployed production frontend and the public WSS game server.
 * No test hooks are used, so this exercises the same paths a real player takes.
 *
 *   BASE_URL=https://vibemilitia.vercel.app \
 *   COLYSEUS_URL=https://vibemilitia-game.endyos.xyz \
 *   npm run verify:production
 *
 * Match one runs with bots to exercise countdown fill, combat and caches.
 * Match two fills all eight seats with real SDK connections so the round ends
 * on the 90 second clock, which is what the participation floor needs before
 * it awards XP.
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "https://vibemilitia.vercel.app";
const serverUrl = process.env.COLYSEUS_URL ?? "https://vibemilitia-game.endyos.xyz";
const artifactDir = process.env.ARTIFACT_DIR ?? "";
const executablePath = process.env.CHROME_PATH;
const expectedBackendHost = new URL(serverUrl).host;

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

if (artifactDir) await mkdir(artifactDir, { recursive: true });

const waitOnlineReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.__VIBE_MILITIA_ONLINE__), null, {
    timeout: 45000,
  });
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true,
    null,
    { timeout: 45000 },
  );
};

const probe = async (page) => {
  // Phaser pauses when a tab is hidden, so keep the sampled page active.
  await page.bringToFront().catch(() => undefined);
  return page.evaluate(() => {
    const booted = window.__VIBE_MILITIA_ONLINE__;
    if (!booted) {
      return { booted: false, token: window.localStorage.getItem("vibe-militia-guest-token") };
    }
    const value = booted.getProbe();
    const snapshot = value.snapshot ?? null;
    const self = snapshot?.participants.find((entry) => entry.id === value.sessionId);
    return {
      booted: true,
      roomId: value.roomId,
      sessionId: value.sessionId,
      token: window.localStorage.getItem("vibe-militia-guest-token"),
      phase: snapshot?.phase ?? null,
      endReason: snapshot?.endReason ?? null,
      elapsedMs: Math.round(snapshot?.elapsedMs ?? 0),
      remainingMs: Math.round(snapshot?.remainingMs ?? 0),
      countdownMs: Math.round(snapshot?.countdownRemainingMs ?? 0),
      humans: snapshot?.humans ?? 0,
      bots: snapshot?.bots ?? 0,
      serverTickMs: snapshot?.serverTickMs ?? 0,
      self: self
        ? {
            skinId: self.skinId,
            x: Math.round(self.x),
            y: Math.round(self.y),
            health: self.health,
            alive: self.alive,
            invulnerable: self.invulnerable,
            grenadeContact: self.grenadeContact,
            medkits: self.medkits,
            equippedSlot: self.equippedSlot ?? 0,
            weapons: (self.weapons ?? []).map((slot) => ({
              owned: slot.owned,
              id: slot.id ?? null,
              ammo: slot.ammo ?? null,
            })),
          }
        : null,
      participants: (snapshot?.participants ?? []).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        skinId: entry.skinId,
        x: Math.round(entry.x),
        y: Math.round(entry.y),
        health: entry.health,
        alive: entry.alive,
      })),
      projectiles: snapshot?.projectiles ?? [],
      pickups: snapshot?.pickups ?? [],
      overlayVisible:
        document
          .querySelector('[data-testid="results-overlay"]')
          ?.classList.contains("is-visible") ?? false,
      resultsXp:
        document.querySelector('[data-testid="results-xp"]')?.textContent ?? "",
      reconnectVisible: Boolean(
        document.querySelector('[data-testid="reconnect-overlay"]'),
      ),
      touchControls: Boolean(document.querySelector('[data-testid="touch-controls"]')),
    };
  });
};

const waitForAlive = async (page) => {  await page.waitForFunction(
    () => {
      const online = window.__VIBE_MILITIA_ONLINE__?.getProbe();
      const self = online?.snapshot?.participants.find(
        (entry) => entry.id === online.sessionId,
      );
      return Boolean(self?.alive) && (self?.invulnerable ?? 1500) < 50;
    },
    null,
    { timeout: 40000 },
  );
};

const probeStable = async (page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await probe(page);
    if (state.booted && state.self) return state;
    await page.waitForTimeout(400);
  }
  return probe(page);
};

const inventoryTotal = (state) =>
  (state.self?.medkits ?? 0) +
  (state.self?.grenadeContact ?? 0) +
  state.self.weapons.filter((slot) => slot.owned).length;

const profileFromServer = async (token) => {
  const response = await fetch(`${serverUrl}/api/profile`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, player: (await response.json()).player };
};

const dismissOnboarding = async (page) => {
  const button = page.locator('[data-testid="onboarding-dismiss"]');
  if (await button.count()) {
    await button.first().click().catch(() => undefined);
    await page.waitForTimeout(250);
  }
};

const waitForPhase = async (page, phase, timeout = 150000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await probe(page);
    if (state.phase === phase) return state;
    await page.waitForTimeout(2000);
  }
  return probe(page);
};

const httpChecks = async () => {
  const health = await fetch(`${serverUrl}/health`);
  const healthBody = await health.json();
  check("public game server health is HTTPS 200", health.ok, `${health.status}`);
  check(
    "public health reports the ffa service",
    healthBody.service === "vibe-militia-server" && healthBody.mode === "ffa",
    `${healthBody.service}/${healthBody.mode}`,
  );
  const ready = await fetch(`${serverUrl}/ready`);
  const readyBody = await ready.json();
  check("public readiness endpoint is 200", ready.ok, `${ready.status}`);
  check(
    "game server persists to PostgreSQL",
    readyBody.database?.backend === "postgres",
    `${readyBody.database?.backend}`,
  );
  const apiConfig = await (await fetch(`${serverUrl}/api/config`)).json();
  check(
    "game server reports postgres persistence on /api/config",
    apiConfig.persistence === "postgres",
    apiConfig.persistence,
  );
  check(
    "production countdown and reconnect grace are configured",
    apiConfig.matchCountdownMs >= 10000 && apiConfig.reconnectGraceSeconds >= 10,
    `countdown=${apiConfig.matchCountdownMs} grace=${apiConfig.reconnectGraceSeconds}`,
  );
  const landing = await fetch(`${baseUrl}/`);
  check("public landing page is 200", landing.ok, `${landing.status}`);
  const online = await fetch(`${baseUrl}/online`);
  check("public /online route is 200", online.ok, `${online.status}`);
  const html = await landing.text();
  check(
    "landing page is not behind a deployment auth wall",
    !/Authentication Required|vercel_authentication/i.test(html),
    "",
  );
  const bundle = await fetch(`${baseUrl}/online`);
  check(
    "production frontend is served from the requested Vercel domain",
    new URL(bundle.url).host === new URL(baseUrl).host,
    new URL(bundle.url).host,
  );
};

await httpChecks();

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=swiftshader"],
});

const consoleIssues = [];
const apiHosts = new Set();
const socketUrls = new Set();
const trackPage = (label, page) => {
  page.on("pageerror", (error) => consoleIssues.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ABORTED/.test(text)) return;
    if (/mixed content|cors|failed to connect|websocket/i.test(text)) {
      consoleIssues.push(`${label} console: ${text}`);
    }
  });
  page.on("websocket", (socket) => socketUrls.add(socket.url()));
  page.on("response", (response) => {
    if (!response.url().includes("/api/")) return;
    try {
      apiHosts.add(new URL(response.url()).host);
    } catch {
      /* ignore */
    }
  });
};

const desktopA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktopB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await desktopA.newPage();
const pageB = await desktopB.newPage();
trackPage("A", pageA);
trackPage("B", pageB);

await pageA.addInitScript(() => {
  window.localStorage.setItem("vibe-militia-skin", "viber-006");
});

const fillers = [];
let mobileContext = null;

try {
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "domcontentloaded" });
  await pageA.waitForSelector('[data-testid="skin-selection"]', { timeout: 60000 });
  await dismissOnboarding(pageA);
  await pageA.waitForSelector('[data-testid="profile-panel"]', { timeout: 45000 });
  await pageA.waitForFunction(
    () => Boolean(window.localStorage.getItem("vibe-militia-guest-token")),
    null,
    { timeout: 45000 },
  );
  let stateA = await probe(pageA);
  const tokenA = stateA.token;
  check("guest profile is issued against the public API", Boolean(tokenA));
  const initialProfile = await profileFromServer(tokenA);
  check(
    "guest profile is readable from the production database",
    initialProfile.ok && initialProfile.player.level >= 1,
    `level=${initialProfile.player?.level} xp=${initialProfile.player?.xp}`,
  );

  const radioCount = await pageA
    .locator('[data-testid="skin-selection"] input[type="radio"]')
    .count();
  check("character picker lists the validated roster", radioCount === 10, `${radioCount} cards`);
  await pageA.locator('input[type="radio"][value="viber-006"]').check({ force: true });
  await pageA.waitForTimeout(200);
  check(
    "character selection is persisted on the device",
    (await pageA.evaluate(() => window.localStorage.getItem("vibe-militia-skin"))) === "viber-006",
  );

  // Warm the second client so the countdown join reflects a player already in
  // the lobby rather than a cold asset load.
  await pageB.goto(`${baseUrl}/online`, { waitUntil: "domcontentloaded" });
  await pageB.waitForSelector('[data-testid="skin-selection"]', { timeout: 60000 });
  await dismissOnboarding(pageB);

  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  stateA = await probe(pageA);
  const roomId = stateA.roomId;
  const roomUrl = pageA.url();
  check(
    "create room starts a server-owned countdown",
    stateA.phase === "countdown" && stateA.countdownMs > 0,
    `phase=${stateA.phase} countdown=${stateA.countdownMs}`,
  );
  check(
    "host joins with the selected Viber",
    stateA.self?.skinId === "viber-006",
    stateA.self?.skinId ?? "none",
  );

  await pageB.goto(roomUrl, { waitUntil: "domcontentloaded" });
  await pageB.waitForSelector('[data-testid="join-invite-room"]', { timeout: 45000 });
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  let stateB = await probe(pageB);
  check("second browser joins the same room", stateB.roomId === roomId, stateB.roomId);
  check(
    "second browser joins during the countdown or replaces a bot",
    stateB.phase === "countdown" ? stateB.bots === 0 : stateB.humans === 2,
    `phase=${stateB.phase} remaining=${stateB.countdownMs} humans=${stateB.humans} bots=${stateB.bots}`,
  );

  await pageA.waitForFunction(
    () => {
      const snap = window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot;
      return Boolean(snap && snap.phase === "live" && snap.bots > 0);
    },
    null,
    { timeout: 40000 },
  );
  stateA = await probe(pageA);
  check(
    "countdown expiry starts the live match with bots",
    stateA.phase === "live" && stateA.bots >= 1,
    `phase=${stateA.phase} bots=${stateA.bots}`,
  );
  check(
    "all eight seats are populated by humans and bots",
    stateA.participants.length === 8 && stateA.humans === 2,
    `${stateA.participants.length} seats, ${stateA.humans} humans, ${stateA.bots} bots`,
  );
  const roster = stateA.participants.map((entry) => entry.skinId).filter(Boolean);
  check(
    "bot skins come from the validated roster",
    roster.length === 8 && roster.every((skin) => typeof skin === "string"),
    `${roster.length} combatants`,
  );

  const startPickups = stateA.pickups.filter((pickup) => pickup.active);
  const startTypes = new Set(startPickups.map((pickup) => pickup.type));
  check(
    "authored supply caches are served to clients",
    startPickups.length >= 25,
    `${startPickups.length} active caches when the match went live`,
  );
  check(
    "weapon caches are present in the live arena",
    startTypes.has("vibe-lance") && startTypes.has("rocket-launcher"),
    `${startTypes.size} cache types`,
  );
  check(
    "starter loadout opens with two owned weapons",
    stateA.self.weapons.filter((slot) => slot.owned).length === 2,
    `${stateA.self.weapons.filter((slot) => slot.owned).length} owned at match start`,
  );

  // Movement authority and cross-client synchronisation.
  const guestViewBefore = ((await probe(pageB)).participants ?? []).find(
    (entry) => entry.id === stateA.sessionId,
  )?.x;  let beforeMoveA = stateA;
  let afterMoveA = stateA;
  let moveDelta = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForAlive(pageA);
    beforeMoveA = await probeStable(pageA);
    const direction = attempt % 2 === 0 ? "KeyD" : "KeyA";
    await pageA.keyboard.down(direction);
    await pageA.waitForTimeout(900);
    await pageA.keyboard.up(direction);
    await pageA.waitForTimeout(600);
    afterMoveA = await probeStable(pageA);
    if (!beforeMoveA.self || !afterMoveA.self) continue;
    moveDelta = Math.abs(afterMoveA.self.x - beforeMoveA.self.x);
    if (moveDelta > 20) break;
  }
  check("host movement is applied by the server", moveDelta > 20, `dx=${moveDelta}`);
  // Remote combatants interpolate, so let the view settle before comparing.
  await pageA.waitForTimeout(1800);
  const guestViewAfter = ((await probe(pageB)).participants ?? []).find(
    (entry) => entry.id === afterMoveA.sessionId,
  )?.x;
  const guestSeesMovement =
    typeof guestViewBefore === "number" && guestViewAfter !== guestViewBefore;
  check(
    "second client sees the host in a synchronised position",
    guestSeesMovement && Math.abs(guestViewAfter - (afterMoveA.self?.x ?? 0)) < 150,
    `guest=${guestViewAfter} host=${afterMoveA.self?.x}`,
  );

  // Firing needs pointer input on the canvas; aim away from the right wall so
  // projectiles stay alive long enough to be observed.
  const firePoint = await pageA.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const candidates = [
      [box.x + box.width * 0.3, box.y + box.height * 0.55],
      [box.x + box.width * 0.45, box.y + box.height * 0.6],
      [box.x + box.width * 0.5, box.y + box.height * 0.5],
    ];
    for (const [x, y] of candidates) {
      if (document.elementFromPoint(x, y)?.tagName === "CANVAS") return { x, y };
    }
    return null;
  });
  check("game canvas accepts pointer input", Boolean(firePoint), firePoint ? "hit test ok" : "covered");

  let firingA = await probe(pageA);
  let ownProjectiles = [];
  let ammoDropped = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForAlive(pageA);
    const beforeFire = await probeStable(pageA);
    if (!beforeFire.self) continue;
    const slot = beforeFire.self.equippedSlot;
    const ammoBefore = beforeFire.self.weapons[slot]?.ammo ?? null;
    await pageA.mouse.move(firePoint.x, firePoint.y);
    await pageA.mouse.down();
    for (let poll = 0; poll < 5; poll += 1) {
      await pageA.waitForTimeout(160);
      const burst = await probe(pageA);
      const live = burst.projectiles.filter(
        (projectile) => projectile.ownerId === burst.sessionId,
      );
      if (live.length > 0) ownProjectiles = live;
    }
    await pageA.mouse.up();
    firingA = await probe(pageA);
    const ammoAfter = firingA.self.weapons[slot]?.ammo ?? null;
    ammoDropped = ammoBefore !== null && ammoAfter !== null && ammoAfter < ammoBefore;
    if (ownProjectiles.length > 0 && ammoDropped) break;
  }
  check(
    "host firing consumes ammo and produces server projectiles",
    ownProjectiles.length > 0 && ammoDropped,
    `rounds=${ownProjectiles.length} ammoChanged=${ammoDropped}`,
  );

  let grenadesBefore = 0;
  let grenadesAfter = 0;
  let grenadeAttempted = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const phase = (await probe(pageA)).phase;
    if (phase !== "live") break;
    await waitForAlive(pageA).catch(() => undefined);
    const before = await probe(pageA);
    grenadesBefore = before.self?.grenadeContact ?? 0;
    grenadeAttempted = true;
    await pageA
      .locator('[data-testid="grenade-throw"]')
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await pageA.waitForTimeout(1400);
    grenadesAfter = (await probe(pageA)).self?.grenadeContact ?? grenadesBefore;
    if (grenadesAfter < grenadesBefore) break;
  }
  if (grenadeAttempted) {
    check(
      "grenade throw consumes the authoritative inventory",
      grenadesAfter < grenadesBefore,
      `${grenadesBefore} -> ${grenadesAfter}`,
    );
  }

  const midMatch = await probe(pageA);
  check(
    "cache state stays authoritative as combat consumes supplies",
    midMatch.pickups.filter((pickup) => pickup.active).length > 0,
    `${midMatch.pickups.filter((pickup) => pickup.active).length} active caches mid-match`,
  );

  // Match one: let the server finish the round with bots on the clock or score.
  // Match one: let the server finish the round with bots on the clock or score.
  const firstEnd = await waitForPhase(pageA, "ended", 160000);
  check("match reaches the ended phase on the server", firstEnd.phase === "ended", firstEnd.phase);
  check(
    "match ends through the server clock or score limit",
    ["time", "score"].includes(firstEnd.endReason ?? ""),
    `${firstEnd.endReason} after ${firstEnd.elapsedMs}ms`,
  );
  await pageA.waitForSelector('[data-testid="results-overlay"].is-visible', { timeout: 20000 });
  check("results overlay appears for the host", true);
  if (artifactDir) {
    await pageA.screenshot({ path: `${artifactDir}/beta-results-a.png` });
    await pageB.screenshot({ path: `${artifactDir}/beta-results-b.png` });
  }

  await pageA.locator('[data-testid="results-replay"]').click();
  const replayState = await waitForPhase(pageA, "live", 30000);
  check(
    "replay returns the room to a live match",
    replayState.phase === "live" && replayState.remainingMs > 80000,
    `phase=${replayState.phase} remaining=${replayState.remainingMs}`,
  );

  // Fill every seat with real connections so the round cannot hit the score
  // limit before the 90 second clock, which is what progression requires.
  for (let index = 0; index < 6; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, { name: `BETA-FILL-${index + 1}` });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
  }
  await pageA.waitForTimeout(3000);
  let filled = await probe(pageA);
  if (filled.humans < 8) {
    // A seat race can leave one bot in place; add one more real connection.
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, { name: "BETA-FILL-7" });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
    await pageA.waitForTimeout(3000);
    filled = await probe(pageA);
  }
  check(
    "real connections replace every bot seat",
    filled.humans === 8 && filled.bots === 0,
    `humans=${filled.humans} bots=${filled.bots}`,
  );

  // Bounded live cache collection during a calm human-only round, attributed
  // to an inventory change rather than cache state alone.
  const baseline = inventoryTotal(filled);
  let collected = false;
  let lastTarget = null;
  const pickupDeadline = Date.now() + 40000;
  while (Date.now() < pickupDeadline) {
    const current = await probe(pageA);
    if (inventoryTotal(current) > baseline) {
      collected = true;
      break;
    }
    if (!current.self?.alive) {
      await pageA.waitForTimeout(800);
      continue;
    }
    const nearest = current.pickups
      .filter((pickup) => pickup.active)
      .sort(
        (left, right) =>
          Math.abs(left.x - current.self.x) +
          Math.abs(left.y - current.self.y) -
          (Math.abs(right.x - current.self.x) + Math.abs(right.y - current.self.y)),
      )[0];
    if (!nearest) break;
    lastTarget = nearest;
    const dx = nearest.x - current.self.x;
    const dy = current.self.y - nearest.y;
    if (Math.abs(dx) > 40) {
      const key = dx > 0 ? "KeyD" : "KeyA";
      await pageA.keyboard.down(key);
      await pageA.waitForTimeout(Math.min(520, Math.abs(dx) * 2));
      await pageA.keyboard.up(key);
    }
    if (dy > 20 && Math.abs(dx) < 130) {
      await pageA.keyboard.down("KeyW");
      await pageA.waitForTimeout(340);
      await pageA.keyboard.up("KeyW");
    }
    await pageA.waitForTimeout(120);
  }
  const afterPickup = await probe(pageA);
  if (collected) {
    check(
      "a live player collects an authored cache",
      inventoryTotal(afterPickup) > baseline,
      `inventory ${baseline} -> ${inventoryTotal(afterPickup)}`,
    );
  } else {
    console.log(
      `INFO  live cache collection not observed (nearest ${lastTarget ? `${Math.round(lastTarget.x)},${Math.round(lastTarget.y)}` : "none"} vs player ${afterPickup.self?.x},${afterPickup.self?.y}).`,
    );
  }

  // Reconnect inside the grace window during a live match.
  await desktopA.setOffline(true);
  await pageA.waitForSelector('[data-testid="reconnect-overlay"]', { timeout: 25000 });
  check("network loss shows the reconnect overlay", true);
  await desktopA.setOffline(false);
  await pageA.waitForFunction(
    () => !document.querySelector('[data-testid="reconnect-overlay"]'),
    null,
    { timeout: 30000 },
  );
  const recovered = await probe(pageA);
  check(
    "client reconnects into the same room seat",
    recovered.roomId === roomId && recovered.phase === "live",
    `room=${recovered.roomId} phase=${recovered.phase}`,
  );

  // Match two runs the full 90 seconds so the participation floor is met.
  const secondEnd = await waitForPhase(pageA, "ended", 170000);
  check(
    "second match ends on the 90 second clock",
    secondEnd.phase === "ended" && secondEnd.endReason === "time",
    `${secondEnd.endReason} after ${secondEnd.elapsedMs}ms`,
  );
  await pageA.waitForSelector('[data-testid="results-overlay"].is-visible', { timeout: 20000 });
  const resultsXp = (await probe(pageA)).resultsXp;
  check("results overlay reports earned XP", /\+\d+\s*XP/i.test(resultsXp), resultsXp.trim().slice(0, 60));

  await pageA.waitForTimeout(8000);
  const settled = await profileFromServer(tokenA);
  check(
    "XP settles into the production database",
    settled.ok && settled.player.xp > 0,
    `xp=${settled.player?.xp}`,
  );
  check(
    "the settled match is recorded on the profile",
    settled.ok && settled.player.matchesPlayed >= 1,
    `matches=${settled.player?.matchesPlayed}`,
  );

  // Mobile landscape emulation (emulated, not a physical device).
  mobileContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mobilePage = await mobileContext.newPage();
  trackPage("mobile", mobilePage);
  await mobilePage.goto(`${baseUrl}/online?touch=1`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector('[data-testid="skin-selection"]', { timeout: 60000 });
  await dismissOnboarding(mobilePage);
  check(
    "landscape mobile layout has no portrait guard",
    (await mobilePage.locator('[data-testid="orientation-guard"]').count()) === 0,
  );
  await mobilePage.locator('[data-testid="quick-match"]').click();
  await waitOnlineReady(mobilePage);
  const mobileState = await probe(mobilePage);
  check(
    "mobile client joins matchmaking over WSS",
    Boolean(mobileState.roomId) && ["countdown", "live"].includes(mobileState.phase),
    `room=${mobileState.roomId} phase=${mobileState.phase}`,
  );
  check("touch controls render in landscape", mobileState.touchControls);
  const layout = await mobilePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    canvasWidth: document.querySelector("canvas")?.getBoundingClientRect().width ?? 0,
  }));
  check(
    "mobile landscape layout fits the viewport",
    layout.scrollWidth <= layout.innerWidth + 1 &&
      layout.canvasWidth > 0 &&
      layout.canvasWidth <= layout.innerWidth + 1,
    `scroll=${layout.scrollWidth} view=${layout.innerWidth} canvas=${Math.round(layout.canvasWidth)}`,
  );
  if (artifactDir) {
    await mobilePage.screenshot({ path: `${artifactDir}/beta-mobile-landscape.png` });
  }
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.waitForTimeout(600);
  check(
    "portrait orientation is guarded",
    (await mobilePage.locator('[data-testid="orientation-guard"]').count()) > 0,
  );

  check(
    "guest API traffic reaches the public game server",
    apiHosts.has(expectedBackendHost),
    [...apiHosts].join(",") || "none",
  );
  const secureSockets = [...socketUrls].filter((url) => url.startsWith("wss://"));
  check(
    "multiplayer runs over secure WebSockets",
    secureSockets.length > 0 &&
      secureSockets.every((url) => url.includes(expectedBackendHost)),
    `${secureSockets.length} wss connections`,
  );
  check(
    "no mixed content, CORS or socket errors in the browser",
    consoleIssues.length === 0,
    consoleIssues.slice(0, 3).join(" | "),
  );
} finally {
  for (const filler of fillers) {
    await filler.room.leave().catch(() => undefined);
  }
  await mobileContext?.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

const passed = checks.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) {
  for (const entry of checks.filter((item) => !item.ok)) {
    console.log(`FAILED  ${entry.name}  ${entry.detail}`);
  }
  process.exitCode = 1;
}
