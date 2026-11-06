import Phaser from "phaser";
import { ARENA, type ArenaSpawnPoint } from "@/game/arena/arena";
import { buildArena, type ArenaBuildResult } from "@/game/arena/ArenaBuilder";
import { buildNavigationGrid, type NavGrid } from "@/game/ai/navigation";
import {
  JETPACK_CONFIG,
  MATCH_CONFIG,
  PLAYER_CONFIG,
  PLAYER_WEAPONS,
  getPracticeDifficulty,
  type PracticeDifficulty,
} from "@/game/config/gameplay";
import type {
  DebugProbe,
  GameBridge,
  GameCommand,
  HudFeedEntry,
  HudPlayerKill,
  HudSnapshot,
  HudStanding,
} from "@/game/bridge";
import { INITIAL_HUD } from "@/game/bridge";
import { clamp } from "@/game/core/combat";
import {
  createMatchTimer,
  endMatchForScore,
  rankParticipants,
  reachedScoreLimit,
  stepMatchTimer,
  type MatchTimerState,
  type ParticipantSummary,
} from "@/game/core/match";
import { selectSpawnPoint, type SpawnThreat } from "@/game/core/spawn";
import { reloadProgress } from "@/game/core/weapon";
import { Drone, type BotTarget, type BotWorld } from "@/game/entities/Drone";
import { getCharacterSkin } from "@/game/characters/roster";
import { Player } from "@/game/entities/Player";
import { audio } from "@/game/audio/AudioEngine";
import { EffectsSystem } from "@/game/systems/EffectsSystem";
import { InputController } from "@/game/systems/InputController";
import { ProjectileSystem } from "@/game/systems/ProjectileSystem";
import { preloadLoadoutArt } from "@/game/systems/LoadoutArt";
import { createGameTextures } from "@/game/systems/TextureFactory";

export class ArenaScene extends Phaser.Scene {
  private bridge: GameBridge;
  private difficulty: PracticeDifficulty;
  private skinId: string;
  private resizeHandler: (() => void) | null = null;
  private arenaBuild!: ArenaBuildResult;
  private navGrid!: NavGrid;
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
  private hitFeedbackMs = 0;
  private matchTimer: MatchTimerState = createMatchTimer(MATCH_CONFIG.durationMs);
  private feed: HudFeedEntry[] = [];
  private feedCounter = 0;
  private lastPlayerKill: HudPlayerKill | null = null;
  private lastKillerName: string | null = null;
  private lastPlayerDeath: { x: number; y: number } | null = null;
  private droneBulletHitsPlayer = 0;
  private playerBulletHitsBot = 0;
  private botBulletHitsBot = 0;
  private botShots = 0;
  private commandUnsubscribe: (() => void) | null = null;
  private testApi: {
    getProbe: () => DebugProbe;
    send: (command: GameCommand) => void;
  } | null = null;

  constructor(
    bridge: GameBridge,
    difficulty: PracticeDifficulty = "normal",
    skinId = "viber-010",
  ) {
    super("ArenaScene");
    this.bridge = bridge;
    this.difficulty = getPracticeDifficulty(difficulty);
    this.skinId = getCharacterSkin(skinId).skinId;
  }

  preload(): void {
    const skin = getCharacterSkin(this.skinId);
    this.load.image("player-viber", skin.cutoutPath);
    preloadLoadoutArt(this);
  }

