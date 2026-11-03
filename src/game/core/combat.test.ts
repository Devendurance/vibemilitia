import { describe, expect, it } from "vitest";
import {
  applyDamage,
  clamp,
  isCriticalFuel,
  isLowHealth,
  stepHealthRegen,
  stepRespawnTimer,
} from "./combat";

describe("combat rules", () => {
  it("applies damage and floors at zero", () => {
    expect(applyDamage(100, 25)).toBe(75);
    expect(applyDamage(10, 99)).toBe(0);
    expect(applyDamage(50, -10)).toBe(50);
  });

  it("regenerates only after the damage delay", () => {
    expect(stepHealthRegen(50, 100, 3999, 1000, 4000, 12)).toBe(50);
    expect(stepHealthRegen(50, 100, 5000, 1000, 4000, 12)).toBe(62);
    expect(stepHealthRegen(99, 100, 5000, 1000, 4000, 12)).toBe(100);
  });

  it("steps the respawn countdown", () => {
    expect(stepRespawnTimer(2800, 500)).toBe(2300);
    expect(stepRespawnTimer(100, 500)).toBe(0);
  });

  it("flags low health and critical fuel thresholds", () => {
    expect(isLowHealth(30, 100)).toBe(true);
    expect(isLowHealth(31, 100)).toBe(false);
    expect(isCriticalFuel(18, 100)).toBe(true);
    expect(isCriticalFuel(19, 100)).toBe(false);
    expect(clamp(140, 0, 100)).toBe(100);
  });
});
