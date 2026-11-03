import { describe, expect, it } from "vitest";
import { scoreSpawnCandidate, selectSpawnPoint } from "./spawn";

const open = { x: 350, y: 1200, width: 200, height: 120 };

const candidates = [
  { id: "near", x: 300, y: 1340 },
  { id: "mid", x: 1400, y: 1340 },
  { id: "far", x: 3000, y: 1340 },
];

describe("respawn selection", () => {
  it("prefers the spawn farthest from a live threat", () => {
    const selected = selectSpawnPoint({
      candidates,
      threats: [{ id: "enemy", x: 250, y: 1280 }],
      blockers: [],
      random: () => 0.5,
    });
    expect(selected.id).toBe("far");
  });

  it("penalizes a spawn in direct line of sight", () => {
    const exposed = scoreSpawnCandidate(
      { id: "exposed", x: 700, y: 1340 },
      [{ id: "enemy", x: 100, y: 1280 }],
      [],
      null,
      0.5,
    );
    const covered = scoreSpawnCandidate(
      { id: "covered", x: 700, y: 1340 },
      [{ id: "enemy", x: 100, y: 1280 }],
      [open],
      null,
      0.5,
    );
    expect(covered).toBeGreaterThan(exposed);
  });

  it("avoids a spawn occupied by an enemy", () => {
    const selected = selectSpawnPoint({
      candidates: [
        { id: "occupied", x: 500, y: 1340 },
        { id: "safe", x: 3000, y: 1340 },
      ],
      threats: [{ id: "enemy", x: 510, y: 1300 }],
      blockers: [],
      random: () => 0.5,
    });
    expect(selected.id).toBe("safe");
  });

  it("moves away from the last death position", () => {
    const nearDeath = scoreSpawnCandidate(
      { id: "a", x: 500, y: 1340 },
      [],
      [],
      { x: 520, y: 1340 },
      0.5,
    );
    const farFromDeath = scoreSpawnCandidate(
      { id: "b", x: 1800, y: 1340 },
      [],
      [],
      { x: 520, y: 1340 },
      0.5,
    );
    expect(farFromDeath).toBeGreaterThan(nearDeath);
  });
});
