import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import {
  LOOT_CONFIG,
  chooseGrenadeReward,
  createEliminationLoot,
  expireLoot,
  findNearestActiveLoot,
  settleLootPosition,
  trimLootToCap,
  type LootRuntime,
} from "./loot";

function bundle(
  eliminationId: number,
  options: {
    x?: number;
    y?: number;
    createdAtMs?: number;
    idPrefix?: string;
  } = {},
): LootRuntime[] {
  let counter = 0;
  return createEliminationLoot({
    eliminationId,
    roomId: "room-a",
    x: options.x ?? 1200,
    y: options.y ?? ARENA.groundY,
    weaponId: "vibe-lance",
    weaponAmmo: 3,
    grenadeType: "frag",
    nowMs: options.createdAtMs ?? 5_000,
    platforms: ARENA.platforms,
    arenaWidth: ARENA.width,
    arenaHeight: ARENA.height,
    createId: () =>
      `${options.idPrefix ?? "loot"}-${eliminationId}-${++counter}`,
  });
}

describe("dynamic elimination loot", () => {
  it("creates one weapon, one medkit and one grenade with stable payloads", () => {
    const loot = bundle(7);
    expect(loot).toHaveLength(3);
    expect(loot.map((item) => item.kind)).toEqual([
      "weapon",
      "medkit",
      "grenade",
    ]);
    expect(loot[0]).toMatchObject({
      weaponId: "vibe-lance",
      ammo: 3,
      grenadeType: null,
      eliminationId: 7,
      roomId: "room-a",
      active: true,
    });
    expect(loot[1]).toMatchObject({
      kind: "medkit",
      weaponId: null,
      grenadeType: null,
      eliminationId: 7,
    });
    expect(loot[2]).toMatchObject({
      kind: "grenade",
      grenadeType: "frag",
      eliminationId: 7,
    });
    expect(new Set(loot.map((item) => item.id)).size).toBe(3);
    for (const item of loot) {
      expect(item.expiresAtMs - item.createdAtMs).toBe(LOOT_CONFIG.lifetimeMs);
    }
  });

  it("scatters the three rewards outward and settles them on reachable ground", () => {
    const loot = bundle(1);
    expect(loot[0].x).toBeLessThan(loot[1].x);
    expect(loot[2].x).toBeGreaterThan(loot[1].x);
    for (const item of loot) {
      expect(item.x).toBeGreaterThanOrEqual(24);
      expect(item.x).toBeLessThanOrEqual(ARENA.width - 24);
      expect(item.y).toBeLessThan(ARENA.groundY);
    }
  });

  it("settles midair deaths on the platform below", () => {
    const position = settleLootPosition(
      1000,
      800,
      1,
      ARENA.platforms,
      ARENA.width,
      ARENA.height,
    );
    expect(position).toEqual({ x: 1000, y: 1144 });
  });

  it("clamps scatter at arena edges", () => {
    const left = settleLootPosition(
      2,
      1340,
      0,
      ARENA.platforms,
      ARENA.width,
      ARENA.height,
    );
    expect(left.x).toBe(24);
    const right = settleLootPosition(
      ARENA.width - 2,
      1340,
      2,
      ARENA.platforms,
      ARENA.width,
      ARENA.height,
    );
    expect(right.x).toBe(ARENA.width - 24);
  });

  it("selects the victim's most-carried grenade deterministically", () => {
    expect(
      chooseGrenadeReward({ contact: 0, frag: 0, stinking: 0 }),
    ).toBe("contact");
    expect(
      chooseGrenadeReward({ contact: 1, frag: 2, stinking: 2 }),
    ).toBe("frag");
    expect(
      chooseGrenadeReward({ contact: 3, frag: 2, stinking: 1 }),
    ).toBe("contact");
    expect(
      chooseGrenadeReward({ contact: 0, frag: 0, stinking: 1 }),
    ).toBe("stinking");
  });

  it("expires on server simulation time and never before the deadline", () => {
    const loot = bundle(2, { createdAtMs: 1_000 });
    expect(expireLoot(loot, 1_000 + LOOT_CONFIG.lifetimeMs - 1)).toHaveLength(
      0,
    );
    expect(loot.every((item) => item.active)).toBe(true);
    const expired = expireLoot(loot, 1_000 + LOOT_CONFIG.lifetimeMs);
    expect(expired).toHaveLength(3);
    expect(loot.every((item) => !item.active)).toBe(true);
  });

  it("caps room loot deterministically by removing the oldest entities", () => {
    const loot: LootRuntime[] = [];
    for (let index = 1; index <= 20; index += 1) {
      loot.push(
        ...bundle(index, {
          createdAtMs: index * 10,
          idPrefix: "bundle",
        }),
      );
    }
    expect(loot).toHaveLength(60);
    const removed = trimLootToCap(loot, 48);
    expect(removed).toHaveLength(12);
    expect(removed.every((item) => !item.active)).toBe(true);
    expect(loot.filter((item) => item.active)).toHaveLength(48);
    expect(removed.map((item) => item.id)).toContain("bundle-1-1");
    expect(removed.map((item) => item.id)).not.toContain("bundle-20-3");
    expect(trimLootToCap(loot, 48)).toHaveLength(0);
  });

  it("finds only active, accepted loot inside the collection radius", () => {
    const loot = bundle(3);
    loot[0].active = false;
    const found = findNearestActiveLoot(
      loot,
      loot[1].x + 4,
      loot[1].y + 2,
      LOOT_CONFIG.collectionRadius,
      (item) => item.kind !== "weapon",
    );
    expect(found?.kind).toBe("medkit");
    const tooFar = findNearestActiveLoot(
      loot,
      2600,
      loot[1].y,
      LOOT_CONFIG.collectionRadius,
      () => true,
    );
    expect(tooFar).toBeNull();
  });
});
