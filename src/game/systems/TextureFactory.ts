import Phaser from "phaser";

function makeSpark(scene: Phaser.Scene, key: string, color: number, size: number): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(color, 1);
  graphics.fillRect(0, 0, size, size);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
}

function makeVoxel(
  scene: Phaser.Scene,
  key: string,
  color: number,
  size: number,
): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(color, 1);
  graphics.fillRect(0, 0, size, size);
  graphics.fillStyle(0xf5f3ec, 0.28);
  graphics.fillRect(1, 1, size - 2, 2);
  graphics.fillStyle(0x0c0d0f, 0.24);
  graphics.fillRect(1, size - 3, size - 2, 2);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
}

function makeBullet(
  scene: Phaser.Scene,
  key: string,
  glow: number,
  core: number,
  width = 22,
  height = 10,
): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(glow, 0.32);
  graphics.fillRect(0, 0, width, height);
  graphics.fillStyle(glow, 1);
  graphics.fillRect(1, 2, width - 3, height - 4);
  graphics.fillStyle(core, 1);
  graphics.fillRect(4, Math.floor(height * 0.3), width - 8, Math.max(2, Math.floor(height * 0.4)));
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function makeMuzzleFlash(scene: Phaser.Scene): void {
  if (scene.textures.exists("muzzle-flash")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xd7ff2e, 0.9);
  g.fillTriangle(0, 13, 32, 0, 24, 13);
  g.fillTriangle(0, 13, 32, 26, 24, 13);
  g.fillStyle(0xf5f3ec, 1);
  g.fillTriangle(4, 13, 22, 6, 17, 13);
  g.fillTriangle(4, 13, 22, 20, 17, 13);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(0, 10, 7, 6);
  g.generateTexture("muzzle-flash", 34, 26);
  g.destroy();
}

function makeDrone(scene: Phaser.Scene): void {
  if (scene.textures.exists("drone-body")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Rotor arms.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(2, 14, 20, 6);
  g.fillRect(62, 14, 20, 6);
  g.fillStyle(0x9bd8f2, 0.8);
  g.fillRect(0, 12, 24, 3);
  g.fillRect(60, 12, 24, 3);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(4, 22, 12, 4);
  g.fillRect(68, 22, 12, 4);

  // Chassis.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(17, 11, 50, 37);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(20, 14, 44, 31);
  g.fillStyle(0x8e4520, 1);
  g.fillRect(20, 38, 44, 7);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(23, 16, 38, 4);

  // Eye socket and red optic.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(31, 22, 22, 13);
  g.fillStyle(0xe5484d, 1);
  g.fillRect(35, 25, 14, 7);
  g.fillStyle(0xffb4b6, 1);
  g.fillRect(38, 26, 4, 3);

  // Vents and counterweight.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(24, 42, 6, 5);
  g.fillRect(34, 42, 6, 5);
  g.fillRect(44, 42, 6, 5);
  g.fillRect(54, 42, 6, 5);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(28, 8, 4, 5);
  g.fillRect(56, 8, 4, 5);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(64, 28, 8, 10);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(66, 30, 4, 6);

  g.generateTexture("drone-body", 84, 52);
  g.destroy();
}

/**
 * Baked rings and shadows. These replace per-frame Arc and Ellipse shapes, so
 * dozens of glows cost one quad each instead of a re-tessellated stroked path.
 */
function makeBakedEffects(scene: Phaser.Scene): void {
  const bake = (
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ) => {
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  };
  bake("fx-pickup-ring", 96, 96, (g) => {
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(48, 48, 44);
    g.lineStyle(3, 0xffffff, 0.55);
    g.strokeCircle(48, 48, 44);
  });
  bake("fx-shield-ring", 128, 128, (g) => {
    g.lineStyle(4, 0xd7ff2e, 0.85);
    g.strokeCircle(64, 64, 60);
  });
  bake("fx-ground-ring", 128, 40, (g) => {
    g.lineStyle(4, 0xd7ff2e, 0.9);
    g.strokeEllipse(64, 20, 120, 32);
  });
  bake("fx-shadow", 96, 28, (g) => {
    g.fillStyle(0x0c0d0f, 0.26);
    g.fillEllipse(48, 14, 92, 24);
  });
  bake("fx-glow", 64, 64, (g) => {
    for (let radius = 30; radius > 2; radius -= 4) {
      g.fillStyle(0xffffff, 0.05);
      g.fillCircle(32, 32, radius);
    }
  });
}

export function createGameTextures(scene: Phaser.Scene): void {
  makeBakedEffects(scene);
  makeSpark(scene, "spark-lime", 0xd7ff2e, 6);
  makeSpark(scene, "spark-mint", 0x9bd8f2, 6);
  makeSpark(scene, "spark-copper", 0xc7692f, 6);
  makeSpark(scene, "spark-red", 0xe5484d, 6);
  makeSpark(scene, "spark-smoke", 0x9aa0a7, 9);
  makeSpark(scene, "spark-cream", 0xf5f3ec, 5);
  makeVoxel(scene, "voxel-lime", 0xd7ff2e, 11);
  makeVoxel(scene, "voxel-copper", 0xc7692f, 10);
  makeVoxel(scene, "voxel-sky", 0x9bd8f2, 9);
  makeVoxel(scene, "voxel-cream", 0xf5f3ec, 8);
  makeVoxel(scene, "voxel-red", 0xe5484d, 10);
  makeBullet(scene, "bullet-drone", 0xe5484d, 0xffb4b6);
  makeMuzzleFlash(scene);
  makeDrone(scene);
}
