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

export interface RocketConfig {
  blastRadius: number;
  maxDamage: number;
  minDamage: number;
  falloffExponent: number;
  coverMultiplier: number;
}

export type WeaponMechanic =
  | "rifle"
  | "scatter"
  | "precision"
  | "akimbo"
  | "smg"
  | "cannon"
  | "rocket";

export interface PlayerWeapon extends WeaponDefinition {
  slot: number;
  shortName: string;
  role: string;
  pellets: number;
  projectileLifetimeMs: number;
  projectileTexture: string;
  weaponTexture: string;
  secondaryWeaponTexture?: string;
  barrelSeparation?: number;
  muzzleColor: number;
  recoil: number;
  mechanic: WeaponMechanic;
  rocket?: RocketConfig;
}

export const PROJECTILE_CONFIG = {
  /** Hard bound on simultaneous player and bot projectiles per room. */
  maxActiveProjectiles: 220,
} as const;


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
    mechanic: "rifle",
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
    mechanic: "scatter",
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
    mechanic: "precision",
  },
];

export const ADVANCED_WEAPONS: readonly PlayerWeapon[] = [
  {
    id: "akimbo-rifles",
    slot: 0,
    name: "AKIMBO RIFLES",
    shortName: "AKIMBO",
    role: "TWIN AUTO / SHARED MAG",
    magazineSize: 36,
    damage: 10,
    fireIntervalMs: 85,
    reloadMs: 1800,
    projectileSpeed: 1650,
    spreadRadians: 0.045,
    pellets: 1,
    projectileLifetimeMs: 1500,
    projectileTexture: "bullet-akimbo",
    weaponTexture: "weapon-akimbo",
    secondaryWeaponTexture: "weapon-akimbo",
    barrelSeparation: 11,
    muzzleColor: 0xd7ff2e,
    recoil: 0.8,
    mechanic: "akimbo",
  },
  {
    id: "vibe-smg",
    slot: 0,
    name: "VIBE SMG",
    shortName: "SMG",
    role: "RAPID AUTO / CLOSE RANGE",
    magazineSize: 30,
    damage: 8,
    fireIntervalMs: 70,
    reloadMs: 1250,
    projectileSpeed: 1500,
    spreadRadians: 0.095,
    pellets: 1,
    projectileLifetimeMs: 1200,
    projectileTexture: "bullet-smg",
    weaponTexture: "weapon-smg",
    muzzleColor: 0x9bd8f2,
    recoil: 0.5,
    mechanic: "smg",
  },
  {
    id: "heavy-cannon",
    slot: 0,
    name: "HEAVY CANNON",
    shortName: "CANNON",
    role: "SLOW SLUG / HIGH IMPACT",
    magazineSize: 5,
    damage: 60,
    fireIntervalMs: 900,
    reloadMs: 2100,
    projectileSpeed: 1050,
    spreadRadians: 0.012,
    pellets: 1,
    projectileLifetimeMs: 2400,
    projectileTexture: "bullet-heavy",
    weaponTexture: "weapon-cannon",
    muzzleColor: 0xf4e21c,
    recoil: 4.2,
    mechanic: "cannon",
  },
  {
    id: "rocket-launcher",
    slot: 0,
    name: "ROCKET LAUNCHER",
    shortName: "ROCKET",
    role: "BLAST / SELF DANGER",
    magazineSize: 3,
    damage: 120,
    fireIntervalMs: 1100,
    reloadMs: 2400,
    projectileSpeed: 850,
    spreadRadians: 0.006,
    pellets: 1,
    projectileLifetimeMs: 3200,
    projectileTexture: "rocket-projectile",
    weaponTexture: "weapon-rocket",
    muzzleColor: 0xc7692f,
    recoil: 3.8,
    mechanic: "rocket",
    rocket: {
      blastRadius: 180,
      maxDamage: 120,
      minDamage: 40,
      falloffExponent: 1.15,
      coverMultiplier: 0.55,
    },
  },
];

export const ALL_PLAYER_WEAPONS: readonly PlayerWeapon[] = [
  ...PLAYER_WEAPONS,
  ...ADVANCED_WEAPONS,
];

export function findPlayerWeaponById(
  weaponId: string | null,
): PlayerWeapon | null {
  if (!weaponId) return null;
  return (
    ALL_PLAYER_WEAPONS.find((weapon) => weapon.id === weaponId) ?? null
  );
}


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

export type PracticeDifficulty = "easy" | "normal" | "hard" | "merciless";

export interface BotDifficultyProfile {
  label: string;
  reactionMs: number;
  fireIntervalMs: number;
  burstCount: number;
  burstSpacingMs: number;
  aimErrorRadians: number;
  hoverSpeed: number;
  standoffDistance: number;
  repathMs: number;
  strafeMinMs: number;
  strafeMaxMs: number;
  projectileSpeed: number;
  projectileDamage: number;
}

