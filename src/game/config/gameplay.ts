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

export const PLAYER_WEAPON: WeaponDefinition = {
  id: "vibe-rifle",
  name: "VIBE RIFLE",
  magazineSize: 20,
  damage: 14,
  fireIntervalMs: 108,
  reloadMs: 1100,
  projectileSpeed: 1750,
  spreadRadians: 0.018,
};

export const DRONE_CONFIG = {
  maxHealth: 64,
  displayWidth: 66,
  displayHeight: 50,
  fireIntervalMs: 1450,
  burstCount: 3,
  burstSpacingMs: 150,
  projectileSpeed: 860,
  projectileDamage: 7,
  aggroRange: 1050,
  orbitRadius: 250,
  hoverSpeed: 92,
  respawnMs: 6200,
  scoreValue: 1,
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
