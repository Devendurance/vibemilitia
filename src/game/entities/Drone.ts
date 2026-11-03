import Phaser from "phaser";
import { ARENA, type DroneSpawn } from "@/game/arena/arena";
import { DRONE_CONFIG } from "@/game/config/gameplay";
import { applyDamage, clamp } from "@/game/core/combat";
import type { Player } from "@/game/entities/Player";

export interface DroneEvents {
  onFire: (drone: Drone) => void;
  onDestroyed: (drone: Drone) => void;
  onRespawn: (drone: Drone) => void;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

export class Drone {
  readonly id: string;
  readonly sprite: Phaser.Physics.Arcade.Image;
  health: number = DRONE_CONFIG.maxHealth;
  alive = true;
  aimAngle = 0;
  respawnRemainingMs = 0;
  hasLineOfSight = false;
  shotsFired = 0;
  fireCooldownDebug = 0;
  private scene: Phaser.Scene;
  private spawn: DroneSpawn;
  private events: DroneEvents;
  private glow: Phaser.GameObjects.Arc;
  private healthBack: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;
  private phase: number;
  private fireCooldownMs: number;
  private burstRemaining = 0;
  private burstTimerMs = 0;
  private hitFlashMs = 0;
  private healthBarMs = 0;

  constructor(scene: Phaser.Scene, spawn: DroneSpawn, events: DroneEvents) {
    this.scene = scene;
    this.spawn = spawn;
    this.events = events;
    this.id = spawn.id;
    this.phase = Math.random() * Math.PI * 2;

    this.sprite = scene.physics.add
      .image(spawn.x, spawn.y, "drone-body")
      .setDepth(24)
      .setCollideWorldBounds(true)
      .setScale(0.9);
    this.sprite.setMaxVelocity(180, 180);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(190, 190);
    body.setSize(62, 40);
    body.setOffset(11, 6);

    this.glow = scene.add
      .circle(spawn.x, spawn.y, 16, 0xe5484d, 0.13)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(23);

    this.healthBack = scene.add
      .rectangle(spawn.x, spawn.y - 40, 48, 6, 0x0c0d0f, 0.9)
      .setDepth(30)
      .setVisible(false);
    this.healthFill = scene.add
      .rectangle(spawn.x - 22, spawn.y - 40, 44, 3, 0xe5484d, 1)
      .setOrigin(0, 0.5)
      .setDepth(31)
      .setVisible(false);

    this.fireCooldownMs = Phaser.Math.Between(900, 1900);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  update(dtMs: number, player: Player, hasLineOfSight: boolean, now: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.hasLineOfSight = hasLineOfSight;
    this.hitFlashMs = Math.max(0, this.hitFlashMs - dtMs);
    this.healthBarMs = Math.max(0, this.healthBarMs - dtMs);

    if (!this.alive) {
      this.respawnRemainingMs = Math.max(0, this.respawnRemainingMs - dtMs);
      if (this.respawnRemainingMs <= 0) {
        this.respawn();
        this.events.onRespawn(this);
      }
      return;
    }

    if (this.hitFlashMs > 0) {
      this.sprite.setTint(0xf5f3ec).setTintMode(Phaser.TintModes.FILL);
    } else {
      this.sprite.clearTint();
    }

    const playerAlive = !player.dead;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const orbit = this.spawn.orbitRadius;
    const angle = now * 0.00032 + this.phase;
    const desired = playerAlive && distance < DRONE_CONFIG.aggroRange * 1.65
      ? {
          x: player.x + Math.cos(angle) * orbit,
          y: player.y - 250 + Math.sin(angle * 1.7) * 45,
        }
      : { x: this.spawn.x, y: this.spawn.y + Math.sin(now * 0.0018 + this.phase) * 14 };

    const targetX = Phaser.Math.Clamp(desired.x, 70, ARENA.width - 70);
    const targetY = Phaser.Math.Clamp(desired.y, 120, ARENA.groundY - 180);
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const desiredVX = (dx / length) * DRONE_CONFIG.hoverSpeed;
    const desiredVY = (dy / length) * DRONE_CONFIG.hoverSpeed;

    this.body.velocity.x = approach(this.body.velocity.x, desiredVX, 260 * dt);
    this.body.velocity.y = approach(this.body.velocity.y, desiredVY, 260 * dt);

    this.aimAngle = Math.atan2(player.y - 56 - this.y, player.x - this.x);
    this.sprite.setRotation(Phaser.Math.Clamp(this.body.velocity.x / 1600, -0.12, 0.12));

    this.glow.setPosition(this.x + Math.cos(this.aimAngle) * 7, this.y + 4);
    const charge = this.fireCooldownMs < 260 && hasLineOfSight ? 1.5 : 1;
    this.glow.setScale(charge + Math.sin(now * 0.012) * 0.06);
    this.glow.setAlpha(playerAlive ? 0.13 * charge : 0.05);
    this.glow.setFillStyle(hasLineOfSight ? 0xe5484d : 0x9aa0a7, 0.13 * charge);

    this.updateHealthBar();

    if (!playerAlive) {
      return;
    }

    this.fireCooldownDebug = this.fireCooldownMs;
    if (this.burstRemaining > 0) {
      this.burstTimerMs -= dtMs;
      if (this.burstTimerMs <= 0) {
        this.events.onFire(this);
        this.shotsFired += 1;
        this.burstRemaining -= 1;
        this.burstTimerMs = DRONE_CONFIG.burstSpacingMs;
        if (this.burstRemaining <= 0) {
          this.fireCooldownMs = DRONE_CONFIG.fireIntervalMs;
        }
      }
    } else {
      this.fireCooldownMs = Math.max(0, this.fireCooldownMs - dtMs);
      if (
        this.fireCooldownMs <= 0 &&
        hasLineOfSight &&
        distance < DRONE_CONFIG.aggroRange
      ) {
        this.burstRemaining = DRONE_CONFIG.burstCount;
        this.burstTimerMs = 70;
      }
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.health = applyDamage(this.health, amount);
    this.hitFlashMs = 70;
    this.healthBarMs = 2200;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  muzzlePoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.x + Math.cos(this.aimAngle) * 38,
      this.y + Math.sin(this.aimAngle) * 38,
    );
  }

  private updateHealthBar(): void {
    const visible = this.alive && this.healthBarMs > 0;
    this.healthBack.setVisible(visible);
    this.healthFill.setVisible(visible);
    if (!visible) return;
    const ratio = clamp(this.health / DRONE_CONFIG.maxHealth, 0, 1);
    this.healthBack.setPosition(this.x, this.y - 40);
    this.healthFill.setPosition(this.x - 22, this.y - 40);
    this.healthFill.setDisplaySize(44 * ratio, 3);
    this.healthFill.setFillStyle(ratio > 0.5 ? 0xd7ff2e : 0xe5484d, 1);
  }

  private die(): void {
    this.alive = false;
    this.health = 0;
    this.respawnRemainingMs = DRONE_CONFIG.respawnMs;
    this.burstRemaining = 0;
    this.body.enable = false;
    this.sprite.setVisible(false);
    this.glow.setVisible(false);
    this.healthBack.setVisible(false);
    this.healthFill.setVisible(false);
    this.events.onDestroyed(this);
  }

  private respawn(): void {
    this.alive = true;
    this.health = DRONE_CONFIG.maxHealth;
    this.respawnRemainingMs = 0;
    this.hitFlashMs = 0;
    this.healthBarMs = 0;
    this.fireCooldownMs = Phaser.Math.Between(800, 1400);
    this.sprite.setPosition(this.spawn.x, this.spawn.y);
    this.sprite.setActive(true).setVisible(true).clearTint();
    this.body.enable = true;
    this.body.reset(this.spawn.x, this.spawn.y);
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
    this.glow.setVisible(true);
  }
}
