import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ARENA } from "@/game/arena/arena";
import { buildArena, type ArenaBuildResult } from "@/game/arena/ArenaBuilder";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { INITIAL_HUD, type GameBridge, type HudSnapshot, type HudWeaponSlot } from "@/game/bridge";
import { createGameTextures } from "@/game/systems/TextureFactory";
import { EffectsSystem } from "@/game/systems/EffectsSystem";
import { InputController, type ControlFrame } from "@/game/systems/InputController";
import { CombatantView } from "@/game/online/CombatantView";
import {
  createHumanKinematics,
  stepHumanKinematics,
  type HumanKinematics,
} from "@/game/multiplayer/humanMovement";
import type {
  OnlineEvent,
  OnlineInputPayload,
  OnlineSnapshot,
  OnlineCombatantSnapshot,
} from "@/game/multiplayer/protocol";

interface OnlineProbe {
  roomId: string;
  sessionId: string;
  ready: boolean;
  snapshot: OnlineSnapshot | null;
  hud: HudSnapshot;
  views: Array<{ id: string; name: string; kind: string; x: number; y: number; alive: boolean }>;
}

export class OnlineScene extends Phaser.Scene {
  private room: Room;
  private bridge: GameBridge;
  private playerName: string;
  private arenaBuild!: ArenaBuildResult;
  private inputController!: InputController;
  private effects!: EffectsSystem;
  private views = new Map<string, CombatantView>();
  private latestSnapshot: OnlineSnapshot | null = null;
  private snapshotAt = 0;
  private previousPhase: string | null = null;
  private bulletGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  private ready = false;
  private localAim = 0;
  private predictor: HumanKinematics | null = null;
  private lastFrame: ControlFrame | null = null;
  private sendAccumulator = 0;
  private inputSeq = 0;
  private wasFiring = false;
  private pendingJump = false;
  private pendingReload = false;
  private pendingWeapon: number | null = null;
  private hitFeedbackMs = 0;
  private localDamageSeq = 0;
  private lastPlayerKill: HudSnapshot["lastPlayerKill"] = null;
  private hudTimer = 0;
  private roomSubscriptions: Array<() => void> = [];
  private commandUnsubscribe: (() => void) | null = null;
  private probe: OnlineProbe;

