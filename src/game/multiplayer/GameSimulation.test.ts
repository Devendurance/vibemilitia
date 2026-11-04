import { describe, expect, it } from "vitest";
import {
  CHARACTER_ROSTER,
  HUMAN_DEFAULT_SKIN_ID,
} from "@/game/characters/roster";
import {
  GRENADE_CONFIG,
  STINKING_CLOUD_CONFIG,
  TOXIC_DAMAGE_PER_TICK,
  computeBlastDamage,
} from "@/game/core/grenades";
import { MEDKIT_CONFIG } from "@/game/core/pickups";
import type { OnlineInputPayload } from "@/game/multiplayer/protocol";
import { GameSimulation } from "./GameSimulation";

const rosterSkinIds = new Set(
  CHARACTER_ROSTER.map((skin) => skin.skinId),
);

function runTicks(sim: GameSimulation, count: number): void {
  for (let index = 0; index < count; index += 1) {
    sim.tick(1000 / 60);
  }
}

interface HumanTestView {
  kin: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    grounded: boolean;
  };
  health: number;
  medkits: number;
  medkitCooldownRemainingMs: number;
  lastDamageMs: number;
  alive: boolean;
  respawnRemainingMs: number;
  invulnerableRemainingMs: number;
  aimAngle: number;
  grenades: { contact: number; frag: number; stinking: number };
  selectedGrenade: "contact" | "frag" | "stinking";
  grenadeCooldownRemainingMs: number;
  eliminations: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
}

interface BotTestView {
  id: string;
  x: number;
  y: number;
  health: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  eliminations: number;
  deaths: number;
  medkits: number;
  medkitCooldownRemainingMs: number;
  grenades: { contact: number; frag: number; stinking: number };
  grenadeCooldownRemainingMs: number;
  grenadeDecisionCooldownMs: number;
  cloudAvoidRemainingMs: number;
}

interface ToxicCloudTestView {
  id: number;
  ownerId: string;
  ownerName: string;
  ownerKind: "human" | "bot";
  x: number;
  y: number;
  radius: number;
  createdAtMs: number;
  expiresAtMs: number;
}

function humanView(sim: GameSimulation, id: string): HumanTestView {
  const humans = (
    sim as unknown as { humans: Map<string, HumanTestView> }
  ).humans;
  const human = humans.get(id);
  if (!human) throw new Error(`missing human ${id}`);
  return human;
}

function spawnTestBot(sim: GameSimulation): BotTestView {
  (
    sim as unknown as { createBot: () => void }
  ).createBot();
  const bots = (
    sim as unknown as { bots: Map<string, BotTestView> }
  ).bots;
  const bot = [...bots.values()].at(-1);
  if (!bot) throw new Error("bot was not created");
  return bot;
}

function placeHuman(
  sim: GameSimulation,
  id: string,
  x: number,
  y: number,
  aim = 0,
): void {
  const human = humanView(sim, id);
  human.kin.x = x;
  human.kin.y = y;
  human.kin.vx = 0;
  human.kin.vy = 0;
  human.kin.grounded = true;
  human.aimAngle = aim;
}

function placeBot(
  sim: GameSimulation,
  bot: BotTestView,
  x: number,
  feetY: number,
): void {
  bot.x = x;
  bot.y = feetY - 18;
  bot.alive = true;
  bot.invulnerableRemainingMs = 0;
}

function injectToxicCloud(
  sim: GameSimulation,
  options: {
    x: number;
    y: number;
    ownerId: string;
    ownerName?: string;
    ownerKind?: "human" | "bot";
    radius?: number;
    expiresAtMs?: number;
  },
): ToxicCloudTestView {
  const clouds = (
    sim as unknown as {
      toxicClouds: Map<number, ToxicCloudTestView>;
    }
  ).toxicClouds;
  const elapsedMs = (
    sim as unknown as { elapsedMs: number }
  ).elapsedMs;
  const id = 1_000 + clouds.size;
  const cloud: ToxicCloudTestView = {
    id,
    ownerId: options.ownerId,
    ownerName: options.ownerName ?? options.ownerId,
    ownerKind: options.ownerKind ?? "human",
    x: options.x,
    y: options.y,
    radius: options.radius ?? STINKING_CLOUD_CONFIG.radius,
    createdAtMs: elapsedMs,
    expiresAtMs:
      options.expiresAtMs ??
      elapsedMs + STINKING_CLOUD_CONFIG.durationMs,
  };
  clouds.set(id, cloud);
  return cloud;
}

function toxicClouds(sim: GameSimulation): ToxicCloudTestView[] {
  const clouds = (
    sim as unknown as {
      toxicClouds: Map<number, ToxicCloudTestView>;
    }
  ).toxicClouds;
  return [...clouds.values()];
}

function placeOnPickup(
  sim: GameSimulation,
  id: string,
  pickupId: string,
): void {
  const pickup = sim
    .snapshot()
    .pickups.find((candidate) => candidate.id === pickupId);
  if (!pickup) throw new Error(`missing pickup ${pickupId}`);
  const human = humanView(sim, id);
  human.kin.x = pickup.x;
  human.kin.y = pickup.y + 16;
  human.kin.vx = 0;
  human.kin.vy = 0;
  human.kin.grounded = true;
}

function medkitInput(seq: number): OnlineInputPayload {
  return {
    seq,
    moveX: 0,
    jump: false,
    jumpHeld: false,
    fire: false,
    reload: false,
    weapon: null,
    aim: 0,
    useMedkit: true,
  };
}

