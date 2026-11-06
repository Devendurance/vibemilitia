import Phaser from "phaser";
import type { ArenaDefinition, PlatformDefinition, PlatformStyle } from "@/game/arena/arena";
import type { Rect } from "@/game/arena/collision";

interface Palette {
  base: number;
  top: number;
  highlight: number;
  shadow: number;
  accent: number;
}

const PALETTES: Record<PlatformStyle, Palette> = {
  ground: {
    base: 0xb85f2c,
    top: 0x78bf38,
    highlight: 0xd7ff2e,
    shadow: 0x7c3c20,
    accent: 0x2f7c79,
  },
  grass: {
    base: 0x5f9f33,
    top: 0x9edb3c,
    highlight: 0xd7ff2e,
    shadow: 0x2f6b2a,
    accent: 0xc7692f,
  },
  stone: {
    base: 0x5c6168,
    top: 0x9aa0a7,
    highlight: 0xc9cdd2,
    shadow: 0x3d434b,
    accent: 0xd7ff2e,
  },
  copper: {
    base: 0xa55227,
    top: 0xd88945,
    highlight: 0xf4e21c,
    shadow: 0x70351c,
    accent: 0x9bd8f2,
  },
  crate: {
    base: 0xa55227,
    top: 0xcf7c3a,
    highlight: 0xf4e21c,
    shadow: 0x6d3219,
    accent: 0xd7ff2e,
  },
};

export interface ArenaBuildResult {
  collisionObjects: Phaser.GameObjects.GameObject[];
  platformRects: Rect[];
}

function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawCloud(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
  const blocks = [
    [-36, 0, 52, 18],
    [-8, -12, 48, 30],
    [28, 2, 40, 16],
    [-68, 8, 38, 12],
    [10, 12, 64, 14],
  ];
  g.fillStyle(0xf5f3ec, 0.82);
  for (const [bx, by, bw, bh] of blocks) {
    g.fillRect(x + bx * scale, y + by * scale, bw * scale, bh * scale);
  }
  g.fillStyle(0x9bd8f2, 0.42);
  for (const [bx, by, bw, bh] of blocks) {
    g.fillRect(x + bx * scale, y + (by + bh) * scale, bw * scale, 4 * scale);
  }
}

function drawFloatingIsland(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  scale: number,
): void {
  const height = 18 * scale;
  g.fillStyle(0x0c0d0f, 0.12);
  g.fillRect(x + 12, y + 28, width, 10);
  g.fillStyle(0x3c8a76, 0.75);
  g.fillRect(x, y, width, height);
  g.fillStyle(0x78bf38, 0.85);
  g.fillRect(x, y - 4, width, 7);
  g.fillStyle(0x2f6b5c, 0.85);
  g.fillTriangle(x + width * 0.12, y + height, x + width * 0.5, y + height + 50 * scale, x + width * 0.88, y + height);
  g.fillStyle(0x2a4c50, 0.55);
  g.fillRect(x + width * 0.2, y + height + 18 * scale, width * 0.32, 8 * scale);
  g.fillRect(x + width * 0.58, y + height + 30 * scale, width * 0.16, 6 * scale);
  g.fillStyle(0x0c0d0f, 0.35);
  g.fillRect(x, y + height - 2, width, 3);
  // A tiny voxel tree.
  g.fillStyle(0x2f6b2a, 0.9);
  g.fillRect(x + width * 0.66, y - 24 * scale, 5 * scale, 24 * scale);
  g.fillStyle(0x5f9f33, 0.9);
  g.fillRect(x + width * 0.62, y - 34 * scale, 16 * scale, 12 * scale);
  g.fillStyle(0x9edb3c, 0.9);
  g.fillRect(x + width * 0.63, y - 35 * scale, 9 * scale, 4 * scale);
}

function bakeLayer(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  scrollFactor: number,
  depth: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  if (!scene.textures.exists(key)) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
  return scene.add
    .image(x, y, key)
    .setOrigin(0, 0)
    .setScrollFactor(scrollFactor)
    .setDepth(depth);
}

