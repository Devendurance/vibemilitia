import {
  GRENADE_INVENTORY_CONFIG,
  type GrenadeType,
} from "@/game/core/grenades";

export type PickupType =
  | "medkit"
  | "contact-grenade"
  | "frag-grenade"
  | "stinking-grenade"
  | "vibe-lance";

export const PICKUP_RADIUS = 78;

export const VIBE_LANCE_PICKUP_RESPAWN_MS = 25_000;

export const PICKUP_LABELS: Record<PickupType, string> = {
  medkit: "MEDKIT",
  "contact-grenade": "CONTACT GRENADE",
  "frag-grenade": "FRAG GRENADE",
  "stinking-grenade": "STINKING GRENADE",
  "vibe-lance": "VIBE LANCE",
};

export function pickupRespawnMs(type: PickupType): number {
  if (type === "medkit") return MEDKIT_CONFIG.respawnMs;
  if (type === "vibe-lance") return VIBE_LANCE_PICKUP_RESPAWN_MS;
  return GRENADE_INVENTORY_CONFIG.pickupRespawnMs;
}

export function isWeaponPickup(type: PickupType): boolean {
  return type === "vibe-lance";
}

export function weaponIdFromPickup(type: PickupType): string | null {
  return type === "vibe-lance" ? "vibe-lance" : null;
}

export function grenadeTypeFromPickup(type: PickupType): GrenadeType | null {
  if (type === "contact-grenade") return "contact";
  if (type === "frag-grenade") return "frag";
  if (type === "stinking-grenade") return "stinking";
  return null;
}

export const MEDKIT_CONFIG = {
  healAmount: 50,
  maxCarried: 2,
  useCooldownMs: 900,
  respawnMs: 20_000,
} as const;

export interface PickupDefinition {
  id: string;
  type: PickupType;
  x: number;
  y: number;
}

export interface PickupRuntime extends PickupDefinition {
  active: boolean;
  respawnRemainingMs: number;
}

export interface MedkitUseState {
  health: number;
  maxHealth: number;
  carried: number;
  cooldownRemainingMs: number;
}

export interface MedkitUseResult {
  ok: boolean;
  health: number;
  carried: number;
  healed: number;
}

export function createPickups(
  definitions: readonly PickupDefinition[],
): PickupRuntime[] {
  return definitions.map((definition) => ({
    ...definition,
    active: true,
    respawnRemainingMs: 0,
  }));
}

export function resetPickups(pickups: PickupRuntime[]): void {
  for (const pickup of pickups) {
    pickup.active = true;
    pickup.respawnRemainingMs = 0;
  }
}

export function stepPickupRespawns(
  pickups: PickupRuntime[],
  dtMs: number,
): PickupRuntime[] {
  const respawned: PickupRuntime[] = [];
  for (const pickup of pickups) {
    if (pickup.active) continue;
    pickup.respawnRemainingMs = Math.max(0, pickup.respawnRemainingMs - dtMs);
    if (pickup.respawnRemainingMs > 0) continue;
    pickup.active = true;
    respawned.push(pickup);
  }
  return respawned;
}

export function findCollectiblePickup(
  pickups: readonly PickupRuntime[],
  x: number,
  y: number,
  accept: (pickup: PickupRuntime) => boolean,
  radius = PICKUP_RADIUS,
): PickupRuntime | null {
  const radiusSq = radius * radius;
  for (const pickup of pickups) {
    if (!pickup.active || !accept(pickup)) continue;
    const dx = pickup.x - x;
    const dy = pickup.y - y;
    if (dx * dx + dy * dy > radiusSq) continue;
    pickup.active = false;
    pickup.respawnRemainingMs = pickupRespawnMs(pickup.type);
    return pickup;
  }
  return null;
}

export function applyMedkit(
  state: MedkitUseState,
  healAmount = MEDKIT_CONFIG.healAmount,
): MedkitUseResult {
  if (
    state.carried <= 0 ||
    state.cooldownRemainingMs > 0 ||
    state.health >= state.maxHealth
  ) {
    return {
      ok: false,
      health: state.health,
      carried: state.carried,
      healed: 0,
    };
  }
  const health = Math.min(state.maxHealth, state.health + healAmount);
  return {
    ok: true,
    health,
    carried: state.carried - 1,
    healed: health - state.health,
  };
}
