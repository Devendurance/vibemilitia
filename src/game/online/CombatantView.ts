import Phaser from "phaser";
import { ALL_PLAYER_WEAPONS } from "@/game/config/gameplay";
import { getCharacterSkin } from "@/game/characters/roster";
import { PlayerVisuals } from "@/game/entities/PlayerVisuals";
import { cosmeticTint } from "@/game/progression/cosmetics";
import { RemoteInterpolator } from "@/game/online/RemoteInterpolator";
import type { OnlineCombatantSnapshot } from "@/game/multiplayer/protocol";

const PLAYER_HEIGHT = 128;

export interface LocalMotionOverride {
  x: number;
  y: number;
  grounded: boolean;
  thrusting: boolean;
  vx: number;
}

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
  private localRing: Phaser.GameObjects.Image | null = null;
  private interpolator = new RemoteInterpolator();
  private labelScale = 1;
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
  private muzzleBarrel: 0 | 1 = 0;
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
    this.visuals = new PlayerVisuals(scene, sprite, {
      dust: false,
      trailTint: snapshot.trailId ? cosmeticTint(snapshot.trailId) : undefined,
    });
    this.localRing =
      isLocal && snapshot.kind === "human"
        ? scene.add
            .image(snapshot.x, snapshot.y + 2, "fx-ground-ring")
            .setDisplaySize(84, 22)
            .setAlpha(0.6)
            .setDepth(11)
        : null;
    this.nameText = scene.add
      .text(snapshot.x, snapshot.y - 145, snapshot.name, {
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#d7ff2e" : "#f5f3ec",
        stroke: "#0c0d0f",
        strokeThickness: 3,
        letterSpacing: 1,
      })
      .setResolution(2)
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
    secondaryWeaponVisible: boolean;
    nameVisible: boolean;
    botLabelVisible: boolean;
    healthBarVisible: boolean;
  } {
    return {
      texture: this.sprite.texture.key,
      weaponTexture: this.visuals.weaponTextureKey,
      weaponVisible: this.visuals.weaponVisible,
      secondaryWeaponVisible: this.visuals.secondaryWeaponVisible,
      nameVisible: this.nameText.visible,
      botLabelVisible: this.botTag?.visible ?? false,
      healthBarVisible: this.healthFill.visible,
    };
  }

  /** Keeps world labels readable when the camera is zoomed out on phones. */
  setLabelScale(scale: number): void {
    this.labelScale = scale;
    this.nameText.setScale(scale);
    this.botTag?.setScale(scale);
  }

  pushSample(serverMs: number, snapshot: OnlineCombatantSnapshot): void {
    this.interpolator.push(
      serverMs,
      snapshot.x,
      snapshot.y,
      snapshot.vx,
      snapshot.vy,
      snapshot.aimAngle,
    );
  }

  update(
    snapshot: OnlineCombatantSnapshot,
    dtMs: number,
    localAim: number | null,
    localMotion?: LocalMotionOverride,
    playbackMs?: number | null,
  ): void {
    const played =
      !localMotion && playbackMs !== null && playbackMs !== undefined
        ? this.interpolator.sample(playbackMs)
        : null;
    this.targetX = localMotion?.x ?? played?.x ?? snapshot.x;
    this.targetY = localMotion?.y ?? played?.y ?? snapshot.y;
    this.targetAim = localAim ?? played?.aim ?? snapshot.aimAngle;
    const dt = Math.min(dtMs, 50) / 1000;
    this.currentX = this.targetX;
    this.currentY = this.targetY;
    this.currentAim = rotateToward(
      this.currentAim,
      this.targetAim,
      localMotion ? 1 : 1 - Math.exp(-dt * 24),
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
      this.visuals.revive();
      this.nameText.setVisible(true);
      this.botTag?.setVisible(true);
      this.localRing?.setVisible(true);
      this.wasAlive = true;
    }

    this.sprite.setPosition(this.currentX, this.currentY);
    this.nameText
      .setText(this.name)
      .setPosition(this.currentX, this.currentY - 145 - (this.labelScale - 1) * 8);
    this.botTag?.setPosition(this.currentX, this.currentY - 158 - (this.labelScale - 1) * 20);
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
      ALL_PLAYER_WEAPONS.find((entry) => entry.id === snapshot.weaponId) ??
      ALL_PLAYER_WEAPONS[0];
    this.visuals.update({
      x: this.currentX,
      y: this.currentY,
      aimAngle: this.currentAim,
      recoil: this.muzzleFlashMs > 45 ? 0.7 : 0,
      grounded: localMotion?.grounded ?? snapshot.grounded,
      thrusting: localMotion?.thrusting ?? snapshot.thrusting,
      moving: Math.abs(localMotion?.vx ?? snapshot.vx) > 20,
      velocityX: localMotion?.vx ?? snapshot.vx,
      muzzleFlash: this.muzzleFlashMs / 80,
      muzzleBarrel: this.muzzleBarrel,
      shield: snapshot.invulnerable > 0,
      flash: this.damageFlashMs > 0,
      alpha: 1,
      weaponTexture: weapon.weaponTexture,
      secondaryWeaponTexture: weapon.secondaryWeaponTexture,
      barrelSeparation: weapon.barrelSeparation,
      muzzleColor: weapon.muzzleColor,
    });

    this.initialized = true;
  }

  onShot(barrel: 0 | 1 = 0): void {
    this.muzzleBarrel = barrel;
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