  create(): void {
    this.ready = false;
    this.elapsedMs = 0;
    this.hudTimerMs = 0;
    this.hitFeedbackMs = 0;
    this.matchTimer = createMatchTimer(MATCH_CONFIG.durationMs);
    this.feed = [];
    this.feedCounter = 0;
    this.lastPlayerKill = null;
    this.lastKillerName = null;
    this.lastPlayerDeath = null;
    this.droneBulletHitsPlayer = 0;
    this.playerBulletHitsBot = 0;
    this.botBulletHitsBot = 0;
    this.botShots = 0;
    this.debugVisible = false;
    this.drones = [];

    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.setBackgroundColor("#9bd8f2");
    this.cameras.main.setRoundPixels(false);

    createGameTextures(this);
    this.arenaBuild = buildArena(this, ARENA);
    this.navGrid = buildNavigationGrid(
      ARENA.width,
      ARENA.height,
      this.arenaBuild.platformRects,
      42,
      64,
    );
    this.effects = new EffectsSystem(this);

    this.player = new Player(this, ARENA.playerSpawn.x, ARENA.playerSpawn.y);
    this.physics.add.collider(this.player.sprite, this.arenaBuild.collisionObjects);

    this.cameras.main.startFollow(this.player.sprite, true, 0.075, 0.075);
    const applyCameraScale = () => {
      const width = this.scale.width;
      const height = this.scale.height;
      const compact = height < 600 || width / Math.max(1, height) > 1.95;
      const zoom = compact
        ? Math.max(0.5, Math.min(0.86, height / 680))
        : 1;
      this.cameras.main.setZoom(zoom);
      this.cameras.main.setDeadzone(
        compact ? 150 : 240,
        compact ? 90 : 150,
      );
    };
    applyCameraScale();
    this.resizeHandler = applyCameraScale;
    this.scale.on(Phaser.Scale.Events.RESIZE, applyCameraScale);
    this.cameras.main.fadeIn(450, 12, 13, 15);

    const botWorld: BotWorld = {
      width: ARENA.width,
      height: ARENA.height,
      platformRects: this.arenaBuild.platformRects,
      navGrid: this.navGrid,
    };
    this.drones = ARENA.droneSpawns.map(
      (spawn) =>
        new Drone(
          this,
          spawn,
          botWorld,
          {
            onFire: (source) => this.onDroneFire(source),
            onDestroyed: (source) => this.onDroneDestroyed(source),
          },
          { difficulty: this.difficulty },
        ),
    );
    for (const drone of this.drones) {
      this.physics.add.collider(drone.sprite, this.arenaBuild.collisionObjects);
    }
    for (let a = 0; a < this.drones.length; a += 1) {
      for (let b = a + 1; b < this.drones.length; b += 1) {
        this.physics.add.collider(this.drones[a].sprite, this.drones[b].sprite);
      }
    }

    this.projectiles = new ProjectileSystem(this, this.arenaBuild.collisionObjects, this.effects);
    this.physics.add.overlap(
      this.projectiles.playerBullets,
      this.drones.map((drone) => drone.sprite),
      (objectA, objectB) => this.onPlayerBulletHitBot(objectA, objectB),
    );
    this.physics.add.overlap(
      this.projectiles.droneBullets,
      this.player.sprite,
      (objectA, objectB) => this.onBotBulletHitPlayer(objectA, objectB),
    );
    this.physics.add.overlap(
      this.projectiles.droneBullets,
      this.drones.map((drone) => drone.sprite),
      (objectA, objectB) => this.onBotBulletHitBot(objectA, objectB),
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
    for (const drone of this.drones) {
      this.effects.spawn(drone.x, drone.y + 30);
    }
    this.ready = true;
    this.publishHud(true);
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, 50);
    this.elapsedMs += dtMs;
    this.hudTimerMs += dtMs;
    this.hitFeedbackMs = Math.max(0, this.hitFeedbackMs - dtMs);

    const input = this.inputController.sample(
      this.cameras.main,
      this.player.x,
      this.player.y,
    );

    if (this.inputController.debugPressed()) {
      this.setDebugVisible(!this.debugVisible);
    }

    if (this.matchTimer.phase !== "live") {
      this.crosshair.clear();
      this.drawDebug();
      if (this.hudTimerMs >= 120) {
        this.hudTimerMs = 0;
        this.publishHud(false);
      }
      return;
    }

    const previousTimer = this.matchTimer;
    this.matchTimer = stepMatchTimer(this.matchTimer, dtMs);
    if (this.matchTimer.phase === "ended" && previousTimer.phase === "live") {
      this.finishMatch();
      this.drawDebug();
      return;
    }

    if (this.player.dead) {
      if (this.player.tickRespawn(dtMs)) {
        this.respawnPlayer();
      }
    } else {
      const previousWeaponId = this.player.weaponDefinition.id;
      const step = this.player.update(dtMs, input, input.aimWorld);
    audio.setJetpackActive(
      !this.player.dead && this.player.thrusting,
      0.7,
    );
      if (step.landed) {
        this.player.visuals.dustPuff(this.player.x, this.player.y);
        this.cameras.main.shake(55, 0.0012, true);
      }

      const weapon = this.player.stepWeapon(dtMs, input);
      if (weapon.fired) {
        const definition = this.player.weaponDefinition;
        const muzzle = this.player.getMuzzlePoint();
        this.projectiles.firePlayer(
          definition,
          muzzle.x,
          muzzle.y,
          this.player.aimAngle,
          this.elapsedMs,
        );
        this.effects.muzzle(muzzle.x, muzzle.y);
      switch (definition.id) {
        case "scatter-blaster":
          audio.play("scatter", 0.8);
          break;
        case "vibe-lance":
          audio.play("lance", 0.8);
          break;
        default:
          audio.play("rifle", 0.8);
          break;
      }
        this.cameras.main.shake(
          38,
          Math.min(0.006, 0.0007 * definition.recoil),
          true,
        );
        this.publishHud(true);
      }
      if (weapon.startedReload || weapon.finishedReload) {
        this.publishHud(true);
      }
      if (this.player.weaponDefinition.id !== previousWeaponId) {
        this.publishHud(true);
      }
    }

    const targets = this.buildBotTargets();
    for (const drone of this.drones) {
      if (drone.alive) {
        drone.update(dtMs, targets, this.elapsedMs);
      } else if (drone.tickRespawn(dtMs)) {
        this.respawnDrone(drone);
      }
    }

    this.projectiles.update(this.elapsedMs, ARENA.width, ARENA.height);
    this.clampCameraToArena();
    this.drawCrosshair(input.aimWorld);
    this.drawDebug();

    if (this.hudTimerMs >= 80) {
      this.hudTimerMs = 0;
      this.publishHud(false);
    }
  }

