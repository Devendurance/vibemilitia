import Phaser from "phaser";
import type { GrenadeType } from "@/game/core/grenades";
import type { EffectsLevel } from "@/game/online/adaptiveQuality";

type ImpactKind = "player" | "drone" | "world";

export class EffectsSystem {
  private scene: Phaser.Scene;
  private reduced = false;
  private lime: Phaser.GameObjects.Particles.ParticleEmitter;
  private red: Phaser.GameObjects.Particles.ParticleEmitter;
  private copper: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private mint: Phaser.GameObjects.Particles.ParticleEmitter;
  private cream: Phaser.GameObjects.Particles.ParticleEmitter;
  private voxelLime: Phaser.GameObjects.Particles.ParticleEmitter;
  private voxelCopper: Phaser.GameObjects.Particles.ParticleEmitter;
  private voxelSky: Phaser.GameObjects.Particles.ParticleEmitter;
  private voxelCream: Phaser.GameObjects.Particles.ParticleEmitter;
  private voxelRed: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const burst = (
      texture: string,
      lifespanMin: number,
      lifespanMax: number,
      speedMin: number,
      speedMax: number,
      scale: number,
      blend = false,
    ) =>
      scene.add
        .particles(0, 0, texture, {
          speed: { min: speedMin, max: speedMax },
          lifespan: { min: lifespanMin, max: lifespanMax },
          scale: { start: scale, end: 0 },
          alpha: { start: 1, end: 0 },
          gravityY: 120,
          frequency: -1,
          quantity: 1,
          emitting: false,
          blendMode: blend ? "ADD" : "NORMAL",
        })
        .setDepth(45);

