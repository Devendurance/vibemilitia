import Phaser from "phaser";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { PlayerVisuals } from "@/game/entities/PlayerVisuals";
import type { OnlineCombatantSnapshot } from "@/game/multiplayer/protocol";

const PLAYER_HEIGHT = 128;

function rotateToward(current: number, target: number, amount: number): number {
  const difference = Phaser.Math.Angle.Wrap(target - current);
  return current + difference * Math.min(1, amount);
}

export class CombatantView {
  readonly id: string;
  readonly kind: "human" | "bot";
  readonly sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private name: string;
  private isLocal: boolean;
  private visuals: PlayerVisuals | null = null;
  private nameText: Phaser.GameObjects.Text;
  private healthBack: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Arc | null = null;
  private shield: Phaser.GameObjects.Arc | null = null;
  private localRing: Phaser.GameObjects.Ellipse | null = null;
  private exhaust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private currentX: number;
  private currentY: number;
  private targetX: number;
  private targetY: number;
  private currentAim = 0;
  private targetAim = 0;
  private initialized = false;
  private alive = true;
  private wasAlive = true;
  private muzzleFlashMs = 0;
  private damageFlashMs = 0;
  private lastWeaponId = "vibe-rifle";
  private lastHealth = 100;

  constructor(
    scene: Phaser.Scene,
    snapshot: OnlineCombatantSnapshot,
    isLocal: boolean,
  ) {
    this.scene = scene;
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.name = snapshot.name;
    this.isLocal = isLocal;
    this.currentX = snapshot.x;
    this.currentY = snapshot.y;
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
    this.currentAim = snapshot.aimAngle;
    this.targetAim = snapshot.aimAngle;

    if (snapshot.kind === "human") {
      const sprite = scene.add
        .sprite(snapshot.x, snapshot.y, "player-viber")
        .setOrigin(0.5, 1)
        .setDepth(20);
      const scale = PLAYER_HEIGHT / sprite.height;
      sprite.setScale(scale);
      this.sprite = sprite;
      this.visuals = new PlayerVisuals(scene, sprite);
      this.localRing = isLocal
        ? scene.add
            .ellipse(snapshot.x, snapshot.y + 2, 76, 18, 0x000000, 0)
            .setStrokeStyle(2, 0xd7ff2e, 0.55)
            .setDepth(11)
        : null;
      this.nameText = scene.add
        .text(snapshot.x, snapshot.y - 145, snapshot.name, {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: "9px",
          fontStyle: "bold",
          color: isLocal ? "#d7ff2e" : "#f5f3ec",
          stroke: "#0c0d0f",
          strokeThickness: 3,
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setDepth(32);
      this.healthBack = scene.add
        .rectangle(snapshot.x, snapshot.y - 132, 58, 5, 0x0c0d0f, 0.85)
        .setDepth(31);
      this.healthFill = scene.add
        .rectangle(snapshot.x - 27, snapshot.y - 132, 54, 2, 0xd7ff2e, 1)
        .setOrigin(0, 0.5)
        .setDepth(32);
    } else {
      this.sprite = scene.add
        .image(snapshot.x, snapshot.y, "drone-body")
        .setScale(0.9)
        .setDepth(24);
      this.glow = scene.add
        .circle(snapshot.x, snapshot.y, 16, 0xe5484d, 0.12)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(23);
      this.shield = scene.add
        .circle(snapshot.x, snapshot.y, 39, 0x000000, 0)
        .setStrokeStyle(2, 0x9bd8f2, 0.55)
        .setDepth(29)
        .setVisible(false);
      this.nameText = scene.add
        .text(snapshot.x, snapshot.y - 58, snapshot.name, {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: "9px",
          fontStyle: "bold",
          color: "#ffb4b6",
          stroke: "#0c0d0f",
          strokeThickness: 3,
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setDepth(30);
      this.healthBack = scene.add
        .rectangle(snapshot.x, snapshot.y - 44, 50, 6, 0x0c0d0f, 0.9)
        .setDepth(30)
        .setVisible(false);
      this.healthFill = scene.add
        .rectangle(snapshot.x - 23, snapshot.y - 44, 46, 3, 0xe5484d, 1)
        .setOrigin(0, 0.5)
        .setDepth(31)
        .setVisible(false);
      this.exhaust = scene.add
        .particles(0, 0, "spark-mint", {
          speed: { min: 30, max: 80 },
          angle: { min: 75, max: 105 },
          lifespan: { min: 160, max: 300 },
          scale: { start: 0.5, end: 0 },
          alpha: { start: 0.55, end: 0 },
          tint: [0x9bd8f2, 0xc7692f],
          frequency: 55,
          quantity: 1,
          emitting: false,
          blendMode: "ADD",
        })
        .setDepth(18);
    }
    this.lastHealth = snapshot.health;
  }

  get active(): boolean {
    return this.initialized;
  }

  update(
    snapshot: OnlineCombatantSnapshot,
    dtMs: number,
    localAim: number | null,
    positionOverride?: { x: number; y: number },
  ): void {
    this.targetX = positionOverride?.x ?? snapshot.x;
    this.targetY = positionOverride?.y ?? snapshot.y;
    this.targetAim = localAim ?? snapshot.aimAngle;
    const dt = Math.min(dtMs, 50) / 1000;
    const positionRate = this.kind === "human" ? 18 : 14;
    const snapThreshold = this.alive ? 360 : 120;
    if (
      positionOverride ||
      Math.hypot(this.targetX - this.currentX, this.targetY - this.currentY) >
        snapThreshold
    ) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
    } else {
      const positionBlend = 1 - Math.exp(-dt * positionRate);
      this.currentX = Phaser.Math.Linear(this.currentX, this.targetX, positionBlend);
      this.currentY = Phaser.Math.Linear(this.currentY, this.targetY, positionBlend);
    }
    this.currentAim = rotateToward(
      this.currentAim,
      this.targetAim,
      this.kind === "human" ? 1 - Math.exp(-dt * 20) : 1,
    );
    this.muzzleFlashMs = Math.max(0, this.muzzleFlashMs - dtMs);
    this.damageFlashMs = Math.max(0, this.damageFlashMs - dtMs);
    this.name = snapshot.name;
    this.lastWeaponId = snapshot.weaponId;
    this.alive = snapshot.alive;

    if (!snapshot.alive) {
      if (this.wasAlive) {
        if (this.visuals) this.visuals.setDead();
        this.sprite.setVisible(false);
        this.nameText.setVisible(false);
        this.healthBack.setVisible(false);
        this.healthFill.setVisible(false);
        this.glow?.setVisible(false);
        this.shield?.setVisible(false);
        this.localRing?.setVisible(false);
        if (this.exhaust) this.exhaust.emitting = false;
        this.wasAlive = false;
      }
      return;
    }

    if (!this.wasAlive) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
      this.sprite.setVisible(true);
      this.nameText.setVisible(true);
      this.visuals?.revive();
      this.glow?.setVisible(true);
      this.localRing?.setVisible(true);
      this.wasAlive = true;
    }

    this.sprite.setPosition(this.currentX, this.currentY);
    this.nameText.setPosition(this.currentX, this.currentY - (this.kind === "human" ? 145 : 58));
    if (this.kind === "human") {
      const width = 54 * Math.max(0, Math.min(1, snapshot.health / snapshot.maxHealth));
      this.healthBack.setPosition(this.currentX, this.currentY - 132);
      this.healthFill.setPosition(this.currentX - 27, this.currentY - 132).setDisplaySize(width, 2);
      this.healthFill.setFillStyle(
        snapshot.health / snapshot.maxHealth > 0.3 ? 0xd7ff2e : 0xe5484d,
      );
      this.healthBack.setVisible(snapshot.health < snapshot.maxHealth);
      this.healthFill.setVisible(snapshot.health < snapshot.maxHealth);
      this.localRing?.setPosition(this.currentX, this.currentY + 2);
      if (this.visuals) {
        if (this.damageFlashMs > 0) {
          this.sprite.setTint(0xffb0a0);
        } else if (this.sprite.tintTopLeft !== 0xffffff) {
          this.sprite.clearTint();
        }
        const weapon =
          PLAYER_WEAPONS.find((entry) => entry.id === snapshot.weaponId) ??
          PLAYER_WEAPONS[0];
        const moving = Math.abs(snapshot.vx) > 20;
        this.visuals.update({
          x: this.currentX,
          y: this.currentY,
          aimAngle: this.currentAim,
          recoil: this.muzzleFlashMs > 45 ? 0.7 : 0,
          grounded: snapshot.grounded,
          thrusting: snapshot.thrusting,
          moving,
          velocityX: snapshot.vx,
          muzzleFlash: this.muzzleFlashMs / 80,
          shield: snapshot.invulnerable > 0,
          flash: false,
          alpha: 1,
          weaponTexture: weapon.weaponTexture,
          muzzleColor: weapon.muzzleColor,
        });
      }
    } else {
      this.sprite.setRotation(Phaser.Math.Clamp(snapshot.vx / 1600, -0.12, 0.12));
      if (this.damageFlashMs > 0) {
        (this.sprite as Phaser.GameObjects.Image)
          .setTint(0xf5f3ec)
          .setTintMode(Phaser.TintModes.FILL);
      } else {
        (this.sprite as Phaser.GameObjects.Image).clearTint();
      }
      this.glow?.setPosition(this.currentX + Math.cos(this.currentAim) * 7, this.currentY + 4);
      this.glow?.setVisible(true);
      this.glow?.setScale(snapshot.invulnerable > 0 ? 1.4 : 1);
      this.shield
        ?.setVisible(snapshot.invulnerable > 0)
        .setPosition(this.currentX, this.currentY);
      const damaged = snapshot.health < snapshot.maxHealth;
      this.healthBack.setVisible(damaged);
      this.healthFill.setVisible(damaged);
      if (damaged) {
        this.healthBack.setPosition(this.currentX, this.currentY - 44);
        this.healthFill
          .setPosition(this.currentX - 23, this.currentY - 44)
          .setDisplaySize(
            46 * Math.max(0, snapshot.health / snapshot.maxHealth),
            3,
          );
        this.healthFill.setFillStyle(
          snapshot.health / snapshot.maxHealth > 0.5 ? 0xd7ff2e : 0xe5484d,
        );
      }
      if (this.exhaust) {
        this.exhaust.setPosition(this.currentX, this.currentY + 14);
        this.exhaust.emitting = snapshot.thrusting;
      }
    }

    this.lastHealth = snapshot.health;
    this.initialized = true;
  }

  onShot(): void {
    this.muzzleFlashMs = 80;
  }

  onHit(): void {
    this.damageFlashMs = 90;
  }

  destroy(): void {
    this.visuals?.destroy();
    this.sprite.destroy();
    this.nameText.destroy();
    this.healthBack.destroy();
    this.healthFill.destroy();
    this.glow?.destroy();
    this.shield?.destroy();
    this.localRing?.destroy();
    this.exhaust?.destroy();
  }
}
