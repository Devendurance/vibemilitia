import { describe, expect, it } from "vitest";
import { AdaptiveQuality, QUALITY_TUNING, type QualityReason } from "./adaptiveQuality";

/** Runs whole windows at one frame time and collects every decision. */
function run(
  quality: AdaptiveQuality,
  clock: { now: number },
  windows: number,
  frameMs: number,
  workShare = 0.2,
): QualityReason[] {
  const reasons: QualityReason[] = [];
  const perWindow = Math.min(QUALITY_TUNING.windowFrames, Math.ceil(QUALITY_TUNING.windowMs / frameMs));
  for (let frame = 0; frame < windows * perWindow; frame += 1) {
    clock.now += frameMs;
    const reason = quality.observe(frameMs, frameMs * workShare, clock.now);
    if (reason) reasons.push(reason);
  }
  return reasons;
}

describe("AdaptiveQuality", () => {
  it("leaves a healthy device alone", () => {
    const quality = new AdaptiveQuality(2);
    expect(run(quality, { now: 0 }, 40, 16.7)).toEqual([]);
    expect(quality.state).toEqual({ scale: 2, effects: "full" });
  });

  it("drops resolution when the GPU is the limit and keeps a drop that helped", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    expect(run(quality, clock, 3, 34)).toEqual(["adaptive"]);
    expect(quality.state.scale).toBe(1.75);
    expect(run(quality, clock, 6, 22)).toEqual([]);
    expect(quality.state.scale).toBe(1.75);
  });

  it("reduces effects, not resolution, when the main thread is the limit", () => {
    const quality = new AdaptiveQuality(1.5);
    const clock = { now: 0 };
    expect(run(quality, clock, 3, 40, 0.8)).toEqual(["effects-reduced"]);
    expect(run(quality, clock, 20, 40, 0.8)).toEqual([]);
    expect(quality.state).toEqual({ scale: 1.5, effects: "reduced" });
  });

  it("restores after a useless trial and tries again later, never stopping", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    const first = run(quality, clock, 12, 33.4);
    expect(first).toEqual(["adaptive", "adaptive", "restore"]);
    expect(quality.state.scale).toBe(2);
    // Frames stay at 33 ms: nothing happens inside the back-off.
    const start = clock.now;
    const later: QualityReason[] = [];
    while (clock.now - start < QUALITY_TUNING.firstRetryMs + 12_000) {
      later.push(...run(quality, clock, 1, 33.4));
    }
    expect(later[0]).toBe("adaptive");
  });

  it("backs off further after each useless trial", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    const restores: number[] = [];
    while (clock.now < 400_000) {
      if (run(quality, clock, 1, 33.4).includes("restore")) restores.push(clock.now);
    }
    expect(restores.length).toBeGreaterThanOrEqual(3);
    expect(restores[2] - restores[1]).toBeGreaterThan(restores[1] - restores[0]);
  });

  it("recovers resolution after a sustained good period", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    run(quality, clock, 3, 34);
    run(quality, clock, 6, 22);
    expect(quality.state.scale).toBe(1.75);
    const reasons = run(quality, clock, 40, 16.7);
    expect(reasons).toEqual(["recover"]);
    expect(quality.state.scale).toBe(2);
  });

  it("falls back when a climb turns slow and waits longer next time", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    run(quality, clock, 3, 34);
    run(quality, clock, 6, 22);
    while (quality.state.scale < 2) run(quality, clock, 1, 16.7);
    expect(run(quality, clock, 4, 34)).toEqual(["restore"]);
    expect(quality.state.scale).toBe(1.75);
    expect(run(quality, clock, 34, 16.7)).toEqual([]);
  });

  it("restores effects once frames stay good", () => {
    const quality = new AdaptiveQuality(1.5);
    const clock = { now: 0 };
    run(quality, clock, 3, 40, 0.8);
    expect(run(quality, clock, 40, 16.7)).toEqual(["effects-full"]);
    expect(quality.state.effects).toBe("full");
  });

  it("never changes twice inside the hold time", () => {
    const quality = new AdaptiveQuality(2);
    const clock = { now: 0 };
    const changes: number[] = [];
    for (let frame = 0; frame < 20_000; frame += 1) {
      const frameMs = frame % 2400 < 1200 ? 40 : 14;
      clock.now += frameMs;
      if (quality.observe(frameMs, frameMs * 0.2, clock.now)) changes.push(clock.now);
    }
    for (let index = 1; index < changes.length; index += 1) {
      expect(changes[index] - changes[index - 1]).toBeGreaterThanOrEqual(QUALITY_TUNING.holdMs);
    }
  });

  it("ignores stalls and hidden tabs", () => {
    const quality = new AdaptiveQuality(2);
    expect(run(quality, { now: 0 }, 10, 2000)).toEqual([]);
  });

  it("still reacts on a device far too slow to fill a frame window", () => {
    const quality = new AdaptiveQuality(1.75);
    const clock = { now: 0 };
    const reasons: QualityReason[] = [];
    for (let frame = 0; frame < 30; frame += 1) {
      clock.now += 350;
      const reason = quality.observe(350, 40, clock.now);
      if (reason) reasons.push(reason);
    }
    expect(reasons[0]).toBe("adaptive");
  });
});
