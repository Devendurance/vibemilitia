/**
 * P4 player-experience verification.
 *
 * Required server environment:
 *   VIBE_MILITIA_TEST_HOOKS=1
 *   MATCH_COUNTDOWN_MS=4000
 *   RECONNECT_GRACE_SECONDS=5
 *   XP_MIN_PARTICIPATION_MS=0
 *   DATABASE_PATH=<disposable sqlite file>
 *
 * Run against a production build:
 *   BASE_URL=http://localhost:3101 npm run verify:online:p4
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3101";
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
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

const pageErrors = [];
const trackErrors = (label, page) => {
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
};

const dismissGuide = async (page) => {
  const guide = page.locator('[data-testid="onboarding-overlay"]');
  if (await guide.count()) {
    await guide.locator('[data-testid="onboarding-dismiss"]').click();
    await page.waitForTimeout(150);
  }
};

const waitLive = (page) =>
  page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__?.getProbe();
    const local = value?.snapshot?.participants.find(
      (entry) => entry.id === value.sessionId,
    );
    return {
      sessionId: value?.sessionId ?? null,
      roomId: value?.snapshot?.roomId ?? null,
      phase: value?.snapshot?.phase ?? null,
      matchId: value?.snapshot?.matchId ?? null,
      locals: value?.snapshot?.humans ?? 0,
      local: local
        ? {
            x: local.x,
            y: local.y,
            ammo: local.weapons[local.equippedSlot]?.ammo ?? 0,
            equippedSlot: local.equippedSlot,
            weapons: local.weapons.map((weapon) => ({
              id: weapon.id,
              owned: weapon.owned,
              ammo: weapon.ammo,
              reloading: weapon.reloading,
            })),
            grenades: {
              contact: local.grenadeContact,
              frag: local.grenadeFrag,
              stinking: local.grenadeStinking,
            },
            medkits: local.medkits,
            grenadeSelected: local.grenadeSelected,
            health: local.health,
            fuel: local.fuel,
            alive: local.alive,
            connected: local.connected,
            level: local.level,
            badgeId: local.badgeId,
            trailId: local.trailId,
            aimAngle: local.aimAngle,
          }
        : null,
      audio: value?.audio ?? null,
      hudNearbyLootCanSwap: value?.hud?.nearbyLootCanSwap ?? false,
      hudNearbyLootText: value?.hud?.nearbyLootText ?? "",
      loot: value?.loot ?? [],
      grenades: value?.grenades ?? [],
      overlay: Boolean(
        document.querySelector('[data-testid="reconnect-overlay"]'),
      ),
      lobby: Boolean(document.querySelector('[data-testid="quick-match"]')),
      touch: Boolean(document.querySelector('[data-testid="touch-controls"]')),
      resultsXp:
        document.querySelector('[data-testid="results-xp"]')?.textContent ??
        null,
      rewardText:
        document.querySelector('[data-testid="progression-toast"]')?.innerText ??
        null,
      settings: Boolean(
        document.querySelector('[data-testid="settings-overlay"]'),
      ),
      hudVitalsVisible: (() => {
        const node = document.querySelector(".hud-vitals");
        return node ? getComputedStyle(node).display !== "none" : false;
      })(),
    };
  });

const fetchProfile = (page) =>
  page.evaluate(async (apiBase) => {
    const token = window.localStorage.getItem("vibe-militia-guest-token");
    if (!token) return null;
    const response = await fetch(`${apiBase}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return response.json();
  }, serverUrl);

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktopContext.newPage();
  trackErrors("desktop", page);
  await page.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);

  const initialProfile = await fetchProfile(page);
  check(
    "a guest profile is issued and cached on the device",
    Boolean(initialProfile?.player?.id) &&
      Boolean(await page.evaluate(() => window.localStorage.getItem("vibe-militia-guest-token"))),
    initialProfile?.player?.id ?? "missing",
  );
  check(
    "the lobby renders level, XP and recent match surfaces",
    (await page.locator('[data-testid="profile-panel"]').count()) === 1 &&
      (await page.locator('[data-testid="profile-level"]').innerText()).includes("LEVEL"),
  );

  const masterSlider = page
    .locator('[data-testid="audio-settings"] input[type="range"]')
    .first();
  await masterSlider.scrollIntoViewIfNeeded();
  const masterBox = await masterSlider.boundingBox();
  if (masterBox) {
    await page.mouse.click(
      masterBox.x + masterBox.width * 0.4,
      masterBox.y + masterBox.height / 2,
    );
  }
  await page.waitForTimeout(200);
  await page.locator('[data-testid="audio-mute"]').click();
  await page.waitForTimeout(200);
  const storedAudio = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("vibe-militia-audio") ?? "{}"),
  );
  check(
    "audio settings persist master volume and mute",
    Math.abs(storedAudio.master - 0.4) < 0.02 && storedAudio.muted === true,
    JSON.stringify(storedAudio),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  check(
    "audio preferences survive a reload",
    (await page.locator('[data-testid="audio-mute"]').innerText()).includes("MUTED"),
  );
  await page.locator('[data-testid="audio-mute"]').click();
  await page.waitForTimeout(200);

  await page.locator('[data-testid="create-room"]').click();
  await page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "countdown",
    null,
    { timeout: 15000 },
  );
  const countdownBefore = await probe(page);
  check(
    "a new room reaches the server countdown",
    countdownBefore.phase === "countdown" && countdownBefore.locals === 1,
  );

  await waitLive(page);
  await dismissGuide(page);
  await page.waitForTimeout(1500);
  const live = await probe(page);
  check(
    "the live HUD exposes the guest level and equipped cosmetics",
    live.local?.level === 1 &&
      live.local?.badgeId === "badge-lime-recruit" &&
      live.local?.trailId === "trail-lime",
    `${live.local?.level} ${live.local?.badgeId}`,
  );

  const audioState = live.audio;
  check(
    "the audio context initializes after a user gesture",
    audioState && audioState.contextState !== "uninitialized",
    JSON.stringify(audioState),
  );

  const firstMatchId = live.matchId;
  await page.evaluate(() =>
    window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.endMatch(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="results-overlay"]')
        ?.classList.contains("is-visible"),
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1200);
  const afterFirst = await fetchProfile(page);
  const firstReward = await probe(page);
  check(
    "a completed match awards server-side XP and stores a record",
    afterFirst?.player?.xp > 0 &&
      afterFirst?.player?.matchesPlayed === 1 &&
      afterFirst?.player?.recentMatches?.[0]?.matchId === firstMatchId,
    `xp=${afterFirst?.player?.xp} matches=${afterFirst?.player?.matchesPlayed}`,
  );
  check(
    "the results screen shows the XP earned",
    firstReward.resultsXp?.includes("XP") === true,
    firstReward.resultsXp ?? "missing",
  );

  await page.evaluate(() =>
    window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.endMatch(),
  );
  await page.waitForTimeout(700);
  const afterDuplicate = await fetchProfile(page);
  check(
    "duplicate match-end calls never award twice",
    afterDuplicate?.player?.xp === afterFirst?.player?.xp &&
      afterDuplicate?.player?.matchesPlayed === 1,
    `xp=${afterDuplicate?.player?.xp} matches=${afterDuplicate?.player?.matchesPlayed}`,
  );

  await page.locator('[data-testid="results-replay"]').click();
  await waitLive(page);
  await page.waitForTimeout(1400);
  const replay = await probe(page);
  check(
    "replay starts a distinct match id",
    replay.matchId !== firstMatchId,
    `${firstMatchId} -> ${replay.matchId}`,
  );
  await page.evaluate(() =>
    window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.endMatch(),
  );
  await page.waitForTimeout(1200);
  const afterSecond = await fetchProfile(page);
  check(
    "a second match adds a separate progression record",
    afterSecond?.player?.matchesPlayed === 2 &&
      afterSecond?.player?.recentMatches?.length >= 2,
    `matches=${afterSecond?.player?.matchesPlayed}`,
  );

  await page.locator('[data-testid="results-replay"]').click();
  await waitLive(page);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__;
    const probe = value.getProbe();
    probe.testHooks.guard();
    probe.testHooks.giveWeapon(probe.sessionId, "vibe-smg");
  });
  await page.waitForTimeout(500);
  const combat = await probe(page);
  const combatSession = combat.sessionId;
  const combatWeapons = combat.local?.weapons.filter((weapon) => weapon.owned);
  check(
    "the reconnect test starts with a full advanced loadout",
    combatWeapons?.some((weapon) => weapon.id === "vibe-smg") === true,
    combatWeapons?.map((weapon) => weapon.id).join(",") ?? "none",
  );

  await desktopContext.setOffline(true);
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="reconnect-overlay"]')),
    null,
    { timeout: 5000 },
  );
  const dropped = await probe(page);
  check(
    "a network drop shows the reconnect status instead of leaving",
    dropped.overlay === true && dropped.lobby === false,
  );
  await desktopContext.setOffline(false);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="reconnect-overlay"]'),
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(900);
  const recovered = await probe(page);
  check(
    "reconnect resumes the same session, seat and advanced inventory",
    recovered.sessionId === combatSession &&
      recovered.phase === "live" &&
      recovered.local?.weapons.some(
        (weapon) => weapon.owned && weapon.id === "vibe-smg",
      ),
    `${recovered.sessionId} ${recovered.phase}`,
  );
  check(
    "reconnect preserves grenade inventory",
    recovered.local?.grenades.contact === 1 &&
      recovered.local?.grenades.frag === 1 &&
      recovered.local?.grenades.stinking === 1,
    JSON.stringify(recovered.local?.grenades),
  );

  await page.evaluate(() =>
    window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.endMatch(),
  );
  await page.waitForTimeout(700);
  const afterThird = await fetchProfile(page);
  check(
    "three completed matches trigger a level-up reward surface",
    afterThird?.player?.level >= 2 &&
      afterThird?.player?.unlocked?.includes("title-drop-ready") === true,
    `level=${afterThird?.player?.level} xp=${afterThird?.player?.xp}`,
  );

  // Capacity while a seat is reserved.
  const capacityPage = await desktopContext.newPage();
  trackErrors("capacity", capacityPage);
  await capacityPage.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await capacityPage.waitForTimeout(900);
  await capacityPage.locator('[data-testid="create-room"]').click();
  await capacityPage.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "countdown",
    null,
    { timeout: 15000 },
  );
  await dismissGuide(capacityPage);
  const capacityRoom = (await probe(capacityPage)).roomId;
  const fillerClients = [];
  const fillerRooms = [];
  for (let index = 0; index < 7; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(capacityRoom, {
      name: `CAP-${index + 1}`,
    });
    fillerClients.push(client);
    fillerRooms.push(room);
  }
  await capacityPage.waitForTimeout(800);
  const fullRoom = await probe(capacityPage);
  check(
    "eight humans fill the room before the reserved-seat check",
    fullRoom.locals === 8,
    `humans=${fullRoom.locals}`,
  );
  await desktopContext.setOffline(true);
  await capacityPage.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="reconnect-overlay"]')),
    null,
    { timeout: 5000 },
  );
  await capacityPage.waitForTimeout(600);
  let rejectMessage = "";
  const ninthClient = new Client(serverUrl);
  try {
    const ninth = await ninthClient.joinById(capacityRoom, { name: "NINTH" });
    await ninth.leave();
  } catch (error) {
    rejectMessage = error instanceof Error ? error.message : String(error);
  }
  check(
    "a reserved disconnected seat still counts toward room capacity",
    /full|locked|seat/i.test(rejectMessage),
    rejectMessage,
  );
  await desktopContext.setOffline(false);
  await capacityPage.waitForFunction(
    () => !document.querySelector('[data-testid="reconnect-overlay"]'),
    null,
    { timeout: 15000 },
  );
  await capacityPage.waitForTimeout(600);
  const capacityRecovered = await probe(capacityPage);
  check(
    "the reserved player can reclaim the full room",
    capacityRecovered.sessionId === fullRoom.sessionId &&
      capacityRecovered.locals === 8,
    `${capacityRecovered.sessionId} humans=${capacityRecovered.locals}`,
  );
  for (const room of fillerRooms) await room.leave().catch(() => {});
  await capacityPage.close();

  // Reconnect during countdown in a fresh room.
  const countdownPage = await desktopContext.newPage();
  trackErrors("countdown-reconnect", countdownPage);
  await countdownPage.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await countdownPage.waitForTimeout(700);
  await countdownPage.locator('[data-testid="create-room"]').click();
  await countdownPage.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "countdown",
    null,
    { timeout: 15000 },
  );
  await dismissGuide(countdownPage);
  const countdownSession = (await probe(countdownPage)).sessionId;
  await desktopContext.setOffline(true);
  await countdownPage.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="reconnect-overlay"]')),
    null,
    { timeout: 5000 },
  );
  await countdownPage.waitForTimeout(1200);
  await desktopContext.setOffline(false);
  await countdownPage.waitForFunction(
    () => !document.querySelector('[data-testid="reconnect-overlay"]'),
    null,
    { timeout: 15000 },
  );
  await countdownPage.waitForTimeout(700);
  const countdownRecovered = await probe(countdownPage);
  check(
    "reconnect during countdown keeps the same reserved seat",
    countdownRecovered.sessionId === countdownSession &&
      ["countdown", "live"].includes(countdownRecovered.phase),
    `${countdownRecovered.sessionId} ${countdownRecovered.phase}`,
  );
  await countdownPage.close();

  // Grace expiry returns cleanly to the lobby.
  const expiryPage = await desktopContext.newPage();
  trackErrors("expiry", expiryPage);
  await expiryPage.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await expiryPage.waitForTimeout(700);
  await expiryPage.locator('[data-testid="create-room"]').click();
  await expiryPage.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "countdown",
    null,
    { timeout: 15000 },
  );
  await dismissGuide(expiryPage);
  await desktopContext.setOffline(true);
  await expiryPage.waitForTimeout(7500);
  await desktopContext.setOffline(false);
  await expiryPage.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="quick-match"]')),
    null,
    { timeout: 15000 },
  );
  check(
    "grace expiry returns the player to the lobby",
    (await probe(expiryPage)).lobby === true,
  );
  await expiryPage.close();
  await desktopContext.close();

  // Mobile real touch events and simultaneous actions.
  const mobileContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mobile = await mobileContext.newPage();
  trackErrors("mobile", mobile);
  await mobile.goto(`${baseUrl}/online?touch=1`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  await mobile.locator('[data-testid="create-room"]').click();
  await waitLive(mobile);
  await mobile.evaluate(() => {
    const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
    probe.testHooks.pauseBotLoot(true);
    probe.testHooks.disableBotCuriosity();
  });
  await dismissGuide(mobile);
  await mobile.waitForTimeout(800);
  const mobileInitial = await probe(mobile);
  check(
    "mobile landscape renders touch controls and hides desktop HUD panels",
    mobileInitial.touch === true && mobileInitial.hudVitalsVisible === false,
  );
  await mobile.screenshot({
    path: artifactDir ? `${artifactDir}/mobile-touch.png` : undefined,
  }).catch(() => {});

  const moveBox = await mobile.locator('[data-testid="touch-move"]').boundingBox();
  const aimBox = await mobile.locator('[data-testid="touch-aim"]').boundingBox();
  const fireBox = await mobile.locator('[data-testid="touch-fire"]').boundingBox();
  const jumpBox = await mobile.locator('[data-testid="touch-jump"]').boundingBox();
  if (moveBox && aimBox && fireBox && jumpBox) {
    const cdp = await mobileContext.newCDPSession(mobile);
    const points = [
      { x: moveBox.x + moveBox.width * 0.78, y: moveBox.y + moveBox.height / 2, id: 1 },
      { x: aimBox.x + aimBox.width * 0.72, y: aimBox.y + aimBox.height * 0.28, id: 2 },
      { x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 3 },
      { x: jumpBox.x + jumpBox.width / 2, y: jumpBox.y + jumpBox.height / 2, id: 4 },
    ];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points,
    });
    await mobile.waitForTimeout(900);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...points[0], x: moveBox.x + moveBox.width * 0.92 },
        points[1],
        points[2],
        points[3],
      ],
    });
    await mobile.waitForTimeout(700);
    const active = await probe(mobile);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await mobile.waitForTimeout(800);
    const settled = await probe(mobile);
    await mobile.waitForTimeout(900);
    const stopped = await probe(mobile);
    check(
      "multi-touch moves, aims, fires and jets at the same time",
      Math.abs((active.local?.x ?? 0) - (mobileInitial.local?.x ?? 0)) > 8 &&
        (active.local?.ammo ?? 99) < (mobileInitial.local?.ammo ?? 0) &&
        (active.local?.fuel ?? 100) < 100,
      `x ${mobileInitial.local?.x}->${active.local?.x} ammo ${mobileInitial.local?.ammo}->${active.local?.ammo} fuel ${active.local?.fuel}`,
    );
    check(
      "ending touches stops movement and firing without stuck input",
      stopped.local?.ammo === settled.local?.ammo &&
        Math.abs((stopped.local?.x ?? 0) - (settled.local?.x ?? 0)) < 4,
      `ammo ${settled.local?.ammo}->${stopped.local?.ammo} x ${settled.local?.x}->${stopped.local?.x}`,
    );

    await mobile.evaluate(() =>
      window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.guard(),
    );
    await mobile.waitForTimeout(250);
    check(
      "the touch test player is alive for utility controls",
      (await probe(mobile)).local?.alive === true,
    );
    await mobile.locator('[data-testid="touch-reload"]').tap();
    await mobile.waitForTimeout(300);
    const reloadStarted = await probe(mobile);
    if (
      !reloadStarted.local?.weapons[reloadStarted.local.equippedSlot]
        ?.reloading
    ) {
      await mobile.locator('[data-testid="touch-reload"]').tap();
    }
    await mobile.waitForTimeout(1450);
    const reloaded = await probe(mobile);
    check(
      "the touch reload control restores a magazine",
      (reloaded.local?.ammo ?? 0) > (stopped.local?.ammo ?? 0),
      `ammo ${stopped.local?.ammo}->${reloaded.local?.ammo}`,
    );

    await mobile.locator('[data-testid="touch-weapon-2"]').tap();
    await mobile.waitForTimeout(300);
    const swapped = await probe(mobile);
    check(
      "the touch weapon strip equips another slot",
      swapped.local?.equippedSlot === 1,
      `slot=${swapped.local?.equippedSlot}`,
    );

    await mobile.locator('[data-testid="touch-grenade"]').tap();
    await mobile.waitForTimeout(250);
    let grenadeSelected = await probe(mobile);
    if (grenadeSelected.local?.grenadeSelected !== "frag") {
      await mobile.locator('[data-testid="touch-grenade"]').tap();
      await mobile.waitForTimeout(250);
      grenadeSelected = await probe(mobile);
    }
    await mobile.locator('[data-testid="touch-throw-grenade"]').tap();
    await mobile.waitForTimeout(500);
    const grenadeThrown = await probe(mobile);
    check(
      "touch grenade selection and throw reach the server",
      grenadeThrown.local?.grenades.frag <
        grenadeSelected.local?.grenades.frag,
      `frag ${grenadeSelected.local?.grenades.frag}->${grenadeThrown.local?.grenades.frag}`,
    );

    // Touch swap: fill all slots and use a static weapon cache. This uses the
    // same authoritative E swap path as dynamic loot without bot timing.
    await mobile.evaluate(() => {
      const value = window.__VIBE_MILITIA_ONLINE__;
      const probe = value.getProbe();
      probe.testHooks.giveWeapon(probe.sessionId, "vibe-smg");
    });
    await mobile.waitForTimeout(400);
    const cache = await mobile.evaluate(() => {
      const probe = window.__VIBE_MILITIA_ONLINE__.getProbe();
      const weaponTypes = new Set([
        "vibe-lance",
        "akimbo-rifles",
        "vibe-smg",
        "heavy-cannon",
        "rocket-launcher",
      ]);
      return (
        probe.pickups.find(
          (pickup) => pickup.active && weaponTypes.has(pickup.type),
        ) ?? null
      );
    });
    check("the touch swap test has a static weapon cache", Boolean(cache));
    if (cache) {
      await mobile.evaluate(
        ({ x, y }) => {
          window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks.teleport(x, y + 16);
        },
        { x: cache.x, y: cache.y },
      );
      let prompt = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await mobile.waitForTimeout(250);
        const state = await probe(mobile);
        if (state.hudNearbyLootCanSwap) {
          prompt = state;
          break;
        }
        if (attempt === 5) {
          await mobile.evaluate(
            ({ x, y }) => {
              window.__VIBE_MILITIA_ONLINE__
                .getProbe()
                .testHooks.teleport(x, y);
            },
            { x: cache.x, y: cache.y },
          );
        }
      }
      check(
        "the touch swap prompt appears next to the weapon cache",
        Boolean(prompt),
        prompt?.hudNearbyLootText ?? "no prompt",
      );
      if (prompt) {
        const beforeSwap = prompt;
        await mobile.locator('[data-testid="touch-swap"]').tap();
        await mobile.waitForTimeout(600);
        const afterSwap = await probe(mobile);
        const beforeEquipped =
          beforeSwap.local?.weapons[beforeSwap.local.equippedSlot]?.id;
        const afterEquipped =
          afterSwap.local?.weapons[afterSwap.local.equippedSlot]?.id;
        check(
          "the touch swap control replaces the equipped weapon from the cache",
          Boolean(afterEquipped) && afterEquipped !== beforeEquipped,
          `${beforeEquipped} -> ${afterEquipped}`,
        );
      }
    }

    await mobile.screenshot({
      path: artifactDir ? `${artifactDir}/mobile-combat.png` : undefined,
    }).catch(() => {});
  } else {
    check("mobile touch controls are measurable", false, "missing bounding box");
  }
  await mobile.screenshot({
    path: artifactDir ? `${artifactDir}/mobile-final.png` : undefined,
  }).catch(() => {});
  await mobileContext.close();

  check("no browser page errors across P4 flows", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILURES:", failed.map((entry) => entry.name).join(", "));
  process.exitCode = 1;
}
