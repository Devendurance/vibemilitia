/**
 * Character selection and selected-skin verification for P3A.
 *
 * Requires Next and Colyseus to be running:
 *   BASE_URL=http://localhost:3101 npm run verify:online:characters
 *
 * Optional:
 *   ARTIFACT_DIR=artifacts   writes selection and gameplay screenshots
 */

import { chromium } from "playwright-core";
import { Client } from "@colyseus/sdk";
import { mkdir, readFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const serverUrl = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const artifactDir = process.env.ARTIFACT_DIR ?? "";
const executablePath = process.env.CHROME_PATH;
const roster = JSON.parse(
  await readFile(
    new URL("../src/game/characters/roster.json", import.meta.url),
    "utf8",
  ),
);
const skins = roster.characters;
const skinById = new Map(skins.map((skin) => [skin.skinId, skin]));
const defaultSkinId = roster.humanDefaultSkinId;

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
const pageErrors = [];
const fillers = [];
const contexts = [];

const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  return page;
};

const dismissGuide = async (page) => {
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.count()) {
    await guide.first().click().catch(() => undefined);
    await page.waitForTimeout(250);
  }
};

const waitForLobby = async (page) => {
  await page.waitForSelector('[data-testid="skin-selection"]', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const images = [...document.querySelectorAll(".skin-card img")];
      return (
        images.length === 10 &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    },
    null,
    { timeout: 30000 },
  );
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
};

const selectedSkin = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('.skin-card[data-selected="true"]');
    return {
      skinId: card?.getAttribute("data-skin-id") ?? null,
      preview:
        document.querySelector('[data-testid="selected-skin-name"]')?.textContent?.trim() ??
        null,
      storage: window.localStorage.getItem("vibe-militia-skin"),
      cards: document.querySelectorAll(".skin-card").length,
      selectionVisible:
        document.querySelectorAll('[data-testid="skin-selection"]').length > 0,
    };
  });