function grenadeInput(
  seq: number,
  options: {
    slot?: number | null;
    throwGrenade?: boolean;
    aim?: number;
  } = {},
): OnlineInputPayload {
  return {
    seq,
    moveX: 0,
    jump: false,
    jumpHeld: false,
    fire: false,
    reload: false,
    weapon: null,
    aim: options.aim ?? 0,
    grenadeSlot: options.slot ?? null,
    throwGrenade: options.throwGrenade ?? false,
  };
}

function detonateTestGrenade(
  sim: GameSimulation,
  x: number,
  y: number,
  ownerId = "one",
  type: "contact" | "frag" = "frag",
  directVictimId?: string,
): void {
  const detonate = (
    sim as unknown as {
      detonateGrenade: (grenade: unknown, victimId?: string) => void;
    }
  ).detonateGrenade;
  detonate.call(
    sim,
    {
      id: 9_999,
      type,
      ownerId,
      ownerKind: "human",
      x,
      y,
      vx: 0,
      vy: 0,
      armed: true,
      armingRemainingMs: 0,
      distanceTraveled: 100,
      bounces: 0,
      detonateAtMs: 0,
      exploded: false,
    },
    directVictimId,
  );
}

describe("authoritative match simulation", () => {
  it("holds a countdown, then fills bots and starts the match", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 5_000,
    });
    expect(sim.addHuman("one", "ONE").ok).toBe(true);
    const waiting = sim.snapshot();
    expect(waiting.phase).toBe("countdown");
    expect(waiting.humans).toBe(1);
    expect(waiting.bots).toBe(0);
    expect(waiting.countdownRemainingMs).toBe(5_000);
    expect(waiting.remainingMs).toBe(90_000);

    expect(sim.addHuman("two", "TWO").ok).toBe(true);
    expect(sim.snapshot().humans).toBe(2);
    expect(sim.snapshot().bots).toBe(0);

    runTicks(sim, 60 * 4);
    expect(sim.snapshot().phase).toBe("countdown");
    runTicks(sim, 70);
    const live = sim.snapshot();
    expect(live.phase).toBe("live");
    expect(live.humans).toBe(2);
    expect(live.bots).toBe(6);
    expect(live.maxCombatants).toBe(8);
    expect(live.remainingMs).toBeGreaterThan(89_000);
  });

  it("starts immediately when all eight human seats fill", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 10_000,
    });
    for (let index = 0; index < 8; index += 1) {
      expect(sim.addHuman(`human-${index}`, `HUMAN-${index}`).ok).toBe(true);
    }
    const live = sim.snapshot();
    expect(live.phase).toBe("live");
    expect(live.humans).toBe(8);
    expect(live.bots).toBe(0);
    expect(live.countdownRemainingMs).toBe(0);
  });

  it("reports online bots with the Vibe Rifle presentation and unique skins", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const snapshot = sim.snapshot();
    const human = snapshot.participants.find((entry) => entry.kind === "human");
    const bots = snapshot.participants.filter((entry) => entry.kind === "bot");
    const botSkins = bots.map((bot) => bot.skinId);
    expect(human?.skinId).toBe(HUMAN_DEFAULT_SKIN_ID);
    expect(bots).toHaveLength(7);
    expect(new Set(botSkins).size).toBe(7);
    expect(botSkins).not.toContain(HUMAN_DEFAULT_SKIN_ID);
    expect(botSkins.every((skinId) => rosterSkinIds.has(skinId))).toBe(true);
    expect(bots.every((bot) => bot.weaponId === "vibe-rifle")).toBe(true);
    expect(
      bots.every(
        (bot) =>
          bot.alive &&
          bot.maxHealth === 100 &&
          Number.isFinite(bot.x) &&
          Number.isFinite(bot.y),
      ),
    ).toBe(true);
  });

  it("uses valid human selections, falls back safely and prioritizes humans", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 0,
      skinSeed: 0x51c0ffee,
    });
    sim.addHuman("one", "ONE", "bureau-023");
    sim.addHuman("two", "TWO", "not-a-real-skin");
    sim.addHuman("three", "THREE", "bureau-023");
    const snapshot = sim.snapshot();
    const humans = snapshot.participants.filter(
      (entry) => entry.kind === "human",
    );
    const bots = snapshot.participants.filter((entry) => entry.kind === "bot");
    expect(humans.map((entry) => entry.skinId)).toEqual([
      "bureau-023",
      HUMAN_DEFAULT_SKIN_ID,
      "bureau-023",
    ]);
    expect(
      bots.every(
        (entry) =>
          entry.skinId !== "bureau-023" &&
          entry.skinId !== HUMAN_DEFAULT_SKIN_ID,
      ),
    ).toBe(true);
    expect(new Set(bots.map((entry) => entry.skinId)).size).toBe(
      bots.length,
    );
  });

  it("assigns deterministic skins and keeps them through human replacement", () => {
    const first = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 0,
      skinSeed: 0x51c0ffee,
    });
    const second = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      countdownMs: 0,
      skinSeed: 0x51c0ffee,
    });
    first.addHuman("one", "ONE");
    second.addHuman("one", "ONE");
    const firstSkins = first
      .snapshot()
      .participants.filter((entry) => entry.kind === "bot")
      .map((entry) => entry.skinId);
    const secondSkins = second
      .snapshot()
      .participants.filter((entry) => entry.kind === "bot")
      .map((entry) => entry.skinId);
    expect(firstSkins).toEqual(secondSkins);

    first.addHuman("two", "TWO");
    const afterJoin = first.snapshot();
    const remainingBots = afterJoin.participants.filter(
      (entry) => entry.kind === "bot",
    );
    expect(remainingBots).toHaveLength(6);
    expect(
      remainingBots.every(
        (entry) =>
          firstSkins.includes(entry.skinId) &&
          entry.skinId !== HUMAN_DEFAULT_SKIN_ID,
      ),
    ).toBe(true);
    expect(new Set(remainingBots.map((entry) => entry.skinId)).size).toBe(6);
  });

  it("accepts movement inputs and advances the server position", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const start = sim.snapshot().participants[0];
    sim.applyInput("one", {
      seq: 1,
      moveX: 1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: 0,
    });
    runTicks(sim, 40);
    const after = sim.snapshot().participants.find((entry) => entry.id === "one");
    expect(after!.x).toBeGreaterThan(start.x + 30);
    expect(after!.lastProcessedInputSeq).toBe(1);
  });

  it("ignores input before the countdown ends", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 5_000,
    });
    sim.addHuman("one", "ONE");
    const start = sim.snapshot().participants[0];
    sim.applyInput("one", {
      seq: 1,
      moveX: 1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: 0,
    });
    runTicks(sim, 30);
    const during = sim.snapshot();
    expect(during.phase).toBe("countdown");
    expect(during.participants[0].x).toBe(start.x);
    expect(during.participants[0].lastProcessedInputSeq).toBe(0);
  });

  it("ignores malformed or stale input", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    sim.applyInput("one", {
      seq: 2,
      moveX: 1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: 0,
    });
    sim.applyInput("one", {
      seq: 1,
      moveX: -1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: 0,
    });
    sim.applyInput("one", {
      seq: 3,
      moveX: 1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: Number.NaN,
    });
    const snapshot = sim.snapshot();
    expect(snapshot.participants[0].lastProcessedInputSeq).toBe(2);
  });

  it("ends on the timer and supports rematch", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE", "viber-123");
    runTicks(sim, 60 * 91);
    expect(sim.snapshot().phase).toBe("ended");
    expect(sim.snapshot().endReason).toBe("time");
    const result = sim.rematch();
    expect(result.ok).toBe(true);
    const restarted = sim.snapshot();
    expect(restarted.phase).toBe("live");
    expect(restarted.remainingMs).toBeGreaterThan(89_000);
    expect(restarted.participants[0].health).toBe(100);
    expect(restarted.participants[0].skinId).toBe("viber-123");
  });

  it("backs a disconnected human seat with a bot", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const before = sim.snapshot();
    const beforeBotIds = new Set(
      before.participants
        .filter((entry) => entry.kind === "bot")
        .map((entry) => entry.id),
    );
    expect(before.bots).toBe(6);
    sim.removeHuman("two");
    const after = sim.snapshot();
    expect(after.humans).toBe(1);
    expect(after.bots).toBe(7);
    const backfill = after.participants.find(
      (entry) => entry.kind === "bot" && !beforeBotIds.has(entry.id),
    );
    expect(backfill).toBeDefined();
    expect(backfill?.skinId).not.toBe(HUMAN_DEFAULT_SKIN_ID);
    expect(rosterSkinIds.has(backfill?.skinId ?? "")).toBe(true);
    expect(
      new Set(
        after.participants
          .filter((entry) => entry.kind === "bot")
          .map((entry) => entry.skinId),
      ).size,
    ).toBe(7);
  });

  it("spawns fixed medkit pickups and grants one on proximity", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const before = sim.snapshot();
    expect(before.pickups).toHaveLength(25);
    const medkits = before.pickups.filter(
      (pickup) => pickup.type === "medkit",
    );
    expect(medkits).toHaveLength(14);
    expect(medkits.every((pickup) => pickup.active)).toBe(true);
    expect(
      before.pickups.filter(
        (pickup) => pickup.type === "contact-grenade",
      ),
    ).toHaveLength(3);
    expect(
      before.pickups.filter((pickup) => pickup.type === "frag-grenade"),
    ).toHaveLength(3);
    expect(
      before.pickups.filter(
        (pickup) => pickup.type === "stinking-grenade",
      ),
    ).toHaveLength(3);
    expect(before.participants[0].medkits).toBe(0);
    expect(before.participants[0].grenadeContact).toBe(1);
    expect(before.participants[0].grenadeFrag).toBe(1);
    expect(before.participants[0].grenadeStinking).toBe(1);
    expect(before.participants[0].grenadeSelected).toBe("contact");

    const target = medkits[0];
    placeOnPickup(sim, "one", target.id);
    runTicks(sim, 1);
    const after = sim.snapshot();
    expect(after.participants[0].medkits).toBe(1);
    expect(
      after.pickups.find((pickup) => pickup.id === target.id)?.active,
    ).toBe(false);
    expect(
      after.pickups.find((pickup) => pickup.id === target.id)?.respawnIn ?? 0,
    ).toBeGreaterThan(19);
  });

  it("awards a contested pickup to only one player", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const target = sim.snapshot().pickups[0];
    placeOnPickup(sim, "one", target.id);
    placeOnPickup(sim, "two", target.id);
    runTicks(sim, 1);
    const after = sim.snapshot();
    const humans = after.participants.filter((entry) => entry.kind === "human");
    expect(humans.reduce((total, human) => total + human.medkits, 0)).toBe(1);
    expect(
      after.pickups.find((pickup) => pickup.id === target.id)?.active,
    ).toBe(false);
  });

  it("caps carried medkits and respawns collected world pickups", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const pickups = sim.snapshot().pickups;
    placeOnPickup(sim, "one", pickups[0].id);
    runTicks(sim, 1);
    placeOnPickup(sim, "one", pickups[1].id);
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].medkits).toBe(
      MEDKIT_CONFIG.maxCarried,
    );

    placeOnPickup(sim, "one", pickups[2].id);
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].medkits).toBe(
      MEDKIT_CONFIG.maxCarried,
    );
    expect(
      sim.snapshot().pickups.find((pickup) => pickup.id === pickups[2].id)
        ?.active,
    ).toBe(true);

    const human = humanView(sim, "one");
    human.kin.x = 1800;
    human.kin.y = 1340;
    human.kin.grounded = true;
    runTicks(
      sim,
      Math.ceil(MEDKIT_CONFIG.respawnMs / (1000 / 60)) + 2,
    );
    expect(
      sim.snapshot().pickups.find((pickup) => pickup.id === pickups[0].id)
        ?.active,
    ).toBe(true);
  });

  it("heals with H, caps at max health and rejects cooldown and empty use", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const pickups = sim.snapshot().pickups;
    placeOnPickup(sim, "one", pickups[0].id);
    runTicks(sim, 1);
    placeOnPickup(sim, "one", pickups[1].id);
    runTicks(sim, 1);

    const human = humanView(sim, "one");
    human.health = 40;
    human.lastDamageMs = 0;
    sim.applyInput("one", medkitInput(1));
    runTicks(sim, 1);
    expect(human.health).toBe(90);
    expect(human.medkits).toBe(1);

    human.health = 40;
    human.lastDamageMs = 0;
    sim.applyInput("one", medkitInput(2));
    runTicks(sim, 1);
    expect(human.health).toBe(40);
    expect(human.medkits).toBe(1);

    runTicks(sim, 60);
    sim.drainEvents();
    human.health = 80;
    human.lastDamageMs = 0;
    sim.applyInput("one", medkitInput(3));
    runTicks(sim, 1);
    expect(human.health).toBe(100);
    expect(human.medkits).toBe(0);
    const healEvents = sim
      .drainEvents()
      .filter((event) => event.type === "medkit-used");
    expect(healEvents).toHaveLength(1);
    expect(healEvents[0]).toMatchObject({ healed: 20, health: 100 });

    human.health = 50;
    sim.applyInput("one", medkitInput(4));
    runTicks(sim, 1);
    expect(human.health).toBe(50);
    expect(human.medkits).toBe(0);

    sim.applyInput("one", medkitInput(3));
    runTicks(sim, 1);
    expect(human.health).toBe(50);
    expect(human.medkits).toBe(0);
  });

  it("rejects medkit use during countdown and while dead", () => {
    const countdown = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 5_000,
    });
    countdown.addHuman("one", "ONE");
    const countdownHuman = humanView(countdown, "one");
    countdownHuman.health = 40;
    countdownHuman.medkits = 1;
    countdown.applyInput("one", medkitInput(1));
    runTicks(countdown, 2);
    expect(countdownHuman.health).toBe(40);
    expect(countdownHuman.medkits).toBe(1);

    const live = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      botsEnabled: false,
      countdownMs: 0,
    });
    live.addHuman("one", "ONE");
    const deadHuman = humanView(live, "one");
    deadHuman.health = 40;
    deadHuman.medkits = 1;
    deadHuman.alive = false;
    deadHuman.respawnRemainingMs = 5_000;
    live.applyInput("one", medkitInput(1));
    runTicks(live, 2);
    expect(deadHuman.health).toBe(40);
    expect(deadHuman.medkits).toBe(1);
  });

  it("resets pickups and carried medkits on match replay", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE", "viber-123");
    runTicks(sim, 60 * 89);
    const target = sim.snapshot().pickups[0];
    placeOnPickup(sim, "one", target.id);
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].medkits).toBe(1);
    expect(
      sim.snapshot().pickups.find((pickup) => pickup.id === target.id)?.active,
    ).toBe(false);
    runTicks(sim, 70);
    expect(sim.snapshot().phase).toBe("ended");
    expect(sim.snapshot().pickups.every((pickup) => pickup.active)).toBe(true);

    const human = humanView(sim, "one");
    human.health = 40;
    sim.applyInput("one", medkitInput(1));
    runTicks(sim, 1);
    expect(human.health).toBe(40);

    injectToxicCloud(sim, {
      x: 1000,
      y: 1000,
      ownerId: "one",
    });
    expect(toxicClouds(sim)).toHaveLength(1);

    const result = sim.rematch();
    expect(result.ok).toBe(true);
    const restarted = sim.snapshot();
    expect(restarted.phase).toBe("live");
    expect(restarted.participants[0].medkits).toBe(0);
    expect(restarted.participants[0].health).toBe(100);
    expect(restarted.participants[0].skinId).toBe("viber-123");
    expect(restarted.pickups.every((pickup) => pickup.active)).toBe(true);
    expect(toxicClouds(sim)).toHaveLength(0);
  });

  it("keeps pickup state independent between rooms", () => {
    const first = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    const second = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      botsEnabled: false,
      countdownMs: 0,
    });
    first.addHuman("one", "ONE");
    second.addHuman("two", "TWO");
    const target = first.snapshot().pickups[0];
    placeOnPickup(first, "one", target.id);
    runTicks(first, 1);
    runTicks(second, 1);

    expect(
      first.snapshot().pickups.find((pickup) => pickup.id === target.id)
        ?.active,
    ).toBe(false);
    expect(
      second.snapshot().pickups.find((pickup) => pickup.id === target.id)
        ?.active,
    ).toBe(true);
    expect(second.snapshot().participants[0].medkits).toBe(0);
  });

  it("starts with one of each grenade and selects by slot", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const start = sim.snapshot().participants[0];
    expect(start.grenadeContact).toBe(1);
    expect(start.grenadeFrag).toBe(1);
    expect(start.grenadeStinking).toBe(1);
    expect(start.grenadeSelected).toBe("contact");
    expect(start.grenadeCooldownMs).toBe(0);

    sim.applyInput("one", grenadeInput(1, { slot: 1 }));
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeSelected).toBe("frag");

    sim.applyInput("one", grenadeInput(2, { slot: 2 }));
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeSelected).toBe("stinking");

    sim.applyInput("one", grenadeInput(3, { slot: 0 }));
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeSelected).toBe("contact");
  });

  it("throws one grenade, enforces cooldown and ignores held input", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1800, 1340, -Math.PI / 2);
    humanView(sim, "one").invulnerableRemainingMs = 0;

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 1,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    let snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeFrag).toBe(0);
    expect(snapshot.participants[0].grenadeContact).toBe(1);
    expect(snapshot.participants[0].grenadeCooldownMs).toBeGreaterThan(0);
    expect(snapshot.grenades).toHaveLength(1);
    expect(snapshot.grenades[0].type).toBe("frag");

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 1,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    expect(sim.snapshot().grenades).toHaveLength(1);

    runTicks(sim, 60);
    sim.applyInput(
      "one",
      grenadeInput(2, {
        slot: 0,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeContact).toBe(1);

    sim.applyInput("one", grenadeInput(3, { throwGrenade: false }));
    runTicks(sim, 1);
    sim.applyInput(
      "one",
      grenadeInput(4, {
        slot: 0,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeContact).toBe(0);
    expect(snapshot.participants[0].grenadeFrag).toBe(0);
  });

  it("contact grenade explodes on terrain and damages its owner", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1800, 1340, Math.PI / 2);
    const human = humanView(sim, "one");
    human.invulnerableRemainingMs = 0;
    sim.drainEvents();

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 0,
        throwGrenade: true,
        aim: Math.PI / 2,
      }),
    );
    runTicks(sim, 3);
    const snapshot = sim.snapshot();
    expect(snapshot.grenades).toHaveLength(0);
    expect(snapshot.participants[0].health).toBeLessThan(100);
    const explosions = sim
      .drainEvents()
      .filter((event) => event.type === "grenade-exploded");
    expect(explosions).toHaveLength(1);
    expect(explosions[0]).toMatchObject({
      grenadeType: "contact",
      ownerId: "one",
    });
  });

  it("frag grenade uses server time and explodes at five seconds", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1800, 1340, -Math.PI / 2);
    humanView(sim, "one").invulnerableRemainingMs = 0;
    sim.drainEvents();

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 1,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 300);
    let snapshot = sim.snapshot();
    expect(snapshot.grenades).toHaveLength(1);
    expect(snapshot.grenades[0].fuseRemainingMs ?? 0).toBeGreaterThan(0);

    // The next server tick crosses the 5000 ms fuse boundary.
    runTicks(sim, 1);
    snapshot = sim.snapshot();
    expect(snapshot.grenades).toHaveLength(0);
    const explosions = sim
      .drainEvents()
      .filter((event) => event.type === "grenade-exploded");
    expect(explosions).toHaveLength(1);
    expect(explosions[0]).toMatchObject({
      grenadeType: "frag",
      ownerId: "one",
    });
  });

  it("falls off with distance and respects invulnerability", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("owner", "OWNER");
    sim.addHuman("two", "TWO");
    sim.addHuman("three", "THREE");
    sim.addHuman("four", "FOUR");
    placeHuman(sim, "owner", 2000, 1340);
    placeHuman(sim, "two", 1200, 1340);
    placeHuman(sim, "three", 1380, 1340);
    placeHuman(sim, "four", 1220, 1340);
    humanView(sim, "two").invulnerableRemainingMs = 0;
    humanView(sim, "three").invulnerableRemainingMs = 0;
    humanView(sim, "four").invulnerableRemainingMs = 5_000;

    detonateTestGrenade(sim, 1200, 1250, "owner", "frag");
    const near = humanView(sim, "two");
    const far = humanView(sim, "three");
    const protectedHuman = humanView(sim, "four");
    const nearDistance = Math.hypot(0, 1282 - 1250);
    const farDistance = Math.hypot(180, 1282 - 1250);
    expect(near.health).toBe(
      Math.max(
        0,
        100 - computeBlastDamage(nearDistance, GRENADE_CONFIG.frag),
      ),
    );
    expect(far.health).toBe(
      100 - computeBlastDamage(farDistance, GRENADE_CONFIG.frag),
    );
    expect(near.health).toBeLessThan(far.health);
    expect(far.health).toBeLessThan(100);
    expect(protectedHuman.health).toBe(100);
    expect(humanView(sim, "owner").health).toBe(100);
  });

  it("contact grenade eliminates a bot and credits the owner", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1000, 1340);
    const human = humanView(sim, "one");
    human.invulnerableRemainingMs = 0;
    const bot = spawnTestBot(sim);
    bot.x = 1150;
    bot.y = 1322;
    bot.health = 100;
    bot.alive = true;
    bot.invulnerableRemainingMs = 0;
    sim.drainEvents();

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 0,
        throwGrenade: true,
        aim: 0,
      }),
    );
    runTicks(sim, 3);
    const snapshot = sim.snapshot();
    expect(bot.alive).toBe(false);
    expect(snapshot.participants.find((entry) => entry.id === "one")?.eliminations).toBe(1);
    const elimination = sim
      .drainEvents()
      .find(
        (event) =>
          event.type === "elimination" && event.victimId === bot.id,
      );
    expect(elimination).toMatchObject({
      killerId: "one",
      victimId: bot.id,
      weaponName: "CONTACT GRENADE",
    });
    expect(human.shotsFired).toBe(0);
    expect(human.shotsHit).toBe(0);
  });

  it("enforces the three-grenade cap and collects only after a slot opens", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const pickupSnapshot = sim.snapshot().pickups;
    const contactPickup = pickupSnapshot.find(
      (pickup) => pickup.type === "contact-grenade",
    )!;
    placeOnPickup(sim, "one", contactPickup.id);
    runTicks(sim, 1);
    let snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeContact).toBe(1);
    expect(
      snapshot.pickups.find((pickup) => pickup.id === contactPickup.id)
        ?.active,
    ).toBe(true);

    const human = humanView(sim, "one");
    human.grenades = { contact: 0, frag: 1, stinking: 1 };
    runTicks(sim, 1);
    snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeContact).toBe(1);
    expect(snapshot.participants[0].grenadeFrag).toBe(1);
    expect(snapshot.participants[0].grenadeStinking).toBe(1);
    expect(
      snapshot.pickups.find((pickup) => pickup.id === contactPickup.id)
        ?.active,
    ).toBe(false);

    const fragPickup = snapshot.pickups.find(
      (pickup) => pickup.type === "frag-grenade",
    )!;
    placeOnPickup(sim, "one", fragPickup.id);
    runTicks(sim, 1);
    snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeFrag).toBe(1);
    expect(
      snapshot.pickups.find((pickup) => pickup.id === fragPickup.id)?.active,
    ).toBe(true);
  });

  it("rejects throws during countdown, while dead and after match end", () => {
    const countdown = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 5_000,
    });
    countdown.addHuman("one", "ONE");
    countdown.applyInput(
      "one",
      grenadeInput(1, {
        slot: 0,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(countdown, 2);
    expect(countdown.snapshot().grenades).toHaveLength(0);
    expect(countdown.snapshot().participants[0].grenadeContact).toBe(1);

    const live = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      botsEnabled: false,
      countdownMs: 0,
    });
    live.addHuman("one", "ONE");
    const deadHuman = humanView(live, "one");
    deadHuman.alive = false;
    deadHuman.respawnRemainingMs = 5_000;
    live.applyInput(
      "one",
      grenadeInput(1, {
        slot: 0,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(live, 2);
    expect(live.snapshot().grenades).toHaveLength(0);
    expect(deadHuman.grenades.contact).toBe(1);

    const ended = new GameSimulation({
      roomId: "room-c",
      roomName: "Arena C",
      botsEnabled: false,
      countdownMs: 0,
    });
    ended.addHuman("one", "ONE");
    runTicks(ended, 60 * 91);
    expect(ended.snapshot().phase).toBe("ended");
    ended.applyInput(
      "one",
      grenadeInput(1, {
        slot: 0,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(ended, 1);
    expect(ended.snapshot().grenades).toHaveLength(0);

    const grenadeMap = (
      ended as unknown as {
        activeGrenades: Map<number, unknown>;
      }
    ).activeGrenades;
    grenadeMap.set(1, {});
    expect(ended.rematch().ok).toBe(true);
    expect(grenadeMap.size).toBe(0);
    expect(ended.snapshot().participants[0].grenadeContact).toBe(1);
    expect(ended.snapshot().participants[0].grenadeFrag).toBe(1);
  });

  it("keeps grenade state independent between rooms", () => {
    const first = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    const second = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      botsEnabled: false,
      countdownMs: 0,
    });
    first.addHuman("one", "ONE");
    second.addHuman("two", "TWO");
    placeHuman(first, "one", 1800, 1340, -Math.PI / 2);
    first.applyInput(
      "one",
      grenadeInput(1, {
        slot: 1,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(first, 1);
    runTicks(second, 1);

    expect(first.snapshot().grenades).toHaveLength(1);
    expect(second.snapshot().grenades).toHaveLength(0);
    expect(second.snapshot().participants[0].grenadeFrag).toBe(1);
    expect(GRENADE_CONFIG.frag.fuseMs).toBe(5_000);
  });

  it("stinking grenade activates a cloud, damages and eliminates its owner", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1800, 1340, Math.PI / 2);
    const human = humanView(sim, "one");
    human.invulnerableRemainingMs = 0;
    sim.drainEvents();

    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 2,
        throwGrenade: true,
        aim: Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    let snapshot = sim.snapshot();
    expect(snapshot.participants[0].grenadeStinking).toBe(0);
    expect(snapshot.grenades).toHaveLength(1);
    expect(snapshot.grenades[0].type).toBe("stinking");
    expect(
      snapshot.grenades[0].activationRemainingMs ?? 0,
    ).toBeGreaterThan(0);

    runTicks(sim, 55);
    snapshot = sim.snapshot();
    expect(snapshot.toxicClouds).toHaveLength(1);
    const cloud = snapshot.toxicClouds[0];
    expect(cloud.radius).toBe(STINKING_CLOUD_CONFIG.radius);
    expect(cloud.remainingMs).toBeGreaterThan(5_000);
    expect(
      Math.hypot(1800 - cloud.x, 1281 - cloud.y),
    ).toBeLessThan(cloud.radius);

    runTicks(sim, 66);
    expect(human.health).toBeLessThan(100);
    const toxicHits = sim
      .drainEvents()
      .filter(
        (event) =>
          event.type === "hit" && event.source === "toxic",
      );
    expect(toxicHits.length).toBeGreaterThan(0);

    human.health = 12;
    runTicks(sim, 66);
    expect(human.alive).toBe(false);
    expect(human.deaths).toBe(1);
    expect(sim.snapshot().participants[0].eliminations).toBe(0);
    expect(
      sim
        .snapshot()
        .feed.some((entry) => entry.text.includes("own toxic cloud")),
    ).toBe(true);
  });

  it("toxic damage is stable across simulation step sizes", () => {
    const fast = new GameSimulation({
      roomId: "room-fast",
      roomName: "Fast",
      botsEnabled: false,
      countdownMs: 0,
    });
    const slow = new GameSimulation({
      roomId: "room-slow",
      roomName: "Slow",
      botsEnabled: false,
      countdownMs: 0,
    });
    fast.addHuman("one", "ONE");
    slow.addHuman("one", "ONE");
    placeHuman(fast, "one", 1000, 1340);
    placeHuman(slow, "one", 1000, 1340);
    humanView(fast, "one").invulnerableRemainingMs = 0;
    humanView(slow, "one").invulnerableRemainingMs = 0;
    injectToxicCloud(fast, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
    });
    injectToxicCloud(slow, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
    });

    runTicks(fast, 66);
    for (let index = 0; index < 33; index += 1) {
      slow.tick(1000 / 30);
    }
    expect(humanView(fast, "one").health).toBe(
      humanView(slow, "one").health,
    );
    expect(humanView(fast, "one").health).toBe(
      100 - TOXIC_DAMAGE_PER_TICK * 4,
    );
  });

  it("overlapping clouds apply one tick and credit the closest owner", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("owner-a", "OWNER-A");
    sim.addHuman("owner-b", "OWNER-B");
    sim.addHuman("victim", "VICTIM");
    placeHuman(sim, "victim", 1000, 1340);
    const victim = humanView(sim, "victim");
    victim.invulnerableRemainingMs = 0;
    victim.health = 5;
    victim.lastDamageMs = 0;
    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "owner-a",
      ownerName: "OWNER-A",
    });
    injectToxicCloud(sim, {
      x: 1010,
      y: 1250,
      ownerId: "owner-b",
      ownerName: "OWNER-B",
    });

    runTicks(sim, 20);
    expect(victim.alive).toBe(false);
    expect(victim.deaths).toBe(1);
    expect(humanView(sim, "owner-a").eliminations).toBe(1);
    expect(humanView(sim, "owner-b").eliminations).toBe(0);
    expect(
      sim
        .snapshot()
        .feed.some((entry) => entry.text.includes("OWNER-A eliminated VICTIM")),
    ).toBe(true);
  });

  it("preserves toxic kill attribution after the owner disconnects", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("victim", "VICTIM");
    placeHuman(sim, "victim", 1000, 1340);
    const victim = humanView(sim, "victim");
    victim.invulnerableRemainingMs = 0;
    victim.health = 5;
    victim.lastDamageMs = 0;
    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
    });

    runTicks(sim, 20);
    expect(victim.alive).toBe(false);
    expect(
      sim
        .snapshot()
        .feed.some((entry) => entry.text.includes("GHOST eliminated VICTIM")),
    ).toBe(true);
  });

  it("stops toxic damage after a combatant leaves the cloud", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("victim", "VICTIM");
    placeHuman(sim, "victim", 1000, 1340);
    const victim = humanView(sim, "victim");
    victim.invulnerableRemainingMs = 0;
    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
    });
    runTicks(sim, 20);
    const damagedHealth = victim.health;
    expect(damagedHealth).toBeLessThan(100);

    placeHuman(sim, "victim", 2000, 1340);
    runTicks(sim, 66);
    expect(victim.health).toBe(damagedHealth);
  });

  it("toxic clouds damage and eliminate bots with owner credit", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("owner", "OWNER");
    const bot = spawnTestBot(sim);
    placeBot(sim, bot, 1000, 1340);
    bot.health = 5;
    bot.invulnerableRemainingMs = 0;
    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "owner",
      ownerName: "OWNER",
    });

    runTicks(sim, 20);
    expect(bot.alive).toBe(false);
    expect(humanView(sim, "owner").eliminations).toBe(1);
    expect(
      sim
        .snapshot()
        .feed.some((entry) => entry.text.includes("OWNER eliminated")),
    ).toBe(true);
  });

  it("terrain blocks toxic damage and invulnerability protects", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("victim", "VICTIM");
    placeHuman(sim, "victim", 1200, 1340);
    const victim = humanView(sim, "victim");
    victim.invulnerableRemainingMs = 0;
    injectToxicCloud(sim, {
      x: 1050,
      y: 1280,
      ownerId: "ghost",
      ownerName: "GHOST",
    });
    runTicks(sim, 66);
    expect(victim.health).toBe(100);

    injectToxicCloud(sim, {
      x: 1200,
      y: 1280,
      ownerId: "ghost",
      ownerName: "GHOST",
    });
    victim.invulnerableRemainingMs = 5_000;
    runTicks(sim, 66);
    expect(victim.health).toBe(100);

    victim.invulnerableRemainingMs = 0;
    runTicks(sim, 66);
    expect(victim.health).toBeLessThan(100);
  });

  it("expires clouds and shows active clouds to late joiners", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("victim", "VICTIM");
    placeHuman(sim, "victim", 1000, 1340);
    humanView(sim, "victim").invulnerableRemainingMs = 0;
    const elapsed = (
      sim as unknown as { elapsedMs: number }
    ).elapsedMs;
    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
      expiresAtMs: elapsed + 100,
    });
    runTicks(sim, 10);
    expect(toxicClouds(sim)).toHaveLength(0);
    expect(humanView(sim, "victim").health).toBe(100);

    injectToxicCloud(sim, {
      x: 1000,
      y: 1250,
      ownerId: "ghost",
      ownerName: "GHOST",
    });
    sim.addHuman("late", "LATE");
    expect(sim.snapshot().toxicClouds).toHaveLength(1);
    expect(
      sim.snapshot().participants.some((entry) => entry.id === "late"),
    ).toBe(true);
  });

  it("caps concurrent toxic clouds at twenty-four", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    for (
      let index = 0;
      index < STINKING_CLOUD_CONFIG.maxActiveClouds;
      index += 1
    ) {
      injectToxicCloud(sim, {
        x: -1_000 + index,
        y: -1_000,
        ownerId: "ghost",
        ownerName: "GHOST",
      });
    }
    sim.applyInput(
      "one",
      grenadeInput(1, {
        slot: 2,
        throwGrenade: true,
        aim: -Math.PI / 2,
      }),
    );
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeStinking).toBe(1);
    expect(sim.snapshot().grenades).toHaveLength(0);
  });

  it("keeps toxic cloud state independent between rooms", () => {
    const first = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    const second = new GameSimulation({
      roomId: "room-b",
      roomName: "Arena B",
      botsEnabled: false,
      countdownMs: 0,
    });
    first.addHuman("one", "ONE");
    second.addHuman("two", "TWO");
    injectToxicCloud(first, {
      x: 1000,
      y: 1000,
      ownerId: "one",
    });
    expect(toxicClouds(first)).toHaveLength(1);
    expect(toxicClouds(second)).toHaveLength(0);
  });

  it("bots start with finite grenades and medkit capacity", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: true,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const bots = sim
      .snapshot()
      .participants.filter((entry) => entry.kind === "bot");
    expect(bots).toHaveLength(7);
    expect(
      bots.every(
        (bot) =>
          bot.grenadeContact === 1 &&
          bot.grenadeFrag === 1 &&
          bot.grenadeStinking === 1 &&
          bot.medkits === 0,
      ),
    ).toBe(true);
  });

  it("bots use medkits when injured", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const bot = spawnTestBot(sim);
    bot.health = 30;
    bot.medkits = 1;
    bot.medkitCooldownRemainingMs = 0;
    runTicks(sim, 1);
    expect(bot.health).toBe(80);
    expect(bot.medkits).toBe(0);
  });

  it("bots collect nearby medkit and grenade supplies", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    const bot = spawnTestBot(sim);
    let snapshot = sim.snapshot();
    const medkit = snapshot.pickups.find(
      (pickup) => pickup.type === "medkit",
    )!;
    bot.x = medkit.x;
    bot.y = medkit.y + 40;
    runTicks(sim, 1);
    expect(bot.medkits).toBe(1);
    expect(
      sim.snapshot().pickups.find((pickup) => pickup.id === medkit.id)
        ?.active,
    ).toBe(false);

    bot.grenades = { contact: 0, frag: 1, stinking: 1 };
    snapshot = sim.snapshot();
    const contact = snapshot.pickups.find(
      (pickup) => pickup.type === "contact-grenade",
    )!;
    bot.x = contact.x;
    bot.y = contact.y + 40;
    runTicks(sim, 1);
    expect(bot.grenades.contact).toBe(1);
    expect(
      sim.snapshot().pickups.find((pickup) => pickup.id === contact.id)
        ?.active,
    ).toBe(false);
  });

  it("bots throw finite grenades and stop when empty", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 1000, 1340);
    const bot = spawnTestBot(sim);
    placeBot(sim, bot, 800, 1340);
    bot.grenadeDecisionCooldownMs = 0;
    bot.invulnerableRemainingMs = 0;
    runTicks(sim, 1);
    let snapshot = sim.snapshot();
    expect(
      snapshot.grenades.some(
        (grenade) =>
          grenade.kind === "bot" && grenade.type === "contact",
      ),
    ).toBe(true);
    expect(bot.grenades.contact).toBe(0);
    expect(bot.grenadeDecisionCooldownMs).toBeGreaterThan(0);

    bot.grenades = { contact: 0, frag: 0, stinking: 0 };
    bot.grenadeDecisionCooldownMs = 0;
    const before = snapshot.grenades.length;
    runTicks(sim, 1);
    snapshot = sim.snapshot();
    expect(snapshot.grenades.length).toBe(before);
  });

  it("bots move away from nearby toxic clouds", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
      countdownMs: 0,
    });
    sim.addHuman("one", "ONE");
    placeHuman(sim, "one", 2000, 1340);
    const bot = spawnTestBot(sim);
    placeBot(sim, bot, 1000, 1340);
    const startX = bot.x;
    injectToxicCloud(sim, {
      x: bot.x,
      y: bot.y - 40,
      ownerId: "one",
      ownerName: "ONE",
    });
    runTicks(sim, 10);
    expect(bot.cloudAvoidRemainingMs).toBeGreaterThan(0);
    expect(bot.x).toBeGreaterThan(startX + 2);
  });
});