function drawBackground(scene: Phaser.Scene): void {
  bakeLayer(scene, "arena-sky", 1440, 810, 0, -1000, (sky) => {
    sky.fillGradientStyle(0x82cdef, 0x9bd8f2, 0xe9f8ef, 0xf5f3ec, 1, 1, 1, 1);
    sky.fillRect(0, 0, 1440, 810);
    sky.fillStyle(0xf4e21c, 0.12);
    sky.fillCircle(880, 168, 112);
    sky.fillStyle(0xf4e21c, 0.2);
    sky.fillCircle(880, 168, 86);
    sky.fillStyle(0xf5f3ec, 0.95);
    sky.fillCircle(880, 168, 62);
    sky.fillStyle(0xf4e21c, 0.9);
    sky.fillRect(852, 138, 22, 22);
  });

  bakeLayer(scene, "arena-clouds", 3800, 320, 0.08, -960, (clouds) => {
    drawCloud(clouds, 180, 120, 1.1);
    drawCloud(clouds, 700, 210, 0.7);
    drawCloud(clouds, 1210, 86, 0.9);
    drawCloud(clouds, 1780, 180, 1.0);
    drawCloud(clouds, 2440, 110, 0.8);
    drawCloud(clouds, 3050, 220, 1.1);
    drawCloud(clouds, 3520, 120, 0.7);
  });

  bakeLayer(scene, "arena-islands", 3800, 680, 0.18, -930, (islands) => {
    drawFloatingIsland(islands, 210, 410, 250, 1);
    drawFloatingIsland(islands, 790, 300, 190, 0.72);
    drawFloatingIsland(islands, 1290, 485, 280, 0.9);
    drawFloatingIsland(islands, 1900, 330, 230, 0.8);
    drawFloatingIsland(islands, 2520, 440, 300, 1.05);
    drawFloatingIsland(islands, 3200, 300, 210, 0.7);
  });

  bakeLayer(scene, "arena-skyline", 3500, 1320, 0.34, -900, (skyline) => {
    const towers = [
      [120, 720, 190, 560, 0.5],
      [340, 830, 130, 430, 0.38],
      [610, 680, 230, 610, 0.45],
      [1010, 780, 160, 500, 0.34],
      [1300, 620, 280, 660, 0.42],
      [1720, 840, 150, 430, 0.35],
      [2060, 700, 250, 560, 0.48],
      [2450, 800, 170, 470, 0.32],
      [2840, 660, 300, 620, 0.45],
      [3250, 780, 190, 490, 0.36],
    ];
    for (const [x, y, width, height, alpha] of towers) {
      skyline.fillStyle(0x2f7c79, alpha);
      skyline.fillRect(x, y, width, height);
      skyline.fillStyle(0x9bd8f2, alpha * 0.55);
      for (let row = 0; row < Math.floor(height / 70); row += 1) {
        for (let col = 0; col < Math.max(1, Math.floor(width / 64)); col += 1) {
          if (hash01(row * 31 + col * 17 + x) > 0.45) {
            skyline.fillRect(x + 18 + col * 64, y + 22 + row * 70, 24, 10);
          }
        }
      }
      skyline.fillStyle(0x0c0d0f, 0.12);
      skyline.fillRect(x, y, 8, height);
    }

    skyline.fillStyle(0x2f6b5c, 0.5);
    skyline.fillRect(1460, 470, 56, 520);
    skyline.fillRect(1830, 470, 56, 520);
    skyline.fillRect(1460, 470, 426, 64);
    skyline.fillStyle(0x9bd8f2, 0.32);
    skyline.fillRect(1516, 534, 314, 18);
  });

  if (!scene.textures.exists("arena-haze")) {
    const haze = scene.make.graphics({ x: 0, y: 0 }, false);
    haze.fillGradientStyle(0xf5f3ec, 0xf5f3ec, 0xf5f3ec, 0xf5f3ec, 0, 0, 0.48, 0.48);
    haze.fillRect(0, 0, 1, 320);
    haze.generateTexture("arena-haze", 1, 320);
    haze.destroy();
  }
  scene.add
    .image(0, 560, "arena-haze")
    .setOrigin(0, 0)
    .setDisplaySize(4300, 320)
    .setScrollFactor(0.42)
    .setDepth(-890);
}