  constructor(room: Room, bridge: GameBridge, playerName: string) {
    super("OnlineScene");
    this.room = room;
    this.bridge = bridge;
    this.playerName = playerName;
    this.probe = {
      roomId: room.roomId,
      sessionId: room.sessionId,
      ready: false,
      snapshot: null,
      hud: INITIAL_HUD,
      views: [],
    };
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
    this.bulletGraphics = this.add.graphics().setDepth(38);
    this.debugGraphics = this.add.graphics().setDepth(200);
    this.crosshair = this.add.graphics().setDepth(300);
    this.inputController = new InputController(this);
    this.cameras.main.fadeIn(350, 12, 13, 15);

    this.roomSubscriptions.push(
      this.room.onMessage("snapshot", (snapshot: OnlineSnapshot) =>
        this.onSnapshot(snapshot),
      ),
      this.room.onMessage("events", (events: OnlineEvent[]) =>
        this.onEvents(events),
      ),
    );
    this.commandUnsubscribe = this.bridge.onCommand((command) => {
      switch (command.type) {
        case "equip-weapon":
          this.pendingWeapon = command.slot;
          break;
        case "restart-match":
          this.room.send("rematch");
          break;
        case "toggle-debug":
          this.debugVisible = !this.debugVisible;
          this.publishHud(true);
          break;
        case "set-debug":
          this.debugVisible = command.value;
          this.publishHud(true);
          break;
        default:
          break;
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
    this.bridge.publish({ ...INITIAL_HUD, ready: false });

    window.__VIBE_MILITIA_ONLINE__ = {
      getProbe: () => ({
        ...this.probe,
        ready: this.ready,
        snapshot: this.latestSnapshot,
        hud: this.bridge.getSnapshot(),
        views: [...this.views.values()].map((view) => ({
          id: view.id,
          name: this.latestSnapshot?.participants.find((p) => p.id === view.id)?.name ?? "",
          kind: view.kind,
          x: view.sprite.x,
          y: view.sprite.y,
          alive: this.latestSnapshot?.participants.find((p) => p.id === view.id)?.alive ?? false,
          ...view.presentation,
        })),
      }),
      sendCommand: (command) => this.bridge.send(command),
    };
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, 50);
    const frame = this.inputController.sample(
      this.cameras.main,
      this.views.get(this.room.sessionId)?.sprite.x ?? 640,
      this.views.get(this.room.sessionId)?.sprite.y ?? 1340,
    );
    this.lastFrame = frame;
    this.hitFeedbackMs = Math.max(0, this.hitFeedbackMs - dtMs);
    this.sendAccumulator += dtMs;
    this.hudTimer += dtMs;

    if (this.inputController.debugPressed()) {
      this.debugVisible = !this.debugVisible;
      this.publishHud(true);
    }

    const live = this.latestSnapshot?.phase === "live";
    const local = this.localSnapshot();
    if (local?.alive) {
      if (!this.predictor) {
        this.predictor = createHumanKinematics(local.x, local.y);
        this.predictor.vx = local.vx;
        this.predictor.vy = local.vy;
        this.predictor.grounded = local.grounded;
        this.predictor.jetpack.fuel = local.fuel;
      }
      if (live) {
        stepHumanKinematics(
          this.predictor,
          {
            moveX: frame.moveX,
            jumpPressed: frame.jumpPressed,
            jumpHeld: frame.jumpHeld,
          },
          dtMs,
          {
            width: ARENA.width,
            height: ARENA.height,
            platforms: this.arenaBuild.platformRects,
          },
        );
      }
      const aimX = this.predictor.x + 28;
      const aimY = this.predictor.y - 58;
      this.localAim = Math.atan2(
        frame.aimWorld.y - aimY,
        frame.aimWorld.x - aimX,
      );
    } else {
      this.predictor = null;
    }

    if (
      live &&
      local?.alive &&
      frame.fire &&
      !this.wasFiring &&
      this.predictor
    ) {
      const active = local.weapons.find((weapon) => weapon.id === local.weaponId);
      if (active && active.ammo > 0 && !active.reloading) {
        const localView = this.views.get(this.room.sessionId);
        localView?.onShot();
        const muzzleX = this.predictor.x + 28 + Math.cos(this.localAim) * 66;
        const muzzleY = this.predictor.y - 58 + Math.sin(this.localAim) * 66;
        this.effects.muzzle(muzzleX, muzzleY);
        this.cameras.main.shake(30, 0.0007, true);
      }
    }
    this.wasFiring = frame.fire;

    if (live) {
      this.pendingJump ||= frame.jumpPressed;
      this.pendingReload ||= frame.reloadPressed;
      if (frame.weaponSlotPressed !== null) {
        this.pendingWeapon = frame.weaponSlotPressed;
      }
    } else {
      this.pendingJump = false;
      this.pendingReload = false;
      this.pendingWeapon = null;
    }

    if (
      this.latestSnapshot &&
      live &&
      this.sendAccumulator >= 33 &&
      local
    ) {
      this.sendAccumulator = 0;
      this.inputSeq += 1;
      const payload: OnlineInputPayload = {
        seq: this.inputSeq,
        moveX: frame.moveX,
        jump: this.pendingJump,
        jumpHeld: frame.jumpHeld,
        fire: frame.fire,
        reload: this.pendingReload,
        weapon: this.pendingWeapon,
        aim: this.localAim,
      };
      this.room.send("input", payload);
      this.pendingJump = false;
      this.pendingReload = false;
      this.pendingWeapon = null;
    }

    if (this.latestSnapshot) {
      const localId = this.room.sessionId;
      for (const participant of this.latestSnapshot.participants) {
        const view = this.views.get(participant.id);
        if (view) {
          const predicted =
            participant.id === localId && participant.alive && this.predictor
              ? { x: this.predictor.x, y: this.predictor.y }
              : undefined;
          view.update(
            participant,
            dtMs,
            participant.id === localId && participant.alive ? this.localAim : null,
            predicted,
          );
        }
      }
      this.drawProjectiles();
      this.drawCrosshair(frame);
      this.drawDebug();
    }

    if (this.hudTimer >= 100) {
      this.hudTimer = 0;
      this.publishHud(false);
    }
  }

  private onSnapshot(snapshot: OnlineSnapshot): void {
    const first = this.latestSnapshot === null;
    this.latestSnapshot = snapshot;
    this.snapshotAt = performance.now();
    this.probe.snapshot = snapshot;
    const present = new Set(snapshot.participants.map((p) => p.id));

    for (const participant of snapshot.participants) {
      const isLocal = participant.id === this.room.sessionId;
      if (!this.views.has(participant.id)) {
        const view = new CombatantView(this, participant, isLocal);
        this.views.set(participant.id, view);
        if (isLocal && participant.kind === "human") {
          this.cameras.main.startFollow(view.sprite, true, 0.08, 0.08);
          this.cameras.main.setDeadzone(240, 150);
        }
      }
    }
    for (const [id, view] of this.views) {
      if (!present.has(id)) {
        if (id === this.room.sessionId) this.cameras.main.stopFollow();
        view.destroy();
        this.views.delete(id);
      }
    }

    const local = snapshot.participants.find(
      (participant) => participant.id === this.room.sessionId,
    );
    if (!local || !local.alive) {
      this.predictor = null;
    } else if (!this.predictor) {
      this.predictor = createHumanKinematics(local.x, local.y);
      this.predictor.vx = local.vx;
      this.predictor.vy = local.vy;
      this.predictor.grounded = local.grounded;
      this.predictor.jetpack.fuel = local.fuel;
    } else {
      const error = Math.hypot(local.x - this.predictor.x, local.y - this.predictor.y);
      if (error > 280) {
        this.predictor.x = local.x;
        this.predictor.y = local.y;
        this.predictor.vx = local.vx;
        this.predictor.vy = local.vy;
        this.predictor.grounded = local.grounded;
      } else if (error > 0.5) {
        this.predictor.x += (local.x - this.predictor.x) * 0.22;
        this.predictor.y += (local.y - this.predictor.y) * 0.22;
      }
      this.predictor.jetpack.fuel = local.fuel;
      this.predictor.grounded = local.grounded;
      this.predictor.thrusting = local.thrusting;
    }

    if (first) {
      this.ready = true;
      this.probe.ready = true;
    }
    if (this.lastPlayerKill && snapshot.elapsedMs < this.lastPlayerKill.atMs) {
      this.lastPlayerKill = null;
    }
    if (this.previousPhase === "ended" && snapshot.phase === "live") {
      this.lastPlayerKill = null;
      this.localDamageSeq = 0;
    }
    if (this.previousPhase === "countdown" && snapshot.phase === "live") {
      this.pendingJump = false;
      this.pendingReload = false;
      this.pendingWeapon = null;
      this.wasFiring = false;
    }
    this.previousPhase = snapshot.phase;
    this.publishHud(true);
  }

  private onEvents(events: OnlineEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "shot": {
          const view = this.views.get(event.ownerId);
          view?.onShot();
          this.effects.muzzle(event.x, event.y);
          break;
        }
        case "hit": {
          const view = this.views.get(event.victimId);
          view?.onHit();
          this.effects.bulletImpact(event.x, event.y, "player");
          this.effects.damageNumber(
            event.x,
            event.y - 12,
            event.damage,
            event.kind === "human" ? "#ffb4b6" : "#f5f3ec",
          );
          if (event.victimId === this.room.sessionId) {
            this.localDamageSeq += 1;
            this.cameras.main.shake(80, 0.0025, true);
          }
          if (event.ownerId === this.room.sessionId) {
            this.hitFeedbackMs = 100;
          }
          break;
        }
        case "elimination": {
          const victim = this.views.get(event.victimId);
          if (victim) {
            this.effects.playerDestroyed(victim.sprite.x, victim.sprite.y);
          }
          if (event.killerId === this.room.sessionId) {
            this.lastPlayerKill = {
              victimName: event.victimName,
              weaponName: event.weaponName,
              atMs: this.latestSnapshot?.elapsedMs ?? event.atMs,
            };
          }
          if (
            event.killerId === this.room.sessionId ||
            event.victimId === this.room.sessionId
          ) {
            this.cameras.main.shake(150, 0.004, true);
          }
          break;
        }
        case "respawn": {
          this.effects.spawn(event.x, event.y);
          break;
        }
        case "match-end": {
          this.cameras.main.flash(220, 215, 255, 46, false);
          this.publishHud(true);
          break;
        }
        case "player-joined":
        case "player-left":
          break;
      }
    }
  }

