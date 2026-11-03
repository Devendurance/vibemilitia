import Phaser from "phaser";
import { ARENA } from "@/game/arena/arena";
import { segmentIntersectsRect } from "@/game/arena/collision";
import { buildArena, type ArenaBuildResult } from "@/game/arena/ArenaBuilder";
import {
  DRONE_WEAPON,
  JETPACK_CONFIG,
  PLAYER_CONFIG,
  PLAYER_WEAPON,
} from "@/game/config/gameplay";
import type { DebugProbe, GameBridge, GameCommand, HudSnapshot } from "@/game/bridge";
import { INITIAL_HUD } from "@/game/bridge";
import { reloadProgress } from "@/game/core/weapon";
import { Drone } from "@/game/entities/Drone";
import { Player } from "@/game/entities/Player";
import { EffectsSystem } from "@/game/systems/EffectsSystem";
import { InputController } from "@/game/systems/InputController";
import { ProjectileSystem } from "@/game/systems/ProjectileSystem";
import { createGameTextures } from "@/game/systems/TextureFactory";

export class ArenaScene extends Phaser.Scene {
  private bridge: GameBridge;
  private arenaBuild!: ArenaBuildResult;
  private inputController!: InputController;
  private player!: Player;
  private drones: Drone[] = [];
  private projectiles!: ProjectileSystem;
  private effects!: EffectsSystem;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  private ready = false;
  private elapsedMs = 0;
  private hudTimerMs = 0;
  private dronesDown = 0;
  private droneBulletHitsPlayer = 0;
  private playerBulletHitsDrone = 0;
  private droneShots = 0;
  private commandUnsubscribe: (() => void) | null = null;
  private testApi: {
    getProbe: () => DebugProbe;
    send: (command: GameCommand) => void;
  } | null = null;

  constructor(bridge: GameBridge) {
    super("ArenaScene");
    this.bridge = bridge;
  }

  preload(): void {
    this.load.image("player-viber", "/sprites/viber-010/viber-010-cutout.png");
  }

  create(): void {
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.setBackgroundColor("#9bd8f2");
    this.cameras.main.setRoundPixels(false);

    createGameTextures(this);
    this.arenaBuild = buildArena(this, ARENA);
    this.effects = new EffectsSystem(this);

    this.player = new Player(this, ARENA.playerSpawn.x, ARENA.playerSpawn.y);
    this.physics.add.collider(this.player.sprite, this.arenaBuild.collisionObjects);

    this.cameras.main.startFollow(this.player.sprite, true, 0.075, 0.075);
    this.cameras.main.setDeadzone(240, 150);
    this.cameras.main.fadeIn(550, 12, 13, 15);

    this.drones = ARENA.droneSpawns.map(
      (spawn) =>
        new Drone(this, spawn, {
          onFire: (source) => this.onDroneFire(source),
          onDestroyed: (source) => this.onDroneDestroyed(source),
          onRespawn: (source) => {
            this.effects.spawn(source.x, source.y + 40);
            this.publishHud(true);
          },
        }),
    );

    this.projectiles = new ProjectileSystem(this, this.arenaBuild.collisionObjects, this.effects);
    this.physics.add.overlap(
      this.projectiles.playerBullets,
      this.drones.map((drone) => drone.sprite),
      (objectA, objectB) => {
        this.onPlayerBulletHitDrone(objectA, objectB);
      },
    );
    this.physics.add.overlap(
      this.projectiles.droneBullets,
      this.player.sprite,
      (objectA, objectB) => {
        this.onDroneBulletHitPlayer(objectA, objectB);
      },
    );

    this.inputController = new InputController(this);
    this.debugGraphics = this.add.graphics().setDepth(200);
    this.crosshair = this.add.graphics().setDepth(300);
    this.crosshair.setScrollFactor(1);

    this.commandUnsubscribe = this.bridge.onCommand((command) => this.handleCommand(command));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    this.installTestApi();
    this.effects.spawn(ARENA.playerSpawn.x, ARENA.playerSpawn.y);
    this.ready = true;
    this.publishHud(true);
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, 50);
    this.elapsedMs += dtMs;
    this.hudTimerMs += dtMs;