  private clampCameraToArena(): void {
    const camera = this.cameras.main;
    const visibleWidth = camera.width / Math.max(0.01, camera.zoom);
    const visibleHeight = camera.height / Math.max(0.01, camera.zoom);
    camera.scrollX = Math.max(
      0,
      Math.min(camera.scrollX, ARENA.width - visibleWidth),
    );
    camera.scrollY = Math.max(
      0,
      Math.min(camera.scrollY, ARENA.height - visibleHeight),
    );
  }

  private buildBotTargets(): BotTarget[] {
    const targets: BotTarget[] = [];
    if (!this.player.dead) {
      targets.push({
        id: "player",
        name: "VIBER-010",
        x: this.player.x,
        y: this.player.y,
        aimX: this.player.x,
        aimY: this.player.y - 58,
        velocityX: this.player.body.velocity.x,
        velocityY: this.player.body.velocity.y,
        dead: false,
      });
    }
    for (const drone of this.drones) {
      if (!drone.alive) continue;
      targets.push({
        id: drone.id,
        name: drone.name,
        x: drone.x,
        y: drone.y,
        aimX: drone.x,
        aimY: drone.y,
        velocityX: drone.body.velocity.x,
        velocityY: drone.body.velocity.y,
        dead: false,
      });
    }
    return targets;
  }

  private onPlayerBulletHitBot(objectA: unknown, objectB: unknown): void {
    if (this.matchTimer.phase !== "live") return;
    const bullet = this.projectiles.asBullet(objectA) ?? this.projectiles.asBullet(objectB);
    if (!bullet || !bullet.active) return;
    const other = bullet === objectA ? objectB : objectA;
    const drone = this.drones.find((candidate) => candidate.sprite === other);
    if (!drone || !drone.alive) return;
    const data = this.projectiles.dataOf(bullet);
    if (!data) return;

    this.playerBulletHitsBot += 1;
    this.player.shotsHit += 1;
    this.projectiles.consumeBotHit(bullet, bullet.x, bullet.y);

    if (drone.invulnerableRemainingMs > 0) {
      this.effects.ring(drone.x, drone.y, 0x9bd8f2);
      return;
    }

    const died = drone.takeDamage(data.damage);
    this.hitFeedbackMs = 100;
    this.effects.damageNumber(drone.x, drone.y - 30, data.damage);
    this.effects.hitMarker(bullet.x, bullet.y);
    this.cameras.main.shake(45, 0.0015, true);
    if (died) {
      this.recordElimination("player", drone.id, data.weaponName);
      this.cameras.main.shake(160, 0.004, true);
      audio.play("elimination", 1);
    }
    this.publishHud(true);
  }

