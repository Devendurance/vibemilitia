import { describe, expect, it } from "vitest";
import { pointInRect, segmentIntersectsRect } from "./collision";

const wall = { x: 100, y: 100, width: 100, height: 100 };

describe("arena collision helpers", () => {
  it("test points in rectangles", () => {
    expect(pointInRect(150, 150, wall)).toBe(true);
    expect(pointInRect(50, 150, wall)).toBe(false);
    expect(pointInRect(100, 100, wall)).toBe(true);
  });

  it("detects a segment crossing a rectangle", () => {
    expect(segmentIntersectsRect(0, 150, 300, 150, wall)).toBe(true);
    expect(segmentIntersectsRect(0, 50, 300, 50, wall)).toBe(false);
    expect(segmentIntersectsRect(0, 0, 150, 150, wall)).toBe(true);
  });

  it("detects a segment that starts inside and exits", () => {
    expect(segmentIntersectsRect(150, 150, 300, 150, wall)).toBe(true);
    expect(segmentIntersectsRect(150, 150, 150, 50, wall)).toBe(true);
  });

  it("detects a segment fully outside", () => {
    expect(segmentIntersectsRect(300, 300, 400, 400, wall)).toBe(false);
    expect(segmentIntersectsRect(50, 50, 50, 80, wall)).toBe(false);
  });

  it("clears the arena platforms for an above-ground firing lane", () => {
    const rects = [
      { x: 0, y: 1340, width: 3600, height: 160 },
      { x: 560, y: 960, width: 280, height: 40 },
      { x: 200, y: 1180, width: 320, height: 40 },
      { x: 900, y: 1160, width: 300, height: 40 },
    ];
    expect(
      rects.some((rect) =>
        segmentIntersectsRect(565, 1074, 640, 1285, rect),
      ),
    ).toBe(false);
    expect(
      rects.some((rect) =>
        segmentIntersectsRect(995, 917, 640, 1285, rect),
      ),
    ).toBe(false);
  });
});
