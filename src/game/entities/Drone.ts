import Phaser from "phaser";
import { ARENA, type DroneSpawn } from "@/game/arena/arena";
import { segmentIntersectsRect, type Rect } from "@/game/arena/collision";
import { DRONE_CONFIG } from "@/game/config/gameplay";
import { applyDamage, clamp } from "@/game/core/combat";
import {
  findPath,
  lineClear,
  type NavGrid,
  type NavPoint,
} from "@/game/ai/navigation";

export interface BotTarget {
  id: string;
  name: string;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  velocityX: number;
  velocityY: number;
  dead: boolean;
}

export interface BotWorld {
  width: number;
  height: number;
  platformRects: Rect[];
  navGrid: NavGrid;
}

export interface DroneEvents {
  onFire: (drone: Drone) => void;
  onDestroyed: (drone: Drone) => void;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

export class Drone {
  readonly id: string;
  readonly name: string;
  readonly sprite: Phaser.Physics.Arcade.Image;
  health: number = DRONE_CONFIG.maxHealth;
  alive = true;
  aimAngle = 0;
  respawnRemainingMs = 0;
  invulnerableRemainingMs = 0;
  hasLineOfSight = false;
  shotsFired = 0;
  fireCooldownDebug = 0;
  currentTargetId: string | null = null;
  pathLength = 0;
  thrusting = false;
  eliminations = 0;
  deaths = 0;