  private onBotBulletHitPlayer(objectA: unknown, objectB: unknown): void {
    if (this.matchTimer.phase !== "live") return;
    const bullet = this.projectiles.asBullet(objectA) ?? this.projectiles.asBullet(objectB);
    if (!bullet || !bullet.active || this.player.dead) return;
    const data = this.projectiles.dataOf(bullet);
    if (!data) return;

    this.droneBulletHitsPlayer += 1;
    this.projectiles.consumePlayerHit(bullet, bullet.x, bullet.y);

    if (this.player.invulnerableRemainingMs > 0) {
      this.effects.ring(this.player.x, this.player.y - 58, 0xd7ff2e);
      return;
    }

    const died = this.player.takeDamage(data.damage);
    this.effects.damageNumber(this.player.x, this.player.y - 100, data.damage, "#ffb4b6");
    this.cameras.main.shake(died ? 280 : 80, died ? 0.012 : 0.0025, true);
    audio.play("damage", 1);
    if (died) {
      this.lastPlayerDeath = { x: this.player.x, y: this.player.y };
      this.effects.playerDestroyed(this.player.x, this.player.y);
      this.cameras.main.flash(200, 229, 72, 77, false);
      this.recordElimination(data.ownerId, "player", data.weaponName);
    }
    this.publishHud(true);
  }

  private onBotBulletHitBot(objectA: unknown, objectB: unknown): void {
    if (this.matchTimer.phase !== "live") return;
    const bullet = this.projectiles.asBullet(objectA) ?? this.projectiles.asBullet(objectB);
    if (!bullet || !bullet.active) return;
    const other = bullet === objectA ? objectB : objectA;
    const target = this.drones.find((candidate) => candidate.sprite === other);
    if (!target || !target.alive) return;
    const data = this.projectiles.dataOf(bullet);
    if (!data || data.ownerId === target.id) return;

    this.botBulletHitsBot += 1;
    this.projectiles.consumeBotHit(bullet, bullet.x, bullet.y);

    if (target.invulnerableRemainingMs > 0) {
      this.effects.ring(target.x, target.y, 0x9bd8f2);
      return;
    }

    const died = target.takeDamage(data.damage);
    this.effects.damageNumber(target.x, target.y - 28, data.damage, "#ffb4b6");
    if (died) {
      this.recordElimination(data.ownerId, target.id, data.weaponName);
    }
    this.publishHud(true);
  }

  private onDroneFire(drone: Drone): void {
    if (!drone.alive || this.matchTimer.phase !== "live") return;
    this.botShots += 1;
    const muzzle = drone.muzzlePoint();
    this.projectiles.fireDrone(
      drone.id,
      muzzle.x,
      muzzle.y,
      drone.aimAngle,
      drone.projectileSpread,
      drone.projectileDamage,
      drone.projectileSpeed,
      this.elapsedMs,
    );
    this.effects.muzzle(muzzle.x, muzzle.y, true);
    audio.play("rifle", 0.35);
  }

  private onDroneDestroyed(drone: Drone): void {
    this.effects.droneDestroyed(drone.x, drone.y);
    this.cameras.main.shake(120, 0.003, true);
  }

  private recordElimination(killerId: string, victimId: string, weaponName: string): void {
    if (this.matchTimer.phase !== "live") return;
    const killer = this.getCombatantName(killerId);
    const victim = this.getCombatantName(victimId);
    if (!killer || !victim || killerId === victimId) return;

    const victimPlayer = victimId === "player";
    const victimDrone = this.drones.find((drone) => drone.id === victimId);
    if (victimPlayer) {
      this.player.deaths += 1;
    } else if (victimDrone) {
      victimDrone.deaths += 1;
    } else {
      return;
    }

    if (killerId === "player") {
      this.player.eliminations += 1;
    } else {
      const killerDrone = this.drones.find((drone) => drone.id === killerId);
      if (killerDrone) {
        killerDrone.eliminations += 1;
      }
    }

    this.feedCounter += 1;
    this.feed.push({
      id: this.feedCounter,
      text: `${killer} eliminated ${victim}`,
      atMs: this.elapsedMs,
      killerId,
      victimId,
    });
    this.feed = this.feed.slice(-6);

    if (killerId === "player") {
      this.lastPlayerKill = {
        victimName: victim,
        weaponName,
        atMs: this.elapsedMs,
      };
    }
    if (victimId === "player") {
      this.lastKillerName = killer;
    }

    const scores = this.participantScores().map((participant) => participant.score);
    if (reachedScoreLimit(scores, MATCH_CONFIG.scoreLimit)) {
      this.matchTimer = endMatchForScore(this.matchTimer);
      this.finishMatch();
    }
    this.publishHud(true);
  }