  private localSnapshot(): OnlineCombatantSnapshot | null {
    return (
      this.latestSnapshot?.participants.find(
        (participant) => participant.id === this.room.sessionId,
      ) ?? null
    );
  }

  private publishHud(force: boolean): void {
    const snapshot = this.latestSnapshot;
    if (!snapshot) {
      if (force) this.bridge.publish({ ...INITIAL_HUD, ready: false });
      return;
    }
    const local = this.localSnapshot();
    const activeWeapon =
      local?.weapons.find((weapon) => weapon.id === local.weaponId) ??
      local?.weapons.find((weapon) => weapon.slot === 1) ??
      null;
    const definition =
      PLAYER_WEAPONS.find((weapon) => weapon.id === activeWeapon?.id) ??
      PLAYER_WEAPONS[0];
    const ranked = snapshot.standings.map((entry) => ({
      ...entry,
      isPlayer: entry.id === this.room.sessionId,
      kind: entry.kind,
    }));
    const playerStanding = ranked.find((entry) => entry.isPlayer);
    const weaponSlots: HudWeaponSlot[] = (local?.weapons ?? []).map((weapon) => ({
      id: weapon.id,
      name: weapon.name,
      shortName: weapon.shortName,
      role: weapon.role,
      slot: weapon.slot,
      key: String(weapon.slot),
      ammo: weapon.ammo,
      magazineSize: weapon.magazineSize,
      active: weapon.id === local?.weaponId,
    }));
    const feed = snapshot.feed.slice(-5);
    const hud: HudSnapshot = {
      ...INITIAL_HUD,
      ready: this.ready,
      health: Math.max(0, Math.round(local?.health ?? 0)),
      maxHealth: local?.maxHealth ?? 100,
      fuel: Math.max(0, Math.round(local?.fuel ?? 0)),
      maxFuel: local?.maxFuel ?? 100,
      ammo: activeWeapon?.ammo ?? 0,
      magazineSize: activeWeapon?.magazineSize ?? definition.magazineSize,
      reloading: activeWeapon?.reloading ?? false,
      reloadProgress: activeWeapon
        ? activeWeapon.reloadProgress
        : 1,
      weaponId: definition.id,
      weaponName: activeWeapon?.name ?? definition.name,
      weaponShortName: activeWeapon?.shortName ?? definition.shortName,
      weaponRole: activeWeapon?.role ?? definition.role,
      weaponSlot: definition.slot,
      weaponSlots,
      isDead: local ? !local.alive : false,
      respawnIn: local?.respawnIn ?? 0,
      playerX: local?.x ?? 0,
      playerY: local?.y ?? 0,
      grounded: local?.grounded ?? false,
      thrusting: local?.thrusting ?? false,
      aimAngle: local?.aimAngle ?? this.localAim,
      matchPhase: snapshot.phase,
      matchTimeRemainingMs: snapshot.remainingMs,
      matchCountdownMs: snapshot.countdownRemainingMs,
      matchCountdownDurationMs: snapshot.countdownDurationMs,
      matchDurationMs: snapshot.durationMs,
      matchScoreLimit: snapshot.scoreLimit,
      matchEndReason: snapshot.endReason,
      standings: ranked.map((entry) => ({
        id: entry.id,
        name: entry.name,
        score: entry.score,
        deaths: entry.deaths,
        alive: entry.alive,
        isPlayer: entry.isPlayer,
        respawnIn: entry.respawnIn,
        placement: entry.placement,
      })),
      playerPlacement: playerStanding?.placement ?? 1,
      playerEliminations: local?.eliminations ?? 0,
      playerDeaths: local?.deaths ?? 0,
      playerAccuracy: local?.accuracy ?? 0,
      winnerName: snapshot.winnerName,
      lastKillerName: local?.lastKillerName ?? null,
      feed,
      lastPlayerKill: this.lastPlayerKill,
      uptimeMs: snapshot.elapsedMs,
      debug: this.debugVisible,
      damageSeq: this.localDamageSeq,
    };
    this.bridge.publish(hud);
  }

