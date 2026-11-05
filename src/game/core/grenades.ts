export type GrenadeType = "contact" | "frag" | "stinking";

export const GRENADE_SLOT_TYPES: readonly GrenadeType[] = [
  "contact",
  "frag",
  "stinking",
];

export interface GrenadeDefinition {
  type: GrenadeType;
  name: string;
  shortName: string;
  selectionSlot: number;
  fuseMs: number | null;
  maxLifetimeMs: number;
  throwSpeed: number;
  gravity: number;
  radius: number;
  blastRadius: number;
  maxDamage: number;
  minDamage: number;
  falloffExponent: number;
  restitution: number;
  friction: number;
  throwCooldownMs: number;
  armingMs: number;
  armingDistance: number;
  coverMultiplier: number;
}

export const GRENADE_CONFIG: Record<GrenadeType, GrenadeDefinition> = {
  contact: {
    type: "contact",
    name: "CONTACT GRENADE",
    shortName: "CONTACT",
    selectionSlot: 4,
    fuseMs: null,
    maxLifetimeMs: 5_000,
    throwSpeed: 920,
    gravity: 1_500,
    radius: 9,
    blastRadius: 220,
    maxDamage: 180,
    minDamage: 10,
    falloffExponent: 1.25,
    restitution: 0.18,
    friction: 0.8,
    throwCooldownMs: 700,
    armingMs: 100,
    armingDistance: 18,
    coverMultiplier: 0.45,
  },
  frag: {
    type: "frag",
    name: "FRAG GRENADE",
    shortName: "FRAG",
    selectionSlot: 5,
    fuseMs: 5_000,
    maxLifetimeMs: 5_000,
    throwSpeed: 820,
    gravity: 1_400,
    radius: 10,
    blastRadius: 215,
    maxDamage: 120,
    minDamage: 6,
    falloffExponent: 1.2,
    restitution: 0.5,
    friction: 0.72,
    throwCooldownMs: 700,
    armingMs: 100,
    armingDistance: 18,
    coverMultiplier: 0.45,
  },
  stinking: {
    type: "stinking",
    name: "STINKING GRENADE",
    shortName: "STINK",
    selectionSlot: 6,
    fuseMs: null,
    maxLifetimeMs: 900,
    throwSpeed: 760,
    gravity: 1_400,
    radius: 10,
    blastRadius: 0,
    maxDamage: 0,
    minDamage: 0,
    falloffExponent: 1,
    restitution: 0.45,
    friction: 0.75,
    throwCooldownMs: 700,
    armingMs: 100,
    armingDistance: 18,
    coverMultiplier: 0,
  },
};

export const STINKING_CLOUD_CONFIG = {
  radius: 160,
  durationMs: 6_000,
  activationDelayMs: 900,
  damagePerSecond: 24,
  damageIntervalMs: 250,
  maxActiveClouds: 24,
  terrainBlocksDamage: true,
} as const;

export const TOXIC_DAMAGE_PER_TICK = Math.max(
  1,
  Math.round(
    (STINKING_CLOUD_CONFIG.damagePerSecond *
      STINKING_CLOUD_CONFIG.damageIntervalMs) /
      1000,
  ),
);

export const GRENADE_INVENTORY_CONFIG = {
  maxTotal: 3,
  starting: {
    contact: 1,
    frag: 1,
    stinking: 1,
  } satisfies Record<GrenadeType, number>,
  pickupRespawnMs: 22_000,
  maxActiveGrenades: 64,
} as const;

export type GrenadeInventory = Record<GrenadeType, number>;

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleRectResolution {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

export function createGrenadeInventory(
  starting: Record<GrenadeType, number> = GRENADE_INVENTORY_CONFIG.starting,
): GrenadeInventory {
  const inventory: GrenadeInventory = {
    contact: Math.max(0, Math.floor(starting.contact)),
    frag: Math.max(0, Math.floor(starting.frag)),
    stinking: Math.max(0, Math.floor(starting.stinking)),
  };
  const total = grenadeInventoryTotal(inventory);
  if (total <= GRENADE_INVENTORY_CONFIG.maxTotal) return inventory;

  let remaining = GRENADE_INVENTORY_CONFIG.maxTotal;
  inventory.contact = Math.min(inventory.contact, remaining);
  remaining -= inventory.contact;
  inventory.frag = Math.min(inventory.frag, remaining);
  remaining -= inventory.frag;
  inventory.stinking = Math.min(inventory.stinking, remaining);
  return inventory;
}

export function grenadeInventoryTotal(inventory: GrenadeInventory): number {
  return inventory.contact + inventory.frag + inventory.stinking;
}

export function canAddGrenade(inventory: GrenadeInventory): boolean {
  return grenadeInventoryTotal(inventory) < GRENADE_INVENTORY_CONFIG.maxTotal;
}

export function addGrenade(
  inventory: GrenadeInventory,
  type: GrenadeType,
): GrenadeInventory {
  if (!canAddGrenade(inventory)) return inventory;
  return { ...inventory, [type]: inventory[type] + 1 };
}

export function consumeGrenade(
  inventory: GrenadeInventory,
  type: GrenadeType,
): GrenadeInventory | null {
  if (inventory[type] <= 0) return null;
  return { ...inventory, [type]: inventory[type] - 1 };
}

export function grenadeTypeFromSlot(slot: number): GrenadeType | null {
  return GRENADE_SLOT_TYPES[slot] ?? null;
}

export function grenadeSlot(type: GrenadeType): number {
  if (type === "contact") return 0;
  if (type === "frag") return 1;
  return 2;
}

export function computeRadialDamage(
  distance: number,
  radius: number,
  maxDamage: number,
  minDamage: number,
  falloffExponent: number,
  coverFactor = 1,
): number {
  if (distance > radius || coverFactor <= 0 || maxDamage <= 0) {
    return 0;
  }
  const falloff = Math.pow(
    Math.max(0, 1 - distance / radius),
    falloffExponent,
  );
  return Math.max(
    minDamage,
    Math.round(maxDamage * falloff * coverFactor),
  );
}

export function computeBlastDamage(
  distance: number,
  definition: GrenadeDefinition,
  coverFactor = 1,
): number {
  return computeRadialDamage(
    distance,
    definition.blastRadius,
    definition.maxDamage,
    definition.minDamage,
    definition.falloffExponent,
    coverFactor,
  );
}

export function resolveCircleRect(
  cx: number,
  cy: number,
  radius: number,
  rect: RectLike,
): CircleRectResolution | null {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > radius * radius + 1e-6) return null;

  if (distanceSq > 1e-6) {
    const distance = Math.sqrt(distanceSq);
    const normalX = dx / distance;
    const normalY = dy / distance;
    return {
      x: closestX + normalX * radius,
      y: closestY + normalY * radius,
      normalX,
      normalY,
    };
  }

  const edges = [
    { distance: cx - rect.x, normalX: -1, normalY: 0 },
    { distance: rect.x + rect.width - cx, normalX: 1, normalY: 0 },
    { distance: cy - rect.y, normalX: 0, normalY: -1 },
    { distance: rect.y + rect.height - cy, normalX: 0, normalY: 1 },
  ];
  const nearest = edges.reduce((left, right) =>
    left.distance <= right.distance ? left : right,
  );
  return {
    x: cx + nearest.normalX * (nearest.distance + radius),
    y: cy + nearest.normalY * (nearest.distance + radius),
    normalX: nearest.normalX,
    normalY: nearest.normalY,
  };
}
