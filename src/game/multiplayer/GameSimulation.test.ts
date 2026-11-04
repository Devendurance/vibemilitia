import { describe, expect, it } from "vitest";
import { GameSimulation } from "./GameSimulation";

function runTicks(sim: GameSimulation, count: number): void {
  for (let index = 0; index < count; index += 1) {
    sim.tick(1000 / 60);
  }
}

describe("authoritative match simulation", () => {
  it("starts with bots filling the remaining slots", () => {
    const sim = new GameSimulation({ roomId: "room-a", roomName: "Arena A" });
    expect(sim.addHuman("one", "ONE").ok).toBe(true);
    expect(sim.snapshot().humans).toBe(1);
    expect(sim.snapshot().bots).toBe(7);
    expect(sim.snapshot().maxCombatants).toBe(8);
    expect(sim.addHuman("two", "TWO").ok).toBe(true);
    expect(sim.snapshot().humans).toBe(2);
    expect(sim.snapshot().bots).toBe(6);
  });

  it("accepts movement inputs and advances the server position", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
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

  it("ignores malformed or stale input", () => {
    const sim = new GameSimulation({
      roomId: "room-a",
      roomName: "Arena A",
      botsEnabled: false,
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
    });
    sim.addHuman("one", "ONE");
    runTicks(sim, 60 * 91);
    expect(sim.snapshot().phase).toBe("ended");
    expect(sim.snapshot().endReason).toBe("time");
    const result = sim.rematch();
    expect(result.ok).toBe(true);
    const restarted = sim.snapshot();
    expect(restarted.phase).toBe("live");
    expect(restarted.remainingMs).toBeGreaterThan(89_000);
    expect(restarted.participants[0].health).toBe(100);
  });

  it("backs a disconnected human seat with a bot", () => {
    const sim = new GameSimulation({ roomId: "room-a", roomName: "Arena A" });
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    expect(sim.snapshot().bots).toBe(6);
    sim.removeHuman("two");
    expect(sim.snapshot().humans).toBe(1);
    expect(sim.snapshot().bots).toBe(7);
  });
});
