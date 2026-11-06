/**
 * Playability acceptance suite. Real Chromium, real CDP multi-touch, a real
 * local server behind a latency proxy.
 *
 *   node scripts/build-test-frontend.mjs
 *   npm run verify:playability
 *
 * Mobile checks are Chromium emulation. They prove event handling and layout,
 * not how a physical phone feels.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStack } from "./lib/test-stack.mjs";

const rosterFile = JSON.parse(readFileSync("src/game/characters/roster.json", "utf8"));
const ROSTER = Array.isArray(rosterFile) ? rosterFile : rosterFile.characters ?? rosterFile.roster;
const out = "artifacts/playability/acceptance";
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");
const results = [];
const check = (name, condition, detail = "") => {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  ${detail}` : ""}`);
};
const section = async (name, run) => {
  if (only && !only.includes(name)) return;
  console.log(`\n## ${name}`);
  try {
    await run();
  } catch (error) {
    check(`${name} completed`, false, error.message.slice(0, 900));
  }
};

const stack = await startStack({ countdownMs: 800, reconnectGraceSeconds: 30 });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=d3d11",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

const PHONE = { width: 844, height: 390 };
const newTouchPage = async (viewport = PHONE) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, errors };
};

const waitLive = (page) =>
  page.waitForFunction(
    () => window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot?.phase === "live",
    null,
    { timeout: 30_000 },
  );
const probe = (page, read) =>
  page.evaluate(
    (source) =>
      eval(source)(window.__VIBE_MILITIA_ONLINE__.getProbe()),
    read.toString(),
  );
const hooks = (page, name, ...args) =>
  page.evaluate(
    ([hook, values]) => window.__VIBE_MILITIA_ONLINE__.getProbe().testHooks[hook](...values),
    [name, args],
  );
const selfOf = (page) =>
  probe(page, (p) => {
    const entry = p.snapshot.participants.find((item) => item.id === p.sessionId);
    return {
      ...entry,
      touch: p.touch,
      control: p.control,
      localAim: p.localAim,
      hud: { ammo: p.hud.ammo },
      camera: p.camera,
    };
  });
const center = async (page, testId) => {
  const box = await page.locator(`[data-testid="${testId}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2, box };
};
const touch = (cdp, type, points) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point, index) => ({
      x: point.x,
      y: point.y,
      id: point.id ?? index,
    })),
  });

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function joinOnline(page, baseUrl = stack.baseUrl) {
  await page.goto(`${baseUrl}/online`, { waitUntil: "load" });
  await page
    .waitForSelector('[data-testid="create-room"]:not([disabled])', { timeout: 30_000 })
    .catch(async (error) => {
      await page.screenshot({ path: `${out}/join-timeout.png` });
      console.log(stack.game.logs.join("").slice(-1200));
      throw error;
    });
  await page.waitForTimeout(500);
  const guide = page.locator('[data-testid="onboarding-dismiss"]');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  await page.locator('[data-testid="create-room"]').click();
  await waitLive(page);
}

try {
  await section("identity", async () => {
    for (const [label, touchMode] of [["desktop", false], ["touch", true]]) {
      const context = await browser.newContext({
        viewport: touchMode ? PHONE : { width: 1366, height: 768 },
        isMobile: touchMode,
        hasTouch: touchMode,
      });
      const page = await context.newPage();
      await page.goto(`${stack.baseUrl}/`, { waitUntil: "load" });
      const name = page.locator('[data-testid="onboarding-name"]');
      const x = page.locator('[data-testid="onboarding-x-handle"]');
      await name.waitFor({ timeout: 20_000 });
      await name.fill("ENDY");
      await (touchMode ? x.tap() : x.click());
      let stolen = 0;
      for (const char of "@vibe_militia_1") {
        await page.keyboard.type(char);
        await page.waitForTimeout(25);
        const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
        if (focused !== "onboarding-x-handle") stolen += 1;
      }
      check(`${label}: typing a full X handle keeps focus`, stolen === 0, `${stolen} steals`);
      check(`${label}: X handle text is intact`, (await x.inputValue()) === "@vibe_militia_1", await x.inputValue());
      check(`${label}: callsign untouched`, (await name.inputValue()) === "ENDY");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("Backspace");
      check(`${label}: select all and delete clears only the handle`, (await x.inputValue()) === "" && (await name.inputValue()) === "ENDY");
      await x.evaluate((node) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(node, "@pasted");
        node.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(50);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
      check(`${label}: paste keeps focus`, focused === "onboarding-x-handle" && (await x.inputValue()) === "@pasted", focused);
      await (touchMode ? name.tap() : name.click());
      await page.keyboard.type("X");
      await (touchMode ? x.tap() : x.click());
      await page.keyboard.type("Z");
      await page.waitForTimeout(50);
      check(`${label}: refocus between fields works both ways`, (await x.inputValue()).endsWith("Z") && (await name.inputValue()).includes("X"));
      const note = page.getByText(/unverified/i).first();
      check(`${label}: handle is labelled unverified`, await note.isVisible().catch(() => false));
      await page.screenshot({ path: `${out}/onboarding-${label}.png` });
      await context.close();
    }
  });

  await section("layout", async () => {
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 932, height: 430 },
      { width: 780, height: 360 },
      { width: 800, height: 360 },
    ]) {
      const { context, page } = await newTouchPage(viewport);
      await page.goto(`${stack.baseUrl}/practice?difficulty=normal`, { waitUntil: "load" });
      await waitLive(page);
      await page.waitForTimeout(600);
      const ids = [
        "touch-move", "touch-aim", "touch-jump", "touch-fire", "touch-reload",
        "touch-grenade", "touch-throw-grenade", "touch-medkit", "touch-swap",
        "touch-weapon-1", "touch-weapon-2", "touch-weapon-3", "touch-settings",
      ];
      const boxes = {};
      for (const id of ids) boxes[id] = await page.locator(`[data-testid="${id}"]`).boundingBox();
      const tag = `${viewport.width}x${viewport.height}`;
      const missing = ids.filter((id) => !boxes[id]);
      check(`${tag}: all thumb controls render`, missing.length === 0, missing.join(","));
      const outside = ids.filter((id) => {
        const box = boxes[id];
        return box && (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height);
      });
      check(`${tag}: no control leaves the screen`, outside.length === 0, outside.join(","));
      const small = ids.filter((id) => id !== "touch-settings" && boxes[id] && (boxes[id].width < 44 || boxes[id].height < 44));
      check(`${tag}: touch targets are at least 44px`, small.length === 0, small.join(","));
      const collisions = [];
      for (let a = 0; a < ids.length; a += 1) {
        for (let b = a + 1; b < ids.length; b += 1) {
          if (boxes[ids[a]] && boxes[ids[b]] && overlaps(boxes[ids[a]], boxes[ids[b]])) {
            collisions.push(`${ids[a]}~${ids[b]}`);
          }
        }
      }
      check(`${tag}: controls do not overlap`, collisions.length === 0, collisions.join(" "));
      const scroll = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
      }));
      check(`${tag}: no page scroll is needed`, scroll.x <= 0 && scroll.y <= 0, JSON.stringify(scroll));
      await context.close();
    }
  });

  await section("touch", async () => {
    const { context, page, cdp, errors } = await newTouchPage();
    await page.goto(`${stack.baseUrl}/practice?difficulty=normal`, { waitUntil: "load" });
    await waitLive(page);
    await hooks(page, "guard");
    await hooks(page, "teleport", 1500, 960);
    await page.waitForTimeout(900);
    const move = await center(page, "touch-move");
    const aim = await center(page, "touch-aim");
    const reach = aim.r * 0.75;

    // Quick tap fires toward the retained aim and moves nothing.
    const before = await selfOf(page);
    await touch(cdp, "touchStart", [{ x: aim.x + 2, y: aim.y + 1, id: 1 }]);
    await page.waitForTimeout(40);
    await touch(cdp, "touchEnd", []);
    await page.waitForTimeout(350);
    const tapped = await selfOf(page);
    check("tap fires one shot or burst", tapped.hud.ammo < before.hud.ammo, `${before.hud.ammo} -> ${tapped.hud.ammo}`);
    check("tap releases fire", (await selfOf(page)).touch.fire === false);

    // One continuous two-thumb gesture: move, fly, rotate and fire together.
    await hooks(page, "teleport", 1300, 1340);
    await page.waitForTimeout(500);
    const left = { x: move.x + move.r * 0.6, y: move.y - move.r * 0.75, id: 2 };
    const right = { x: aim.x + reach, y: aim.y, id: 3 };
    await touch(cdp, "touchStart", [left]);
    await page.waitForTimeout(60);
    await touch(cdp, "touchStart", [left, right]);
    await page.waitForTimeout(120);
    const angles = [];
    let unwrapped = 0;
    let last = null;
    let firingFrames = 0;
    let movingFrames = 0;
    for (let step = 0; step <= 36; step += 1) {
      const angle = (step / 36) * Math.PI * 2;
      await touch(cdp, "touchMove", [
        left,
        { x: aim.x + Math.cos(angle) * reach, y: aim.y + Math.sin(angle) * reach, id: 3 },
      ]);
      await page.waitForTimeout(34);
      const state = await selfOf(page);
      angles.push({ want: Math.atan2(Math.sin(angle), Math.cos(angle)), got: state.localAim });
      if (last !== null) {
        let delta = state.localAim - last;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        unwrapped += delta;
      }
      last = state.localAim;
      if (state.touch.fire) firingFrames += 1;
      if (state.control?.moveX > 0 && state.touch.jumpHeld) movingFrames += 1;
    }
    const worst = Math.max(
      ...angles.map(({ want, got }) => {
        let delta = Math.abs(want - got);
        if (delta > Math.PI) delta = Math.PI * 2 - delta;
        return delta;
      }),
    );
    check("weapon follows the thumb through a full 360", Math.abs(unwrapped) > 5.5, `${unwrapped.toFixed(2)} rad`);
    check("aim error stays small while rotating", worst < 0.35, `${worst.toFixed(3)} rad`);
    check("drag aims and fires at once", firingFrames >= 30, `${firingFrames}/37`);
    check("left thumb keeps moving and thrusting throughout", movingFrames >= 30, `${movingFrames}/37`);
    const air = await selfOf(page);
    check("jetpack lifted the player during the gesture", air.y < 1320, `y=${air.y.toFixed(0)}`);
    const held = (await selfOf(page)).localAim;
    // CDP touchEnd lists the fingers that lift, and an empty list lifts all.
    await touch(cdp, "touchEnd", [right]);
    await page.waitForTimeout(150);
    const released = await selfOf(page);
    check("release stops fire", released.touch.fire === false);
    check("release keeps the last aim", Math.abs(released.localAim - held) < 0.2, `${held.toFixed(2)} -> ${released.localAim.toFixed(2)}`);
    check("left thumb is unaffected by the right release", released.touch.moveX > 0);
    await touch(cdp, "touchEnd", []);
    await page.waitForTimeout(120);
    const clear = await selfOf(page);
    check("no stuck input after both thumbs lift", clear.touch.moveX === 0 && !clear.touch.jumpHeld && !clear.touch.fire);

    // Blur, cancel and rotation mid-gesture.
    await touch(cdp, "touchStart", [left, right]);
    await page.waitForTimeout(120);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(80);
    const blurred = await selfOf(page);
    check("blur clears held input", blurred.touch.moveX === 0 && !blurred.touch.fire && !blurred.touch.jumpHeld);
    await touch(cdp, "touchEnd", []);
    await touch(cdp, "touchStart", [left, right]);
    await page.waitForTimeout(100);
    await touch(cdp, "touchCancel", []);
    await page.waitForTimeout(100);
    const cancelled = await selfOf(page);
    check("touch cancel clears held input", cancelled.touch.moveX === 0 && !cancelled.touch.fire && !cancelled.touch.jumpHeld);

    // Camera look-ahead stays gentle.
    await hooks(page, "teleport", 1800, 1340);
    await page.waitForTimeout(700);
    const restCamera = (await selfOf(page)).camera;
    await touch(cdp, "touchStart", [{ x: aim.x + reach, y: aim.y, id: 3 }]);
    const trace = [];
    for (let frame = 0; frame < 30; frame += 1) {
      await page.waitForTimeout(16);
      trace.push((await selfOf(page)).camera.scrollX);
    }
    await touch(cdp, "touchEnd", []);
    const shift = trace.at(-1) - restCamera.scrollX;
    const steps = trace.slice(1).map((value, index) => Math.abs(value - trace[index]));
    check("aiming shifts the camera toward the aim", shift > 40, `${shift.toFixed(0)}px (zoomed space)`);
    check("look-ahead is smooth, with no yank", Math.max(...steps) < 40, `max ${Math.max(...steps).toFixed(1)}px/sample`);

    await page.evaluate(() => {
      const raw = localStorage.getItem("vibe-militia-touch-v2");
      const settings = raw ? JSON.parse(raw) : {};
      localStorage.setItem("vibe-militia-touch-v2", JSON.stringify({ ...settings, aimFireEnabled: false }));
    });
    await page.reload({ waitUntil: "load" });
    await waitLive(page);
    await hooks(page, "guard");
    await page.waitForTimeout(500);
    const aimPad = await page.locator('[data-testid="touch-aim"]').getAttribute("data-aim-fire-enabled");
    check("separate FIRE mode can be selected", aimPad === "false", aimPad);
    const aimBox = await center(page, "touch-aim");
    await touch(cdp, "touchStart", [{ x: aimBox.x + reach, y: aimBox.y - 10, id: 4 }]);
    await page.waitForTimeout(200);
    check("separate mode: drag aims without firing", (await selfOf(page)).touch.fire === false);
    const fireBox = await center(page, "touch-fire");
    await touch(cdp, "touchStart", [{ x: aimBox.x + reach, y: aimBox.y - 10, id: 4 }, { x: fireBox.x, y: fireBox.y, id: 5 }]);
    await page.waitForTimeout(150);
    check("separate mode: FIRE button fires", (await selfOf(page)).touch.fire === true);
    await touch(cdp, "touchEnd", []);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    check("portrait shows the rotate guard", await page.locator('[data-testid="orientation-guard"]').isVisible());
    check("no page errors in the touch suite", errors.length === 0, errors[0] ?? "");
    await context.close();
  });

  await section("practice", async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const gameRequests = [];
    page.on("request", (request) => {
      if (request.url().includes(":3212")) gameRequests.push(request.url());
    });
    await page.addInitScript(() => localStorage.setItem("vibe-militia-skin", "viber-031"));
    await page.goto(`${stack.baseUrl}/practice?difficulty=hard`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__?.getProbe().ready === true);
    await context.setOffline(true);
    await waitLive(page);
    check("practice runs with the network off", true);
    const roster = await probe(page, (p) => ({
      bots: p.snapshot.participants.filter((e) => e.kind === "bot").map((e) => e.skinId),
      me: p.snapshot.participants.find((e) => e.id === p.sessionId),
      pickups: p.snapshot.pickups.map((e) => e.type),
    }));
    check("seven Viber bots join", roster.bots.length === 7, roster.bots.length);
    const official = new Set(ROSTER.map((entry) => entry.skinId ?? entry.id));
    check("bots wear official Viber skins", roster.bots.every((id) => official.has(id)), roster.bots.join(","));
    check("selected Viber is used", roster.me.skinId === "viber-031", roster.me.skinId);
    check("no ranked identity is attached", roster.me.playerId === null);
    check("world medkits exist", roster.pickups.some((type) => type.includes("medkit")), roster.pickups.join(","));
    check("all three grenade supplies exist", ["contact", "frag", "stinking"].every((type) => roster.pickups.some((entry) => entry.includes(type))));

    await hooks(page, "guard");
    await hooks(page, "disableBotCuriosity");
    await hooks(page, "extendMatch", 600_000);
    const weapons = ["vibe-rifle", "scatter-blaster", "vibe-lance", "akimbo-rifles", "vibe-smg", "heavy-cannon", "rocket-launcher"];
    const fired = [];
    for (const weaponId of weapons) {
      const id = await probe(page, (p) => p.sessionId);
      await hooks(page, "giveWeapon", id, weaponId);
      await page.waitForTimeout(120);
      await hooks(page, "setAim", 1800, 1200);
      const ammoBefore = (await selfOf(page)).hud.ammo;
      await hooks(page, "fireOnce");
      await page.waitForTimeout(260);
      const state = await probe(page, (p) => ({
        weapon: p.snapshot.participants.find((e) => e.id === p.sessionId).weaponId,
        ammo: p.hud.ammo,
      }));
      if (state.weapon === weaponId && state.ammo < ammoBefore) fired.push(weaponId);
    }
    check("all seven weapons equip and fire", fired.length === 7, fired.join(","));

    const pickupTarget = await probe(page, (p) => p.snapshot.pickups.find((e) => e.type.includes("medkit") && e.active));
    await hooks(page, "teleport", pickupTarget.x, pickupTarget.y);
    await page.waitForTimeout(500);
    const kit = await probe(page, (p) => p.hud.medkits);
    check("a world medkit is collected", kit >= 1, kit);
    await page.locator('[data-testid="hud-medkits"]').waitFor();

    for (const [type, slot] of [["contact", 4], ["frag", 5], ["stinking", 6]]) {
      await page.keyboard.press(`Digit${slot}`);
      await page.waitForTimeout(120);
      const count = await page.locator(`[data-testid="grenade-count-${type === "stinking" ? "stinking" : type}"]`).innerText();
      await hooks(page, "setAim", 1800, 1000);
      await page.keyboard.press("KeyG");
      await page.waitForTimeout(700);
      const after = await page.locator(`[data-testid="grenade-count-${type === "stinking" ? "stinking" : type}"]`).innerText();
      check(`${type} grenade throws`, Number(after) < Number(count), `${count} -> ${after}`);
      await hooks(page, "resetPickups");
      await page.waitForTimeout(100);
      const target = await page.evaluate(
        (kind) =>
          window.__VIBE_MILITIA_ONLINE__
            .getProbe()
            .snapshot.pickups.find((entry) => entry.type.startsWith(kind) && entry.active),
        type,
      );
      await hooks(page, "teleport", target.x, target.y);
      await page.waitForTimeout(500);
      const collected = await page.locator(`[data-testid="grenade-count-${type}"]`).innerText();
      check(`${type} grenade pickup is collected`, Number(collected) > Number(after), collected);
      await hooks(page, "teleport", 1500, 960);
      await page.waitForTimeout(1300);
    }

    const bot = await probe(page, (p) => p.snapshot.participants.find((e) => e.kind === "bot" && e.alive).id);
    await hooks(page, "eliminate", bot, "bullet");
    await page.waitForTimeout(500);
    const loot = await probe(page, (p) => p.snapshot.loot.length);
    check("an elimination drops loot", loot > 0, loot);
    await page.waitForFunction(
      (id) => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.participants.find((e) => e.id === id)?.alive,
      bot,
      { timeout: 12_000 },
    );
    check("eliminated bot respawns", true);

    await hooks(page, "endMatch");
    await page.waitForSelector('.results-overlay.is-visible', { timeout: 8000 });
    check("results show practice label", /NO RANKED XP/.test(await page.locator(".results-foot").innerText()));
    check("no XP is shown after practice", (await page.locator('[data-testid="results-progression"]').count()) === 0);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return p.snapshot.phase === "live" && p.snapshot.remainingMs > 80_000;
    }, null, { timeout: 8000 });
    check("Enter plays again", true);
    await hooks(page, "endMatch");
    await page.waitForSelector('.results-overlay.is-visible', { timeout: 8000 });
    await page.locator('[data-testid="results-lobby"]').waitFor();
    await context.setOffline(false);
    await page.keyboard.press("KeyL");
    await page.waitForURL(`${stack.baseUrl}/`, { timeout: 8000 });
    check("L returns to the hub", true);
    check("practice never contacted the game server", gameRequests.length === 0, gameRequests.length);
    check("no practice page errors", errors.length === 0, errors[0] ?? "");
    await context.close();
  });

  await section("occlusion", async () => {
    const measure = (page) =>
      page.evaluate(() => {
        const selectors = [
          ".hud-strip", ".hud-clock", ".hud-loadout", ".hud-board-toggle",
          ".online-session-bar", ".practice-back", ".tc-hud", ".tc-weapons",
        ];
        const area = innerWidth * innerHeight;
        let covered = 0;
        for (const selector of selectors) {
          for (const node of document.querySelectorAll(selector)) {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden") continue;
            const box = node.getBoundingClientRect();
            covered += box.width * box.height;
          }
        }
        return (covered / area) * 100;
      });
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await joinOnline(page);
      await page.waitForTimeout(800);
      const percent = await measure(page);
      check(`${viewport.width}x${viewport.height}: permanent HUD covers under 9% of the view`, percent < 9, `${percent.toFixed(1)}%`);
      const board = page.locator('[data-testid="board-toggle"]');
      await board.click();
      check("scoreboard opens on demand", await page.locator('[data-testid="leaderboard"]').isVisible());
      await board.click();
      check("scoreboard closes again", !(await page.locator('[data-testid="leaderboard"]').isVisible()));
      await page.keyboard.down("Tab");
      await page.waitForTimeout(80);
      check("holding Tab shows the scoreboard", await page.locator('[data-testid="leaderboard"]').isVisible());
      await page.keyboard.up("Tab");
      await context.close();
    }
  });

  await section("online", async () => {
    stack.proxy.set({ rttMs: 150, jitterMs: 40 });
    const contextA = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const contextB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const a = await contextA.newPage();
    const b = await contextB.newPage();
    const errors = [];
    a.on("pageerror", (error) => errors.push(error.message));
    b.on("pageerror", (error) => errors.push(error.message));
    await joinOnline(a);
    const room = await a.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().roomId);
    await b.goto(`${stack.baseUrl}/online?room=${room}`, { waitUntil: "load" });
    await b.waitForSelector('[data-testid="join-invite-room"]:not([disabled])', { timeout: 20_000 });
    await b.waitForTimeout(1200);
    const guide = b.locator('[data-testid="onboarding-dismiss"]');
    if (await guide.isVisible().catch(() => false)) await guide.click();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const join = b.locator('[data-testid="join-invite-room"]');
      if (await join.isVisible().catch(() => false)) await join.click({ timeout: 4000 });
      const joined = await b
        .waitForFunction(() => Boolean(window.__VIBE_MILITIA_ONLINE__), null, { timeout: 7000 })
        .then(() => true)
        .catch(() => false);
      if (joined) break;
      console.log("join retry", (await b.locator(".online-invite").allInnerTexts()).join(" | ").slice(0, 200));
    }
    await waitLive(b);
    const idA = await a.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().sessionId);
    check("second independent client shares the room", (await b.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().roomId)) === room);
    await hooks(a, "guard");
    await hooks(b, "guard");
    await hooks(a, "extendMatch", 600_000);
    await hooks(a, "teleport", 2400, 1340);
    await hooks(b, "teleport", 2500, 1340);
    await a.waitForTimeout(900);

    await a.bringToFront();
    await a.keyboard.down("KeyD");
    const seen = [];
    for (let sample = 0; sample < 22; sample += 1) {
      seen.push(
        await b.evaluate((id) => window.__VIBE_MILITIA_ONLINE__.getProbe().views.find((view) => view.id === id)?.x, idA),
      );
      await b.waitForTimeout(50);
    }
    await a.keyboard.up("KeyD");
    await a.waitForTimeout(1200);
    const moved = seen.at(-1) - seen[0];
    check("client B sees client A run", moved > 200, `${moved.toFixed(0)}px`);
    const backStep = Math.max(0, ...seen.slice(1).map((x, index) => seen[index] - x));
    check("client B never sees A visibly step backwards", backStep < 4, `${backStep.toFixed(2)}px`);
    const stateA = await a.evaluate((id) => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return { view: p.views.find((v) => v.id === id).x, auth: p.snapshot.participants.find((e) => e.id === id).x };
    }, idA);
    check("client and server agree once stopped", Math.abs(stateA.view - stateA.auth) < 2, `${Math.abs(stateA.view - stateA.auth).toFixed(2)}px`);

    await a.keyboard.press("Space");
    await a.keyboard.down("Space");
    await a.waitForTimeout(600);
    const flight = await a.evaluate((id) => window.__VIBE_MILITIA_ONLINE__.getProbe().views.find((v) => v.id === id).y, idA);
    await a.keyboard.up("Space");
    check("jetpack flies online", flight < 1250, `y=${flight.toFixed(0)}`);
    await a.waitForTimeout(1600);

    // Being eliminated is not a connection problem, and must not read like one.
    await hooks(b, "eliminate", idA, "bullet");
    await a.waitForSelector(".death-overlay.is-visible", { timeout: 4000 });
    const death = await a.locator(".death-overlay").innerText();
    check("elimination says ELIMINATED", /ELIMINATED/.test(death) && !/SIGNAL/.test(death), death.replace(/\s+/g, " ").slice(0, 60));
    check("elimination shows no connection warning", (await a.locator('[data-testid="connection-status"]').getAttribute("data-signal")) === "ok");
    check("no full-screen scrim while eliminated", (await a.evaluate(() => getComputedStyle(document.querySelector(".death-overlay")).backgroundImage + getComputedStyle(document.querySelector(".death-overlay")).backgroundColor)).match(/none|rgba\(0, 0, 0, 0\)/) !== null);
    await a.waitForFunction((id) => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.participants.find((e) => e.id === id).alive, idA, { timeout: 8000 });
    await hooks(a, "guard");

    // A real drop: the proxy kills every socket. Seat and room must survive.
    stack.proxy.dropAll();
    await a.waitForSelector('[data-testid="reconnect-overlay"]', { timeout: 6000 }).catch(() => null);
    await a.waitForFunction(() => !document.querySelector('[data-testid="reconnect-overlay"]'), null, { timeout: 25_000 });
    await a.waitForTimeout(1200);
    const after = await a.evaluate(() => {
      const p = window.__VIBE_MILITIA_ONLINE__.getProbe();
      return { room: p.roomId, id: p.sessionId, connected: p.snapshot.participants.find((e) => e.id === p.sessionId)?.connected, fire: p.control?.fire, move: p.control?.moveX };
    });
    check("reconnect keeps the room", after.room === room);
    check("reconnect keeps the seat", after.id === idA && after.connected === true, JSON.stringify(after));
    check("inputs are clear after reconnect", !after.fire && after.move === 0);
    await a.keyboard.down("KeyD");
    await a.waitForTimeout(500);
    const live = await a.evaluate(() => window.__VIBE_MILITIA_ONLINE__.getProbe().control.moveX);
    await a.keyboard.up("KeyD");
    check("controls work after reconnect", live === 1);

    const token = await a.evaluate(() => localStorage.getItem("vibe-militia-guest-token"));
    const xp = async () => {
      const response = await fetch(`http://localhost:3212/api/profile`, { headers: { Authorization: `Bearer ${token}` } });
      return response.ok ? (await response.json()).player?.xp ?? null : null;
    };
    const xpBefore = await xp();
    await hooks(a, "endMatch");
    await a.waitForSelector('.results-overlay.is-visible', { timeout: 8000 });
    await b.waitForSelector('.results-overlay.is-visible', { timeout: 8000 });
    await a.waitForTimeout(1500);
    const xpAfter = await xp();
    check("the online match settles XP once", xpAfter !== null && xpBefore !== null && xpAfter > xpBefore, `${xpBefore} -> ${xpAfter}`);
    await a.locator('[data-testid="results-replay"]').click();
    await a.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.phase === "live", null, { timeout: 8000 });
    await a.waitForTimeout(1500);
    check("PLAY AGAIN does not award XP twice", (await xp()) === xpAfter);
    await hooks(a, "endMatch");
    await a.waitForSelector('.results-overlay.is-visible', { timeout: 8000 });
    await a.locator('[data-testid="results-lobby"]').click();
    await a.waitForSelector('[data-testid="create-room"]', { timeout: 8000 });
    check("LOBBY leaves the match", (await a.evaluate(() => window.location.pathname)) === "/online");
    await b.waitForFunction(
      (id) => !window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.participants.some((e) => e.id === id),
      idA,
      { timeout: 6000 },
    );
    check("leaving frees the room seat", true);
    await b.screenshot({ path: `${out}/results-b.png` });
    await b.locator('[data-testid="results-replay"]').click({ timeout: 6000 }).catch(async (error) => {
      console.log(error.message.slice(0, 900));
      throw error;
    });
    await b.waitForFunction(() => window.__VIBE_MILITIA_ONLINE__.getProbe().snapshot.phase === "live", null, { timeout: 8000 });
    await hooks(b, "guard");
    const leave = b.locator('[data-testid="leave-online"]');
    await leave.click();
    await b.waitForTimeout(150);
    check("a live LEAVE asks for confirmation", /CONFIRM/.test(await leave.innerText()) && (await b.evaluate(() => Boolean(window.__VIBE_MILITIA_ONLINE__))));
    await leave.click();
    await b.waitForSelector('[data-testid="create-room"]', { timeout: 8000 });
    check("confirmed LEAVE returns to the lobby", true);
    check("no online page errors", errors.length === 0, errors[0] ?? "");
    stack.proxy.set({ rttMs: 0, jitterMs: 0 });
    await contextA.close();
    await contextB.close();
  });
} finally {
  await browser.close();
  await stack.stop();
}

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const entry of failed) console.log(`FAILED  ${entry.name}  ${entry.detail}`);
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
if (failed.length > 0) process.exitCode = 1;
