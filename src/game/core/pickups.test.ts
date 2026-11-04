import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import {
  MEDKIT_CONFIG,
  createPickups,
  findCollectiblePickup,
  resetPickups,
  stepPickupRespawns,
  applyMedkit,
  type PickupDefinition,
} from "./pickups";

const definitions: PickupDefinition[] = [
  { id: "medkit-a", type: "medkit", x: 100, y: 200 },
  { id: "medkit-b", type: "medkit", x: 500, y: 200 },
];

describe("authoritative pickup field", () => {
  it("creates active pickups and resets collected ones", () => {
    const pickups = createPickups(definitions);
    expect(pickups).toHaveLength(2);
    expect(pickups.every((pickup) => pickup.active)).toBe(true);

    pickups[0].active = false;
    pickups[0].respawnRemainingMs = 5_000;
    resetPickups(pickups);
    expect(pickups.every((pickup) => pickup.active)).toBe(true);
    expect(pickups.every((pickup) => pickup.respawnRemainingMs === 0)).toBe(true);
  });

  it("requires proximity and never grants the same pickup twice", () => {
    const pickups = createPickups(definitions);
    expect(findCollectiblePickup(pickups, 900, 900, () => true)).toBeNull();

    const collected = findCollectiblePickup(pickups, 100, 200, () => true);
    expect(collected?.id).toBe("medkit-a");
    expect(collected?.active).toBe(false);
    expect(collected?.respawnRemainingMs).toBe(MEDKIT_CONFIG.respawnMs);

    expect(findCollectiblePickup(pickups, 100, 200, () => true)).toBeNull();
  });

  it("does not collect when the inventory rejects the item", () => {
    const pickups = createPickups(definitions);
    expect(findCollectiblePickup(pickups, 100, 200, () => false)).toBeNull();
    expect(pickups[0].active).toBe(true);
  });

  it("respawns after the configured cooldown", () => {
    const pickups = createPickups(definitions);
    findCollectiblePickup(pickups, 100, 200, () => true);

    expect(stepPickupRespawns(pickups, MEDKIT_CONFIG.respawnMs - 1)).toHaveLength(0);
    expect(pickups[0].active).toBe(false);

    const respawned = stepPickupRespawns(pickups, 1);
    expect(respawned.map((pickup) => pickup.id)).toEqual(["medkit-a"]);
    expect(pickups[0].active).toBe(true);
    expect(pickups[0].respawnRemainingMs).toBe(0);
  });
});

describe("Sector 07 pickup placement", () => {
  it("places unique supplies on platform tops away from spawn bodies", () => {
    const ids = new Set(ARENA.pickupSpawns.map((pickup) => pickup.id));
    expect(ids.size).toBe(ARENA.pickupSpawns.length);
    expect(
      ARENA.pickupSpawns.filter((pickup) => pickup.type === "medkit"),
    ).toHaveLength(14);
    expect(
      ARENA.pickupSpawns.filter(
        (pickup) => pickup.type === "contact-grenade",
      ),
    ).toHaveLength(3);
    expect(
      ARENA.pickupSpawns.filter(
        (pickup) => pickup.type === "frag-grenade",
      ),
    ).toHaveLength(3);
    expect(
      new Set(ARENA.pickupSpawns.map((pickup) => pickup.y)).size,
    ).toBeGreaterThan(2);

    for (const pickup of ARENA.pickupSpawns) {
      const feetY = pickup.y + 16;
      const supported = ARENA.platforms.some(
        (platform) =>
          pickup.x >= platform.x &&
          pickup.x <= platform.x + platform.width &&
          Math.abs(platform.y - feetY) <= 2,
      );
      expect(supported, `${pickup.id} sits on a platform`).toBe(true);
      const nearSpawn = ARENA.spawnPoints.some(
        (spawn) =>
          Math.hypot(spawn.x - pickup.x, spawn.y - feetY) < 60,
      );
      expect(nearSpawn, `${pickup.id} avoids spawn bodies`).toBe(false);
    }
  });
});

describe("medkit use rules", () => {  it("heals 50 and consumes one medkit", () => {
    const result = applyMedkit({
      health: 40,
      maxHealth: 100,
      carried: 2,
      cooldownRemainingMs: 0,
    });
    expect(result).toEqual({ ok: true, health: 90, carried: 1, healed: 50 });
  });

  it("caps healing at maximum health", () => {
    const result = applyMedkit({
      health: 80,
      maxHealth: 100,
      carried: 1,
      cooldownRemainingMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.health).toBe(100);
    expect(result.healed).toBe(20);
    expect(result.carried).toBe(0);
  });

  it("rejects empty inventory, full health and cooldown", () => {
    expect(
      applyMedkit({
        health: 40,
        maxHealth: 100,
        carried: 0,
        cooldownRemainingMs: 0,
      }).ok,
    ).toBe(false);
    expect(
      applyMedkit({
        health: 100,
        maxHealth: 100,
        carried: 2,
        cooldownRemainingMs: 0,
      }).ok,
    ).toBe(false);
    expect(
      applyMedkit({
        health: 40,
        maxHealth: 100,
        carried: 2,
        cooldownRemainingMs: 1,
      }).ok,
    ).toBe(false);
  });
});
