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

function makeScatterWeapon(scene: Phaser.Scene): void {
  if (scene.textures.exists("weapon-scatter")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Thick twin-bore receiver with a copper break-action hinge.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(4, 5, 62, 18);
  g.fillStyle(0x8e4520, 1);
  g.fillRect(7, 8, 52, 12);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(10, 9, 42, 8);
  g.fillStyle(0xf4e21c, 1);
  g.fillRect(14, 10, 8, 4);
  g.fillRect(24, 10, 8, 4);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(54, 6, 18, 7);
  g.fillRect(54, 15, 18, 7);
  g.fillStyle(0x3d434b, 1);
  g.fillRect(56, 8, 14, 3);
  g.fillRect(56, 17, 14, 3);
  g.fillStyle(0x9bd8f2, 1);
  g.fillRect(70, 8, 3, 3);
  g.fillRect(70, 17, 3, 3);

  // Grip and stock.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(9, 19, 16, 11);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(12, 21, 10, 8);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(13, 22, 8, 2);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(2, 8, 5, 8);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(3, 10, 2, 4);

  g.generateTexture("weapon-scatter", 76, 30);
  g.destroy();
}

function makePrecisionWeapon(scene: Phaser.Scene): void {
  if (scene.textures.exists("weapon-precision")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Long graphite rail with a mint scope.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(4, 8, 70, 11);
  g.fillStyle(0x2a2e34, 1);
  g.fillRect(7, 10, 62, 7);
  g.fillStyle(0x3d434b, 1);
  g.fillRect(9, 10, 56, 2);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(58, 6, 18, 6);
  g.fillStyle(0x9bd8f2, 1);
  g.fillRect(60, 7, 13, 2);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(71, 8, 3, 3);

  // Scope.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(26, 1, 20, 8);
  g.fillStyle(0x1f2227, 1);
  g.fillRect(28, 2, 16, 6);
  g.fillStyle(0x9bd8f2, 1);
  g.fillRect(30, 3, 5, 3);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(38, 3, 4, 3);

  // Grip and energy cell.
  g.fillStyle(0x0c0d0f, 1);
  g.fillRect(11, 18, 14, 12);
  g.fillStyle(0xc7692f, 1);
  g.fillRect(13, 20, 10, 9);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(42, 11, 7, 5);
  g.fillStyle(0xf5f3ec, 1);
  g.fillRect(43, 12, 5, 2);

  g.generateTexture("weapon-precision", 76, 30);
  g.destroy();
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
  makeBullet(scene, "bullet-scatter", 0xc7692f, 0xf4e21c, 13, 8);
  makeBullet(scene, "bullet-precision", 0x9bd8f2, 0xf5f3ec, 34, 6);
  makeBullet(scene, "bullet-drone", 0xe5484d, 0xffb4b6);
  makeWeapon(scene);
  makeScatterWeapon(scene);
  makePrecisionWeapon(scene);
  makeMuzzleFlash(scene);
  makeDrone(scene);
  makeMedkitPickup(scene);
  makeGrenadeAssets(scene);
}

function makeMedkitPickup(scene: Phaser.Scene): void {
  if (scene.textures.exists("pickup-medkit")) return;
  const g = scene.add.graphics();
  g.clear();

  g.fillStyle(0xd7ff2e, 0.14);
  g.fillEllipse(26, 34, 46, 14);

  g.fillStyle(0x0c0d0f, 1);
  g.fillRoundedRect(4, 9, 44, 29, 5);
  g.fillStyle(0x16181c, 1);
  g.fillRoundedRect(6, 11, 40, 25, 4);

  g.fillStyle(0xc7692f, 1);
  g.fillRoundedRect(20, 4, 12, 9, 3);
  g.fillStyle(0x0c0d0f, 1);
  g.fillRoundedRect(23, 6, 6, 5, 2);

  g.fillStyle(0xf5f3ec, 1);
  g.fillRoundedRect(8, 13, 36, 20, 3);
  g.fillStyle(0xe5484d, 1);
  g.fillRect(23, 16, 6, 14);
  g.fillRect(19, 20, 14, 6);
  g.fillStyle(0xd7ff2e, 1);
  g.fillRect(8, 30, 36, 3);
  g.fillStyle(0xffffff, 0.55);
  g.fillRect(11, 15, 7, 2);
  g.fillStyle(0x0c0d0f, 0.32);
  g.fillRect(8, 33, 36, 1);

  g.generateTexture("pickup-medkit", 52, 42);
  g.destroy();
}

function makeGrenadeAssets(scene: Phaser.Scene): void {
  if (!scene.textures.exists("grenade-contact")) {
    const g = scene.add.graphics();
    g.fillStyle(0x0c0d0f, 1);
    g.fillCircle(13, 14, 11);
    g.fillStyle(0xe5484d, 1);
    g.fillCircle(13, 14, 9);
    g.fillStyle(0xff8a3d, 1);
    g.fillCircle(10, 11, 4);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(9, 10, 2);
    g.fillStyle(0xc7692f, 1);
    g.fillRect(9, 3, 8, 4);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRect(11, 1, 4, 3);
    g.generateTexture("grenade-contact", 26, 26);
    g.destroy();
  }

  if (!scene.textures.exists("grenade-frag")) {
    const g = scene.add.graphics();
    g.fillStyle(0x0c0d0f, 1);
    g.fillRoundedRect(5, 7, 16, 21, 6);
    g.fillStyle(0x566b32, 1);
    g.fillRoundedRect(7, 9, 12, 17, 4);
    g.fillStyle(0x2f3a1d, 1);
    g.fillRect(7, 14, 12, 3);
    g.fillStyle(0xc7692f, 1);
    g.fillRect(11, 3, 4, 6);
    g.fillStyle(0xf4e21c, 1);
    g.fillRect(9, 10, 2, 2);
    g.fillStyle(0xf5f3ec, 0.55);
    g.fillRect(9, 10, 3, 2);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRect(14, 1, 4, 3);
    g.generateTexture("grenade-frag", 26, 30);
    g.destroy();
  }

  if (!scene.textures.exists("pickup-grenade-contact")) {
    const g = scene.add.graphics();
    g.fillStyle(0xd7ff2e, 0.14);
    g.fillEllipse(26, 34, 46, 14);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRoundedRect(4, 9, 44, 29, 5);
    g.fillStyle(0x1f2227, 1);
    g.fillRoundedRect(6, 11, 40, 25, 4);
    g.fillStyle(0x0c0d0f, 1);
    g.fillCircle(26, 23, 11);
    g.fillStyle(0xe5484d, 1);
    g.fillCircle(26, 23, 9);
    g.fillStyle(0xff8a3d, 1);
    g.fillCircle(23, 20, 4);
    g.fillStyle(0xc7692f, 1);
    g.fillRect(22, 10, 8, 4);
    g.fillStyle(0xd7ff2e, 1);
    g.fillRect(8, 31, 36, 3);
    g.generateTexture("pickup-grenade-contact", 52, 42);
    g.destroy();
  }

  if (!scene.textures.exists("pickup-grenade-frag")) {
    const g = scene.add.graphics();
    g.fillStyle(0xf4e21c, 0.12);
    g.fillEllipse(26, 34, 46, 14);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRoundedRect(4, 9, 44, 29, 5);
    g.fillStyle(0x2a2e34, 1);
    g.fillRoundedRect(6, 11, 40, 25, 4);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRoundedRect(19, 14, 14, 18, 5);
    g.fillStyle(0x566b32, 1);
    g.fillRoundedRect(21, 16, 10, 14, 4);
    g.fillStyle(0x2f3a1d, 1);
    g.fillRect(21, 21, 10, 3);
    g.fillStyle(0xc7692f, 1);
    g.fillRect(24, 11, 4, 5);
    g.fillStyle(0xf4e21c, 1);
    g.fillRect(8, 31, 36, 3);
    g.generateTexture("pickup-grenade-frag", 52, 42);
    g.destroy();
  }
}
