/**
 * Viber bot presentation and combat verification for P2.5 Slice B.
 *
 * Requires Next and Colyseus to be running:
 *   BASE_URL=http://localhost:3101 npm run verify:online:bots
 *
 * Optional:
 *   ARTIFACT_DIR=artifacts   writes screenshots
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
const rosterBySkin = new Map(
  roster.characters.map((skin) => [skin.skinId, skin]),
);
const rosterTextureKeys = new Set(
  roster.characters.map((skin) => skin.textureKey),
);
const defaultSkinId = roster.humanDefaultSkinId;
const defaultTextureKey = rosterBySkin.get(defaultSkinId).textureKey;

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

const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  return { context, page };
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

const probe = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__.getProbe();
    const hud = document.querySelector(".hud-root");
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: value.snapshot?.phase ?? null,
      humans: value.snapshot?.humans ?? 0,
      bots: value.snapshot?.bots ?? 0,
      participants: value.snapshot?.participants ?? [],
      projectiles: value.snapshot?.projectiles ?? [],
      standings: value.snapshot?.standings ?? [],
      feed: value.snapshot?.feed ?? [],
      views: value.views,
      hudPhase: hud?.getAttribute("data-hud-phase") ?? null,
    };
  });

try {
  const { page: pageA } = await newPage();
  await pageA.goto(`${baseUrl}/online`, { waitUntil: "networkidle" });
  await pageA.waitForTimeout(700);
  await pageA.locator('[data-testid="create-room"]').click();
  await waitOnlineReady(pageA);
  await pageA.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30000 },
  );
  await pageA.waitForTimeout(2500);

  const initial = await probe(pageA);
  const initialBotParticipants = initial.participants.filter(
    (entry) => entry.kind === "bot",
  );
  const initialHumanParticipants = initial.participants.filter(
    (entry) => entry.kind === "human",
  );
  const initialBotIds = initialBotParticipants.map((entry) => entry.id);
  const initialBotSet = new Set(initialBotIds);
  const initialBotSkins = initialBotParticipants.map((entry) => entry.skinId);
  const initialSkinIds = initial.participants.map((entry) => entry.skinId);
  const botViews = initial.views.filter((view) => view.kind === "bot");
  const humanViews = initial.views.filter((view) => view.kind === "human");
  console.log("INITIAL", {
    humans: initial.humans,
    bots: initial.bots,
    views: initial.views.length,
    skinIds: initialSkinIds,
    textures: initial.views.map((view) => view.texture),
  });
  check("one human and seven bots are present", initial.humans === 1 && initial.bots === 7);
  check("eight Viber character views render", initial.views.length === 8);
  check(
    "all combatants use validated roster textures",
    initial.views.every((view) => rosterTextureKeys.has(view.texture)),
  );
  check(
    "the human keeps the VIBER-010 default skin",
    initialHumanParticipants.length === 1 &&
      initialHumanParticipants[0].skinId === defaultSkinId &&
      humanViews[0]?.texture === defaultTextureKey,
  );
  check(
    "eight distinct official skins render",
    initialSkinIds.length === 8 &&
      new Set(initialSkinIds).size === 8 &&
      new Set(initial.views.map((view) => view.texture)).size === 8,
    initialSkinIds.join(", "),
  );
  check(
    "bots use unique valid non-default skins",
    initialBotSkins.length === 7 &&
      new Set(initialBotSkins).size === 7 &&
      initialBotSkins.every(
        (skinId) =>
          skinId !== defaultSkinId && rosterBySkin.has(skinId),
      ),
    initialBotSkins.join(", "),
  );
  check(
    "bots show the player weapon layer",
    botViews.length === 7 &&
      botViews.every(
        (view) =>
          view.weaponVisible &&
          view.weaponTexture === "weapon-player" &&
          view.nameVisible,
      ),
  );
  check(
    "bots show BOT labels and the human does not",
    botViews.every((view) => view.botLabelVisible) &&
      humanViews.every((view) => !view.botLabelVisible),
  );
  check(
    "bot snapshots use the Vibe Rifle",
    initial.participants
      .filter((entry) => entry.kind === "bot")
      .every((entry) => entry.weaponId === "vibe-rifle"),
  );
  const loadedSprites = await pageA.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/sprites/")),
  );
  check(
    "all ten validated roster textures load",
    roster.characters.every((skin) =>
      loadedSprites.some((url) => url.endsWith(skin.cutoutPath)),
    ),
    `${loadedSprites.length} sprite requests`,
  );

  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/slice-c-viber-roster.png`,
      fullPage: true,
    });
  }

  const combat = {
    botProjectile: null,
    humanDamaged: false,
    botVsBot: null,
    botDeath: null,
    botDeathSkinId: null,
    botDeathPresentation: null,
    botRespawnSkinId: null,
    botRespawnPresentation: null,
    thrusting: false,
    moved: false,
    aimed: false,
    damagedBotHealthBar: false,
  };
  const lastPositions = new Map(
    initial.participants.map((entry) => [entry.id, { x: entry.x, y: entry.y }]),
  );
  const initialAims = new Map(
    initial.participants.map((entry) => [entry.id, entry.aimAngle]),
  );
  const deadBotIds = new Set();
  let respawnedBotId = null;

  const combatDeadline = Date.now() + 45000;
  while (Date.now() < combatDeadline) {
    const current = await probe(pageA);
    if (current.phase === "ended") break;
    const human = current.participants.find((entry) => entry.kind === "human");
    if (human && human.health < 100) combat.humanDamaged = true;

    for (const projectile of current.projectiles) {
      if (
        initialBotSet.has(projectile.ownerId) &&
        projectile.weaponId === "vibe-rifle" &&
        !combat.botProjectile
      ) {
        combat.botProjectile = {
          ownerId: projectile.ownerId,
          weaponId: projectile.weaponId,
        };
      }
    }
    for (const entry of current.feed) {
      if (
        initialBotSet.has(entry.killerId) &&
        initialBotSet.has(entry.victimId) &&
        !combat.botVsBot
      ) {
        combat.botVsBot = entry.text;
      }
    }
    for (const bot of current.participants.filter((entry) => entry.kind === "bot")) {
      if (bot.thrusting) combat.thrusting = true;
      if (bot.health < bot.maxHealth && bot.alive) {
        const botView = current.views.find((view) => view.id === bot.id);
        if (botView?.healthBarVisible) combat.damagedBotHealthBar = true;
      }
      const previous = lastPositions.get(bot.id);
      if (previous && Math.hypot(bot.x - previous.x, bot.y - previous.y) > 24) {
        combat.moved = true;
      }
      lastPositions.set(bot.id, { x: bot.x, y: bot.y });
      const initialAim = initialAims.get(bot.id);
      if (initialAim !== undefined && Math.abs(bot.aimAngle - initialAim) > 0.35) {
        combat.aimed = true;
      }

      if (!bot.alive && !deadBotIds.has(bot.id) && !combat.botDeath) {
        deadBotIds.add(bot.id);
        combat.botDeath = bot.name;
        combat.botDeathSkinId = bot.skinId;
        await pageA.waitForTimeout(150);
        const deathProbe = await probe(pageA);
        combat.botDeathPresentation =
          deathProbe.views.find((view) => view.id === bot.id) ?? null;
      }
      if (
        deadBotIds.has(bot.id) &&
        bot.alive &&
        respawnedBotId === null &&
        combat.botDeath
      ) {
        respawnedBotId = bot.id;
        combat.botRespawnSkinId = bot.skinId;
        await pageA.waitForTimeout(150);
        const respawnProbe = await probe(pageA);
        combat.botRespawnPresentation =
          respawnProbe.views.find((view) => view.id === bot.id) ?? null;
      }
    }

    if (
      combat.botProjectile &&
      combat.humanDamaged &&
      combat.botVsBot &&
      combat.botDeathPresentation &&
      combat.botRespawnPresentation &&
      combat.thrusting &&
      combat.moved &&
      combat.aimed &&
      combat.damagedBotHealthBar
    ) {
      break;
    }
    await pageA.waitForTimeout(200);
  }

  console.log("COMBAT", combat);
  check("bots fire real Vibe Rifle projectiles", Boolean(combat.botProjectile), combat.botProjectile?.ownerId ?? "none");
  check("bot fire damages the human", combat.humanDamaged);
  check("bots eliminate other bots", Boolean(combat.botVsBot), combat.botVsBot ?? "none");
  check("bots navigate and use their thrusters", combat.moved && combat.thrusting);
  check("bots visibly track targets with their aim", combat.aimed);
  check("damaged bots show health bars", combat.damagedBotHealthBar);
  const deathSkin = rosterBySkin.get(combat.botDeathSkinId);
  const respawnSkin = rosterBySkin.get(combat.botRespawnSkinId);
  check(
    "bot death hides the character presentation",
    combat.botDeathPresentation?.texture === deathSkin?.textureKey &&
      combat.botDeathPresentation.nameVisible === false &&
      combat.botDeathPresentation.weaponVisible === false,
  );
  check(
    "bot respawn restores the same official skin",
    combat.botDeathSkinId === combat.botRespawnSkinId &&
      combat.botRespawnPresentation?.texture === respawnSkin?.textureKey &&
      combat.botRespawnPresentation.nameVisible === true &&
      combat.botRespawnPresentation.botLabelVisible === true &&
      combat.botRespawnPresentation.weaponVisible === true,
    `${combat.botDeathSkinId} -> ${combat.botRespawnSkinId}`,
  );

  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/slice-c-viber-combat.png`,
      fullPage: true,
    });
  }

  // A real second browser joins and must replace one bot cleanly.
  const { context: contextB, page: pageB } = await newPage();
  await pageB.goto(pageA.url(), { waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator('[data-testid="join-invite-room"]').click();
  await waitOnlineReady(pageB);
  await pageA.waitForTimeout(1200);
  const joined = await probe(pageA);
  const joinedB = await probe(pageB);
  const joinedBots = joined.views.filter((view) => view.kind === "bot");
  const joinedBotParticipants = joined.participants.filter(
    (entry) => entry.kind === "bot",
  );
  const joinedHumanParticipants = joined.participants.filter(
    (entry) => entry.kind === "human",
  );
  const joinedBotSkins = joinedBotParticipants.map((entry) => entry.skinId);
  const joinedSkinMapA = new Map(
    joined.participants.map((entry) => [entry.id, entry.skinId]),
  );
  const joinedSkinMapB = new Map(
    joinedB.participants.map((entry) => [entry.id, entry.skinId]),
  );
  const sharedIds = [...joinedSkinMapA.keys()].filter((id) =>
    joinedSkinMapB.has(id),
  );
  console.log("HUMAN JOIN", {
    humans: joined.humans,
    bots: joined.bots,
    views: joined.views.length,
    botSkins: joinedBotSkins,
    secondRoom: joinedB.roomId,
  });
  check("second browser joined the same live room", joinedB.roomId === joined.roomId);
  check("human join replaces one bot", joined.humans === 2 && joined.bots === 6);
  check("replacement leaves eight views with no ghost", joined.views.length === 8);
  check(
    "both humans keep the VIBER-010 default skin",
    joinedHumanParticipants.length === 2 &&
      joinedHumanParticipants.every(
        (entry) => entry.skinId === defaultSkinId,
      ),
  );
  check(
    "human replacement preserves the remaining bot skins",
    joinedBotSkins.length === 6 &&
      new Set(joinedBotSkins).size === 6 &&
      joinedBotSkins.every(
        (skinId) =>
          initialBotSkins.includes(skinId) && skinId !== defaultSkinId,
      ),
  );
  check(
    "late-joining client sees identical skin assignments",
    sharedIds.length > 0 &&
      sharedIds.every(
        (id) => joinedSkinMapA.get(id) === joinedSkinMapB.get(id),
      ),
    `${sharedIds.length} shared combatants`,
  );
  check(
    "remaining bots and both humans keep valid Viber presentations",
    joined.views.every((view) => rosterTextureKeys.has(view.texture)) &&
      joined.views.filter((view) => view.kind === "human").length === 2 &&
      joinedBots.length === 6 &&
      joinedBots.every((view) =>
        view.alive
          ? view.botLabelVisible && view.weaponVisible
          : !view.nameVisible && !view.weaponVisible,
      ),
  );
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/slice-c-viber-human-join.png`,
      fullPage: true,
    });
  }

  // Disconnect the second browser and confirm a Viber bot takes the seat.
  await pageB.close();
  await contextB.close();
  await pageA.waitForFunction(
    () =>
      window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.humans === 1 &&
      window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.bots === 7,
    null,
    { timeout: 10000 },
  );
  await pageA.waitForTimeout(500);
  const backfilled = await probe(pageA);
  const backfilledBotParticipants = backfilled.participants.filter(
    (entry) => entry.kind === "bot",
  );
  const backfilledBotSkins = backfilledBotParticipants.map(
    (entry) => entry.skinId,
  );
  const newBackfillSkins = backfilledBotSkins.filter(
    (skinId) => !joinedBotSkins.includes(skinId),
  );
  console.log("BACKFILL", {
    humans: backfilled.humans,
    bots: backfilled.bots,
    views: backfilled.views.length,
    botSkins: backfilledBotSkins,
  });
  check("disconnect backfills a bot", backfilled.humans === 1 && backfilled.bots === 7);
  const backfilledBots = backfilled.views.filter((view) => view.kind === "bot");
  check(
    "backfill preserves six bot identities and assigns a valid seventh",
    backfilledBotSkins.length === 7 &&
      new Set(backfilledBotSkins).size === 7 &&
      joinedBotSkins.every((skinId) => backfilledBotSkins.includes(skinId)) &&
      newBackfillSkins.length === 1 &&
      rosterBySkin.has(newBackfillSkins[0]) &&
      newBackfillSkins[0] !== defaultSkinId,
    `new=${newBackfillSkins[0] ?? "none"}`,
  );
  check(
    "backfilled bot renders as a Viber with a BOT label",
    backfilled.views.length === 8 &&
      backfilled.views.every((view) => rosterTextureKeys.has(view.texture)) &&
      backfilledBots.length === 7 &&
      backfilledBots.every((view) =>
        view.alive ? view.botLabelVisible : !view.nameVisible,
      ),
  );

  // Fill all eight human seats and confirm no bot visuals remain.
  const roomId = backfilled.roomId;
  for (let index = 0; index < 7; index += 1) {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, {
      name: `HUMAN-${index + 2}`,
    });
    room.onMessage("snapshot", () => undefined);
    room.onMessage("events", () => undefined);
    fillers.push({ client, room });
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
  console.log("EIGHT HUMANS", {
    humans: eightHumans.humans,
    bots: eightHumans.bots,
    views: eightHumans.views.length,
    skinIds: eightHumans.participants.map((entry) => entry.skinId),
    botLabels: eightHumans.views.filter((view) => view.botLabelVisible).length,
  });
  check("eight-human match has no bots", eightHumans.humans === 8 && eightHumans.bots === 0);
  check(
    "all eight humans keep the VIBER-010 default skin",
    eightHumans.participants.length === 8 &&
      eightHumans.participants.every(
        (entry) => entry.kind === "human" && entry.skinId === defaultSkinId,
      ),
  );
  check(
    "eight-human match shows only default Viber humans with no bot labels",
    eightHumans.views.length === 8 &&
      eightHumans.views.every(
        (view) =>
          view.kind === "human" &&
          view.texture === defaultTextureKey &&
          view.botLabelVisible === false,
      ),
  );
  if (artifactDir) {
    await pageA.screenshot({
      path: `${artifactDir}/slice-c-viber-eight-humans.png`,
      fullPage: true,
    });
  }

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
