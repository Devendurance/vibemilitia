import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ARENA } from "@/game/arena/arena";
import { buildArena, type ArenaBuildResult } from "@/game/arena/ArenaBuilder";
import { CHARACTER_ROSTER } from "@/game/characters/roster";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import {
  GRENADE_CONFIG,
  GRENADE_INVENTORY_CONFIG,
  type GrenadeType,
} from "@/game/core/grenades";
import { MEDKIT_CONFIG, PICKUP_LABELS } from "@/game/core/pickups";
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
  OnlineGrenadeSnapshot,
  OnlineInputPayload,
  OnlineSnapshot,
  OnlineCombatantSnapshot,
  OnlinePickupSnapshot,
  OnlineToxicCloudSnapshot,
} from "@/game/multiplayer/protocol";

interface PickupView {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  baseY: number;
  phase: number;
  texture: string;
}

interface GrenadeView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  type: GrenadeType;
  fuseDot: Phaser.GameObjects.Arc | null;
  fuseRing: Phaser.GameObjects.Arc | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  interpolation: number;
  fuseRemainingMs: number | null;
  activationRemainingMs: number | null;
  fuseSnapshotAt: number;
  spin: number;
}

interface ToxicCloudView {
  container: Phaser.GameObjects.Container;
  fill: Phaser.GameObjects.Arc;
  puffs: Phaser.GameObjects.Arc[];
  ring: Phaser.GameObjects.Arc;
  bubbles: Phaser.GameObjects.Arc[];
  radius: number;
  durationMs: number;
  remainingMs: number;
  snapshotAt: number;
  spawnAt: number;
  phase: number;
}

interface OnlineProbe {
  roomId: string;
  sessionId: string;
  ready: boolean;
  snapshot: OnlineSnapshot | null;
  hud: HudSnapshot;
  views: Array<{ id: string; name: string; kind: string; x: number; y: number; alive: boolean }>;
  pickups: Array<{ id: string; type: string; x: number; y: number; active: boolean; visible: boolean; texture: string }>;
  grenades: Array<{ id: number; type: GrenadeType; x: number; y: number; visible: boolean; fuseRemainingMs: number | null }>;
  toxicClouds: Array<{ id: number; x: number; y: number; radius: number; remainingMs: number; visible: boolean }>;
  camera: {
    scrollX: number;
    scrollY: number;
    zoom: number;
    width: number;
    height: number;
  };
  platforms: Array<{ x: number; y: number; width: number; height: number }>;
}

