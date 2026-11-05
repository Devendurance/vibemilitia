import { describe, expect, it } from "vitest";
import {
  XP_RULES,
  calculateMatchXp,
  progressForXp,
  totalXpForLevel,
  xpForNextLevel,
} from "./progression";
import {
  COSMETIC_UNLOCKS,
  DEFAULT_EQUIPPED,
  isCosmeticUnlocked,
  unlockedIds,
  validateEquipped,
} from "./cosmetics";

const eligible = {
  placement: 1,
  humanEliminations: 3,
  botEliminations: 2,
  participationMs: 90_000,
  inputsReceived: 200,
  completed: true,
};

describe("progression", () => {
  it("awards completion, eliminations and placement XP", () => {
    const result = calculateMatchXp(eligible);
    expect(result.eligible).toBe(true);
    expect(result.total).toBe(30 + 30 + 10 + 25);
    expect(result.breakdown.map((line) => line.id)).toEqual([
      "completion",
      "human-eliminations",
      "bot-eliminations",
      "placement",
    ]);
  });

  it("caps elimination farming and total match XP", () => {
    const result = calculateMatchXp({
      ...eligible,
      humanEliminations: 40,
      botEliminations: 40,
    });
    expect(result.total).toBe(175);
    expect(result.total).toBeLessThanOrEqual(XP_RULES.maxMatchXp);
  });

  it("rejects incomplete and low-participation matches", () => {
    expect(calculateMatchXp({ ...eligible, completed: false }).total).toBe(0);
    expect(
      calculateMatchXp({ ...eligible, participationMs: 20_000 }).reason,
    ).toBe("participation");
    expect(calculateMatchXp({ ...eligible, inputsReceived: 2 }).total).toBe(0);
  });

  it("uses a predictable level curve", () => {
    expect(xpForNextLevel(1)).toBe(100);
    expect(xpForNextLevel(2)).toBe(150);
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(250);
    expect(progressForXp(0).level).toBe(1);
    expect(progressForXp(99).level).toBe(1);
    expect(progressForXp(100).level).toBe(2);
    expect(progressForXp(249).level).toBe(2);
    expect(progressForXp(250).level).toBe(3);
  });

  it("clamps progress at the maximum level", () => {
    const maxXp = totalXpForLevel(XP_RULES.maxLevel);
    const progress = progressForXp(maxXp + 10_000);
    expect(progress.level).toBe(XP_RULES.maxLevel);
    expect(progress.atMaxLevel).toBe(true);
    expect(progress.progress).toBe(1);
  });
});

describe("cosmetics", () => {
  it("unlocks only level-eligible cosmetics", () => {
    expect(unlockedIds(1)).toContain("title-rookie");
    expect(unlockedIds(1)).not.toContain("title-field-tested");
    expect(unlockedIds(12)).toContain("title-sector-legend");
    expect(unlockedIds(12).length).toBe(COSMETIC_UNLOCKS.length);
  });

  it("validates equipped slots and falls back to defaults", () => {
    const levelOne = validateEquipped(
      {
        titleId: "title-sector-legend",
        badgeId: "badge-copper-strike",
        eliminationId: "elimination-copper",
        trailId: "trail-sky",
      },
      1,
    );
    expect(levelOne).toEqual(DEFAULT_EQUIPPED);

    const levelTen = validateEquipped(
      {
        titleId: "title-sector-legend",
        badgeId: "badge-copper-strike",
        eliminationId: "elimination-copper",
        trailId: "trail-sky",
      },
      10,
    );
    expect(levelTen.titleId).toBe("title-sector-legend");
    expect(levelTen.badgeId).toBe("badge-copper-strike");
  });

  it("rejects a cosmetic from the wrong slot", () => {
    const equipped = validateEquipped(
      { badgeId: "title-rookie" },
      10,
    );
    expect(equipped.badgeId).toBe(DEFAULT_EQUIPPED.badgeId);
  });

  it("reports lock state from level", () => {
    expect(isCosmeticUnlocked("elimination-toxic", 6)).toBe(false);
    expect(isCosmeticUnlocked("elimination-toxic", 7)).toBe(true);
    expect(isCosmeticUnlocked("missing", 99)).toBe(false);
  });
});