  private scene: Phaser.Scene;
  private spawn: DroneSpawn;
  private world: BotWorld;
  private events: DroneEvents;
  private glow: Phaser.GameObjects.Arc;
  private shield: Phaser.GameObjects.Arc;
  private nameText: Phaser.GameObjects.Text;
  private healthBack: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;
  private exhaust: Phaser.GameObjects.Particles.ParticleEmitter;
  private phase: number;
  private fireCooldownMs: number;
  private burstRemaining = 0;
  private burstTimerMs = 0;
  private hitFlashMs = 0;
  private healthBarMs = 0;
  private repathTimerMs = 0;
  private strafeTimerMs = 0;
  private strafeSign = 1;
  private path: NavPoint[] = [];
  private pathIndex = 0;
  private lastGoal: NavPoint = { x: 0, y: 0 };
  private stuckMs = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(
    scene: Phaser.Scene,
    spawn: DroneSpawn,
    world: BotWorld,
    events: DroneEvents,
  ) {
    this.scene = scene;
    this.spawn = spawn;
    this.world = world;
    this.events = events;
    this.id = spawn.id;
    this.name = spawn.name;
    this.phase = Math.random() * Math.PI * 2;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimerMs = Phaser.Math.Between(900, 2200);
    this.lastX = spawn.x;
    this.lastY = spawn.y;

    this.sprite = scene.physics.add
      .image(spawn.x, spawn.y, "drone-body")
      .setDepth(24)
      .setCollideWorldBounds(true)
      .setScale(0.9);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(220, 220);
    body.setSize(62, 40);
    body.setOffset(11, 6);

    this.glow = scene.add
      .circle(spawn.x, spawn.y, 16, 0xe5484d, 0.13)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(23);

    this.shield = scene.add
      .circle(spawn.x, spawn.y, 39, 0x000000, 0)
      .setStrokeStyle(2, 0x9bd8f2, 0.7)
      .setDepth(29)
      .setVisible(false);

    this.nameText = scene.add
      .text(spawn.x, spawn.y - 58, spawn.name, {
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
      .rectangle(spawn.x, spawn.y - 44, 50, 6, 0x0c0d0f, 0.9)
      .setDepth(30)
      .setVisible(false);
    this.healthFill = scene.add
      .rectangle(spawn.x - 23, spawn.y - 44, 46, 3, 0xe5484d, 1)
      .setOrigin(0, 0.5)
      .setDepth(31)
      .setVisible(false);

    this.exhaust = scene.add
      .particles(0, 0, "spark-mint", {
        speed: { min: 30, max: 85 },
        angle: { min: 75, max: 105 },
        lifespan: { min: 180, max: 340 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.65, end: 0 },
        tint: [0x9bd8f2, 0xc7692f, 0xf5f3ec],
        frequency: 45,
        quantity: 1,
        emitting: false,
        blendMode: "ADD",
      })
      .setDepth(18);

    this.fireCooldownMs = Phaser.Math.Between(900, 1800);
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

  update(dtMs: number, targets: readonly BotTarget[], now: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.hitFlashMs = Math.max(0, this.hitFlashMs - dtMs);
    this.healthBarMs = Math.max(0, this.healthBarMs - dtMs);
    this.invulnerableRemainingMs = Math.max(0, this.invulnerableRemainingMs - dtMs);

    if (!this.alive) {
      this.exhaust.emitting = false;
      return;
    }

    if (this.hitFlashMs > 0) {
      this.sprite.setTint(0xf5f3ec).setTintMode(Phaser.TintModes.FILL);
    } else {
      this.sprite.clearTint();
    }

    this.shield.setVisible(this.invulnerableRemainingMs > 0);
    if (this.invulnerableRemainingMs > 0) {
      this.shield
        .setPosition(this.x, this.y)
        .setScale(1 + Math.sin(now * 0.012) * 0.05);
    }

    const previousTargetId = this.currentTargetId;
    const target = this.chooseTarget(targets);
    if (target && target.id !== previousTargetId) {
      this.repathTimerMs = 0;
    }
    if (target) {
      this.aimAngle = Math.atan2(
        target.aimY + target.velocityY * 0.12 - this.y,
        target.aimX + target.velocityX * 0.12 - this.x,
      );
      this.fight(target, dt, dtMs, now);
    } else {
      this.returnHome(dt, now);
    }

    this.sprite.setRotation(Phaser.Math.Clamp(this.body.velocity.x / 1600, -0.12, 0.12));
    this.glow.setPosition(this.x + Math.cos(this.aimAngle) * 7, this.y + 4);
    const charge = this.fireCooldownMs < 260 && this.hasLineOfSight ? 1.5 : 1;
    this.glow.setScale(charge + Math.sin(now * 0.012) * 0.06);
    this.glow.setAlpha(0.13 * charge);
    this.glow.setFillStyle(this.hasLineOfSight ? 0xe5484d : 0x9aa0a7, 0.13 * charge);

    this.nameText.setPosition(this.x, this.y - 58);
    this.healthBack.setPosition(this.x, this.y - 44);
    this.healthFill.setPosition(this.x - 23, this.y - 44);
    this.updateHealthBar();

    this.exhaust.setPosition(this.x, this.y + 14);
    this.exhaust.emitting = this.thrusting;

    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    if (moved < 0.6 && target && this.path.length === 0) {
      this.stuckMs += dtMs;
      if (this.stuckMs > 500) {
        this.repathTimerMs = 0;
        this.body.velocity.y = -150;
        this.stuckMs = 0;
      }
    } else {
      this.stuckMs = 0;
    }
    this.lastX = this.x;
    this.lastY = this.y;

    if (this.body.blocked.left || this.body.blocked.right) {
      this.repathTimerMs = 0;
    }
    if (this.body.blocked.up) {
      this.body.velocity.y = 90;
    }
  }

  private chooseTarget(targets: readonly BotTarget[]): BotTarget | null {
    const alive = targets.filter((target) => !target.dead && target.id !== this.id);
    if (alive.length === 0) {
      this.currentTargetId = null;
      return null;
    }

    const current = alive.find((target) => target.id === this.currentTargetId);
    let nearest = alive[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const target of alive) {
      const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = target;
      }
    }

    if (current) {
      const currentDistance = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        current.x,
        current.y,
      );
      if (currentDistance <= nearestDistance * 1.45) {
        this.currentTargetId = current.id;
        return current;
      }
    }

    this.currentTargetId = nearest.id;
    return nearest;
  }

  private fight(target: BotTarget, dt: number, dtMs: number, now: number): void {
    const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const lineOfSight = !this.world.platformRects.some((rect) =>
      segmentIntersectsRect(this.x, this.y, target.aimX, target.aimY, rect),
    );
    this.hasLineOfSight = lineOfSight;

    this.strafeTimerMs -= dtMs;
    if (this.strafeTimerMs <= 0) {
      this.strafeSign *= -1;
      this.strafeTimerMs = Phaser.Math.Between(1200, 2400);
    }

    const inCombatBand = distance < 520 && distance > 140;
    let goal: NavPoint | null = null;
    let direct = false;

    if (lineOfSight && inCombatBand) {
      const desired = {
        x: target.x + this.strafeSign * DRONE_CONFIG.standoffDistance,
        y: target.aimY - 120 + Math.sin(now * 0.002 + this.phase) * 28,
      };
      if (lineClear({ x: this.x, y: this.y }, desired, this.world.navGrid.obstacles)) {
        goal = desired;
        direct = true;
        this.path = [];
        this.pathIndex = 0;
        this.pathLength = 0;
      }
    }

    this.repathTimerMs -= dtMs;
    const goalMoved = Phaser.Math.Distance.Between(
      this.lastGoal.x,
      this.lastGoal.y,
      target.x,
      target.aimY,
    );
    if (!direct && (this.repathTimerMs <= 0 || goalMoved > 140)) {
      const navGoal = {
        x: target.x,
        y: target.aimY - 35,
      };
      this.path = findPath(
        this.world.navGrid,
        { x: this.x, y: this.y },
        navGoal,
      ) ?? [];
      this.pathIndex = 0;
      this.lastGoal = navGoal;
      this.repathTimerMs = DRONE_CONFIG.repathMs;
      this.pathLength = this.path.length;
    }

    if (!direct && this.path.length > 0) {
      const waypoint = this.followPath();
      if (waypoint) goal = waypoint;
    }

    if (!goal) {
      goal = {
        x: this.x + (target.x >= this.x ? 40 : -40),
        y: this.y - 30,
      };
      direct = true;
    }

    const desiredX = Phaser.Math.Clamp(goal.x, 60, this.world.width - 60);
    const desiredY = Phaser.Math.Clamp(goal.y, 90, ARENA.groundY - 80);
    const dx = desiredX - this.x;
    const dy = desiredY - this.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = direct ? DRONE_CONFIG.hoverSpeed : DRONE_CONFIG.hoverSpeed * 1.05;
    const desiredVX = (dx / length) * speed;
    const desiredVY = (dy / length) * speed;
    const acceleration = (this.body.blocked.left || this.body.blocked.right ? 620 : 380) * dt;

    this.body.velocity.x = approach(this.body.velocity.x, desiredVX, acceleration);
    this.body.velocity.y = approach(this.body.velocity.y, desiredVY, acceleration);
    this.thrusting = desiredVY < -18 || this.body.blocked.left || this.body.blocked.right;

    if (this.body.blocked.left || this.body.blocked.right) {
      this.body.velocity.y = Math.min(this.body.velocity.y, -95);
    }

    if (lineOfSight && distance < DRONE_CONFIG.aggroRange) {
      this.stepFire(dtMs);
    } else {
      this.burstRemaining = 0;
    }
  }

  private returnHome(dt: number, now: number): void {
    this.hasLineOfSight = false;
    this.thrusting = false;
    this.path = [];
    this.pathIndex = 0;
    this.pathLength = 0;
    const target = {
      x: this.spawn.x,
      y: this.spawn.y + Math.sin(now * 0.0018 + this.phase) * 14,
    };
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    if (length < 16) {
      this.body.velocity.x = approach(this.body.velocity.x, 0, 260 * dt);
      this.body.velocity.y = approach(this.body.velocity.y, 0, 260 * dt);
      return;
    }
    this.body.velocity.x = approach(this.body.velocity.x, (dx / length) * 95, 280 * dt);
    this.body.velocity.y = approach(this.body.velocity.y, (dy / length) * 95, 280 * dt);
    this.thrusting = dy < -12;
  }

  private followPath(): NavPoint | null {
    while (this.pathIndex < this.path.length) {
      const point = this.path[this.pathIndex];
      if (Phaser.Math.Distance.Between(this.x, this.y, point.x, point.y) < 26) {
        this.pathIndex += 1;
        continue;
      }
      return point;
    }
    this.path = [];
    this.pathIndex = 0;
    this.pathLength = 0;
    return null;
  }

  private stepFire(dtMs: number): void {
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
      return;
    }

    this.fireCooldownMs = Math.max(0, this.fireCooldownMs - dtMs);
    if (this.fireCooldownMs <= 0) {
      this.burstRemaining = DRONE_CONFIG.burstCount;
      this.burstTimerMs = 70;
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.invulnerableRemainingMs > 0) return false;
    this.health = applyDamage(this.health, amount);
    this.hitFlashMs = 70;
    this.healthBarMs = 2600;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  debugPath(): readonly NavPoint[] {
    return this.path;
  }

  muzzlePoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.x + Math.cos(this.aimAngle) * 38,
      this.y + Math.sin(this.aimAngle) * 38,
    );
  }

