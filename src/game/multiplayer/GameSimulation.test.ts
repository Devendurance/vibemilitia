import { describe, expect, it } from "vitest";
import {
  CHARACTER_ROSTER,
  HUMAN_DEFAULT_SKIN_ID,
} from "@/game/characters/roster";
import { GameSimulation } from "./GameSimulation";

const rosterSkinIds = new Set(
  CHARACTER_ROSTER.map((skin) => skin.skinId),
);

function runTicks(sim: GameSimulation, count: number): void {
  for (let index = 0; index < count; index += 1) {
    sim.tick(1000 / 60);
  }
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
});