function drawBlock(
  g: Phaser.GameObjects.Graphics,
  platform: PlatformDefinition,
  palette: Palette,
): void {
  const { x, y, width, height, style } = platform;
  g.fillStyle(0x0c0d0f, 0.14);
  g.fillRect(x + 10, y + 16, width, height);

  g.fillStyle(0x101216, 1);
  g.fillRect(x - 3, y - 3, width + 6, height + 6);
  g.fillStyle(palette.base, 1);
  g.fillRect(x, y, width, height);

  const topHeight = style === "ground" ? 16 : Math.min(12, height * 0.28);
  g.fillStyle(palette.top, 1);
  g.fillRect(x, y, width, topHeight);
  g.fillStyle(palette.highlight, 0.85);
  g.fillRect(x, y, width, 3);
  g.fillStyle(0x0c0d0f, 0.2);
  g.fillRect(x, y + topHeight, width, 2);

  if (height > 24) {
    g.fillStyle(palette.shadow, 0.8);
    g.fillRect(x, y + height - Math.min(8, height * 0.16), width, Math.min(8, height * 0.16));
  }

  // Chunky voxel seams.
  for (let seam = 86; seam < width; seam += 86) {
    const jitter = hash01(x + seam) * 16;
    g.fillStyle(0x0c0d0f, 0.13);
    g.fillRect(x + seam, y + topHeight + 6 + jitter, 2, Math.max(3, height - topHeight - 18));
  }

  if (style === "ground") {
    for (let i = 0; i < Math.floor(width / 120); i += 1) {
      const bx = x + 26 + i * 120 + hash01(i + x) * 50;
      const by = y + 42 + hash01(i * 3 + x) * Math.max(10, height - 82);
      const size = 8 + hash01(i * 7 + x) * 20;
      g.fillStyle(0x8e4520, 0.8);
      g.fillRect(bx, by, size, size * 0.7);
      g.fillStyle(0xf5f3ec, 0.12);
      g.fillRect(bx + 2, by + 2, size * 0.5, 2);
    }
    g.fillStyle(0x2f7c79, 0.55);
    g.fillRect(x + 1200, y + 24, 180, 10);
    g.fillRect(x + 2480, y + 24, 220, 10);
    g.fillStyle(0x9bd8f2, 0.5);
    g.fillRect(x + 1210, y + 26, 160, 3);
    g.fillRect(x + 2490, y + 26, 200, 3);
  }

  // Grass tufts and moss.
  if (style === "ground" || style === "grass") {
    for (let i = 0; i < Math.floor(width / 46); i += 1) {
      const tx = x + 18 + i * 46 + hash01(i + x) * 18;
      const th = 4 + hash01(i * 5 + x) * 10;
      g.fillStyle(palette.highlight, 0.9);
      g.fillRect(tx, y - th, 5, th);
      g.fillStyle(palette.top, 0.8);
      g.fillRect(tx + 8, y - th * 0.6, 4, th * 0.6);
    }
  }

  if (style === "copper" || style === "crate") {
    g.fillStyle(0x0c0d0f, 0.25);
    g.fillRect(x + 12, y + topHeight + 6, width - 24, 4);
    for (let i = 0; i < Math.floor(width / 60); i += 1) {
      g.fillStyle(palette.highlight, 0.95);
      g.fillRect(x + 20 + i * 60, y + topHeight + 5, 6, 6);
    }
    if (style === "crate") {
      g.fillStyle(0x0c0d0f, 0.3);
      g.fillRect(x + width * 0.3, y + topHeight + 6, 6, height - topHeight - 10);
      g.fillRect(x + width * 0.7, y + topHeight + 6, 6, height - topHeight - 10);
      g.fillStyle(palette.accent, 0.9);
      g.fillRect(x + 10, y + height - 18, width - 20, 5);
    }
  }

  if (style === "stone") {
    g.lineStyle(2, 0xc9cdd2, 0.22);
    for (let i = 0; i < Math.floor(width / 100); i += 1) {
      const sx = x + 30 + i * 100;
      g.lineBetween(sx, y + 20, sx + 14, y + Math.max(26, height - 10));
    }
    for (let i = 0; i < Math.floor(width / 130); i += 1) {
      g.fillStyle(palette.accent, 0.45);
      g.fillRect(x + 40 + i * 130, y + topHeight - 4, 12, 4);
    }
  }

  // Hanging roots and crystals under floating slabs.
  if (style !== "ground" && height <= 60) {
    for (let i = 0; i < Math.floor(width / 110); i += 1) {
      const hx = x + 34 + i * 110 + hash01(i + y) * 40;
      const hh = 8 + hash01(i * 3 + y) * 20;
      g.fillStyle(style === "stone" ? 0x9bd8f2 : 0x2f6b2a, 0.55);
      g.fillRect(hx, y + height, 4, hh);
      g.fillRect(hx + 6, y + height + 4, 3, hh * 0.6);
    }
  }

  // Corner bolts.
  for (const bx of [x + 8, x + width - 12]) {
    for (const by of [y + 8, y + Math.max(12, height - 12)]) {
      g.fillStyle(0x0c0d0f, 0.4);
      g.fillRect(bx, by, 4, 4);
    }
  }
}

