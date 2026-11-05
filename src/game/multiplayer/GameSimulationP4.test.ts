import { describe, expect, it } from "vitest";
import { GameSimulation } from "./GameSimulation";

function createSim(): GameSimulation {
  return new GameSimulation({
    roomId: "p4-room",
    roomName: "P4",
    botsEnabled: false,
    countdownMs: 0,
  });
}

interface HumanRuntimeView {
  id: string;
  playerId: string | null;
  connected: boolean;
  weaponIds: (string | null)[];
  grenades: { contact: number; frag: number; stinking: number };
}

function human(
  sim: GameSimulation,
  id: string,
): HumanRuntimeView {
  const humans = (
    sim as unknown as { humans: Map<string, HumanRuntimeView> }
  ).humans;
  const value = humans.get(id);
  if (!value) throw new Error(`missing human ${id}`);
  return value;
}

describe("P4 seat and reconnect simulation", () => {
  it("keeps inventory and seat while disconnected", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE", "viber-010", {
      playerId: "pl_one",
      cosmetics: {
        level: 4,
        equipped: {
          titleId: "title-field-tested",
          badgeId: "badge-lime-recruit",
          eliminationId: "elimination-copper",
          trailId: "trail-lime",
        },
      },
    });
    sim.debugGiveWeapon("one", "vibe-smg");
    const before = human(sim, "one");
    expect(before.weaponIds).toContain("vibe-smg");
    expect(sim.setHumanConnected("one", false)).toBe(true);
    expect(human(sim, "one").connected).toBe(false);
    expect(sim.humanSeats).toBe(1);
    expect(human(sim, "one").weaponIds).toContain("vibe-smg");
    expect(sim.setHumanConnected("one", true)).toBe(true);
    expect(human(sim, "one").connected).toBe(true);
    expect(sim.hasHumanPlayer("pl_one")).toBe(true);
    expect(sim.hasHumanPlayer("pl_other")).toBe(false);
  });

  it("remaps a reconnected session without duplicating a human", () => {
    const sim = createSim();
    sim.addHuman("old", "ONE", "viber-010", { playerId: "pl_one" });
    sim.debugGiveWeapon("old", "heavy-cannon");
    expect(sim.reconnectHuman("old", "new")).toBe(true);
    expect(sim.humanSeats).toBe(1);
    expect(human(sim, "new").weaponIds).toContain("heavy-cannon");
    expect(
      sim.snapshot().participants.filter((entry) => entry.kind === "human"),
    ).toHaveLength(1);
  });

  it("counts disconnected seats toward the eight-human capacity", () => {
    const sim = createSim();
    for (let index = 0; index < 8; index += 1) {
      expect(sim.addHuman(`human-${index}`, `H${index}`).ok).toBe(true);
    }
    expect(sim.addHuman("human-9", "NINE").ok).toBe(false);
    sim.setHumanConnected("human-0", false);
    expect(sim.humanSeats).toBe(8);
    expect(sim.addHuman("human-9", "NINE").ok).toBe(false);
  });

  it("reports per-human match results with the stable player id", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE", "viber-123", { playerId: "pl_one" });
    sim.addHuman("two", "TWO", "viber-006");
    const result = sim.matchResults();
    expect(result).toHaveLength(2);
    expect(result[0]?.playerId).toBe("pl_one");
    expect(result[0]?.placement).toBe(1);
    expect(result[0]?.inputsReceived).toBe(0);
    expect(result[0]?.weaponShots).toEqual({});
  });

  it("uses a new match id after replay", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const first = sim.matchId;
    expect(sim.debugEndMatch()).toBe(true);
    expect(sim.matchId).toBe(first);
    expect(sim.rematch().ok).toBe(true);
    expect(sim.matchId).not.toBe(first);
    expect(sim.matchId.endsWith(":2")).toBe(true);
  });

  it("does not add invulnerability when a human disconnects", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const runtime = human(sim, "one") as HumanRuntimeView & {
      invulnerableRemainingMs: number;
    };
    runtime.invulnerableRemainingMs = 0;
    sim.setHumanConnected("one", false);
    expect(runtime.invulnerableRemainingMs).toBe(0);
  });
});
