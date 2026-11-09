import { describe, expect, it } from "vitest";
import { chooseRenderScale, nextCanvasSize, pixelBudget, worldZoomFor } from "./renderScale";

describe("nextCanvasSize", () => {
  const phone = { width: 844, height: 390 };

  it("ignores a toolbar taking some height", () => {
    expect(nextCanvasSize(phone, { width: 844, height: 335 })).toBe(phone);
  });

  it("grows at once so the frame never shows a gap", () => {
    const measured = { width: 844, height: 420 };
    expect(nextCanvasSize(phone, measured)).toBe(measured);
  });

  it("accepts a real resize", () => {
    const rotated = { width: 390, height: 844 };
    const split = { width: 844, height: 200 };
    expect(nextCanvasSize(phone, rotated)).toBe(rotated);
    expect(nextCanvasSize(phone, split)).toBe(split);
  });
});

describe("worldZoomFor", () => {
  it("matches the framing players already know", () => {
    expect(worldZoomFor(844, 390)).toBeCloseTo(0.629, 3);
    expect(worldZoomFor(1920, 1080)).toBe(1);
    expect(worldZoomFor(568, 320)).toBe(0.56);
  });
});

describe("chooseRenderScale", () => {
  const touch = pixelBudget(true, "");

  it("keeps phones where the iPhone work left them", () => {
    expect(chooseRenderScale(844, 390, 3, touch)).toBe(2);
    expect(chooseRenderScale(932, 430, 3, touch)).toBe(2);
    expect(chooseRenderScale(844, 390, 1, touch)).toBe(1);
  });

  it("never exceeds the budget it was given", () => {
    for (const [width, height] of [
      [1024, 600],
      [1024, 768],
      [1180, 820],
      [1280, 720],
      [1280, 800],
      [1366, 768],
      [1366, 1024],
    ]) {
      for (const budget of [1_200_000, 1_900_000, 2_600_000]) {
        const scale = chooseRenderScale(width, height, 2, budget);
        const pixels = width * scale * height * scale;
        if (scale > 1) expect(pixels).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("no longer rounds 1280x720 over the touch budget", () => {
    expect(chooseRenderScale(1280, 720, 3, touch)).toBe(1.25);
  });
});

describe("pixelBudget", () => {
  it("uses the desktop budget without touch, whatever the GPU", () => {
    expect(pixelBudget(false, "Mali-G52")).toBe(3_700_000);
  });

  it("starts weak tablets lower and capable ones higher", () => {
    expect(pixelBudget(true, "Mali-G52 MC2")).toBe(1_200_000);
    expect(pixelBudget(true, "Adreno (TM) 610")).toBe(1_200_000);
    expect(pixelBudget(true, "PowerVR Rogue GE8320")).toBe(1_200_000);
    expect(pixelBudget(true, "Apple GPU")).toBe(2_600_000);
    expect(pixelBudget(true, "Adreno (TM) 740")).toBe(2_600_000);
    expect(pixelBudget(true, "Mali-G710")).toBe(2_600_000);
  });

  it("falls back to the shared budget for an unknown GPU", () => {
    expect(pixelBudget(true, "")).toBe(1_900_000);
    expect(pixelBudget(true, "ANGLE (Intel, Iris Xe)")).toBe(1_900_000);
  });
});