    this.lime = burst("spark-lime", 160, 380, 40, 260, 0.75, true);
    this.red = burst("spark-red", 160, 360, 40, 240, 0.75, true);
    this.copper = burst("spark-copper", 220, 480, 30, 200, 0.8);
    this.smoke = burst("spark-smoke", 380, 720, 20, 90, 1.1);
    this.mint = burst("spark-mint", 160, 380, 40, 200, 0.6, true);
    this.cream = burst("spark-cream", 140, 300, 30, 170, 0.55, true);
    const cube = (texture: string) =>
      scene.add
        .particles(0, 0, texture, {
          speed: { min: 90, max: 330 },
          lifespan: { min: 420, max: 820 },
          scale: { start: 1, end: 0.35 },
          alpha: { start: 1, end: 0 },
          gravityY: 980,
          rotate: { min: -180, max: 180 },
          frequency: -1,
          quantity: 1,
          emitting: false,
        })
        .setDepth(46);
    this.voxelLime = cube("voxel-lime");
    this.voxelCopper = cube("voxel-copper");
    this.voxelSky = cube("voxel-sky");
    this.voxelCream = cube("voxel-cream");
    this.voxelRed = cube("voxel-red");
  }

  bulletImpact(x: number, y: number, kind: ImpactKind): void {
    this.burst(this.lime, 4, x, y);
    this.burst(this.mint, 2, x, y);
    if (kind !== "world") {
      this.burst(this.copper, 3, x, y);
    }
    this.burst(this.smoke, 2, x, y);
  }

  muzzle(x: number, y: number, enemy = false): void {
    if (enemy) {
      this.burst(this.red, 2, x, y);
    } else {
      this.burst(this.lime, 2, x, y);
      this.burst(this.cream, 1, x, y);
    }
  }

  heavyMuzzle(x: number, y: number): void {
    this.burst(this.cream, 5, x, y);
    this.burst(this.copper, 4, x, y);
    this.burst(this.voxelCopper, 3, x, y);
    this.ring(x, y, 0xf4e21c);
  }

  rocketMuzzle(x: number, y: number): void {
    this.burst(this.copper, 6, x, y);
    this.burst(this.smoke, 5, x, y);
    this.burst(this.voxelCopper, 3, x, y);
    this.ring(x, y, 0xc7692f);
  }

  droneHit(x: number, y: number): void {
    this.burst(this.lime, 7, x, y);
    this.burst(this.copper, 5, x, y);
    this.burst(this.cream, 3, x, y);
  }

  droneDestroyed(x: number, y: number): void {
    this.burst(this.copper, 14, x, y);
    this.burst(this.red, 10, x, y);
    this.burst(this.lime, 8, x, y);
    this.burst(this.smoke, 10, x, y);
    this.ring(x, y, 0xc7692f);
  }

  playerDestroyed(x: number, y: number): void {
    this.mint.explode(16, x, y - 40);
    this.lime.explode(14, x, y - 40);
    this.cream.explode(10, x, y - 40);
    this.smoke.explode(12, x, y - 40);
    this.ring(x, y - 40, 0x9bd8f2);
    this.ring(x, y - 40, 0xd7ff2e);
  }

  /**
   * P3C elimination burst. A handful of one-shot voxel cubes, no continuous
   * emitter, so peak cost is bounded by a single elimination event.
   */
  eliminationBurst(
    x: number,
    y: number,
    kind: "impact" | "toxic" = "impact",
    style: "lime" | "copper" | "toxic" = kind === "toxic" ? "toxic" : "lime",
  ): void {
    this.burst(this.voxelLime, 11, x, y);
    this.burst(this.voxelCopper, 9, x, y);
    this.burst(this.voxelSky, 8, x, y);
    this.burst(this.voxelCream, 6, x, y);
    if (kind === "toxic" || style === "toxic") {
      this.burst(this.voxelRed, 8, x, y);
      this.burst(this.mint, 9, x, y);
    } else if (style === "copper") {
      this.burst(this.voxelCopper, 12, x, y);
      this.burst(this.voxelRed, 7, x, y);
      this.burst(this.smoke, 8, x, y);
    } else {
      this.burst(this.voxelRed, 6, x, y);
      this.burst(this.lime, 8, x, y);
    }
    this.burst(this.smoke, 7, x, y);
    this.ring(
      x,
      y,
      style === "copper" ? 0xc7692f : style === "toxic" ? 0x9bff5a : 0xd7ff2e,
    );
    this.ring(x, y, 0x9bd8f2);
  }

  lootExpired(x: number, y: number): void {
    this.burst(this.smoke, 3, x, y);
    this.burst(this.cream, 2, x, y);
    this.ring(x, y, 0x6f767e);
  }

  weaponSwap(x: number, y: number): void {
    this.burst(this.voxelSky, 7, x, y);
    this.burst(this.voxelCream, 5, x, y);
    this.burst(this.mint, 5, x, y);
    this.ring(x, y, 0x9bd8f2);
  }

  heavyImpact(x: number, y: number): void {
    this.burst(this.voxelCream, 8, x, y);
    this.burst(this.voxelCopper, 7, x, y);
    this.burst(this.voxelRed, 5, x, y);
    this.burst(this.smoke, 5, x, y);
    this.ring(x, y, 0xf4e21c);
  }

  rocketExplosion(x: number, y: number, radius: number): void {
    this.burst(this.voxelRed, 10, x, y);
    this.burst(this.voxelCopper, 9, x, y);
    this.burst(this.voxelCream, 6, x, y);
    this.burst(this.voxelLime, 4, x, y);
    this.burst(this.smoke, 6, x, y);
    this.burst(this.red, 6, x, y);
    this.burst(this.copper, 5, x, y);
    this.ring(x, y, 0xe5484d);
    this.ring(x, y, 0xf4e21c);
    const shock = this.scene.add
      .circle(x, y, Math.max(18, radius * 0.28), 0x000000, 0)
      .setStrokeStyle(4, 0xf4e21c, 0.75)
      .setDepth(44);
    this.scene.tweens.add({
      targets: shock,
      scale: radius / Math.max(18, radius * 0.28),
      alpha: 0,
      duration: 320,
      ease: "Cubic.Out",
      onComplete: () => shock.destroy(),
    });
  }

  spawn(x: number, y: number): void {
    this.mint.explode(12, x, y - 30);
    this.ring(x, y - 48, 0xd7ff2e);
    this.ring(x, y - 48, 0x9bd8f2);
  }

  pickupCollected(x: number, y: number): void {
    this.burst(this.mint, 9, x, y);
    this.burst(this.lime, 7, x, y);
    this.burst(this.cream, 5, x, y);
    this.ring(x, y, 0xd7ff2e);
  }

  heal(x: number, y: number): void {
    this.burst(this.mint, 8, x, y);
    this.burst(this.cream, 6, x, y);
    this.ring(x, y, 0x9bd8f2);
  }

  grenadeThrow(x: number, y: number, type: GrenadeType): void {
    if (type === "stinking") {
      this.burst(this.mint, 4, x, y);
      this.burst(this.lime, 2, x, y);
    } else {
      this.burst(this.copper, 3, x, y);
      this.burst(this.smoke, 2, x, y);
    }
  }

  toxicCloudCreated(x: number, y: number): void {
    this.burst(this.mint, 10, x, y);
    this.burst(this.lime, 8, x, y);
    this.burst(this.smoke, 4, x, y);
    this.ring(x, y, 0x9bff5a);
  }

  toxicCloudExpired(x: number, y: number): void {
    this.burst(this.mint, 5, x, y);
    this.burst(this.smoke, 4, x, y);
    this.ring(x, y, 0x6fbe2e);
  }

  toxicTick(x: number, y: number): void {
    this.burst(this.mint, 2, x, y);
  }

  grenadeExplosion(x: number, y: number, type: GrenadeType): void {
    const contact = type === "contact";
    this.red.explode(contact ? 18 : 14, x, y);
    this.copper.explode(contact ? 15 : 11, x, y);
    this.cream.explode(contact ? 10 : 8, x, y);
    this.smoke.explode(contact ? 12 : 10, x, y);
    this.ring(x, y, contact ? 0xff6b35 : 0xf4e21c);
    this.ring(x, y, 0xf5f3ec);
    if (contact) {
      this.ring(x, y, 0xff8a3d);
    }

    const flash = this.scene.add
      .circle(x, y, contact ? 18 : 20, 0xffd166, 0.95)
      .setDepth(50)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      scale: 6.5,
      alpha: 0,
      duration: contact ? 420 : 320,
      ease: "Cubic.Out",
      onComplete: () => flash.destroy(),
    });
  }

  ring(x: number, y: number, color: number): void {
    const ring = this.scene.add
      .circle(x, y, 18, 0x000000, 0)
      .setStrokeStyle(3, color, 0.9)
      .setDepth(52);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.3,
      alpha: 0,
      duration: 380,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
  }

  setLevel(level: EffectsLevel): void {
    this.reduced = level === "reduced";
  }

  private burst(
    emitter: Phaser.GameObjects.Particles.ParticleEmitter,
    count: number,
    x: number,
    y: number,
  ): void {
    emitter.explode(this.reduced ? Math.ceil(count / 2) : count, x, y);
  }

  damageNumber(x: number, y: number, amount: number, color = "#d7ff2e"): void {
    const label = this.scene.add
      .text(x, y, `-${Math.round(amount)}`, {
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: "15px",
        fontStyle: "bold",
        color,
        stroke: "#0c0d0f",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.scene.tweens.add({
      targets: label,
      y: y - 26,
      alpha: 0,
      duration: 620,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }

  healNumber(x: number, y: number, amount: number): void {
    const label = this.scene.add
      .text(x, y, `+${Math.round(amount)}`, {
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: "15px",
        fontStyle: "bold",
        color: "#d7ff2e",
        stroke: "#0c0d0f",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.scene.tweens.add({
      targets: label,
      y: y - 30,
      alpha: 0,
      duration: 760,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }

  hitMarker(x: number, y: number): void {
    const marker = this.scene.add
      .star(x, y, 4, 3, 8, 0xd7ff2e, 1)
      .setDepth(61)
      .setAngle(45);
    this.scene.tweens.add({
      targets: marker,
      scale: 1.8,
      alpha: 0,
      duration: 190,
      onComplete: () => marker.destroy(),
    });
  }
}