  private participantScores(): ParticipantSummary[] {
    return [
      {
        id: "player",
        name: "VIBER-010",
        score: this.player.eliminations,
        deaths: this.player.deaths,
        order: 0,
      },
      ...this.drones.map((drone, index) => ({
        id: drone.id,
        name: drone.name,
        score: drone.eliminations,
        deaths: drone.deaths,
        order: index + 1,
      })),
    ];
  }

  private getCombatantName(id: string): string | null {
    if (id === "player") return "VIBER-010";
    return this.drones.find((drone) => drone.id === id)?.name ?? null;
  }

  private finishMatch(): void {
    if (this.matchTimer.phase !== "ended") return;
    this.projectiles.clearAll();
    this.crosshair.clear();
    audio.setJetpackActive(false);
    const bestRival = this.drones.reduce(
      (best, drone) => Math.max(best, drone.eliminations),
      0,
    );
    audio.play(
      this.player.eliminations >= bestRival ? "victory" : "defeat",
      1,
    );
    this.publishHud(true);
  }

  private respawnPlayer(): void {
    const spawn = this.pickSpawn("player", this.lastPlayerDeath);
    this.player.respawnAt(spawn.x, spawn.y);
    this.lastPlayerDeath = null;
    this.lastKillerName = null;
    this.effects.spawn(spawn.x, spawn.y);
    this.cameras.main.flash(220, 215, 255, 46, false);
    this.publishHud(true);
  }

  private respawnDrone(drone: Drone): void {
    const death = { x: drone.x, y: drone.y };
    const spawn = this.pickSpawn(drone.id, death);
    drone.respawnAt(spawn.x, spawn.y - 44);
    this.effects.spawn(spawn.x, spawn.y);
    this.publishHud(true);
  }

  private pickSpawn(
    excludedId: string,
    lastDeath: { x: number; y: number } | null,
  ): ArenaSpawnPoint {
    const threats: SpawnThreat[] = [];
    if (excludedId !== "player" && !this.player.dead) {
      threats.push({
        id: "player",
        x: this.player.x,
        y: this.player.y - 58,
      });
    }
    for (const drone of this.drones) {
      if (drone.alive && drone.id !== excludedId) {
        threats.push({ id: drone.id, x: drone.x, y: drone.y });
      }
    }
    return selectSpawnPoint({
      candidates: ARENA.spawnPoints,
      threats,
      blockers: this.arenaBuild.platformRects,
      lastDeath,
    });
  }

  private drawCrosshair(aimWorld: Phaser.Math.Vector2): void {
    this.crosshair.clear();
    if (this.player.dead) return;

    const definition = this.player.weaponDefinition;
    const target = aimWorld;
    const baseSpread = 6 + Math.min(24, definition.spreadRadians * 100);
    const spread =
      baseSpread +
      (this.player.weapon.cooldownMs / definition.fireIntervalMs) * 4;
    const reloading = this.player.weapon.reloading;
    const hit = this.hitFeedbackMs > 0;
    const color = hit ? 0xf5f3ec : reloading ? 0xf5f3ec : 0xd7ff2e;
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
    this.crosshair.lineStyle(1, color, hit ? 0.8 : 0.32);
    this.crosshair.strokeCircle(target.x, target.y, spread + 13);

    if (hit) {
      this.crosshair.lineStyle(2, 0xf5f3ec, 0.9);
      this.crosshair.lineBetween(target.x - 16, target.y - 16, target.x - 8, target.y - 8);
      this.crosshair.lineBetween(target.x + 16, target.y - 16, target.x + 8, target.y - 8);
      this.crosshair.lineBetween(target.x - 16, target.y + 16, target.x - 8, target.y + 8);
      this.crosshair.lineBetween(target.x + 16, target.y + 16, target.x + 8, target.y + 8);
    }
  }

