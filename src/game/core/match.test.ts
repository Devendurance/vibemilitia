import { describe, expect, it } from "vitest";
import {
  createMatchTimer,
  endMatchForScore,
  formatMatchClock,
  rankParticipants,
  reachedScoreLimit,
  stepMatchTimer,
} from "./match";

describe("match timer", () => {
  it("counts down and ends at zero", () => {
    let state = createMatchTimer(5000);
    expect(state.phase).toBe("live");
    state = stepMatchTimer(state, 2000);
    expect(state.remainingMs).toBe(3000);
    state = stepMatchTimer(state, 4000);
    expect(state.phase).toBe("ended");
    expect(state.remainingMs).toBe(0);
    expect(state.endReason).toBe("time");
  });

  it("does not tick after the match has ended", () => {
    const ended = endMatchForScore(createMatchTimer(10000));
    expect(ended.phase).toBe("ended");
    expect(ended.endReason).toBe("score");
    expect(stepMatchTimer(ended, 9999).remainingMs).toBe(10000);
  });

  it("detects the score limit", () => {
    expect(reachedScoreLimit([2, 4, 9, 1], 10)).toBe(false);
    expect(reachedScoreLimit([2, 10, 9, 1], 10)).toBe(true);
  });

  it("ranks by score, deaths, then id", () => {
    const ranked = rankParticipants([
      { id: "b", name: "B", score: 4, deaths: 3 },
      { id: "a", name: "A", score: 4, deaths: 1 },
      { id: "c", name: "C", score: 6, deaths: 5 },
    ]);
    expect(ranked.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(ranked.map((entry) => entry.placement)).toEqual([1, 2, 3]);
  });

  it("formats the match clock", () => {
    expect(formatMatchClock(90000)).toBe("01:30");
    expect(formatMatchClock(0)).toBe("00:00");
    expect(formatMatchClock(1500)).toBe("00:02");
  });
});
