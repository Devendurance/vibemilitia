import { describe, expect, it } from "vitest";
import {
  BOT_DIFFICULTIES,
  DRONE_CONFIG,
  MATCH_CONFIG,
  PLAYER_WEAPONS,
  getPracticeDifficulty,
} from "./gameplay";

describe("P1 combat tuning", () => {
  it("ships three distinct weapon slots", () => {
    expect(PLAYER_WEAPONS).toHaveLength(3);
    expect(PLAYER_WEAPONS.map((weapon) => weapon.slot)).toEqual([1, 2, 3]);
    expect(new Set(PLAYER_WEAPONS.map((weapon) => weapon.id)).size).toBe(3);
    expect(new Set(PLAYER_WEAPONS.map((weapon) => weapon.name)).size).toBe(3);
  });

  it("makes the scatter blaster a close-range pellet weapon", () => {
    const scatter = PLAYER_WEAPONS[1];
    expect(scatter.pellets).toBeGreaterThan(1);
    expect(scatter.damage * scatter.pellets).toBeGreaterThan(
      PLAYER_WEAPONS[0].damage * 2,
    );
    expect(scatter.magazineSize).toBeLessThan(PLAYER_WEAPONS[0].magazineSize);
    expect(scatter.spreadRadians).toBeGreaterThan(
      PLAYER_WEAPONS[0].spreadRadians * 3,
    );
    expect(scatter.projectileLifetimeMs).toBeLessThan(
      PLAYER_WEAPONS[0].projectileLifetimeMs,
    );
  });

  it("makes the vibe lance a slow, precise two-shot weapon", () => {
    const lance = PLAYER_WEAPONS[2];
    expect(lance.damage * 2).toBeGreaterThanOrEqual(
      DRONE_CONFIG.maxHealth,
    );
    expect(lance.magazineSize).toBeLessThanOrEqual(4);
    expect(lance.spreadRadians).toBeLessThan(
      PLAYER_WEAPONS[0].spreadRadians,
    );
    expect(lance.fireIntervalMs).toBeGreaterThan(
      PLAYER_WEAPONS[0].fireIntervalMs,
    );
  });

  it("defines a timed score-limited match", () => {
    expect(MATCH_CONFIG.durationMs).toBe(90_000);
    expect(MATCH_CONFIG.scoreLimit).toBe(10);
    expect(DRONE_CONFIG.maxHealth).toBe(100);
  });

  it("gives every practice difficulty measurably different bot behavior", () => {
    const easy = BOT_DIFFICULTIES.easy;
    const normal = BOT_DIFFICULTIES.normal;
    const hard = BOT_DIFFICULTIES.hard;
    const merciless = BOT_DIFFICULTIES.merciless;
    expect(easy.reactionMs).toBeGreaterThan(normal.reactionMs);
    expect(normal.reactionMs).toBeGreaterThan(hard.reactionMs);
    expect(hard.reactionMs).toBeGreaterThan(merciless.reactionMs);
    expect(easy.fireIntervalMs).toBeGreaterThan(normal.fireIntervalMs);
    expect(normal.fireIntervalMs).toBeGreaterThan(hard.fireIntervalMs);
    expect(hard.fireIntervalMs).toBeGreaterThan(merciless.fireIntervalMs);
    expect(easy.aimErrorRadians).toBeGreaterThan(normal.aimErrorRadians);
    expect(normal.aimErrorRadians).toBeGreaterThan(hard.aimErrorRadians);
    expect(hard.aimErrorRadians).toBeGreaterThan(merciless.aimErrorRadians);
    expect(easy.burstCount).toBeLessThan(merciless.burstCount);
    expect(getPracticeDifficulty("merciless")).toBe("merciless");
    expect(getPracticeDifficulty("nonsense")).toBe("normal");
  });
});