  private drawDebug(): void {
    this.debugGraphics.clear();
    if (!this.debugVisible) return;

    this.debugGraphics.lineStyle(2, 0xd7ff2e, 0.72);
    for (const rect of this.arenaBuild.platformRects) {
      this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    this.debugGraphics.fillStyle(0x9bd8f2, 0.55);
    for (const spawn of ARENA.spawnPoints) {
      this.debugGraphics.fillCircle(spawn.x, spawn.y - 4, 4);
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
      const path = drone.debugPath();
      if (path.length > 0) {
        this.debugGraphics.lineStyle(1, 0x9bd8f2, 0.55);
        let previous = { x: drone.x, y: drone.y };
        for (const point of path) {
          this.debugGraphics.lineBetween(previous.x, previous.y, point.x, point.y);
          previous = point;
        }
      }
    }

    this.debugGraphics.fillStyle(0x9bd8f2, 1);
    for (const bullet of this.projectiles.listActive()) {
      this.debugGraphics.fillRect(bullet.x - 2, bullet.y - 2, 4, 4);
    }
  }

  private publishHud(force: boolean): void {
    if (!this.ready && !force) return;
    this.bridge.publish(this.buildSnapshot());
  }

  private buildSnapshot(): HudSnapshot {
    const definition = this.player.weaponDefinition;
    const ranked = rankParticipants(this.participantScores());
    const standings: HudStanding[] = ranked.map((entry) => {
      const drone = this.drones.find((candidate) => candidate.id === entry.id);
      const isPlayer = entry.id === "player";
      const alive = isPlayer ? !this.player.dead : Boolean(drone?.alive);
      return {
        ...entry,
        isPlayer,
        alive,
        respawnIn: isPlayer
          ? this.player.dead
            ? this.player.respawnRemainingMs / 1000
            : 0
          : drone?.alive
            ? 0
            : (drone?.respawnRemainingMs ?? 0) / 1000,
      };
    });
    const playerStanding = standings.find((entry) => entry.isPlayer);
    const winner = this.matchTimer.phase === "ended" ? standings[0]?.name ?? null : null;
    const matchEnded = this.matchTimer.phase === "ended";

    return {
      ...INITIAL_HUD,
      ready: this.ready,
      health: Math.max(0, Math.round(this.player.health)),
      maxHealth: PLAYER_CONFIG.maxHealth,
      fuel: Math.max(0, Math.round(this.player.jetpack.fuel)),
      maxFuel: JETPACK_CONFIG.maxFuel,
      ammo: this.player.weapon.ammo,
      magazineSize: definition.magazineSize,
      reloading: this.player.weapon.reloading,
      reloadProgress: reloadProgress(this.player.weapon, definition),
      weaponId: definition.id,
      weaponName: definition.name,
      weaponShortName: definition.shortName,
      weaponRole: definition.role,
      weaponSlot: definition.slot,
      weaponSlots: PLAYER_WEAPONS.map((weapon, index) => ({
        id: weapon.id,
        name: weapon.name,
        shortName: weapon.shortName,
        role: weapon.role,
        slot: weapon.slot,
        key: String(weapon.slot),
        ammo: this.player.weaponStates[index].ammo,
        magazineSize: weapon.magazineSize,
        active: index === this.player.equippedWeaponIndex,
        owned: true,
        reloading: this.player.weaponStates[index].reloading,
        reloadProgress: 1,
      })),
      isDead: this.player.dead,
      respawnIn: this.player.dead ? this.player.respawnRemainingMs / 1000 : 0,
      playerX: this.player.x,
      playerY: this.player.y,
      grounded: this.player.grounded,
      thrusting: this.player.thrusting,
      aimAngle: this.player.aimAngle,
      matchPhase: this.matchTimer.phase,
      matchTimeRemainingMs: this.matchTimer.remainingMs,
      matchDurationMs: MATCH_CONFIG.durationMs,
      matchScoreLimit: MATCH_CONFIG.scoreLimit,
      matchEndReason: this.matchTimer.endReason,
      standings: standings.map(({ id, name, score, deaths, alive, isPlayer, respawnIn, placement }) => ({
        id,
        name,
        score,
        deaths,
        alive,
        isPlayer,
        respawnIn: matchEnded ? 0 : respawnIn,
        placement,
      })),
      playerPlacement: playerStanding?.placement ?? 1,
      playerEliminations: this.player.eliminations,
      playerDeaths: this.player.deaths,
      playerAccuracy:
        this.player.shotsFired > 0
          ? clamp(this.player.shotsHit / this.player.shotsFired, 0, 1)
          : 0,
      winnerName: winner,
      lastKillerName: this.lastKillerName,
      feed: this.feed.slice(-5),
      lastPlayerKill: this.lastPlayerKill,
      uptimeMs: this.elapsedMs,
      debug: this.debugVisible,
      damageSeq: this.player.damageSeq,
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
        if (this.matchTimer.phase === "live" && this.player.dead) {
          this.respawnPlayer();
        }
        break;
      case "equip-weapon":
        if (
          this.matchTimer.phase === "live" &&
          !this.player.dead &&
          this.player.equipWeapon(command.slot)
        ) {
          this.publishHud(true);
        }
        break;
      case "restart-match":
        this.scene.restart();
        break;
      case "force-match-end":
        if (this.matchTimer.phase === "live") {
          this.matchTimer = stepMatchTimer(
            this.matchTimer,
            this.matchTimer.remainingMs,
          );
          this.finishMatch();
        }
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
    const hud = this.buildSnapshot();
    return {
      hud,
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
        weaponId: this.player.weaponDefinition.id,
        weaponSlot: this.player.weaponDefinition.slot,
        eliminations: this.player.eliminations,
        deaths: this.player.deaths,
        shotsFired: this.player.shotsFired,
        shotsHit: this.player.shotsHit,
      },
      drones: this.drones.map((drone) => ({
        id: drone.id,
        name: drone.name,
        x: drone.x,
        y: drone.y,
        health: drone.health,
        alive: drone.alive,
        sight: drone.hasLineOfSight,
        shotsFired: drone.shotsFired,
        cooldown: drone.fireCooldownDebug,
        targetId: drone.currentTargetId,
        pathLength: drone.pathLength,
        thrusting: drone.thrusting,
        invulnerable: drone.invulnerableRemainingMs,
        bodyX: drone.body.x,
        bodyY: drone.body.y,
        bodyWidth: drone.body.width,
        bodyHeight: drone.body.height,
        eliminations: drone.eliminations,
        deaths: drone.deaths,
      })),
      projectiles: this.projectiles.listActive(),
      platforms: ARENA.platforms.map((platform) => ({
        id: platform.id,
        x: platform.x,
        y: platform.y,
        width: platform.width,
        height: platform.height,
      })),
      spawnPoints: ARENA.spawnPoints.map((spawn) => ({
        id: spawn.id,
        x: spawn.x,
        y: spawn.y,
      })),
      camera: {
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
        zoom: this.cameras.main.zoom,
        width: this.cameras.main.width,
        height: this.cameras.main.height,
      },
      match: {
        phase: this.matchTimer.phase,
        remainingMs: this.matchTimer.remainingMs,
        endReason: this.matchTimer.endReason,
        playerPlacement: hud.playerPlacement,
        winnerName: hud.winnerName,
      },
      counters: {
        droneBulletHitsPlayer: this.droneBulletHitsPlayer,
        playerBulletHitsDrone: this.playerBulletHitsBot,
        droneShots: this.botShots,
        playerBulletHitsBot: this.playerBulletHitsBot,
        botBulletHitsBot: this.botBulletHitsBot,
        playerShots: this.player.shotsFired,
        playerHits: this.player.shotsHit,
      },
      debugVisible: this.debugVisible,
    };
  }

  private cleanup(): void {
    if (this.resizeHandler) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
      this.resizeHandler = null;
    }
    this.commandUnsubscribe?.();
    this.commandUnsubscribe = null;
    if (this.testApi && window.__VIBE_MILITIA__ === this.testApi) {
      delete window.__VIBE_MILITIA__;
    }
    this.testApi = null;
    this.ready = false;
  }
}