/**
 * Real behavioral tuning for local practice bots. Higher tiers react faster,
 * fire longer and more accurate bursts, close distance more aggressively and
 * reposition sooner. Nothing here changes the player or grants progression.
 */
export const BOT_DIFFICULTIES: Record<PracticeDifficulty, BotDifficultyProfile> = {
  easy: {
    label: "EASY",
    reactionMs: 1100,
    fireIntervalMs: 2500,
    burstCount: 2,
    burstSpacingMs: 190,
    aimErrorRadians: 0.16,
    hoverSpeed: 112,
    standoffDistance: 330,
    repathMs: 1350,
    strafeMinMs: 1800,
    strafeMaxMs: 3200,
    projectileSpeed: 760,
    projectileDamage: 5,
  },
  normal: {
    label: "NORMAL",
    reactionMs: 250,
    fireIntervalMs: DRONE_CONFIG.fireIntervalMs,
    burstCount: DRONE_CONFIG.burstCount,
    burstSpacingMs: DRONE_CONFIG.burstSpacingMs,
    aimErrorRadians: 0.055,
    hoverSpeed: DRONE_CONFIG.hoverSpeed,
    standoffDistance: DRONE_CONFIG.standoffDistance,
    repathMs: DRONE_CONFIG.repathMs,
    strafeMinMs: 1200,
    strafeMaxMs: 2400,
    projectileSpeed: DRONE_CONFIG.projectileSpeed,
    projectileDamage: DRONE_CONFIG.projectileDamage,
  },
  hard: {
    label: "HARD",
    reactionMs: 120,
    fireIntervalMs: 1100,
    burstCount: 4,
    burstSpacingMs: 130,
    aimErrorRadians: 0.028,
    hoverSpeed: 188,
    standoffDistance: 235,
    repathMs: 600,
    strafeMinMs: 750,
    strafeMaxMs: 1600,
    projectileSpeed: 980,
    projectileDamage: 8,
  },
  merciless: {
    label: "MERCILESS",
    reactionMs: 40,
    fireIntervalMs: 760,
    burstCount: 6,
    burstSpacingMs: 95,
    aimErrorRadians: 0.012,
    hoverSpeed: 218,
    standoffDistance: 205,
    repathMs: 420,
    strafeMinMs: 480,
    strafeMaxMs: 1050,
    projectileSpeed: 1080,
    projectileDamage: 9,
  },
};

/**
 * Tuning for simulation bots. DEFAULT_SIM_BOT_TUNING is the online behaviour and
 * must stay equal to the DRONE_CONFIG values it replaced. The practice tiers
 * change how bots think and shoot. Weapons, damage and supplies stay the same
 * rules as online, so practice teaches the real game.
 */
export interface SimBotTuning {
  reactionMs: number;
  fireIntervalMs: number;
  burstCount: number;
  burstSpacingMs: number;
  aimErrorRadians: number;
  leadFactor: number;
  hoverSpeed: number;
  standoffDistance: number;
  repathMs: number;
  grenades: boolean;
}

export const DEFAULT_SIM_BOT_TUNING: SimBotTuning = {
  reactionMs: 70,
  fireIntervalMs: DRONE_CONFIG.fireIntervalMs,
  burstCount: DRONE_CONFIG.burstCount,
  burstSpacingMs: DRONE_CONFIG.burstSpacingMs,
  aimErrorRadians: 0,
  leadFactor: 0.35,
  hoverSpeed: DRONE_CONFIG.hoverSpeed,
  standoffDistance: DRONE_CONFIG.standoffDistance,
  repathMs: DRONE_CONFIG.repathMs,
  grenades: true,
};

export const SIM_BOT_TUNING: Record<PracticeDifficulty, SimBotTuning> = {
  easy: {
    reactionMs: 520,
    fireIntervalMs: 2600,
    burstCount: 2,
    burstSpacingMs: 210,
    aimErrorRadians: 0.2,
    leadFactor: 0,
    hoverSpeed: 118,
    standoffDistance: 340,
    repathMs: 1300,
    grenades: false,
  },
  normal: {
    ...DEFAULT_SIM_BOT_TUNING,
    aimErrorRadians: 0.07,
    reactionMs: 220,
  },
  hard: {
    reactionMs: 110,
    fireIntervalMs: 1150,
    burstCount: 4,
    burstSpacingMs: 125,
    aimErrorRadians: 0.03,
    leadFactor: 0.6,
    hoverSpeed: 190,
    standoffDistance: 235,
    repathMs: 600,
    grenades: true,
  },
  merciless: {
    reactionMs: 45,
    fireIntervalMs: 780,
    burstCount: 6,
    burstSpacingMs: 95,
    aimErrorRadians: 0.012,
    leadFactor: 0.9,
    hoverSpeed: 220,
    standoffDistance: 205,
    repathMs: 420,
    grenades: true,
  },
};

export function getPracticeDifficulty(value: unknown): PracticeDifficulty {
  return value === "easy" ||
    value === "hard" ||
    value === "merciless" ||
    value === "normal"
    ? value
    : "normal";
}

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
