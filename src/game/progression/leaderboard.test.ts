import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "../../../server/leaderboard";

describe("public leaderboard projection", () => {
  it("orders by XP, computes level and K/D, and hides private X handles", () => {
    const result = buildLeaderboard(
      [
        {
          id: "pl_a",
          name: "ALPHA",
          xp: 90,
          wins: 1,
          losses: 0,
          eliminations: 10,
          deaths: 2,
          matches_played: 1,
          x_handle: "alpha_vibes",
          x_public: true,
        },
        {
          id: "pl_b",
          name: "BRAVO",
          xp: 40,
          wins: 0,
          losses: 1,
          eliminations: 3,
          deaths: 5,
          matches_played: 1,
          x_handle: "hidden_handle",
          x_public: false,
        },
      ],
      1234,
    );
    expect(result.period).toBe("all-time");
    expect(result.metric).toBe("xp");
    expect(result.generatedAt).toBe(1234);
    expect(result.entries.map((entry) => entry.name)).toEqual([
      "ALPHA",
      "BRAVO",
    ]);
    expect(result.entries[0]?.rank).toBe(1);
    expect(result.entries[0]?.xHandle).toBe("alpha_vibes");
    expect(result.entries[0]?.xVerified).toBe(false);
    expect(result.entries[0]?.kd).toBe(5);
    expect(result.entries[1]?.xHandle).toBeNull();
    expect(result.entries[1]?.kd).toBe(0.6);
  });
});
