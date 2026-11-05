import { describe, expect, it } from "vitest";
import {
  ADVANCED_WEAPONS,
  ALL_PLAYER_WEAPONS,
  PLAYER_WEAPONS,
  PROJECTILE_CONFIG,
} from "@/game/config/gameplay";
import { computeRadialDamage } from "@/game/core/grenades";

describe("advanced weapon registry", () => {
  it("keeps the P1 training loadout at exactly three weapons", () => {
    expect(PLAYER_WEAPONS.map((weapon) => weapon.id)).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "vibe-lance",
    ]);
    expect(ALL_PLAYER_WEAPONS).toHaveLength(7);
  });

  it("registers all four advanced weapons with the specified balance", () => {
    expect(ADVANCED_WEAPONS.map((weapon) => weapon.id)).toEqual([
      "akimbo-rifles",
      "vibe-smg",
      "heavy-cannon",
      "rocket-launcher",
    ]);
    const akimbo = ALL_PLAYER_WEAPONS.find(
      (weapon) => weapon.id === "akimbo-rifles",
    );
    expect(akimbo).toMatchObject({
      magazineSize: 36,
      damage: 10,
      fireIntervalMs: 85,
      reloadMs: 1800,
      mechanic: "akimbo",
      secondaryWeaponTexture: "weapon-akimbo",
    });
    const smg = ALL_PLAYER_WEAPONS.find(
      (weapon) => weapon.id === "vibe-smg",
    );
    expect(smg).toMatchObject({
      magazineSize: 30,
      damage: 8,
      fireIntervalMs: 70,
      reloadMs: 1250,
      mechanic: "smg",
    });
    const cannon = ALL_PLAYER_WEAPONS.find(
      (weapon) => weapon.id === "heavy-cannon",
    );
    expect(cannon).toMatchObject({
      magazineSize: 5,
      damage: 60,
      fireIntervalMs: 900,
      reloadMs: 2100,
      mechanic: "cannon",
    });
    const rocket = ALL_PLAYER_WEAPONS.find(
      (weapon) => weapon.id === "rocket-launcher",
    );
    expect(rocket).toMatchObject({
      magazineSize: 3,
      fireIntervalMs: 1100,
      reloadMs: 2400,
      projectileSpeed: 850,
      mechanic: "rocket",
      rocket: {
        blastRadius: 180,
        maxDamage: 120,
      },
    });
    expect(PROJECTILE_CONFIG.maxActiveProjectiles).toBeGreaterThanOrEqual(
      200,
    );
  });

  it("computes rocket-style radial falloff without double damage", () => {
    expect(computeRadialDamage(0, 180, 120, 40, 1.15)).toBe(120);
    const mid = computeRadialDamage(90, 180, 120, 40, 1.15);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(120);
    expect(computeRadialDamage(180, 180, 120, 40, 1.15)).toBe(40);
    expect(computeRadialDamage(181, 180, 120, 40, 1.15)).toBe(0);
  });
});
