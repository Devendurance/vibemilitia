import type { GrenadeInventory, GrenadeType } from "@/game/core/grenades";

export type LootKind = "weapon" | "medkit" | "grenade";

export const LOOT_CONFIG = {
  /** Server simulation lifetime for one elimination bundle item. */
  lifetimeMs: 12_000,
  /** Server-authoritative proximity for automatic and explicit collection. */
  collectionRadius: 82,
  /** Horizontal spread for the three rewards around the death position. */
  scatterDistance: 46,
  /** Hard bound per room. Oldest active entities are removed first. */
  maxEntities: 48,
} as const;

export interface LootPlatform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LootRuntime {
  id: string;
  kind: LootKind;
  weaponId: string | null;
  ammo: number;
  grenadeType: GrenadeType | null;
  x: number;
  y: number;
  eliminationId: number;
  roomId: string;
  active: boolean;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface CreateEliminationLootOptions {
  eliminationId: number;
  roomId: string;
  x: number;
  y: number;
  weaponId: string;
  weaponAmmo: number;
  grenadeType: GrenadeType;
  nowMs: number;
  platforms: readonly LootPlatform[];
  arenaWidth: number;
  arenaHeight: number;
  createId: () => string;
}

const GRENADE_LABELS: Record<GrenadeType, string> = {
  contact: "CONTACT GRENADE",
  frag: "FRAG GRENADE",
  stinking: "STINKING GRENADE",
};

export function grenadeLabel(type: GrenadeType): string {
  return GRENADE_LABELS[type];
}

/**
 * Deterministic grenade reward policy. The victim's most-carried grenade type
 * wins. Ties resolve contact, frag, stinking. An empty inventory falls back to
 * the documented default reward, contact.
 */
export function chooseGrenadeReward(inventory: GrenadeInventory): GrenadeType {
  const order: GrenadeType[] = ["contact", "frag", "stinking"];
  let selected: GrenadeType = "contact";
  let selectedCount = -1;
  for (const type of order) {
    const count = inventory[type];
    if (count > selectedCount) {
      selected = type;
      selectedCount = count;
    }
  }
  return selectedCount > 0 ? selected : "contact";
}

export function clampWeaponAmmo(ammo: number, magazineSize: number): number {
  if (!Number.isFinite(ammo) || !Number.isFinite(magazineSize)) return 0;
  return Math.max(0, Math.min(Math.floor(magazineSize), Math.floor(ammo)));
}

/**
 * Loot settles on the first platform top at or below the death position. This
 * keeps bundles inside the arena, above solid terrain and reachable. The
 * client adds the outward pop animation on top of these final server points.
 */
export function settleLootPosition(
  originX: number,
  originY: number,
  scatterIndex: number,
  platforms: readonly LootPlatform[],
  arenaWidth: number,
  arenaHeight: number,
  scatterDistance = LOOT_CONFIG.scatterDistance,
): { x: number; y: number } {
  const direction = scatterIndex === 0 ? -1 : scatterIndex === 2 ? 1 : 0;
  const x = Math.max(
    24,
    Math.min(arenaWidth - 24, originX + direction * scatterDistance),
  );
  const below = platforms
    .filter(
      (platform) =>
        x >= platform.x + 6 &&
        x <= platform.x + platform.width - 6 &&
        platform.y >= originY - 12,
    )
    .sort((left, right) => left.y - right.y);
  const surfaceY = below[0]?.y ?? Math.min(arenaHeight - 24, originY);
  return {
    x,
    y: Math.max(24, Math.min(arenaHeight - 24, surfaceY - 16)),
  };
}

export function createEliminationLoot(
  options: CreateEliminationLootOptions,
): LootRuntime[] {
  const common = {
    eliminationId: options.eliminationId,
    roomId: options.roomId,
    active: true,
    createdAtMs: options.nowMs,
    expiresAtMs: options.nowMs + LOOT_CONFIG.lifetimeMs,
  };
  const weaponPosition = settleLootPosition(
    options.x,
    options.y,
    0,
    options.platforms,
    options.arenaWidth,
    options.arenaHeight,
  );
  const medkitPosition = settleLootPosition(
    options.x,
    options.y,
    1,
    options.platforms,
    options.arenaWidth,
    options.arenaHeight,
  );
  const grenadePosition = settleLootPosition(
    options.x,
    options.y,
    2,
    options.platforms,
    options.arenaWidth,
    options.arenaHeight,
  );

  return [
    {
      ...common,
      id: options.createId(),
      kind: "weapon",
      weaponId: options.weaponId,
      ammo: Math.max(0, Math.floor(options.weaponAmmo)),
      grenadeType: null,
      x: weaponPosition.x,
      y: weaponPosition.y,
    },
    {
      ...common,
      id: options.createId(),
      kind: "medkit",
      weaponId: null,
      ammo: 0,
      grenadeType: null,
      x: medkitPosition.x,
      y: medkitPosition.y,
    },
    {
      ...common,
      id: options.createId(),
      kind: "grenade",
      weaponId: null,
      ammo: 0,
      grenadeType: options.grenadeType,
      x: grenadePosition.x,
      y: grenadePosition.y,
    },
  ];
}

export function expireLoot(
  loot: LootRuntime[],
  nowMs: number,
): LootRuntime[] {
  const expired: LootRuntime[] = [];
  for (const item of loot) {
    if (!item.active || nowMs < item.expiresAtMs) continue;
    item.active = false;
    expired.push(item);
  }
  return expired;
}

export function trimLootToCap(
  loot: LootRuntime[],
  maxEntities = LOOT_CONFIG.maxEntities,
): LootRuntime[] {
  const active = loot.filter((item) => item.active);
  if (active.length <= maxEntities) return [];
  const excess = active
    .slice()
    .sort(
      (left, right) =>
        left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id),
    )
    .slice(0, active.length - maxEntities);
  for (const item of excess) item.active = false;
  return excess;
}

export function distanceSquaredToLoot(
  item: LootRuntime,
  x: number,
  y: number,
): number {
  const dx = item.x - x;
  const dy = item.y - y;
  return dx * dx + dy * dy;
}

export function findNearestActiveLoot(
  loot: readonly LootRuntime[],
  x: number,
  y: number,
  radius: number,
  accept: (item: LootRuntime) => boolean,
): LootRuntime | null {
  const radiusSq = radius * radius;
  let nearest: LootRuntime | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const item of loot) {
    if (!item.active || !accept(item)) continue;
    const distance = distanceSquaredToLoot(item, x, y);
    if (distance > radiusSq || distance >= nearestDistance) continue;
    nearest = item;
    nearestDistance = distance;
  }
  return nearest;
}
