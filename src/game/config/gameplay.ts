import type { WeaponDefinition } from "@/game/core/weapon";
import type { JetpackConfig } from "@/game/core/jetpack";

export const PLAYER_CONFIG = {
  displayHeight: 128,
  physicsWidth: 390,
  physicsHeight: 890,
  physicsOffsetX: 169,
  physicsOffsetY: 62,
  maxHealth: 100,
  moveSpeed: 390,
  groundAcceleration: 3400,
  airAcceleration: 2100,
  groundFriction: 3800,
  airFriction: 720,
  jumpSpeed: 700,
  maxFallSpeed: 980,
  coyoteMs: 110,
  invulnerabilityMs: 1500,
  respawnMs: 2800,
  damageRegenDelayMs: 4000,
  healthRegenPerSecond: 12,
} as const;

export const JETPACK_CONFIG: JetpackConfig = {
  maxFuel: 100,
  drainPerSecond: 33,
  regenPerSecond: 25,
  regenDelayMs: 780,
};

export const JETPACK_THRUST_ACCELERATION = 2500;
export const JETPACK_MAX_RISE_SPEED = 430;

export interface PlayerWeapon extends WeaponDefinition {
  slot: number;
  shortName: string;
  role: string;
  pellets: number;
  projectileLifetimeMs: number;
  projectileTexture: string;
  weaponTexture: string;
  muzzleColor: number;
  recoil: number;
}

export const PLAYER_WEAPONS: readonly PlayerWeapon[] = [
  {
    id: "vibe-rifle",
    slot: 1,
    name: "VIBE RIFLE",
    shortName: "RIFLE",
    role: "FULL AUTO / MID RANGE",
    magazineSize: 20,
    damage: 14,
    fireIntervalMs: 108,
    reloadMs: 1100,
    projectileSpeed: 1750,
    spreadRadians: 0.018,
    pellets: 1,
    projectileLifetimeMs: 1800,
    projectileTexture: "bullet-player",
    weaponTexture: "weapon-player",
    muzzleColor: 0xd7ff2e,
    recoil: 1,
  },
  {
    id: "scatter-blaster",
    slot: 2,
    name: "SCATTER BLASTER",
    shortName: "SCATTER",
    role: "BREAK ACTION / CLOSE RANGE",
    magazineSize: 6,
    damage: 9,
    fireIntervalMs: 720,
    reloadMs: 1800,
    projectileSpeed: 1350,
    spreadRadians: 0.17,
    pellets: 7,
    projectileLifetimeMs: 700,
    projectileTexture: "bullet-scatter",
    weaponTexture: "weapon-scatter",
    muzzleColor: 0xc7692f,
    recoil: 3.4,
  },
  {
    id: "vibe-lance",
    slot: 3,
    name: "VIBE LANCE",
    shortName: "LANCE",
    role: "PRECISION / TWO SHOT",
    magazineSize: 4,
    damage: 50,
    fireIntervalMs: 650,
    reloadMs: 1650,
    projectileSpeed: 2600,
    spreadRadians: 0.0025,
    pellets: 1,
    projectileLifetimeMs: 2200,
    projectileTexture: "bullet-precision",
    weaponTexture: "weapon-precision",
    muzzleColor: 0x9bd8f2,
    recoil: 2.2,
  },
];

export const MATCH_CONFIG = {
  durationMs: 90_000,
  scoreLimit: 10,
} as const;

export const DRONE_CONFIG = {
  maxHealth: 100,
  displayWidth: 66,
  displayHeight: 50,
  fireIntervalMs: 1600,
  burstCount: 3,
  burstSpacingMs: 150,
  projectileSpeed: 900,
  projectileDamage: 7,
  aggroRange: 1050,
  hoverSpeed: 155,
  respawnMs: 4200,
  invulnerabilityMs: 900,
  standoffDistance: 265,
  repathMs: 850,
} as const;

export const DRONE_WEAPON: WeaponDefinition = {
  id: "drone-burst",
  name: "GLITCH BURST",
  magazineSize: 3,
  damage: DRONE_CONFIG.projectileDamage,
  fireIntervalMs: DRONE_CONFIG.burstSpacingMs,
  reloadMs: DRONE_CONFIG.fireIntervalMs,
  projectileSpeed: DRONE_CONFIG.projectileSpeed,
  spreadRadians: 0.055,
};

export const PROJECTILE_LIFETIME_MS = 1800;
export const DEBUG_SHORTCUT = "F1";
