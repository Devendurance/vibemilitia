import Phaser from "phaser";
import {
  PLAYER_CONFIG,
  JETPACK_CONFIG,
  JETPACK_MAX_RISE_SPEED,
  JETPACK_THRUST_ACCELERATION,
  PLAYER_WEAPONS,
  type PlayerWeapon,
} from "@/game/config/gameplay";
import { applyDamage, stepHealthRegen } from "@/game/core/combat";
import { createJetpackState, stepJetpack } from "@/game/core/jetpack";
import type { JetpackState } from "@/game/core/jetpack";
import { createWeaponState, stepWeapon } from "@/game/core/weapon";
import type { WeaponState } from "@/game/core/weapon";
import type { ControlFrame } from "@/game/systems/InputController";
import { PlayerVisuals } from "@/game/entities/PlayerVisuals";

const COYOTE_MS = PLAYER_CONFIG.coyoteMs;

function moveToward(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

export interface PlayerUpdateResult {
  grounded: boolean;
  thrusting: boolean;
  landed: boolean;
  jumped: boolean;
  damageSeq: number;
  aimAngle: number;
}

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly visuals: PlayerVisuals;
  readonly weaponStates: WeaponState[] = PLAYER_WEAPONS.map((definition) =>
    createWeaponState(definition),
  );
  readonly jetpack: JetpackState = createJetpackState(JETPACK_CONFIG);
  health: number = PLAYER_CONFIG.maxHealth;
  dead = false;
  grounded = false;
  thrusting = false;
  aimAngle = 0;
  damageSeq = 0;
  respawnRemainingMs = 0;
  invulnerableRemainingMs = 0;
  equippedWeaponIndex = 0;
  eliminations = 0;
  deaths = 0;
  shotsFired = 0;
  shotsHit = 0;
  msSinceDamage: number = PLAYER_CONFIG.damageRegenDelayMs;

  private scene: Phaser.Scene;
  private coyoteRemainingMs = 0;
  private wasGrounded = false;
  private flashRemainingMs = 0;
  private recoil = 0;
  private muzzleFlashRemainingMs = 0;
  private justJumped = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, "player-viber").setOrigin(0.5, 1).setDepth(20);
    this.sprite.setCollideWorldBounds(true);
    const textureHeight = this.sprite.height;
    const textureWidth = this.sprite.width;
    const scale = PLAYER_CONFIG.displayHeight / textureHeight;
    this.sprite.setScale(scale);
    this.sprite.setMaxVelocity(PLAYER_CONFIG.moveSpeed * 1.35, PLAYER_CONFIG.maxFallSpeed);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_CONFIG.physicsWidth, PLAYER_CONFIG.physicsHeight);
    body.setOffset(PLAYER_CONFIG.physicsOffsetX, PLAYER_CONFIG.physicsOffsetY);
    body.setAllowGravity(true);
    body.setDrag(0, 0);
    body.setMaxVelocity(PLAYER_CONFIG.moveSpeed * 1.35, PLAYER_CONFIG.maxFallSpeed);

    // Keep the art's aspect ratio exact even if the processed frame changes width.
    if (textureWidth !== 728) {
      const horizontalInset = (textureWidth - PLAYER_CONFIG.physicsWidth) / 2;
      body.setOffset(horizontalInset, textureHeight - PLAYER_CONFIG.physicsHeight - 10);
    }

    this.visuals = new PlayerVisuals(scene, this.sprite);
    this.invulnerableRemainingMs = PLAYER_CONFIG.invulnerabilityMs * 0.45;
    this.visuals.setShield(this.invulnerableRemainingMs > 0);
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  get weapon(): WeaponState {
    return this.weaponStates[this.equippedWeaponIndex];
  }

  get weaponDefinition(): PlayerWeapon {
    return PLAYER_WEAPONS[this.equippedWeaponIndex];
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(dtMs: number, input: ControlFrame, aimWorld: Phaser.Math.Vector2): PlayerUpdateResult {
    const dt = Math.min(dtMs, 50) / 1000;
    this.msSinceDamage += dtMs;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - dtMs);
    this.recoil = Math.max(0, this.recoil - dtMs * 0.012);
    this.muzzleFlashRemainingMs = Math.max(0, this.muzzleFlashRemainingMs - dtMs);

    if (this.dead) {
      this.thrusting = false;
      this.visuals.hide();
      return {
        grounded: false,
        thrusting: false,
        landed: false,
        jumped: false,
        damageSeq: this.damageSeq,
        aimAngle: this.aimAngle,
      };
    }

    const body = this.body;
    this.invulnerableRemainingMs = Math.max(0, this.invulnerableRemainingMs - dtMs);
    this.grounded = body.blocked.down || body.touching.down;

    if (this.grounded) {
      this.coyoteRemainingMs = COYOTE_MS;
      this.jetpack.msSinceThrust = Math.max(this.jetpack.msSinceThrust, JETPACK_CONFIG.regenDelayMs);
    } else {
      this.coyoteRemainingMs = Math.max(0, this.coyoteRemainingMs - dtMs);
    }

    const landed = this.grounded && !this.wasGrounded;
    this.justJumped = false;

    if (input.jumpPressed && this.coyoteRemainingMs > 0) {
      body.velocity.y = -PLAYER_CONFIG.jumpSpeed;
      this.coyoteRemainingMs = 0;
      this.justJumped = true;
      this.visuals.dustPuff(this.sprite.x, this.y);
    }

    const targetSpeed = input.moveX * PLAYER_CONFIG.moveSpeed;
    const acceleration = this.grounded
      ? PLAYER_CONFIG.groundAcceleration
      : PLAYER_CONFIG.airAcceleration;

    if (Math.abs(input.moveX) > 0.01) {
      body.velocity.x = moveToward(body.velocity.x, targetSpeed, acceleration * dt);
    } else {
      const friction = this.grounded ? PLAYER_CONFIG.groundFriction : PLAYER_CONFIG.airFriction;
      body.velocity.x = moveToward(body.velocity.x, 0, friction * dt);
    }

    const thrustRequested = input.jumpHeld && !this.grounded && !this.justJumped;
    const jetpackStep = stepJetpack(
      this.jetpack,
      { thrustRequested, dtMs },
      JETPACK_CONFIG,
    );
    this.jetpack.fuel = jetpackStep.state.fuel;
    this.jetpack.msSinceThrust = jetpackStep.state.msSinceThrust;
    this.thrusting = jetpackStep.thrusting;

    if (this.thrusting) {
      body.velocity.y = Math.max(
        -JETPACK_MAX_RISE_SPEED,
        body.velocity.y - JETPACK_THRUST_ACCELERATION * dt,
      );
    }

    if (body.velocity.y > PLAYER_CONFIG.maxFallSpeed) {
      body.velocity.y = PLAYER_CONFIG.maxFallSpeed;
    }

    this.health = stepHealthRegen(
      this.health,
      PLAYER_CONFIG.maxHealth,
      this.msSinceDamage,
      dtMs,
      PLAYER_CONFIG.damageRegenDelayMs,
      PLAYER_CONFIG.healthRegenPerSecond,
    );

    this.aimAngle = Math.atan2(
      aimWorld.y - (this.y - 58),
      aimWorld.x - (this.sprite.x + 28),
    );
    const weaponDefinition = this.weaponDefinition;
    this.visuals.update({
      x: this.sprite.x,
      y: this.sprite.y,
      aimAngle: this.aimAngle,
      recoil: this.recoil,
      grounded: this.grounded,
      thrusting: this.thrusting,
      moving: Math.abs(body.velocity.x) > 20,
      velocityX: body.velocity.x,
      muzzleFlash: this.muzzleFlashRemainingMs / 80,
      shield: this.invulnerableRemainingMs > 0,
      flash: this.flashRemainingMs > 0,
      alpha: 1,
      weaponTexture: weaponDefinition.weaponTexture,
      muzzleColor: weaponDefinition.muzzleColor,
    });

    this.wasGrounded = this.grounded;
    return {
      grounded: this.grounded,
      thrusting: this.thrusting,
      landed,
      jumped: this.justJumped,
      damageSeq: this.damageSeq,
      aimAngle: this.aimAngle,
    };
  }

  equipWeapon(index: number): boolean {
    if (index < 0 || index >= PLAYER_WEAPONS.length || index === this.equippedWeaponIndex) {
      return false;
    }
    this.equippedWeaponIndex = index;
    this.recoil = 0;
    this.muzzleFlashRemainingMs = 0;
    return true;
  }

  stepWeapon(dtMs: number, input: ControlFrame): { fired: boolean; startedReload: boolean; finishedReload: boolean } {
    if (this.dead) {
      return { fired: false, startedReload: false, finishedReload: false };
    }
    if (input.weaponSlotPressed !== null) {
      this.equipWeapon(input.weaponSlotPressed);
    }

    const definition = this.weaponDefinition;
    const result = stepWeapon(this.weapon, definition, {
      fire: input.fire,
      reload: input.reloadPressed,
      dtMs,
    });
    Object.assign(this.weapon, result.state);

    if (result.fired) {
      this.recoil = 1;
      this.muzzleFlashRemainingMs = 80;
      this.shotsFired += definition.pellets;
      this.visuals.kick();
    }
    return result;
  }

  getMuzzlePoint(): Phaser.Math.Vector2 {
    const distance = 66;
    return new Phaser.Math.Vector2(
      this.sprite.x + 28 + Math.cos(this.aimAngle) * distance,
      this.y - 58 + Math.sin(this.aimAngle) * distance,
    );
  }

  takeDamage(amount: number): boolean {
    if (this.dead || this.invulnerableRemainingMs > 0) {
      return false;
    }
    this.health = applyDamage(this.health, amount);
    this.msSinceDamage = 0;
    this.damageSeq += 1;
    this.flashRemainingMs = 90;
    this.visuals.hitFlash();
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.thrusting = false;
    this.respawnRemainingMs = PLAYER_CONFIG.respawnMs;
    this.body.enable = false;
    this.body.setVelocity(0, 0);
    this.visuals.setDead();
  }

  tickRespawn(dtMs: number): boolean {
    if (!this.dead) return false;
    this.respawnRemainingMs = Math.max(0, this.respawnRemainingMs - dtMs);
    return this.respawnRemainingMs <= 0;
  }

  respawnAt(x: number, y: number): void {
    this.dead = false;
    this.recoil = 0;
    this.muzzleFlashRemainingMs = 0;
    this.health = PLAYER_CONFIG.maxHealth;
    this.jetpack.fuel = JETPACK_CONFIG.maxFuel;
    this.jetpack.msSinceThrust = JETPACK_CONFIG.regenDelayMs;
    for (let index = 0; index < this.weaponStates.length; index += 1) {
      const state = this.weaponStates[index];
      state.ammo = PLAYER_WEAPONS[index].magazineSize;
      state.reloading = false;
      state.reloadRemainingMs = 0;
      state.cooldownMs = 0;
    }
    this.invulnerableRemainingMs = PLAYER_CONFIG.invulnerabilityMs;
    this.msSinceDamage = PLAYER_CONFIG.damageRegenDelayMs;
    this.respawnRemainingMs = 0;
    this.flashRemainingMs = 0;
    this.thrusting = false;
    this.damageSeq += 1;
    this.wasGrounded = false;
    this.sprite.setPosition(x, y);
    this.body.reset(x, y);
    this.sprite.setActive(true).setVisible(true);
    this.sprite.setAlpha(1);
    this.sprite.clearTint();
    this.body.enable = true;
    this.body.setVelocity(0, 0);
    this.visuals.revive();
    this.visuals.setShield(true);
  }

}
