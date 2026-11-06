import { describe, expect, it } from "vitest";
import { chooseRenderScale, nextCanvasSize, worldZoomFor } from "./renderScale";

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
  it("stays within the phone pixel budget", () => {
    expect(chooseRenderScale(844, 390, 3, true)).toBe(2);
    expect(chooseRenderScale(1280, 720, 3, true)).toBe(1.5);
    expect(chooseRenderScale(844, 390, 1, true)).toBe(1);
  });
});
