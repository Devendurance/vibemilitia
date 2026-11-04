import { describe, expect, it } from "vitest";
import {
  WEAPON_SLOT_COUNT,
  canEquipWeaponSlot,
  createStarterWeaponLoadout,
  findEmptyWeaponSlot,
  findWeaponSlot,
  hasEmptyWeaponSlot,
  ownsWeapon,
  replaceWeaponSlot,
  weaponPickupOutcome,
} from "./weaponInventory";

describe("weapon inventory rules", () => {
  it("starts online humans with rifle, scatter and an empty third slot", () => {
    const loadout = createStarterWeaponLoadout();
    expect(loadout).toHaveLength(WEAPON_SLOT_COUNT);
    expect(loadout).toEqual(["vibe-rifle", "scatter-blaster", null]);
    expect(findEmptyWeaponSlot(loadout)).toBe(2);
    expect(hasEmptyWeaponSlot(loadout)).toBe(true);
    expect(ownsWeapon(loadout, "vibe-rifle")).toBe(true);
    expect(ownsWeapon(loadout, "vibe-lance")).toBe(false);
  });

  it("fills an empty slot before asking for a replacement", () => {
    const loadout = createStarterWeaponLoadout();
    expect(weaponPickupOutcome(loadout, "vibe-lance")).toBe("empty");
    const full = replaceWeaponSlot(loadout, 2, "vibe-rifle");
    expect(hasEmptyWeaponSlot(full)).toBe(false);
    expect(weaponPickupOutcome(full, "vibe-lance")).toBe("needs-swap");
    expect(weaponPickupOutcome(full, "vibe-rifle")).toBe("duplicate");
  });

  it("cannot equip an empty or unowned slot", () => {
    const loadout = createStarterWeaponLoadout();
    expect(canEquipWeaponSlot(loadout, 0)).toBe(true);
    expect(canEquipWeaponSlot(loadout, 2)).toBe(false);
    expect(canEquipWeaponSlot(loadout, 3)).toBe(false);
    expect(canEquipWeaponSlot(loadout, -1)).toBe(false);
    expect(canEquipWeaponSlot(loadout, 1.5)).toBe(false);
  });

  it("replaces one slot without duplicating the source weapon", () => {
    const loadout = replaceWeaponSlot(
      createStarterWeaponLoadout(),
      2,
      "vibe-lance",
    );
    expect(loadout).toEqual(["vibe-rifle", "scatter-blaster", "vibe-lance"]);
    expect(findWeaponSlot(loadout, "vibe-lance")).toBe(2);
    const swapped = replaceWeaponSlot(loadout, 0, "vibe-lance");
    expect(swapped).toEqual(["vibe-lance", "scatter-blaster", "vibe-lance"]);
    expect(swapped.filter((id) => id === "vibe-lance")).toHaveLength(2);
  });
});