  tickRespawn(dtMs: number): boolean {
    if (this.alive) return false;
    this.respawnRemainingMs = Math.max(0, this.respawnRemainingMs - dtMs);
    return this.respawnRemainingMs <= 0;
  }

  respawnAt(x: number, y: number): void {
    this.alive = true;
    this.health = DRONE_CONFIG.maxHealth;
    this.respawnRemainingMs = 0;
    this.hitFlashMs = 0;
    this.healthBarMs = 0;
    this.invulnerableRemainingMs = DRONE_CONFIG.invulnerabilityMs;
    this.fireCooldownMs = Phaser.Math.Between(700, 1300);
    this.burstRemaining = 0;
    this.path = [];
    this.pathIndex = 0;
    this.pathLength = 0;
    this.repathTimerMs = 0;
    this.currentTargetId = null;
    this.stuckMs = 0;
    this.lastX = x;
    this.lastY = y;
    this.sprite.setPosition(x, y);
    this.sprite.setActive(true).setVisible(true).clearTint();
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
    this.glow.setVisible(true);
    this.shield.setVisible(true).setPosition(x, y);
    this.nameText.setVisible(true);
    this.healthBack.setVisible(false);
    this.healthFill.setVisible(false);
  }

  private updateHealthBar(): void {
    const visible = this.alive && this.healthBarMs > 0;
    this.healthBack.setVisible(visible);
    this.healthFill.setVisible(visible);
    if (!visible) return;
    const ratio = clamp(this.health / DRONE_CONFIG.maxHealth, 0, 1);
    this.healthFill.setDisplaySize(46 * ratio, 3);
    this.healthFill.setFillStyle(ratio > 0.5 ? 0xd7ff2e : 0xe5484d, 1);
  }

  private die(): void {
    this.alive = false;
    this.health = 0;
    this.respawnRemainingMs = DRONE_CONFIG.respawnMs;
    this.burstRemaining = 0;
    this.pathLength = 0;
    this.path = [];
    this.body.enable = false;
    this.body.setVelocity(0, 0);
    this.sprite.setVisible(false);
    this.glow.setVisible(false);
    this.shield.setVisible(false);
    this.nameText.setVisible(false);
    this.healthBack.setVisible(false);
    this.healthFill.setVisible(false);
    this.exhaust.emitting = false;
    this.events.onDestroyed(this);
  }
}
