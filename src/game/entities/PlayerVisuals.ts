import Phaser from "phaser";

interface VisualState {
  x: number;
  y: number;
  aimAngle: number;
  recoil: number;
  grounded: boolean;
  thrusting: boolean;
  moving: boolean;
  velocityX: number;
  muzzleFlash: number;
  shield: boolean;
  flash: boolean;
  alpha: number;
  weaponTexture: string;
  secondaryWeaponTexture?: string;
  barrelSeparation?: number;
  muzzleBarrel?: 0 | 1;
  muzzleColor: number;
}

const PIVOT_X = 28;
const PIVOT_Y = 58;
const MUZZLE_LOCAL_X = 67;

interface PlayerVisualsOptions {
  dust?: boolean;
  trailTint?: number;
}

/**
 * Rendering only. The NFT cutout is never distorted or regenerated. Weapon,
 * exhaust, shield, shadow, muzzle flash and damage tint are separate layers.
 */
export class PlayerVisuals {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private weapon: Phaser.GameObjects.Container;
  private weaponImage: Phaser.GameObjects.Image;
  private weaponImage2: Phaser.GameObjects.Image;
  private muzzle: Phaser.GameObjects.Image;
  private muzzle2: Phaser.GameObjects.Image;
  private shield: Phaser.GameObjects.Arc;
  private jetLeft: Phaser.GameObjects.Particles.ParticleEmitter;
  private jetRight: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private hitDust: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private shieldVisible = false;
  private dead = false;

