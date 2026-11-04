import Phaser from "phaser";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { getCharacterSkin } from "@/game/characters/roster";
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
  readonly sprite: Phaser.GameObjects.Sprite;
  private name: string;
  private visuals: PlayerVisuals;
  private nameText: Phaser.GameObjects.Text;
  private botTag: Phaser.GameObjects.Text | null = null;
  private healthBack: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;
  private localRing: Phaser.GameObjects.Ellipse | null = null;
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

  constructor(
    scene: Phaser.Scene,
    snapshot: OnlineCombatantSnapshot,
    isLocal: boolean,
  ) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.name = snapshot.name;
    this.currentX = snapshot.x;
    this.currentY = snapshot.y;
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
    this.currentAim = snapshot.aimAngle;
    this.targetAim = snapshot.aimAngle;

    const skin = getCharacterSkin(snapshot.skinId);
    const sprite = scene.add
      .sprite(snapshot.x, snapshot.y, skin.textureKey)
      .setOrigin(0.5, 1)
      .setDepth(20);
    const scale = PLAYER_HEIGHT / sprite.height;
    sprite.setScale(scale);
    this.sprite = sprite;
    this.visuals = new PlayerVisuals(scene, sprite, { dust: false });
    this.localRing =
      isLocal && snapshot.kind === "human"
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
    if (snapshot.kind === "bot") {
      this.botTag = scene.add
        .text(snapshot.x, snapshot.y - 157, "BOT", {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: "7px",
          fontStyle: "bold",
          color: "#c7692f",
          stroke: "#0c0d0f",
          strokeThickness: 3,
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(32);
    }
    this.healthBack = scene.add
      .rectangle(snapshot.x, snapshot.y - 132, 58, 5, 0x0c0d0f, 0.85)
      .setDepth(31);
    this.healthFill = scene.add
      .rectangle(snapshot.x - 27, snapshot.y - 132, 54, 2, 0xd7ff2e, 1)
      .setOrigin(0, 0.5)
      .setDepth(32);
  }

  get active(): boolean {
    return this.initialized;
  }

  get presentation(): {
    texture: string;
    weaponTexture: string;
    weaponVisible: boolean;
    nameVisible: boolean;
    botLabelVisible: boolean;
    healthBarVisible: boolean;
  } {
    return {
      texture: this.sprite.texture.key,
      weaponTexture: this.visuals.weaponTextureKey,
      weaponVisible: this.visuals.weaponVisible,
      nameVisible: this.nameText.visible,
      botLabelVisible: this.botTag?.visible ?? false,
      healthBarVisible: this.healthFill.visible,
    };
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
      1 - Math.exp(-dt * 20),
    );
    this.muzzleFlashMs = Math.max(0, this.muzzleFlashMs - dtMs);
    this.damageFlashMs = Math.max(0, this.damageFlashMs - dtMs);
    this.name = snapshot.name;
    this.alive = snapshot.alive;

    if (!snapshot.alive) {
      if (this.wasAlive) {
        this.visuals.setDead();
        this.nameText.setVisible(false);
        this.botTag?.setVisible(false);
        this.healthBack.setVisible(false);
        this.healthFill.setVisible(false);
        this.localRing?.setVisible(false);
        this.wasAlive = false;
      }
      return;
    }

    if (!this.wasAlive) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
      this.visuals.revive();
      this.nameText.setVisible(true);
      this.botTag?.setVisible(true);
      this.localRing?.setVisible(true);
      this.wasAlive = true;
    }

    this.sprite.setPosition(this.currentX, this.currentY);
    this.nameText
      .setText(this.name)
      .setPosition(this.currentX, this.currentY - 145);
    this.botTag?.setPosition(this.currentX, this.currentY - 157);
    const width = 54 * Math.max(0, Math.min(1, snapshot.health / snapshot.maxHealth));
    this.healthBack.setPosition(this.currentX, this.currentY - 132);
    this.healthFill
      .setPosition(this.currentX - 27, this.currentY - 132)
      .setDisplaySize(width, 2);
    this.healthFill.setFillStyle(
      snapshot.health / snapshot.maxHealth > 0.3 ? 0xd7ff2e : 0xe5484d,
    );
    this.healthBack.setVisible(snapshot.health < snapshot.maxHealth);
    this.healthFill.setVisible(snapshot.health < snapshot.maxHealth);
    this.localRing?.setPosition(this.currentX, this.currentY + 2);

    const weapon =
      PLAYER_WEAPONS.find((entry) => entry.id === snapshot.weaponId) ??
      PLAYER_WEAPONS[0];
    this.visuals.update({
      x: this.currentX,
      y: this.currentY,
      aimAngle: this.currentAim,
      recoil: this.muzzleFlashMs > 45 ? 0.7 : 0,
      grounded: snapshot.grounded,
      thrusting: snapshot.thrusting,
      moving: Math.abs(snapshot.vx) > 20,
      velocityX: snapshot.vx,
      muzzleFlash: this.muzzleFlashMs / 80,
      shield: snapshot.invulnerable > 0,
      flash: this.damageFlashMs > 0,
      alpha: 1,
      weaponTexture: weapon.weaponTexture,
      muzzleColor: weapon.muzzleColor,
    });

    this.initialized = true;
  }

  onShot(): void {
    this.muzzleFlashMs = 80;
  }

  onHit(): void {
    this.damageFlashMs = 90;
  }

  destroy(): void {
    this.visuals.destroy();
    this.sprite.destroy();
    this.nameText.destroy();
    this.botTag?.destroy();
    this.healthBack.destroy();
    this.healthFill.destroy();
    this.localRing?.destroy();
  }
}