function drawArenaDecorGraphics(
  arena: ArenaDefinition,
  g: Phaser.GameObjects.Graphics,
): void {
  // Ground edge chevrons.
  for (let i = 0; i < 12; i += 1) {
    const x = 46 + i * 290;
    g.fillStyle(0x0c0d0f, 0.75);
    g.fillRect(x, arena.groundY + 26, 100, 18);
    g.fillStyle(0xf4e21c, 0.95);
    g.fillTriangle(x + 6, arena.groundY + 42, x + 28, arena.groundY + 30, x + 50, arena.groundY + 42);
    g.fillStyle(0x0c0d0f, 1);
    g.fillRect(x + 58, arena.groundY + 30, 8, 12);
    g.fillRect(x + 72, arena.groundY + 30, 8, 12);
    g.fillRect(x + 86, arena.groundY + 30, 8, 12);
  }

  // Big luminous spawn pad.
  const spawn = arena.playerSpawn;
  g.fillStyle(0x0c0d0f, 0.55);
  g.fillRect(spawn.x - 55, spawn.y - 7, 110, 10);
  g.fillStyle(0xd7ff2e, 0.95);
  g.fillRect(spawn.x - 48, spawn.y - 6, 96, 4);
  g.fillStyle(0x9bd8f2, 0.8);
  g.fillRect(spawn.x - 28, spawn.y - 2, 56, 3);
  for (const offset of [-72, 72]) {
    g.fillStyle(0x0c0d0f, 1);
    g.fillRect(spawn.x + offset - 10, spawn.y - 24, 20, 25);
    g.fillStyle(0xd7ff2e, 1);
    g.fillRect(spawn.x + offset - 6, spawn.y - 20, 12, 4);
    g.fillRect(spawn.x + offset - 6, spawn.y - 11, 12, 4);
  }

  // Edge warning columns.
  for (const side of [0, arena.width - 24]) {
    g.fillStyle(0x0c0d0f, 0.95);
    g.fillRect(side, 0, 24, arena.height);
    g.fillStyle(0xf4e21c, 0.9);
    for (let y = 36; y < arena.height; y += 54) {
      g.fillRect(side + 4, y, 16, 18);
      g.fillStyle(0x0c0d0f, 1);
      g.fillRect(side + 4, y + 18, 16, 8);
      g.fillStyle(0xf4e21c, 0.9);
    }
  }

  // Lamp posts at the bridge and right route.
  const lamps = [
    { x: 1300, y: 960 },
    { x: 1760, y: 960 },
    { x: 2540, y: 940 },
    { x: 3200, y: 740 },
  ];
  for (const lamp of lamps) {
    g.fillStyle(0x0c0d0f, 1);
    g.fillRect(lamp.x - 3, lamp.y - 54, 6, 54);
    g.fillStyle(0x2e333a, 1);
    g.fillRect(lamp.x - 10, lamp.y - 62, 20, 10);
    g.fillStyle(0xd7ff2e, 0.95);
    g.fillRect(lamp.x - 6, lamp.y - 58, 12, 5);
  }

  // Scattered voxel plants and rocks.
  const plants = [340, 980, 1260, 1830, 2330, 2760, 3120, 3440];
  for (let i = 0; i < plants.length; i += 1) {
    const x = plants[i];
    const h = 18 + hash01(i * 5) * 22;
    g.fillStyle(0x0c0d0f, 0.3);
    g.fillRect(x + 2, arena.groundY - h + 3, 12, h);
    g.fillStyle(0x2f6b2a, 1);
    g.fillRect(x, arena.groundY - h, 10, h);
    g.fillStyle(0x9edb3c, 1);
    g.fillRect(x - 8, arena.groundY - h, 14, 5);
    g.fillRect(x + 3, arena.groundY - h - 8, 6, 8);
    g.fillStyle(0xd7ff2e, 0.9);
    g.fillRect(x + 4, arena.groundY - h - 6, 3, 3);
  }
}