  constructor(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    options: PlayerVisualsOptions = {},
  ) {
    this.scene = scene;
    this.sprite = sprite;

    this.shadow = scene.add
      .ellipse(sprite.x, sprite.y + 2, 64, 16, 0x0c0d0f, 0.26)
      .setDepth(12);

    const exhaustConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      speed: { min: 55, max: 130 },
      angle: { min: 70, max: 110 },
      lifespan: { min: 180, max: 330 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [options.trailTint ?? 0xd7ff2e, 0x9bd8f2, 0xf5f3ec, 0xc7692f],
      frequency: 22,
      quantity: 2,
      emitting: false,
      blendMode: "ADD",
    };
    this.jetLeft = scene.add.particles(sprite.x - 15, sprite.y - 10, "spark-lime", exhaustConfig).setDepth(16);
    this.jetRight = scene.add.particles(sprite.x + 15, sprite.y - 10, "spark-lime", exhaustConfig).setDepth(16);

    this.weapon = scene.add.container(sprite.x, sprite.y - PIVOT_Y).setDepth(31);
    this.weaponImage = scene.add.image(0, 0, "weapon-player").setOrigin(10 / 76, 0.5);
    this.weaponImage2 = scene.add
      .image(0, 0, "weapon-player")
      .setOrigin(10 / 76, 0.5)
      .setFlipY(true)
      .setVisible(false);
    this.muzzle = scene.add
      .image(MUZZLE_LOCAL_X, 0, "muzzle-flash")
      .setAlpha(0)
      .setOrigin(0.32, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.muzzle2 = scene.add
      .image(MUZZLE_LOCAL_X, 0, "muzzle-flash")
      .setAlpha(0)
      .setOrigin(0.32, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.weapon.add([this.weaponImage2, this.weaponImage, this.muzzle, this.muzzle2]);

    this.shield = scene.add
      .circle(sprite.x, sprite.y - 58, 47, 0x000000, 0)
      .setStrokeStyle(2, 0xd7ff2e, 0.8)
      .setDepth(29)
      .setVisible(false);

    if (options.dust === false) {
      this.dust = null;
      this.hitDust = null;
    } else {
      this.dust = scene.add
        .particles(0, 0, "spark-smoke", {
          speed: { min: 25, max: 100 },
          angle: { min: 185, max: 355 },
          lifespan: { min: 220, max: 480 },
          scale: { start: 0.8, end: 0 },
          alpha: { start: 0.55, end: 0 },
          tint: [0xf5f3ec, 0x9aa0a7, 0xc7692f],
          frequency: -1,
          quantity: 7,
          emitting: false,
        })
        .setDepth(19);

      this.hitDust = scene.add
        .particles(0, 0, "spark-red", {
          speed: { min: 50, max: 150 },
          lifespan: { min: 160, max: 360 },
          scale: { start: 0.7, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: [0xe5484d, 0xffb4b6],
          gravityY: 200,
          frequency: -1,
          quantity: 4,
          emitting: false,
        })
        .setDepth(46);
    }
  }

  get weaponTextureKey(): string {
    return this.weaponImage.texture.key;
  }

  get weaponVisible(): boolean {
    return this.weapon.visible;
  }

  get secondaryWeaponVisible(): boolean {
    return this.weaponImage2.visible;
  }

  update(state: VisualState): void {
    if (this.dead) {
      return;
    }

    this.sprite.setAlpha(state.alpha);
    if (state.flash) {
      this.sprite.setTint(0xffb0a0);
    } else {
      this.sprite.clearTint();
    }

    this.shadow.setPosition(state.x, state.y + 1);
    this.shadow.setAlpha(state.grounded ? 0.26 : 0.09);
    this.shadow.setScale(state.grounded ? 1 : 0.8);

    const px = state.x + PIVOT_X - Math.cos(state.aimAngle) * state.recoil * 4;
    const py = state.y - PIVOT_Y - Math.sin(state.aimAngle) * state.recoil * 4;
    this.weapon.setPosition(px, py);
    this.weapon.setRotation(state.aimAngle);
    this.weapon.setScale(1, Math.cos(state.aimAngle) < 0 ? -1 : 1);

    if (this.weaponImage.texture.key !== state.weaponTexture) {
      this.weaponImage.setTexture(state.weaponTexture);
    }
    const separation = state.secondaryWeaponTexture
      ? state.barrelSeparation ?? 10
      : 0;
    const hasSecondary = Boolean(state.secondaryWeaponTexture);
    this.weaponImage.setY(hasSecondary ? separation / 2 : 0);
    this.weaponImage2.setVisible(hasSecondary);
    if (hasSecondary && state.secondaryWeaponTexture) {
      if (this.weaponImage2.texture.key !== state.secondaryWeaponTexture) {
        this.weaponImage2.setTexture(state.secondaryWeaponTexture);
      }
      this.weaponImage2.setY(-separation / 2);
    }
    if (this.muzzle.tintTopLeft !== state.muzzleColor) {
      this.muzzle.setTint(state.muzzleColor);
    }
    if (this.muzzle2.tintTopLeft !== state.muzzleColor) {
      this.muzzle2.setTint(state.muzzleColor);
    }
    const barrel = state.muzzleBarrel ?? 0;
    this.muzzle.setPosition(MUZZLE_LOCAL_X, hasSecondary ? separation / 2 : 0);
    this.muzzle2.setPosition(MUZZLE_LOCAL_X, -separation / 2);
    this.muzzle.setAlpha(
      state.muzzleFlash > 0 && barrel === 0 ? state.muzzleFlash : 0,
    );
    this.muzzle2.setAlpha(
      state.muzzleFlash > 0 && hasSecondary && barrel === 1
        ? state.muzzleFlash
        : 0,
    );
    this.muzzle.setScale(0.9 + state.muzzleFlash * 0.45);
    this.muzzle2.setScale(0.9 + state.muzzleFlash * 0.45);

    this.shieldVisible = state.shield;
    this.shield.setVisible(state.shield);
    if (state.shield) {
      const pulse = 1 + Math.sin(this.scene.time.now * 0.009) * 0.045;
      this.shield.setScale(pulse);
      this.shield.setPosition(state.x, state.y - 58);
      this.shield.setAlpha(0.35 + pulse * 0.2);
    }

    const emitting = state.thrusting;
    this.jetLeft.emitting = emitting;
    this.jetRight.emitting = emitting;
    this.jetLeft.setPosition(state.x - 15, state.y - 8);
    this.jetRight.setPosition(state.x + 15, state.y - 8);
    this.jetLeft.setScrollFactor(1);
    this.jetRight.setScrollFactor(1);
  }

  kick(): void {
    this.muzzle.setPosition(MUZZLE_LOCAL_X, this.weaponImage.y);
    this.muzzle2.setPosition(MUZZLE_LOCAL_X, this.weaponImage2.y);
  }

  dustPuff(x: number, y: number): void {
    if (!this.dust) return;
    this.dust.setPosition(x, y - 3);
    this.dust.explode(7);
  }

  hitFlash(): void {
    if (!this.hitDust) return;
    this.hitDust.setPosition(this.sprite.x, this.sprite.y - 52);
    this.hitDust.explode(4);
  }

  setShield(visible: boolean): void {
    this.shieldVisible = visible;
    this.shield.setVisible(visible);
  }

  setDead(): void {
    this.dead = true;
    this.sprite.setVisible(false);
    this.weapon.setVisible(false);
    this.muzzle.setVisible(false);
    this.muzzle2.setVisible(false);
    this.shield.setVisible(false);
    this.shadow.setVisible(false);
    this.jetLeft.emitting = false;
    this.jetRight.emitting = false;
  }

  revive(): void {
    this.dead = false;
    this.sprite.setVisible(true);
    this.weapon.setVisible(true);
    this.muzzle.setVisible(true);
    this.muzzle2.setVisible(true);
    this.shield.setVisible(this.shieldVisible);
    this.shadow.setVisible(true);
    this.sprite.clearTint();
    this.sprite.setAlpha(1);
  }

  hide(): void {
    this.dead = true;
    this.sprite.setVisible(false);
    this.weapon.setVisible(false);
    this.shield.setVisible(false);
    this.shadow.setVisible(false);
    this.jetLeft.emitting = false;
    this.jetRight.emitting = false;
  }

  destroy(): void {
    this.shadow.destroy();
    this.weapon.destroy();
    this.shield.destroy();
    this.jetLeft.destroy();
    this.jetRight.destroy();
    this.dust?.destroy();
    this.hitDust?.destroy();
  }
}