export class OnlineScene extends Phaser.Scene {
  private room: Room;
  private bridge: GameBridge;
  private playerName: string;
  private arenaBuild!: ArenaBuildResult;
  private inputController!: InputController;
  private effects!: EffectsSystem;
  private views = new Map<string, CombatantView>();
  private pickupViews = new Map<string, PickupView>();
  private grenadeViews = new Map<number, GrenadeView>();
  private toxicCloudViews = new Map<number, ToxicCloudView>();
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
  private pendingMedkit = false;
  private pendingGrenadeSlot: number | null = null;
  private pendingGrenadeThrow = false;
  private medkitFeedbackSeq = 0;
  private medkitFeedbackAmount = 0;
  private supplyFeedbackSeq = 0;
  private supplyFeedbackText = "";
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
      pickups: [],
      grenades: [],
      toxicClouds: [],
      camera: { scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 },
      platforms: [],
    };
  }

  preload(): void {
    for (const skin of CHARACTER_ROSTER) {
      this.load.image(skin.textureKey, skin.cutoutPath);
    }
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
        case "use-medkit":
          this.pendingMedkit = true;
          break;
        case "select-grenade":
          this.pendingGrenadeSlot = command.slot;
          break;
        case "throw-grenade":
          this.pendingGrenadeThrow = true;
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
        pickups: [...this.pickupViews.entries()].map(([id, view]) => ({
          id,
          type:
            this.latestSnapshot?.pickups.find((pickup) => pickup.id === id)
              ?.type ?? "",
          x: view.container.x,
          y: view.baseY,
          active:
            this.latestSnapshot?.pickups.find((pickup) => pickup.id === id)
              ?.active ?? false,
          visible: view.container.visible,
          texture: view.texture,
        })),
        grenades: [...this.grenadeViews.entries()].map(([id, view]) => ({
          id,
          type: view.type,
          x: view.container.x,
          y: view.container.y,
          visible: view.container.visible,
          fuseRemainingMs: view.fuseRemainingMs,
        })),
        toxicClouds: [...this.toxicCloudViews.entries()].map(([id, view]) => ({
          id,
          x: view.container.x,
          y: view.container.y,
          radius: view.radius,
          remainingMs: view.remainingMs,
          visible: view.container.visible,
        })),
        camera: {
          scrollX: this.cameras.main.scrollX,
          scrollY: this.cameras.main.scrollY,
          zoom: this.cameras.main.zoom,
          width: this.cameras.main.width,
          height: this.cameras.main.height,
        },
        platforms: this.arenaBuild.platformRects.map((platform) => ({
          x: platform.x,
          y: platform.y,
          width: platform.width,
          height: platform.height,
        })),
      }),
      sendCommand: (command) => this.bridge.send(command),
    };
  }

  update(time: number, delta: number): void {
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
      this.pendingMedkit ||= frame.medkitPressed;
      if (frame.grenadeSlotPressed !== null) {
        this.pendingGrenadeSlot = frame.grenadeSlotPressed;
      }
      this.pendingGrenadeThrow ||= frame.grenadeThrowPressed;
    } else {
      this.pendingJump = false;
      this.pendingReload = false;
      this.pendingWeapon = null;
      this.pendingMedkit = false;
      this.pendingGrenadeSlot = null;
      this.pendingGrenadeThrow = false;
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
        useMedkit: this.pendingMedkit,
        grenadeSlot: this.pendingGrenadeSlot,
        throwGrenade: this.pendingGrenadeThrow,
      };
      this.room.send("input", payload);
      this.pendingJump = false;
      this.pendingReload = false;
      this.pendingWeapon = null;
      this.pendingMedkit = false;
      this.pendingGrenadeSlot = null;
      this.pendingGrenadeThrow = false;
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
      this.animatePickups(time);
      this.animateGrenades(dtMs);
      this.animateToxicClouds(time);
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
    this.syncPickupViews(snapshot.pickups);
    this.syncGrenadeViews(snapshot.grenades);
    this.syncToxicCloudViews(snapshot.toxicClouds);

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
      this.pendingMedkit = false;
      this.pendingGrenadeSlot = null;
      this.pendingGrenadeThrow = false;
      this.wasFiring = false;
    }
    this.previousPhase = snapshot.phase;
    this.publishHud(true);
  }

  private syncPickupViews(pickups: OnlinePickupSnapshot[]): void {
    const present = new Set(pickups.map((pickup) => pickup.id));
    for (const pickup of pickups) {
      let view = this.pickupViews.get(pickup.id);
      if (!view) {
        const color =
          pickup.type === "contact-grenade"
            ? 0xff6b35
            : pickup.type === "frag-grenade"
              ? 0xf4e21c
              : pickup.type === "stinking-grenade"
                ? 0x9bff5a
                : 0xd7ff2e;
        const glow = this.add
          .circle(0, 8, 22, color, 0.08)
          .setStrokeStyle(1, color, 0.3);
        const texture =
          pickup.type === "contact-grenade"
            ? "pickup-grenade-contact"
            : pickup.type === "frag-grenade"
              ? "pickup-grenade-frag"
              : pickup.type === "stinking-grenade"
                ? "pickup-grenade-stinking"
                : "pickup-medkit";
        const image = this.add.image(0, -4, texture);
        const container = this.add
          .container(pickup.x, pickup.y, [glow, image])
          .setDepth(24);
        view = {
          container,
          glow,
          baseY: pickup.y,
          phase: this.pickupViews.size * 0.9,
          texture,
        };
        this.pickupViews.set(pickup.id, view);
      }
      view.container.setVisible(pickup.active);
    }
    for (const [id, view] of this.pickupViews) {
      if (present.has(id)) continue;
      view.container.destroy(true);
      this.pickupViews.delete(id);
    }
  }

  private animatePickups(time: number): void {
    for (const view of this.pickupViews.values()) {
      if (!view.container.visible) continue;
      view.container.y = view.baseY + Math.sin(time / 420 + view.phase) * 3;
      view.glow.setScale(1 + Math.sin(time / 520 + view.phase) * 0.08);
    }
  }

  private syncGrenadeViews(grenades: OnlineGrenadeSnapshot[]): void {
    const present = new Set(grenades.map((grenade) => grenade.id));
    for (const grenade of grenades) {
      let view = this.grenadeViews.get(grenade.id);
      if (!view) {
        const shadow = this.add.ellipse(
          0,
          13,
          24,
          8,
          0x0c0d0f,
          0.28,
        );
        const body = this.add.image(
          0,
          0,
          grenade.type === "contact"
            ? "grenade-contact"
            : grenade.type === "frag"
              ? "grenade-frag"
              : "grenade-stinking",
        );
        const children: Phaser.GameObjects.GameObject[] = [shadow, body];
        let fuseDot: Phaser.GameObjects.Arc | null = null;
        let fuseRing: Phaser.GameObjects.Arc | null = null;
        if (grenade.type !== "contact") {
          const color =
            grenade.type === "stinking" ? 0x9bff5a : 0xf4e21c;
          fuseRing = this.add
            .circle(0, 0, 17, 0x000000, 0)
            .setStrokeStyle(2, color, 0.55);
          fuseDot = this.add.circle(0, -18, 3.5, color, 0.9);
          children.push(fuseRing, fuseDot);
        }
        const container = this.add
          .container(grenade.x, grenade.y, children)
          .setDepth(27);
        view = {
          container,
          body,
          type: grenade.type,
          fuseDot,
          fuseRing,
          fromX: grenade.x,
          fromY: grenade.y,
          toX: grenade.x,
          toY: grenade.y,
          interpolation: 1,
          fuseRemainingMs: grenade.fuseRemainingMs,
          activationRemainingMs: grenade.activationRemainingMs,
          fuseSnapshotAt: performance.now(),
          spin: 0,
        };
        this.grenadeViews.set(grenade.id, view);
      }
      view.fromX = view.container.x;
      view.fromY = view.container.y;
      view.toX = grenade.x;
      view.toY = grenade.y;
      view.interpolation = 0;
      view.fuseRemainingMs = grenade.fuseRemainingMs;
      view.activationRemainingMs = grenade.activationRemainingMs;
      view.fuseSnapshotAt = performance.now();
      view.container.setVisible(true);
    }

    for (const [id, view] of this.grenadeViews) {
      if (present.has(id)) continue;
      view.container.destroy(true);
      this.grenadeViews.delete(id);
    }
  }

  private animateGrenades(dtMs: number): void {
    const now = performance.now();
    for (const view of this.grenadeViews.values()) {
      view.interpolation = Math.min(
        1,
        view.interpolation + dtMs / 50,
      );
      const t = view.interpolation;
      view.container.x =
        view.fromX + (view.toX - view.fromX) * t;
      view.container.y =
        view.fromY + (view.toY - view.fromY) * t;
      view.spin += dtMs * 0.012;
      view.body.setRotation(view.spin);

      if (!view.fuseDot || !view.fuseRing) {
        continue;
      }
      let remaining: number;
      let duration: number;
      let color: number;
      if (view.type === "frag" && view.fuseRemainingMs !== null) {
        remaining = Math.max(
          0,
          view.fuseRemainingMs - (now - view.fuseSnapshotAt),
        );
        duration = 5_000;
        color = remaining < 1_000 ? 0xff6b35 : 0xf4e21c;
      } else if (
        view.type === "stinking" &&
        view.activationRemainingMs !== null
      ) {
        remaining = Math.max(
          0,
          view.activationRemainingMs - (now - view.fuseSnapshotAt),
        );
        duration = 900;
        color = 0x9bff5a;
      } else {
        continue;
      }
      const danger = remaining < 2_000;
      const blink = danger
        ? Math.sin(now / 55) > 0
          ? 1
          : 0.15
        : 0.72;
      const ratio = Math.max(0, Math.min(1, remaining / duration));
      view.fuseDot.setFillStyle(color, blink);
      view.fuseRing.setStrokeStyle(
        2,
        color,
        0.35 + (1 - ratio) * 0.55,
      );
      view.fuseRing.setScale(1 + (1 - ratio) * 0.35);
    }
  }

  private syncToxicCloudViews(clouds: OnlineToxicCloudSnapshot[]): void {
    const present = new Set(clouds.map((cloud) => cloud.id));
    for (const cloud of clouds) {
      let view = this.toxicCloudViews.get(cloud.id);
      if (!view) {
        const fill = this.add.circle(
          0,
          0,
          cloud.radius,
          0x7cff3a,
          0.22,
        );
        const puffs = [
          this.add.circle(
            -cloud.radius * 0.14,
            cloud.radius * 0.08,
            cloud.radius * 0.72,
            0x9bff5a,
            0.12,
          ),
          this.add.circle(
            cloud.radius * 0.16,
            -cloud.radius * 0.1,
            cloud.radius * 0.52,
            0x6fbe2e,
            0.14,
          ),
        ];
        const ring = this.add
          .circle(0, 0, cloud.radius, 0x000000, 0)
          .setStrokeStyle(3, 0x9bff5a, 0.75);
        const outerRing = this.add
          .circle(0, 0, cloud.radius + 5, 0x000000, 0)
          .setStrokeStyle(1, 0xd7ff2e, 0.35);
        const bubbles: Phaser.GameObjects.Arc[] = [];
        for (let index = 0; index < 8; index += 1) {
          const angle = (index / 8) * Math.PI * 2;
          const distance = cloud.radius * (0.2 + (index % 4) * 0.15);
          bubbles.push(
            this.add.circle(
              Math.cos(angle) * distance,
              Math.sin(angle) * distance * 0.7,
              3 + (index % 3) * 1.2,
              0xd7ff2e,
              0.4,
            ),
          );
        }
        const container = this.add
          .container(cloud.x, cloud.y, [
            fill,
            ...puffs,
            outerRing,
            ring,
            ...bubbles,
          ])
          .setDepth(22)
          .setScale(0.2);
        view = {
          container,
          fill,
          puffs,
          ring,
          bubbles,
          radius: cloud.radius,
          durationMs: cloud.durationMs,
          remainingMs: cloud.remainingMs,
          snapshotAt: performance.now(),
          spawnAt: performance.now(),
          phase: cloud.id * 0.7,
        };
        this.toxicCloudViews.set(cloud.id, view);
      }
      view.radius = cloud.radius;
      view.durationMs = cloud.durationMs;
      view.remainingMs = cloud.remainingMs;
      view.snapshotAt = performance.now();
    }

    for (const [id, view] of this.toxicCloudViews) {
      if (present.has(id)) continue;
      view.container.destroy(true);
      this.toxicCloudViews.delete(id);
    }
  }

  private animateToxicClouds(time: number): void {
    const now = performance.now();
    for (const view of this.toxicCloudViews.values()) {
      const age = now - view.spawnAt;
      const expand = Math.min(1, 0.2 + 0.8 * Math.min(1, age / 260));
      const remaining = Math.max(
        0,
        view.remainingMs - (now - view.snapshotAt),
      );
      const fade = Math.min(1, remaining / 1_000);
      const pulse = 0.85 + 0.15 * Math.sin(time / 500 + view.phase);
      view.container.setScale(expand).setAlpha(fade * pulse);
      for (let index = 0; index < view.puffs.length; index += 1) {
        const puff = view.puffs[index];
        puff.setScale(
          0.94 + 0.08 * Math.sin(time / 900 + view.phase + index),
        );
        puff.setAlpha(
          0.1 + 0.04 * Math.sin(time / 700 + index * 1.3),
        );
      }
      for (let index = 0; index < view.bubbles.length; index += 1) {
        const bubble = view.bubbles[index];
        const angle = time / 1_800 + view.phase + index * 1.1;
        const distance = view.radius * (0.2 + (index % 3) * 0.18);
        bubble.setPosition(
          Math.cos(angle) * distance,
          Math.sin(angle * 1.3) * distance * 0.7 - 10,
        );
        bubble.setAlpha(
          0.24 + 0.16 * Math.sin(time / 350 + index),
        );
      }
    }
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
          const toxic = event.source === "toxic";
          this.effects.bulletImpact(event.x, event.y, "player");
          if (toxic) {
            this.effects.toxicTick(event.x, event.y);
          }
          this.effects.damageNumber(
            event.x,
            event.y - 12,
            event.damage,
            toxic
              ? "#9bff5a"
              : event.kind === "human"
                ? "#ffb4b6"
                : "#f5f3ec",
          );
          if (event.victimId === this.room.sessionId) {
            this.localDamageSeq += 1;
            if (!toxic) {
              this.cameras.main.shake(80, 0.0025, true);
            }
          }
          if (
            event.ownerId === this.room.sessionId &&
            !toxic
          ) {
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
            if (event.killerId !== event.victimId) {
              this.lastPlayerKill = {
                victimName: event.victimName,
                weaponName: event.weaponName,
                atMs: this.latestSnapshot?.elapsedMs ?? event.atMs,
              };
            }
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
        case "pickup-collected": {
          this.pickupViews.get(event.pickupId)?.container.setVisible(false);
          this.effects.pickupCollected(event.x, event.y);
          if (event.playerId === this.room.sessionId) {
            this.supplyFeedbackSeq += 1;
            this.supplyFeedbackText = PICKUP_LABELS[event.itemType];
          }
          break;
        }
        case "pickup-respawn": {
          this.pickupViews.get(event.pickupId)?.container.setVisible(true);
          this.effects.ring(event.x, event.y, 0xd7ff2e);
          break;
        }
        case "medkit-used": {
          this.effects.heal(event.x, event.y);
          this.effects.healNumber(event.x, event.y - 18, event.healed);
          if (event.playerId === this.room.sessionId) {
            this.medkitFeedbackSeq += 1;
            this.medkitFeedbackAmount = event.healed;
          }
          break;
        }
        case "grenade-thrown": {
          this.effects.grenadeThrow(
            event.x,
            event.y,
            event.grenadeType,
          );
          break;
        }
        case "grenade-exploded": {
          this.grenadeViews.get(event.grenadeId)?.container.destroy(true);
          this.grenadeViews.delete(event.grenadeId);
          this.effects.grenadeExplosion(
            event.x,
            event.y,
            event.grenadeType,
          );
          const local = this.localSnapshot();
          if (local) {
            const distance = Math.hypot(
              local.x - event.x,
              local.y - event.y,
            );
            if (distance < 900) {
              this.cameras.main.shake(
                event.grenadeType === "contact" ? 170 : 230,
                Math.max(0.0015, 0.007 * (1 - distance / 900)),
                true,
              );
            }
          }
          break;
        }
        case "toxic-cloud-created": {
          this.effects.toxicCloudCreated(event.x, event.y);
          break;
        }
        case "toxic-cloud-expired": {
          this.effects.toxicCloudExpired(event.x, event.y);
          this.toxicCloudViews.get(event.cloudId)?.container.destroy(true);
          this.toxicCloudViews.delete(event.cloudId);
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
      medkits: local?.medkits ?? 0,
      maxMedkits: MEDKIT_CONFIG.maxCarried,
      medkitFeedbackSeq: this.medkitFeedbackSeq,
      medkitFeedbackAmount: this.medkitFeedbackAmount,
      grenadeContact: local?.grenadeContact ?? 0,
      grenadeFrag: local?.grenadeFrag ?? 0,
      grenadeStinking: local?.grenadeStinking ?? 0,
      grenadeSelected: local?.grenadeSelected ?? "contact",
      grenadeMax: GRENADE_INVENTORY_CONFIG.maxTotal,
      grenadeCooldownRemainingMs: local?.grenadeCooldownMs ?? 0,
      grenadeThrowCooldownMs:
        GRENADE_CONFIG[local?.grenadeSelected ?? "contact"]
          .throwCooldownMs,
      supplyFeedbackSeq: this.supplyFeedbackSeq,
      supplyFeedbackText: this.supplyFeedbackText,
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
    for (const view of this.pickupViews.values()) view.container.destroy(true);
    this.pickupViews.clear();
    for (const view of this.grenadeViews.values()) view.container.destroy(true);
    this.grenadeViews.clear();
    for (const view of this.toxicCloudViews.values()) view.container.destroy(true);
    this.toxicCloudViews.clear();
    if (window.__VIBE_MILITIA_ONLINE__) {
      delete window.__VIBE_MILITIA_ONLINE__;
    }
    this.bridge.publish({ ...INITIAL_HUD, ready: false });
  }
}
