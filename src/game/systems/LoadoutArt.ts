import type Phaser from "phaser";

/** The approved art is exported at 2x, so every image draws at half its size. */
export const ART_SCALE = 0.5;

interface WeaponAnchor {
  /** Fractions of the texture, placing the barrel on the aim line. */
  originX: number;
  originY: number;
  /** Barrel tip, in world units from the weapon pivot. */
  muzzleX: number;
}

/**
 * Measured from the exported art by scripts/export-sprites.py. The grip sits so
 * each barrel ends as close as the art allows to 66 units, where the server
 * spawns bullets. Long guns reach back over the shoulder, short ones stop short.
 */
export const WEAPON_ANCHORS: Record<string, WeaponAnchor> = {
  "weapon-player": { originX: 0.108, originY: 0.433, muzzleX: 66 },
  "weapon-scatter": { originX: 0.008, originY: 0.433, muzzleX: 66 },
  "weapon-precision": { originX: 0.132, originY: 0.434, muzzleX: 66 },
  "weapon-akimbo": { originX: 0, originY: 0.382, muzzleX: 64 },
  "weapon-akimbo-b": { originX: 0, originY: 0.391, muzzleX: 64 },
  "weapon-smg": { originX: 0, originY: 0.389, muzzleX: 58 },
  "weapon-cannon": { originX: 0.25, originY: 0.453, muzzleX: 66 },
  "weapon-rocket": { originX: 0.283, originY: 0.459, muzzleX: 66 },
};

const LOADOUT_FILES: Record<string, string> = {
  "weapon-player": "vibe-rifle",
  "weapon-scatter": "scatter-blaster",
  "weapon-precision": "vibe-lance",
  "weapon-akimbo": "akimbo-single-a",
  "weapon-akimbo-b": "akimbo-single-b",
  "weapon-smg": "vibe-smg",
  "weapon-cannon": "heavy-cannon",
  "weapon-rocket": "rocket-launcher",
  "grenade-contact": "grenade-contact",
  "grenade-frag": "grenade-frag",
  "grenade-stinking": "grenade-stinking",
  "pickup-medkit": "pickup-medkit",
  "pickup-grenade-contact": "pickup-grenade-contact",
  "pickup-grenade-frag": "pickup-grenade-frag",
  "pickup-grenade-stinking": "pickup-grenade-stinking",
};

const PROJECTILE_FILES: Record<string, string> = {
  "bullet-player": "proj-bullet-player",
  "bullet-scatter": "proj-bullet-scatter",
  "bullet-precision": "proj-bullet-precision",
  "bullet-akimbo": "proj-bullet-akimbo",
  "bullet-smg": "proj-bullet-smg",
  "bullet-heavy": "proj-bullet-heavy",
  "rocket-projectile": "proj-rocket-projectile",
};

/**
 * Call from a scene's `preload`. `createGameTextures` runs in `create` and no
 * longer draws these keys, so nothing else provides them. The exists check keeps
 * a scene restart from queueing a key the texture manager already holds.
 */
export function preloadLoadoutArt(scene: Phaser.Scene): void {
  for (const [key, file] of Object.entries(LOADOUT_FILES)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `/sprites/loadout/${file}.png`);
    }
  }
  for (const [key, file] of Object.entries(PROJECTILE_FILES)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `/sprites/projectiles/${file}.png`);
    }
  }
}