    const input = this.inputController.sample(
      this.cameras.main,
      this.player.x,
      this.player.y,
    );

    if (this.inputController.debugPressed()) {
      this.setDebugVisible(!this.debugVisible);
    }

    if (this.player.dead) {
      if (this.player.tickRespawn(dtMs)) {
        this.effects.spawn(this.player.x, this.player.y);
        this.cameras.main.flash(260, 215, 255, 46, false);
        this.publishHud(true);
      }
    } else {
      const step = this.player.update(dtMs, input, input.aimWorld);
      if (step.landed) {
        this.player.visuals.dustPuff(this.player.x, this.player.y);
        this.cameras.main.shake(55, 0.0012, true);
      }

      const weapon = this.player.stepWeapon(dtMs, input);
      if (weapon.fired) {
        const muzzle = this.player.getMuzzlePoint();
        this.projectiles.firePlayer(muzzle.x, muzzle.y, this.player.aimAngle, this.elapsedMs);
        this.effects.muzzle(muzzle.x, muzzle.y);
        this.cameras.main.shake(38, 0.0011, true);
        this.publishHud(true);
      }
      if (weapon.startedReload || weapon.finishedReload) {
        this.publishHud(true);
      }
    }

    for (const drone of this.drones) {
      const hasLineOfSight = !this.arenaBuild.platformRects.some((rect) =>
        segmentIntersectsRect(
          drone.x,
          drone.y,
          this.player.x,
          this.player.y - 56,
          rect,
        ),
      );
      drone.update(dtMs, this.player, hasLineOfSight && !this.player.dead, this.elapsedMs);
    }

    this.projectiles.update(this.elapsedMs, ARENA.width, ARENA.height);
    this.drawCrosshair(input.aimWorld);
    this.drawDebug();