  private drawProjectiles(): void {
    this.bulletGraphics.clear();
    if (!this.latestSnapshot) return;
    const extrapolate = Math.min(0.055, (performance.now() - this.snapshotAt) / 1000);
    for (const projectile of this.latestSnapshot.projectiles) {
      const x = projectile.x + projectile.vx * extrapolate;
      const y = projectile.y + projectile.vy * extrapolate;
      const color =
        projectile.weaponId === "vibe-lance"
          ? 0x9bd8f2
          : projectile.weaponId === "scatter-blaster"
            ? 0xc7692f
            : 0xd7ff2e;
      this.bulletGraphics.lineStyle(4, color, 0.22);
      this.bulletGraphics.lineBetween(
        x - projectile.vx * 0.014,
        y - projectile.vy * 0.014,
        x,
        y,
      );
      this.bulletGraphics.fillStyle(color, 1);
      this.bulletGraphics.fillCircle(x, y, 2.2);
    }
  }

  private drawCrosshair(frame: ControlFrame): void {
    this.crosshair.clear();
    const local = this.localSnapshot();
    if (!local?.alive) return;
    const definition =
      PLAYER_WEAPONS.find((weapon) => weapon.id === local.weaponId) ??
      PLAYER_WEAPONS[0];
    const spread = 7 + Math.min(24, definition.spreadRadians * 100);
    const color = this.hitFeedbackMs > 0 ? 0xf5f3ec : 0xd7ff2e;
    const target = frame.aimWorld;
    const muzzle = {
      x: local.x + 28 + Math.cos(this.localAim) * 66,
      y: local.y - 58 + Math.sin(this.localAim) * 66,
    };
    this.crosshair.lineStyle(1, color, 0.09);
    this.crosshair.lineBetween(muzzle.x, muzzle.y, target.x, target.y);
    this.crosshair.lineStyle(2, color, 0.92);
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
    this.crosshair.fillStyle(color, 1);
    this.crosshair.fillRect(target.x - 1.5, target.y - 1.5, 3, 3);
    this.crosshair.lineStyle(1, color, 0.28);
    this.crosshair.strokeCircle(target.x, target.y, spread + 13);
    if (this.hitFeedbackMs > 0) {
      this.crosshair.lineStyle(2, 0xf5f3ec, 0.9);
      this.crosshair.lineBetween(target.x - 16, target.y - 16, target.x - 8, target.y - 8);
      this.crosshair.lineBetween(target.x + 16, target.y - 16, target.x + 8, target.y - 8);
      this.crosshair.lineBetween(target.x - 16, target.y + 16, target.x - 8, target.y + 8);
      this.crosshair.lineBetween(target.x + 16, target.y + 16, target.x + 8, target.y + 8);
    }
  }