function createArenaDecorActors(scene: Phaser.Scene, arena: ArenaDefinition): void {
  const spawn = arena.playerSpawn;
  const spawnText = scene.add
    .text(spawn.x, spawn.y - 34, "DEPLOY 01", {
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: "10px",
      color: "#d7ff2e",
      letterSpacing: 2,
    })
    .setOrigin(0.5)
    .setDepth(9);
  scene.tweens.add({
    targets: spawnText,
    alpha: { from: 0.45, to: 1 },
    duration: 1200,
    yoyo: true,
    repeat: -1,
    ease: "Sine.InOut",
  });

  const lamps = [
    { x: 1300, y: 960 },
    { x: 1760, y: 960 },
    { x: 2540, y: 940 },
    { x: 3200, y: 740 },
  ];
  for (const lamp of lamps) {
    const glow = scene.add
      .image(lamp.x, lamp.y - 56, "fx-glow")
      .setTint(0xd7ff2e)
      .setDisplaySize(52, 52)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.3, to: 0.9 },
      duration: 1700 + hash01(lamp.x) * 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
}

function createAmbientCubes(scene: Phaser.Scene): void {
  const positions = [
    [420, 610, 22],
    [1030, 520, 14],
    [1470, 420, 18],
    [1970, 500, 12],
    [2710, 600, 20],
    [3260, 470, 16],
    [3520, 640, 12],
  ];
  for (let i = 0; i < positions.length; i += 1) {
    const [x, y, size] = positions[i];
    const cube = scene.add.container(x, y).setDepth(-840).setScrollFactor(0.62);
    const back = scene.add.rectangle(0, 0, size, size, i % 2 === 0 ? 0x9bd8f2 : 0xd7ff2e, 0.42);
    back.setStrokeStyle(2, 0x0c0d0f, 0.3);
    const front = scene.add.rectangle(size * 0.32, size * 0.32, size * 0.55, size * 0.55, 0xf5f3ec, 0.4);
    cube.add([back, front]);
    scene.tweens.add({
      targets: cube,
      y: y - 18 - (i % 3) * 6,
      angle: i % 2 === 0 ? 4 : -4,
      duration: 2600 + i * 410,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
}

export function buildArena(scene: Phaser.Scene, arena: ArenaDefinition): ArenaBuildResult {
  drawBackground(scene);

  const collisionObjects: Phaser.GameObjects.GameObject[] = [];
  const platformRects: Rect[] = [];

  bakeLayer(scene, "arena-static", arena.width, arena.height, 1, 5, (graphics) => {
    for (const platform of arena.platforms) {
      drawBlock(graphics, platform, PALETTES[platform.style]);
    }
    drawArenaDecorGraphics(arena, graphics);
  });

  for (const platform of arena.platforms) {
    platformRects.push({
      x: platform.x,
      y: platform.y,
      width: platform.width,
      height: platform.height,
    });

    const zone = scene.add.zone(
      platform.x + platform.width / 2,
      platform.y + platform.height / 2,
      platform.width,
      platform.height,
    );
    scene.physics.add.existing(zone, true);
    collisionObjects.push(zone);
  }

  createArenaDecorActors(scene, arena);
  createAmbientCubes(scene);

  const spawn = arena.playerSpawn;
  const spawnGlow = scene.add
    .image(spawn.x, spawn.y, "fx-glow")
    .setTint(0xd7ff2e)
    .setDisplaySize(140, 26)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(8);
  scene.tweens.add({
    targets: spawnGlow,
    alpha: { from: 0.3, to: 0.8 },
    duration: 1500,
    yoyo: true,
    repeat: -1,
    ease: "Sine.InOut",
  });

  return { collisionObjects, platformRects };
}