const selectSkin = async (page, skinId) => {
  const card = page.locator(`[data-testid="skin-card-${skinId}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('.skin-card[data-selected="true"]')
        ?.getAttribute("data-skin-id") === expected,
    skinId,
    { timeout: 5000 },
  );
};

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const local = value.snapshot?.participants.find(
      (participant) => participant.id === value.sessionId,
    );
    const hud = document.querySelector(".hud-root");
    const hudName =
      document.querySelector(".hud-identity__name")?.textContent?.trim() ?? "";
    const hudAvatar = document.querySelector(".hud-avatar img");
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: value.snapshot?.phase ?? null,
      humans: value.snapshot?.humans ?? 0,
      bots: value.snapshot?.bots ?? 0,
      localSkinId: local?.skinId ?? null,
      participants: value.snapshot?.participants ?? [],
      views: value.views,
      hudPhase: hud?.getAttribute("data-hud-phase") ?? null,
      hudName,
      hudAvatarAlt: hudAvatar?.getAttribute("alt") ?? null,
      hudAvatarSrc: hudAvatar?.getAttribute("src") ?? null,
      skinSelectionVisible:
        document.querySelectorAll('[data-testid="skin-selection"]').length > 0,
    };
  });

const participantSkinMap = (pageProbe) =>
  new Map(
    pageProbe.participants.map((participant) => [
      participant.id,
      participant.skinId,
    ]),
  );

const textureForView = (pageProbe, id) =>
  pageProbe.views.find((view) => view.id === id)?.texture ?? null;

const waitForAlive = async (page, timeoutMs = 10000) => {
  await page.waitForFunction(
    () => {
      const value = window.__VIBE_MILITIA_ONLINE__?.getProbe();
      const local = value?.snapshot?.participants.find(
        (participant) => participant.id === value.sessionId,
      );
      return local?.alive === true;
    },
    null,
    { timeout: timeoutMs },
  );
};

try {
  const pageA = await newPage();
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await waitForLobby(pageA);
  await dismissGuide(pageA);
  const initialSelection = await selectedSkin(pageA);
  console.log("SELECTION INITIAL", initialSelection);
  check("all ten character cards render", initialSelection.cards === 10);
  check(
    "VIBER-010 is the fresh-profile default",
    initialSelection.skinId === defaultSkinId &&
      initialSelection.preview === "VIBER-010",
  );

  const cardNames = await pageA.locator(".skin-card__name").allTextContents();
  check(
    "all roster display names are visible",
    cardNames.length === 10 &&
      cardNames.every((name) => name.length > 0),
    cardNames.join(", "),
  );

  for (const skin of skins) {
    await selectSkin(pageA, skin.skinId);
    const selected = await selectedSkin(pageA);
    check(
      `select ${skin.skinId}`,
      selected.skinId === skin.skinId &&
        selected.preview === skin.displayName &&
        selected.storage === skin.skinId,
      selected.preview ?? "none",
    );
  }

  await selectSkin(pageA, defaultSkinId);
  await pageA.locator('input[value="viber-010"]').focus();
  await pageA.keyboard.press("ArrowRight");
  await pageA.waitForFunction(
    () =>
      document
        .querySelector('.skin-card[data-selected="true"]')
        ?.getAttribute("data-skin-id") === "viber-006",
    null,
    { timeout: 5000 },
  );
  const keyboardSelection = await selectedSkin(pageA);
  check(
    "keyboard arrows change the selected character",
    keyboardSelection.skinId === "viber-006" &&
      keyboardSelection.preview === "VIBER-006",
    keyboardSelection.preview ?? "none",
  );

  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.waitForTimeout(300);
  const mobileLayout = await pageA.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cards: document.querySelectorAll(".skin-card").length,
    rosterDisplay: getComputedStyle(
      document.querySelector(".skin-grid"),
    ).display,
    selected: document
      .querySelector('.skin-card[data-selected="true"]')
      ?.getAttribute("data-skin-id"),
  }));
  console.log("MOBILE", mobileLayout);
  check(
    "portrait lobby keeps roster state without horizontal overflow",
    mobileLayout.cards === 10 &&
      ["none", "flex"].includes(mobileLayout.rosterDisplay) &&
      mobileLayout.selected === "viber-006" &&
      mobileLayout.scrollWidth <= mobileLayout.width + 1,
  );
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/p3a-character-select-mobile.png`,
      fullPage: true,
    });
  }
  await pageA.setViewportSize({ width: 1440, height: 900 });
  await pageA.waitForTimeout(300);

  await selectSkin(pageA, "bureau-023");
  await pageA.reload({ waitUntil: "networkidle" });
  await waitForLobby(pageA);
  const persisted = await selectedSkin(pageA);
  check(
    "selection survives a page refresh",
    persisted.skinId === "bureau-023" &&
      persisted.preview === "BUREAU-023" &&
      persisted.storage === "bureau-023",
    persisted.preview ?? "none",
  );

  await pageA.evaluate(() => {
    window.localStorage.setItem("vibe-militia-skin", "not-a-real-skin");
    window.localStorage.removeItem("vibe-militia-guest-profile");
    window.localStorage.removeItem("vibe-militia-guest-token");
  });
  await pageA.reload({ waitUntil: "networkidle" });
  await waitForLobby(pageA);
  const fallback = await selectedSkin(pageA);
  check(
    "invalid saved skin falls back to VIBER-010",
    fallback.skinId === defaultSkinId &&
      fallback.preview === "VIBER-010" &&
      fallback.storage === defaultSkinId,
    fallback.preview ?? "none",
  );

  await selectSkin(pageA, "bureau-023");
  await pageA.locator("#guest-name").fill("ALPHA-SKIN");
  await pageA.waitForTimeout(250);
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/p3a-character-select.png`,
      fullPage: true,
    });
  }
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  const host = await probe(pageA);
  console.log("HOST", {
    roomId: host.roomId,
    skinId: host.localSkinId,
    hudName: host.hudName,
    phase: host.phase,
  });
  check(
    "create room uses the selected skin",
    host.localSkinId === "bureau-023" &&
      textureForView(host, host.sessionId) ===
        skinById.get("bureau-023").textureKey,
  );
  check(
    "HUD portrait and identity use the selected skin",
    host.hudName === "BUREAU-023" &&
      (host.hudAvatarAlt ?? "").includes("BUREAU-023"),
    `${host.hudName} / ${host.hudAvatarAlt ?? "none"}`,
  );
  check("selection UI is hidden in the live session", host.skinSelectionVisible === false);

  const pageB = await newPage();
  await pageB.goto(pageA.url(), { waitUntil: "networkidle" });
  await pageB.waitForTimeout(900);
  await dismissGuide(pageB);
  await waitForLobby(pageB);
  await selectSkin(pageB, "viber-123");
  await pageB.locator("#guest-name").fill("BRAVO-SKIN");
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  const guest = await probe(pageB);
  const hostSeesGuest = await probe(pageA);
  const guestMap = participantSkinMap(guest);
  const hostMap = participantSkinMap(hostSeesGuest);
  check(
    "invite join uses the guest's selected skin",
    guest.localSkinId === "viber-123" &&
      textureForView(guest, guest.sessionId) ===
        skinById.get("viber-123").textureKey,
  );
  check(
    "both clients see the host's selected skin",
    guestMap.get(host.sessionId) === "bureau-023" &&
      hostMap.get(host.sessionId) === "bureau-023" &&
      hostMap.get(guest.sessionId) === "viber-123",
  );

  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageA.waitForTimeout(500);
  const twoHumans = await probe(pageA);
  const botParticipants = twoHumans.participants.filter(
    (participant) => participant.kind === "bot",
  );
  const botSkins = botParticipants.map((participant) => participant.skinId);
  console.log("TWO HUMANS", {
    humans: twoHumans.humans,
    bots: twoHumans.bots,
    botSkins,
  });
  check("countdown fills six bots around two humans", twoHumans.humans === 2 && twoHumans.bots === 6);
  check(
    "bots remain varied and avoid human skins",
    new Set(botSkins).size === 6 &&
      botSkins.every(
        (skinId) =>
          skinById.has(skinId) &&
          skinId !== defaultSkinId &&
          !["bureau-023", "viber-123"].includes(skinId),
      ),
    botSkins.join(", "),
  );

  // Give the camera a moment to show the selected humans and bots together.
  await pageA.keyboard.down("KeyD");
  await pageA.waitForTimeout(600);
  await pageA.keyboard.up("KeyD");
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/p3a-multiplayer-skins-a.png`,
      fullPage: true,
    });
    await pageB.screenshot({
      path: `${artifactDir}/p3a-multiplayer-skins-b.png`,
      fullPage: true,
    });
  }

  // Quick Match selects a free roster skin and joins the populated room.
  const unusedQuickSkins = skins
    .map((skin) => skin.skinId)
    .filter(
      (skinId) =>
        !botSkins.includes(skinId) &&
        skinId !== "bureau-023" &&
        skinId !== "viber-123",
    );
  const quickSkin = unusedQuickSkins[0];
  const pageC = await newPage();
  await pageC.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(900);
  await dismissGuide(pageC);
  await waitForLobby(pageC);
  await selectSkin(pageC, quickSkin);
  await pageC.locator("#guest-name").fill("CHARLIE-SKIN");
  await pageC.locator('[data-testid="quick-match"]').click();
  await waitOnlineReady(pageC);
  const quick = await probe(pageC);
  const afterQuick = await probe(pageA);
  console.log("QUICK MATCH", {
    skin: quick.localSkinId,
    room: quick.roomId,
    humans: afterQuick.humans,
    bots: afterQuick.bots,
  });
  check("quick match uses the selected skin", quick.localSkinId === quickSkin);
  check(
    "quick match joins the populated room and replaces one bot",
    quick.roomId === host.roomId &&
      afterQuick.humans === 3 &&
      afterQuick.bots === 5,
  );
  const quickMap = participantSkinMap(quick);
  const afterQuickMap = participantSkinMap(afterQuick);
  check(
    "three clients agree on every shared skin",
    [...afterQuickMap.keys()].every(
      (id) => !quickMap.has(id) || quickMap.get(id) === afterQuickMap.get(id),
    ) &&
      afterQuickMap.get(quick.sessionId) === quickSkin,
  );

  // Fill the remaining five seats with independent human choices.
  const usedHumanSkins = new Set([
    "bureau-023",
    "viber-123",
    quickSkin,
  ]);
  const fillerSkins = skins
    .map((skin) => skin.skinId)
    .filter((skinId) => !usedHumanSkins.has(skinId))
    .slice(0, 5);
  const expectedHumans = new Map([
    [host.sessionId, "bureau-023"],
    [guest.sessionId, "viber-123"],
    [quick.sessionId, quickSkin],
  ]);
  for (let index = 0; index < fillerSkins.length; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(host.roomId, {
      name: `HUMAN-${index + 2}`,
      skinId: fillerSkins[index],
    });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
    expectedHumans.set(room.sessionId, fillerSkins[index]);
  }
  await pageA.waitForFunction(
    () =>
      window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.humans === 8 &&
      window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.bots === 0,
    null,
    { timeout: 10000 },
  );
  await pageA.waitForTimeout(500);
  const eightHumans = await probe(pageA);
  const eightMap = participantSkinMap(eightHumans);
  console.log("EIGHT HUMANS", {
    humans: eightHumans.humans,
    bots: eightHumans.bots,
    skins: [...eightMap.entries()].map(([id, skin]) => [id, skin]),
  });
  check("eight human seats all fill independently", eightHumans.humans === 8 && eightHumans.bots === 0);
  check(
    "all eight humans keep their requested skins",
    [...expectedHumans.entries()].every(
      ([id, skinId]) => eightMap.get(id) === skinId,
    ),
  );
  check(
    "eight-human room has no bot labels or bot views",
    eightHumans.views.length === 8 &&
      eightHumans.views.every(
        (view) => view.kind === "human" && view.botLabelVisible === false,
      ),
  );
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/p3a-eight-human-skins.png`,
      fullPage: true,
    });
  }

  // A dedicated room makes the death/respawn presentation deterministic.
  const pageD = await newPage();
  await pageD.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageD.waitForTimeout(900);
  await dismissGuide(pageD);
  await waitForLobby(pageD);
  await selectSkin(pageD, "viber-141");
  await pageD.locator("#guest-name").fill("DEATH-SKIN");
  await pageD.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageD);
  await pageD.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageD.waitForTimeout(500);
  let deathSeen = false;
  let deathSkinId = null;
  const deathDeadline = Date.now() + 60000;
  while (Date.now() < deathDeadline) {
    const current = await probe(pageD);
    if (current.phase === "ended") break;
    const local = current.participants.find(
      (participant) => participant.id === current.sessionId,
    );
    if (!local) break;
    if (!local.alive) {
      deathSeen = true;
      deathSkinId = local.skinId;
      const deadView = current.views.find(
        (view) => view.id === current.sessionId,
      );
      check(
        "selected human keeps the skin while dead",
        deathSkinId === "viber-141" &&
          deadView?.texture === skinById.get("viber-141").textureKey &&
          deadView?.nameVisible === false,
      );
      break;
    }
    const nearestBot = current.participants
      .filter((participant) => participant.kind === "bot" && participant.alive)
      .sort(
        (a, b) =>
          Math.hypot(a.x - local.x, a.y - local.y) -
          Math.hypot(b.x - local.x, b.y - local.y),
      )[0];
    if (nearestBot) {
      const key = nearestBot.x > local.x ? "KeyD" : "KeyA";
      await pageD.keyboard.down(key);
      if (nearestBot.y < local.y - 120) {
        await pageD.keyboard.down("Space");
      }
      await pageD.waitForTimeout(350);
      await pageD.keyboard.up(key);
      await pageD.keyboard.up("Space");
    } else {
      await pageD.waitForTimeout(250);
    }
  }
  check("selected human can be eliminated in combat", deathSeen);
  if (deathSeen) {
    await waitForAlive(pageD);
    const respawned = await probe(pageD);
    const local = respawned.participants.find(
      (participant) => participant.id === respawned.sessionId,
    );
    check(
      "selected human keeps the skin after respawn",
      local?.skinId === "viber-141" &&
        textureForView(respawned, respawned.sessionId) ===
          skinById.get("viber-141").textureKey,
      local?.skinId ?? "none",
    );
  }

  // The server must ignore arbitrary skin IDs and URLs.
  const invalidClient = new Client(serverUrl);
  const invalidRoom = await invalidClient.create("ffa", {
    name: "INVALID-SKIN",
    roomName: "SKIN CHECK",
    skinId: "https://evil.example/character.png",
  });
  let invalidSnapshot = null;
  invalidRoom.onMessage("snapshot", (snapshot) => {
    invalidSnapshot = snapshot;
  });
  invalidRoom.onMessage("events", () => undefined);
  const invalidDeadline = Date.now() + 5000;
  while (!invalidSnapshot && Date.now() < invalidDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const invalidLocal = invalidSnapshot?.participants.find(
    (participant) => participant.id === invalidRoom.sessionId,
  );
  check(
    "server rejects arbitrary skin IDs and falls back safely",
    invalidLocal?.skinId === defaultSkinId,
    invalidLocal?.skinId ?? "none",
  );
  await invalidRoom.leave().catch(() => undefined);

  check("no browser page errors", pageErrors.length === 0, `${pageErrors.length} errors`);
} finally {
  for (const filler of fillers) {
    await filler.room.leave().catch(() => undefined);
  }
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