  private drawDebug(): void {
    this.debugGraphics.clear();
    if (!this.debugVisible || !this.latestSnapshot) return;
    this.debugGraphics.lineStyle(2, 0xd7ff2e, 0.6);
    for (const platform of this.arenaBuild.platformRects) {
      this.debugGraphics.strokeRect(
        platform.x,
        platform.y,
        platform.width,
        platform.height,
      );
    }
    for (const participant of this.latestSnapshot.participants) {
      if (!participant.alive) continue;
      const isHuman = participant.kind === "human";
      this.debugGraphics.lineStyle(
        2,
        isHuman ? 0xe5484d : 0xc7692f,
        0.9,
      );
      this.debugGraphics.strokeRect(
        participant.x - 26,
        participant.y - 118,
        52,
        118,
      );
    }
    this.debugGraphics.fillStyle(0x9bd8f2, 1);
    for (const projectile of this.latestSnapshot.projectiles) {
      this.debugGraphics.fillRect(projectile.x - 2, projectile.y - 2, 4, 4);
    }
    this.debugGraphics.lineStyle(1, 0xf5f3ec, 0.7);
    const local = this.localSnapshot();
    if (local?.alive) {
      this.debugGraphics.lineBetween(
        local.x + 28,
        local.y - 58,
        local.x + 28 + Math.cos(this.localAim) * 90,
        local.y - 58 + Math.sin(this.localAim) * 90,
      );
    }
  }

  private cleanup(): void {
    for (const unsubscribe of this.roomSubscriptions) unsubscribe();
    this.roomSubscriptions = [];
    this.commandUnsubscribe?.();
    this.commandUnsubscribe = null;
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    if (window.__VIBE_MILITIA_ONLINE__) {
      delete window.__VIBE_MILITIA_ONLINE__;
    }
    this.bridge.publish({ ...INITIAL_HUD, ready: false });
  }
}
