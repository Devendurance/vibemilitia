export const WEAPON_SLOT_COUNT = 3;

/**
 * Online starter loadout. Slot 3 stays empty so the Vibe Lance is a real
 * battlefield acquisition. P1 local mode keeps its original three-weapon
 * training loadout and never reads this constant.
 */
export const STARTER_WEAPON_LOADOUT: readonly (string | null)[] = [
  "vibe-rifle",
  "scatter-blaster",
  null,
];

export type WeaponPickupOutcome = "empty" | "duplicate" | "needs-swap";

export function createStarterWeaponLoadout(): (string | null)[] {
  return [...STARTER_WEAPON_LOADOUT];
}

export function findWeaponSlot(
  loadout: readonly (string | null)[],
  weaponId: string,
): number {
  return loadout.findIndex((ownedId) => ownedId === weaponId);
}

export function findEmptyWeaponSlot(
  loadout: readonly (string | null)[],
): number {
  return loadout.findIndex((ownedId) => ownedId === null);
}

export function hasEmptyWeaponSlot(
  loadout: readonly (string | null)[],
): boolean {
  return findEmptyWeaponSlot(loadout) !== -1;
}

export function ownsWeapon(
  loadout: readonly (string | null)[],
  weaponId: string,
): boolean {
  return findWeaponSlot(loadout, weaponId) !== -1;
}

export function weaponPickupOutcome(
  loadout: readonly (string | null)[],
  weaponId: string,
): WeaponPickupOutcome {
  if (hasEmptyWeaponSlot(loadout)) return "empty";
  if (ownsWeapon(loadout, weaponId)) return "duplicate";
  return "needs-swap";
}

export function canEquipWeaponSlot(
  loadout: readonly (string | null)[],
  slot: number,
): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= WEAPON_SLOT_COUNT) {
    return false;
  }
  return loadout[slot] !== null;
}

export function replaceWeaponSlot(
  loadout: readonly (string | null)[],
  slot: number,
  weaponId: string,
): (string | null)[] {
  if (!Number.isInteger(slot) || slot < 0 || slot >= WEAPON_SLOT_COUNT) {
    return [...loadout];
  }
  const next = [...loadout];
  next[slot] = weaponId;
  return next;
}
