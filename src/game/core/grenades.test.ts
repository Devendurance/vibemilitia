import { describe, expect, it } from "vitest";
import {
  GRENADE_CONFIG,
  GRENADE_INVENTORY_CONFIG,
  STINKING_CLOUD_CONFIG,
  TOXIC_DAMAGE_PER_TICK,
  addGrenade,
  canAddGrenade,
  computeBlastDamage,
  consumeGrenade,
  createGrenadeInventory,
  grenadeInventoryTotal,
  grenadeSlot,
  grenadeTypeFromSlot,
  resolveCircleRect,
} from "./grenades";

describe("grenade configuration", () => {
  it("uses a five second frag fuse and a contact impact fuse", () => {
    expect(GRENADE_CONFIG.frag.fuseMs).toBe(5_000);
    expect(GRENADE_CONFIG.contact.fuseMs).toBeNull();
    expect(GRENADE_CONFIG.contact.maxDamage).toBeGreaterThan(100);
    expect(GRENADE_CONFIG.frag.maxDamage).toBeGreaterThanOrEqual(100);
    expect(GRENADE_CONFIG.contact.blastRadius).toBeGreaterThan(0);
    expect(GRENADE_CONFIG.frag.gravity).toBeGreaterThan(0);
  });

  it("maps slots four, five and six to contact, frag and stinking", () => {
    expect(grenadeTypeFromSlot(0)).toBe("contact");
    expect(grenadeTypeFromSlot(1)).toBe("frag");
    expect(grenadeTypeFromSlot(2)).toBe("stinking");
    expect(grenadeTypeFromSlot(3)).toBeNull();
    expect(grenadeSlot("contact")).toBe(0);
    expect(grenadeSlot("frag")).toBe(1);
    expect(grenadeSlot("stinking")).toBe(2);
  });

  it("defines the toxic cloud balance and tick damage", () => {
    expect(STINKING_CLOUD_CONFIG.radius).toBe(160);
    expect(STINKING_CLOUD_CONFIG.durationMs).toBe(6_000);
    expect(STINKING_CLOUD_CONFIG.damagePerSecond).toBe(24);
    expect(STINKING_CLOUD_CONFIG.damageIntervalMs).toBe(250);
    expect(STINKING_CLOUD_CONFIG.maxActiveClouds).toBe(24);
    expect(TOXIC_DAMAGE_PER_TICK).toBe(6);
    expect(GRENADE_CONFIG.stinking.selectionSlot).toBe(6);
    expect(GRENADE_CONFIG.stinking.fuseMs).toBeNull();
    expect(GRENADE_CONFIG.stinking.throwCooldownMs).toBe(700);
  });
});

describe("grenade inventory", () => {
  it("starts with one of each grenade and caps at three total", () => {
    const inventory = createGrenadeInventory();
    expect(inventory).toEqual({ contact: 1, frag: 1, stinking: 1 });
    expect(grenadeInventoryTotal(inventory)).toBe(3);
    expect(canAddGrenade(inventory)).toBe(false);
    expect(addGrenade(inventory, "contact")).toBe(inventory);

    const truncated = createGrenadeInventory({
      contact: 2,
      frag: 2,
      stinking: 2,
    });
    expect(grenadeInventoryTotal(truncated)).toBe(
      GRENADE_INVENTORY_CONFIG.maxTotal,
    );
    expect(truncated).toEqual({ contact: 2, frag: 1, stinking: 0 });
  });

  it("consumes exactly one grenade and rejects empty types", () => {
    const inventory = createGrenadeInventory();
    const after = consumeGrenade(inventory, "contact");
    expect(after).toEqual({ contact: 0, frag: 1, stinking: 1 });
    expect(consumeGrenade(after!, "contact")).toBeNull();
    expect(consumeGrenade(inventory, "frag")).toEqual({
      contact: 1,
      frag: 0,
      stinking: 1,
    });
    expect(consumeGrenade(inventory, "stinking")).toEqual({
      contact: 1,
      frag: 1,
      stinking: 0,
    });
    expect(addGrenade(after!, "contact")).toEqual({
      contact: 1,
      frag: 1,
      stinking: 1,
    });
  });
});

describe("grenade blast damage", () => {
  it("is highest at the center and falls off to the blast radius", () => {
    const definition = GRENADE_CONFIG.contact;
    const center = computeBlastDamage(0, definition);
    const near = computeBlastDamage(40, definition);
    const far = computeBlastDamage(160, definition);
    expect(center).toBe(definition.maxDamage);
    expect(center).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(computeBlastDamage(definition.blastRadius + 1, definition)).toBe(0);
  });

  it("reduces damage behind cover", () => {
    const definition = GRENADE_CONFIG.frag;
    expect(computeBlastDamage(50, definition, definition.coverMultiplier)).toBe(
      Math.round(computeBlastDamage(50, definition) * definition.coverMultiplier),
    );
    expect(computeBlastDamage(50, definition, 0)).toBe(0);
  });
});

describe("grenade circle collision", () => {
  const rect = { x: 100, y: 100, width: 100, height: 40 };

  it("ignores circles outside the rectangle", () => {
    expect(resolveCircleRect(100, 50, 10, rect)).toBeNull();
  });

  it("resolves a circle approaching the top surface", () => {
    const hit = resolveCircleRect(150, 95, 10, rect);
    expect(hit).not.toBeNull();
    expect(hit?.normalX).toBe(0);
    expect(hit?.normalY).toBe(-1);
    expect(hit?.y).toBe(90);
  });

  it("resolves a circle inside the rectangle to the nearest edge", () => {
    const hit = resolveCircleRect(150, 103, 10, rect);
    expect(hit).not.toBeNull();
    expect(hit?.normalY).toBe(-1);
    expect(hit?.y).toBe(90);
  });
});
