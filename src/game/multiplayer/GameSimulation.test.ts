import { describe, expect, it } from "vitest";
import {
  CHARACTER_ROSTER,
  HUMAN_DEFAULT_SKIN_ID,
} from "@/game/characters/roster";
import { GRENADE_CONFIG } from "@/game/core/grenades";
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
  grenades: { contact: number; frag: number };
  selectedGrenade: "contact" | "frag";
  grenadeCooldownRemainingMs: number;
  eliminations: number;
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
    expect(before.pickups).toHaveLength(20);
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
    expect(before.participants[0].medkits).toBe(0);
    expect(before.participants[0].grenadeContact).toBe(1);
    expect(before.participants[0].grenadeFrag).toBe(1);
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

    const result = sim.rematch();
    expect(result.ok).toBe(true);
    const restarted = sim.snapshot();
    expect(restarted.phase).toBe("live");
    expect(restarted.participants[0].medkits).toBe(0);
    expect(restarted.participants[0].health).toBe(100);
    expect(restarted.participants[0].skinId).toBe("viber-123");
    expect(restarted.pickups.every((pickup) => pickup.active)).toBe(true);
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

  it("starts with one contact and one frag and selects by slot", () => {
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
    expect(start.grenadeSelected).toBe("contact");
    expect(start.grenadeCooldownMs).toBe(0);

    sim.applyInput("one", grenadeInput(1, { slot: 1 }));
    runTicks(sim, 1);
    expect(sim.snapshot().participants[0].grenadeSelected).toBe("frag");

    sim.applyInput("one", grenadeInput(2, { slot: 0 }));
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
    runTicks(sim, 60 * 4 + 50);
    let snapshot = sim.snapshot();
    expect(snapshot.grenades).toHaveLength(1);
    expect(snapshot.grenades[0].fuseRemainingMs ?? 0).toBeGreaterThan(0);

    runTicks(sim, 30);
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
    placeHuman(sim, "two", 1000, 1340);
    placeHuman(sim, "three", 1180, 1340);
    placeHuman(sim, "four", 1020, 1340);
    humanView(sim, "two").invulnerableRemainingMs = 0;
    humanView(sim, "three").invulnerableRemainingMs = 0;
    humanView(sim, "four").invulnerableRemainingMs = 5_000;

    detonateTestGrenade(sim, 1000, 1250, "owner", "frag");
    const near = humanView(sim, "two");
    const far = humanView(sim, "three");
    const protectedHuman = humanView(sim, "four");
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

  it("caps grenade pickups at three total and leaves the next cache", () => {
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
    expect(snapshot.participants[0].grenadeContact).toBe(2);
    expect(snapshot.participants[0].grenadeFrag).toBe(1);
    expect(snapshot.participants[0].grenadeContact + snapshot.participants[0].grenadeFrag).toBe(3);

    const fragPickup = snapshot.pickups.find(
      (pickup) => pickup.id === pickupSnapshot.find((entry) => entry.type === "frag-grenade")?.id,
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
});