    if (this.hudTimerMs >= 80) {
      this.hudTimerMs = 0;
      this.publishHud(false);
    }
  }

  private onPlayerBulletHitDrone(objectA: unknown, objectB: unknown): void {
    const bullet = this.projectiles.asBullet(objectA) ?? this.projectiles.asBullet(objectB);
    if (!bullet || !bullet.active) return;
    const other = bullet === objectA ? objectB : objectA;
    const drone = this.drones.find((candidate) => candidate.sprite === other);
    if (!drone || !drone.alive) return;

    this.playerBulletHitsDrone += 1;
    const damage = this.projectiles.damageOf(bullet);
    this.projectiles.consumeDroneHit(bullet, bullet.x, bullet.y);
    const died = drone.takeDamage(damage);
    this.effects.damageNumber(drone.x, drone.y - 30, damage);
    this.effects.hitMarker(bullet.x, bullet.y);
    this.cameras.main.shake(45, 0.0015, true);
    this.publishHud(true);

    if (died) {
      this.effects.droneDestroyed(drone.x, drone.y);
      this.dronesDown += 1;
      this.cameras.main.shake(160, 0.004, true);
      this.publishHud(true);
    }
  }

  private onDroneBulletHitPlayer(objectA: unknown, objectB: unknown): void {
    const bullet = this.projectiles.asBullet(objectA) ?? this.projectiles.asBullet(objectB);
    if (!bullet || !bullet.active || this.player.dead) return;
    this.droneBulletHitsPlayer += 1;
    const damage = this.projectiles.damageOf(bullet);
    this.projectiles.consumePlayerHit(bullet, bullet.x, bullet.y);

    if (this.player.invulnerableRemainingMs > 0) {
      this.effects.ring(this.player.x, this.player.y - 58, 0xd7ff2e);
      return;
    }

    const died = this.player.takeDamage(damage);
    this.effects.damageNumber(this.player.x, this.player.y - 100, damage, "#ffb4b6");
    this.cameras.main.shake(died ? 280 : 80, died ? 0.012 : 0.0025, true);
    if (died) {
      this.effects.playerDestroyed(this.player.x, this.player.y);
      this.cameras.main.flash(200, 229, 72, 77, false);
    }
    this.publishHud(true);
  }

  private onDroneFire(drone: Drone): void {
    if (!drone.alive || this.player.dead) return;
    this.droneShots += 1;
    const muzzle = drone.muzzlePoint();
    this.projectiles.fireDrone(
      muzzle.x,
      muzzle.y,
      drone.aimAngle,
      DRONE_WEAPON.spreadRadians,
      DRONE_WEAPON.damage,
      DRONE_WEAPON.projectileSpeed,
      this.elapsedMs,
    );
    this.effects.muzzle(muzzle.x, muzzle.y, true);
  }

  private onDroneDestroyed(drone: Drone): void {
    this.effects.droneDestroyed(drone.x, drone.y);
  }

  private drawCrosshair(aimWorld: Phaser.Math.Vector2): void {
    this.crosshair.clear();
    if (this.player.dead) return;

    const target = aimWorld;
    const spread = 10 + (this.player.weapon.cooldownMs / PLAYER_WEAPON.fireIntervalMs) * 5;
    const reloading = this.player.weapon.reloading;
    const color = reloading ? 0xf5f3ec : 0xd7ff2e;
    const alpha = reloading ? 0.8 : 0.95;

    const muzzle = this.player.getMuzzlePoint();
    this.crosshair.lineStyle(1, color, 0.1);
    this.crosshair.lineBetween(muzzle.x, muzzle.y, target.x, target.y);

    this.crosshair.lineStyle(2, color, alpha);
    for (const [sx, sy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      this.crosshair.lineBetween(
        target.x + sx * spread,
        target.y + sy * spread,
        target.x + sx * (spread + 7),
        target.y + sy * (spread + 7),
      );
    }
    this.crosshair.fillStyle(color, alpha);
    this.crosshair.fillRect(target.x - 1.5, target.y - 1.5, 3, 3);
    this.crosshair.lineStyle(1, color, 0.32);
    this.crosshair.strokeCircle(target.x, target.y, spread + 13);
  }

  private drawDebug(): void {
    this.debugGraphics.clear();
    if (!this.debugVisible) return;

    this.debugGraphics.lineStyle(2, 0xd7ff2e, 0.72);
    for (const rect of this.arenaBuild.platformRects) {
      this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    if (!this.player.dead) {
      const body = this.player.body;
      this.debugGraphics.lineStyle(2, 0xe5484d, 1);
      this.debugGraphics.strokeRect(body.x, body.y, body.width, body.height);
      this.debugGraphics.lineStyle(1, 0xf5f3ec, 0.65);
      this.debugGraphics.lineBetween(
        this.player.x + 28,
        this.player.y - 58,
        this.player.x + 28 + Math.cos(this.player.aimAngle) * 90,
        this.player.y - 58 + Math.sin(this.player.aimAngle) * 90,
      );
    }

    for (const drone of this.drones) {
      if (!drone.alive) continue;
      const body = drone.body;
      this.debugGraphics.lineStyle(2, 0xc7692f, 0.95);
      this.debugGraphics.strokeRect(body.x, body.y, body.width, body.height);
    }

    this.debugGraphics.fillStyle(0x9bd8f2, 1);
    for (const bullet of this.projectiles.listActive()) {
      this.debugGraphics.fillRect(bullet.x - 2, bullet.y - 2, 4, 4);
    }

    this.debugGraphics.fillStyle(0xe5484d, 0.8);
    for (const drone of this.drones) {
      if (drone.alive && !this.player.dead) {
        this.debugGraphics.fillCircle(drone.x, drone.y, 3);
      }
    }
  }

  private publishHud(force: boolean): void {
    if (!this.ready && !force) return;
    this.bridge.publish(this.buildSnapshot());
  }

  private buildSnapshot(): HudSnapshot {
    return {
      ...INITIAL_HUD,
      ready: this.ready,
      health: Math.max(0, Math.round(this.player?.health ?? 0)),
      maxHealth: PLAYER_CONFIG.maxHealth,
      fuel: Math.max(0, Math.round(this.player?.jetpack.fuel ?? 0)),
      maxFuel: JETPACK_CONFIG.maxFuel,
      ammo: this.player?.weapon.ammo ?? 0,
      magazineSize: PLAYER_WEAPON.magazineSize,
      reloading: this.player?.weapon.reloading ?? false,
      reloadProgress: this.player
        ? reloadProgress(this.player.weapon, PLAYER_WEAPON)
        : 1,
      isDead: this.player?.dead ?? false,
      respawnIn: this.player?.dead ? this.player.respawnRemainingMs / 1000 : 0,
      playerX: this.player?.x ?? 0,
      playerY: this.player?.y ?? 0,
      grounded: this.player?.grounded ?? false,
      thrusting: this.player?.thrusting ?? false,
      aimAngle: this.player?.aimAngle ?? 0,
      dronesDown: this.dronesDown,
      dronesAlive: this.drones.filter((drone) => drone.alive).length,
      droneTotal: this.drones.length,
      uptimeMs: this.elapsedMs,
      debug: this.debugVisible,
      damageSeq: this.player?.damageSeq ?? 0,
    };
  }

  private setDebugVisible(value: boolean): void {
    this.debugVisible = value;
    this.debugGraphics.setVisible(value);
    this.publishHud(true);
  }

  private handleCommand(command: GameCommand): void {
    switch (command.type) {
      case "toggle-debug":
        this.setDebugVisible(!this.debugVisible);
        break;
      case "set-debug":
        this.setDebugVisible(command.value);
        break;
      case "respawn":
        this.player.forceRespawn();
        this.effects.spawn(this.player.x, this.player.y);
        this.publishHud(true);
        break;
      case "reset-score":
        this.dronesDown = 0;
        this.publishHud(true);
        break;
    }
  }

  private installTestApi(): void {
    this.testApi = {
      getProbe: () => this.buildProbe(),
      send: (command) => this.handleCommand(command),
    };
    window.__VIBE_MILITIA__ = this.testApi;
  }

  private buildProbe(): DebugProbe {
    return {
      hud: this.buildSnapshot(),
      player: {
        x: this.player.x,
        y: this.player.y,
        velocityX: this.player.dead ? 0 : this.player.body.velocity.x,
        velocityY: this.player.dead ? 0 : this.player.body.velocity.y,
        onGround: this.player.grounded,
        thrusting: this.player.thrusting,
        health: this.player.health,
        fuel: this.player.jetpack.fuel,
        ammo: this.player.weapon.ammo,
        reloading: this.player.weapon.reloading,
        dead: this.player.dead,
        aimAngle: this.player.aimAngle,
        visible: this.player.sprite.visible,
        alpha: this.player.sprite.alpha,
        bodyEnabled: this.player.body.enable,
        bodyMoves: this.player.body.moves,
        texture: this.player.sprite.texture.key,
      },
      drones: this.drones.map((drone) => ({
        id: drone.id,
        x: drone.x,
        y: drone.y,
        health: drone.health,
        alive: drone.alive,
        sight: drone.hasLineOfSight,
        shotsFired: drone.shotsFired,
        cooldown: drone.fireCooldownDebug,
      })),
      projectiles: this.projectiles.listActive(),
      platforms: ARENA.platforms.map((platform) => ({
        id: platform.id,
        x: platform.x,
        y: platform.y,
        width: platform.width,
        height: platform.height,
      })),
      camera: {
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
        zoom: this.cameras.main.zoom,
      },
      counters: {
        droneBulletHitsPlayer: this.droneBulletHitsPlayer,
        playerBulletHitsDrone: this.playerBulletHitsDrone,
        droneShots: this.droneShots,
      },
      debugVisible: this.debugVisible,
    };
  }

  private cleanup(): void {
    this.commandUnsubscribe?.();
    this.commandUnsubscribe = null;
    if (this.testApi && window.__VIBE_MILITIA__ === this.testApi) {
      delete window.__VIBE_MILITIA__;
    }
    this.testApi = null;
    this.ready = false;
  }
}
