import Phaser from "phaser";

type ImpactKind = "player" | "drone" | "world";

export class EffectsSystem {
  private scene: Phaser.Scene;
  private lime: Phaser.GameObjects.Particles.ParticleEmitter;
  private red: Phaser.GameObjects.Particles.ParticleEmitter;
  private copper: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private mint: Phaser.GameObjects.Particles.ParticleEmitter;
  private cream: Phaser.GameObjects.Particles.ParticleEmitter;

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
  }

  bulletImpact(x: number, y: number, kind: ImpactKind): void {
    this.lime.explode(4, x, y);
    this.mint.explode(2, x, y);
    if (kind !== "world") {
      this.copper.explode(3, x, y);
    }
    this.smoke.explode(2, x, y);
  }

  muzzle(x: number, y: number, enemy = false): void {
    if (enemy) {
      this.red.explode(2, x, y);
    } else {
      this.lime.explode(2, x, y);
      this.cream.explode(1, x, y);
    }
  }

  droneHit(x: number, y: number): void {
    this.lime.explode(7, x, y);
    this.copper.explode(5, x, y);
    this.cream.explode(3, x, y);
  }

  droneDestroyed(x: number, y: number): void {
    this.copper.explode(14, x, y);
    this.red.explode(10, x, y);
    this.lime.explode(8, x, y);
    this.smoke.explode(10, x, y);
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

  spawn(x: number, y: number): void {
    this.mint.explode(12, x, y - 30);
    this.ring(x, y - 48, 0xd7ff2e);
    this.ring(x, y - 48, 0x9bd8f2);
  }

  pickupCollected(x: number, y: number): void {
    this.mint.explode(9, x, y);
    this.lime.explode(7, x, y);
    this.cream.explode(5, x, y);
    this.ring(x, y, 0xd7ff2e);
  }

  heal(x: number, y: number): void {
    this.mint.explode(8, x, y);
    this.cream.explode(6, x, y);
    this.ring(x, y, 0x9bd8f2);
  }

  grenadeThrow(x: number, y: number): void {
    this.copper.explode(3, x, y);
    this.smoke.explode(2, x, y);
  }

  grenadeExplosion(x: number, y: number, type: "contact" | "frag"): void {
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
