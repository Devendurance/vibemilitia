import Phaser from "phaser";

function makeSpark(scene: Phaser.Scene, key: string, color: number, size: number): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(color, 1);
  graphics.fillRect(0, 0, size, size);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
}

function makeBullet(
  scene: Phaser.Scene,
  key: string,
  glow: number,
  core: number,
): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(glow, 0.32);
  graphics.fillRect(0, 0, 22, 10);
  graphics.fillStyle(glow, 1);
  graphics.fillRect(1, 2, 19, 6);
  graphics.fillStyle(core, 1);
  graphics.fillRect(4, 3, 14, 4);
  graphics.generateTexture(key, 22, 10);
  graphics.destroy();
}

function makeWeapon(scene: Phaser.Scene): void {
  if (scene.textures.exists("weapon-player")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Grip and stock.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(8, 12, 14, 16);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(10, 14, 10, 12);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(11, 15, 8, 3);

  // Graphite receiver.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(4, 4, 60, 15);
  g.fillStyle(0x2a2e34, 1);
  g.fillRect(6, 6, 56, 11);
  g.fillStyle(0x3d434b, 1);
  g.fillRect(8, 7, 52, 3);
  g.fillStyle(0x16181c, 1);
  g.fillRect(24, 10, 24, 6);

  // Lime energy cell and vent slits.
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(18, 8, 6, 7);
  g.fillStyle(0x9bd8f2, 1);
  g.fillRect(28, 8, 3, 7);
  g.fillRect(34, 8, 3, 7);
  g.fillRect(40, 8, 3, 7);

  // Barrel, brake and copper collar.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(58, 7, 14, 8);
  g.fillStyle(0x3d434b, 1);
  g.fillRect(59, 8, 11, 5);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(63, 6, 4, 9);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(70, 8, 3, 5);

  // Sight.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(34, 1, 10, 5);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(37, 2, 4, 2);

  g.generateTexture("weapon-player", 76, 30);
  g.destroy();
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

export function createGameTextures(scene: Phaser.Scene): void {
  makeSpark(scene, "spark-lime", 0xd7ff2e, 6);
  makeSpark(scene, "spark-mint", 0x9bd8f2, 6);
  makeSpark(scene, "spark-copper", 0xc7692f, 6);
  makeSpark(scene, "spark-red", 0xe5484d, 6);
  makeSpark(scene, "spark-smoke", 0x9aa0a7, 9);
  makeSpark(scene, "spark-cream", 0xf5f3ec, 5);
  makeBullet(scene, "bullet-player", 0xd7ff2e, 0xf5f3ec);
  makeBullet(scene, "bullet-drone", 0xe5484d, 0xffb4b6);
  makeWeapon(scene);
  makeMuzzleFlash(scene);
  makeDrone(scene);
}
