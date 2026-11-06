import Phaser from "phaser";
import { ARENA } from "@/game/arena/arena";
import { buildArena, type ArenaBuildResult } from "@/game/arena/ArenaBuilder";
import { CHARACTER_ROSTER } from "@/game/characters/roster";
import { ALL_PLAYER_WEAPONS } from "@/game/config/gameplay";
import {
  GRENADE_CONFIG,
  GRENADE_INVENTORY_CONFIG,
  type GrenadeType,
} from "@/game/core/grenades";
import { MEDKIT_CONFIG, PICKUP_LABELS, weaponIdFromPickup } from "@/game/core/pickups";
import { LOOT_CONFIG } from "@/game/core/loot";
import {
  hasEmptyWeaponSlot,
  ownsWeapon,
} from "@/game/core/weaponInventory";
import { INITIAL_HUD, type GameBridge, type HudSnapshot, type HudWeaponSlot } from "@/game/bridge";
import { createGameTextures } from "@/game/systems/TextureFactory";
import { EffectsSystem } from "@/game/systems/EffectsSystem";
import { InputController, type ControlFrame } from "@/game/systems/InputController";
import { clearTouchFireLatch, touchInput } from "@/game/input/touchInput";
import { audio } from "@/game/audio/AudioEngine";
import { CombatantView } from "@/game/online/CombatantView";
import { LocalPredictor, type AuthoritativeMotion } from "@/game/online/LocalPredictor";
import { SnapshotClock } from "@/game/online/RemoteInterpolator";
import type { MatchRoom } from "@/game/online/matchRoom";
import type { RenderScaler } from "@/game/online/renderScale";
import {
  INPUT_TICKS_PER_PACKET,
  SERVER_TICK_MS,
} from "@/game/multiplayer/protocol";
import {
  SNAPSHOT_FAST,
  SNAPSHOT_SELF,
  SNAPSHOT_SLOW,
  SnapshotAssembler,
  type FastSnapshot,
  type SelfSnapshot,
  type SlowSnapshot,
} from "@/game/multiplayer/snapshotCodec";
import type {
  OnlineEvent,
  OnlineGrenadeSnapshot,
  OnlineInputPayload,
  OnlineSnapshot,
  OnlineCombatantSnapshot,
  OnlineLootSnapshot,
  OnlinePickupSnapshot,
  OnlineToxicCloudSnapshot,
} from "@/game/multiplayer/protocol";

const HUD_PUBLISH_INTERVAL_MS = 100;
/** A predicted shot the server never echoes stops counting after this long. */
const CONFIRM_WINDOW_MS = 1500;
const COUNTDOWN_MAX_EXTRAPOLATION_MS = 250;
/** Waits out the camera fade so the frozen frame is not black. */
const BACKDROP_DELAY_MS = 500;
const BACKDROP_DIVISOR = 10;
/** GameHud starts fading the boot screen at 700 ms and shows the digit then. */
const BOOT_SCREEN_MS = 750;
const WEAPON_PIVOT_X = 28;
const WEAPON_PIVOT_Y = 58;
const TOUCH_RETICLE_RANGE = 300;

function motionFrom(local: OnlineCombatantSnapshot): AuthoritativeMotion {
  return {
    x: local.x,
    y: local.y,
    vx: local.vx,
    vy: local.vy,
    grounded: local.grounded,
    thrusting: local.thrusting,
    fuel: local.fuel,
    coyoteMs: local.coyoteMs,
    thrustIdleMs: local.thrustIdleMs,
    ackSeq: local.lastProcessedInputSeq,
    ackTicks: local.lastProcessedInputTicks,
  };
}

interface PickupView {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  baseY: number;
  phase: number;
  texture: string;
  active: boolean;
}

interface LootView {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Rectangle;
  baseY: number;
  phase: number;
  texture: string;
  kind: OnlineLootSnapshot["kind"];
  weaponId: string | null;
  expiresAtLocal: number;
  spawnedAtLocal: number;
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
  loot: Array<{
    id: string;
    kind: string;
    weaponId: string | null;
    eliminationId: number;
    x: number;
    y: number;
    visible: boolean;
    texture: string;
  }>;
  testHooks: {
    eliminate: (victimId: string, source?: "bullet" | "grenade" | "toxic") => void;
    teleport: (x: number, y: number) => void;
    teleportBot: (id: string, x: number, y: number) => void;
    endMatch: () => void;
    guard: () => void;
    giveWeapon: (id: string, weaponId: string) => void;
    freeze: (id: string, frozen: boolean) => void;
    disableBotCuriosity: () => void;
    setZoom: (zoom: number) => void;
    setAim: (x: number, y: number) => void;
    fireOnce: () => void;
    reloadOnce: () => void;
    guardTarget: (id: string) => void;
    pauseBotLoot: (paused: boolean) => void;
    pauseLoot: (paused: boolean) => void;
    extendMatch: (durationMs: number) => void;
    resetPickups: () => void;
  };
  combatLog: Array<{
    type: string;
    weaponId: string | null;
    barrel: number | null;
    ownerId: string;
    victimId: string | null;
    damage: number | null;
    atMs: number;
  }>;
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
  private room: MatchRoom;
  private bridge: GameBridge;
  private playerName: string;
  private arenaBuild!: ArenaBuildResult;
  private inputController!: InputController;
  private effects!: EffectsSystem;
  private views = new Map<string, CombatantView>();
  private pickupViews = new Map<string, PickupView>();
  private lootViews = new Map<string, LootView>();
  private grenadeViews = new Map<number, GrenadeView>();
  private toxicCloudViews = new Map<number, ToxicCloudView>();
  private latestSnapshot: OnlineSnapshot | null = null;
  private snapshotAt = 0;
  private resizeHandler: (() => void) | null = null;
  private previousPhase: string | null = null;
  private bulletGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  private ready = false;
  private localAim = 0;
  private testAimAngle: number | null = null;
  private testFireFrames = 0;
  private testReloadFrames = 0;
  private predictor: LocalPredictor | null = null;
  private assembler: SnapshotAssembler;
  private snapshotClock = new SnapshotClock();
  private renderScaler: RenderScaler | null;
  private movementWorld!: { width: number; height: number; platforms: readonly { x: number; y: number; width: number; height: number }[] };
  private lastFrame: ControlFrame | null = null;
  private packetTick = 0;
  private packet: { seq: number; moveX: number; jump: boolean; jumpHeld: boolean } | null = null;
  private inputSeq = 0;
  private renderedLocal: { x: number; y: number } | null = null;
  private cameraFocus: { x: number; y: number } | null = null;
  private lookX = 0;
  private lookY = 0;
  private lastLocalAlive = false;
  private snapshotGapEma = 50;
  private frameMsEma = 16.7;
  private wasFiring = false;
  private pendingJump = false;
  private pendingReload = false;
  private pendingWeapon: number | null = null;
  private pendingMedkit = false;
  private pendingGrenadeSlot: number | null = null;
  private pendingGrenadeThrow = false;
  private pendingSwap = false;
  private medkitFeedbackSeq = 0;
  private medkitFeedbackAmount = 0;
  private supplyFeedbackSeq = 0;
  private supplyFeedbackText = "";
  private supplyFeedbackDetail = "+1";
  private combatLog: Array<{
    type: string;
    weaponId: string | null;
    barrel: number | null;
    ownerId: string;
    victimId: string | null;
    damage: number | null;
    atMs: number;
  }> = [];
  private hitFeedbackMs = 0;
  private localDamageSeq = 0;
  private lastAudioCountdownSecond = -1;
  /** Monotonic within one countdown, so a late snapshot cannot rewind a digit. */
  private countdownDisplayMs: number | null = null;
  private backdrop: HTMLCanvasElement | null = null;
  private backdropTimer: number | null = null;
  private sceneReadyTimer: number | null = null;
  private localShotAt = -Infinity;
  private latchSentThisFrame = false;
  private localBarrel = 0;
  /** Shots shown locally that the server has not echoed yet. */
  private unconfirmedShots: number[] = [];
  private lastAimStamp = 0;
  private lastFireStamp = 0;
  private aimLatency: number[] = [];
  private fireLatency: number[] = [];
  private frameLog: number[] = [];
  private zoomChanges = 0;
  private lastWorldZoom = 0;
  private lastAudioMatchId: string | null = null;
  private lastPlayerKill: HudSnapshot["lastPlayerKill"] = null;
  private hudTimer = 0;
  private roomSubscriptions: Array<() => void> = [];
  private commandUnsubscribe: (() => void) | null = null;
  private probe: OnlineProbe;

  constructor(
    room: MatchRoom,
    bridge: GameBridge,
    playerName: string,
    renderScaler: RenderScaler | null = null,
  ) {
    super("OnlineScene");
    this.room = room;
    this.bridge = bridge;
    this.playerName = playerName;
    this.renderScaler = renderScaler;
    this.assembler = new SnapshotAssembler(room.sessionId);
    this.probe = {
      roomId: room.roomId,
      sessionId: room.sessionId,
      ready: false,
      snapshot: null,
      hud: INITIAL_HUD,
      views: [],
      pickups: [],
      loot: [],
      testHooks: {
        eliminate: () => undefined,
        teleport: () => undefined,
        teleportBot: () => undefined,
        endMatch: () => undefined,
        guard: () => undefined,
        giveWeapon: () => undefined,
        freeze: () => undefined,
        disableBotCuriosity: () => undefined,
        setZoom: () => undefined,
        setAim: () => undefined,
        fireOnce: () => undefined,
        reloadOnce: () => undefined,
        guardTarget: () => undefined,
        pauseBotLoot: () => undefined,
        pauseLoot: () => undefined,
        extendMatch: () => undefined,
        resetPickups: () => undefined,
      },
      combatLog: [],
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
    this.movementWorld = {
      width: ARENA.width,
      height: ARENA.height,
      platforms: this.arenaBuild.platformRects,
    };
    this.effects = new EffectsSystem(this);
    this.bulletGraphics = this.add.graphics().setDepth(38);
    this.debugGraphics = this.add.graphics().setDepth(200);
    this.crosshair = this.add.graphics().setDepth(300);
    this.inputController = new InputController(this);
    this.renderScaler?.setChangeListener(() => this.applyCameraScale());
    this.applyCameraScale();
    this.resizeHandler = () => this.applyCameraScale();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.cameras.main.fadeIn(350, 12, 13, 15);

    this.roomSubscriptions.push(
      this.room.onMessage("snapshot", (snapshot: OnlineSnapshot) => {
        this.assembler.seed(snapshot);
        this.onSnapshot(snapshot);
      }),
      this.room.onMessage(SNAPSHOT_SLOW, (slow: SlowSnapshot) => {
        this.assembler.applySlow(slow);
      }),
      this.room.onMessage(SNAPSHOT_SELF, (self: SelfSnapshot) => {
        this.assembler.applySelf(self);
      }),
      this.room.onMessage(SNAPSHOT_FAST, (fast: FastSnapshot) => {
        const snapshot = this.assembler.assemble(fast);
        if (snapshot) this.onSnapshot(snapshot);
      }),
      this.room.onMessage("events", (events: OnlineEvent[]) =>
        this.onEvents(events),
      ),
    );
    // The room can start streaming before this scene exists, and change-only
    // sections sent in that gap are lost. Ask for one full snapshot now.
    this.room.send("resync");
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
        case "swap-weapon":
          this.pendingSwap = true;
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
        audio: audio.debugState(),
        touch: {
          enabled: touchInput.enabled,
          fire: touchInput.fire,
          buttonFire: touchInput.buttonFire,
          aimFire: touchInput.aimFire,
          jumpHeld: touchInput.jumpHeld,
          thrustHeld: touchInput.thrustHeld,
          moveX: touchInput.moveX,
          aimAngle: touchInput.aimAngle,
          aimActive: touchInput.aimActive,
          fireLatch: touchInput.fireLatch,
        },
        net: {
          pendingTicks: this.predictor?.pendingTicks ?? 0,
          lastCorrectionPx: this.predictor?.lastCorrection ?? 0,
          snaps: this.predictor?.snaps ?? 0,
          playbackDelayMs: this.snapshotClock.playbackDelayMs,
          jitterMs: this.snapshotClock.jitterMs,
          snapshotAgeMs: performance.now() - this.snapshotAt,
          snapshotGapMs: this.snapshotGapEma,
        },
        render: {
          scale: this.renderScaler?.scale ?? 1,
          frameMs: this.frameMsEma,
        },
        viewport: this.viewportTelemetry(),
        input: {
          aimLatencyMs: [...this.aimLatency],
          fireLatencyMs: [...this.fireLatency],
          unconfirmedShots: this.unconfirmedShots.length,
          localShotAt: this.localShotAt,
          look: { x: this.lookX, y: this.lookY },
        },
        frames: [...this.frameLog],
        localAim: this.localAim,
        control: this.lastFrame
          ? {
              fire: this.lastFrame.fire,
              moveX: this.lastFrame.moveX,
              jumpHeld: this.lastFrame.jumpHeld,
            }
          : null,
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
        loot: [...this.lootViews.entries()].map(([id, view]) => ({
          id,
          kind: view.kind,
          weaponId: view.weaponId,
          eliminationId:
            this.latestSnapshot?.loot.find((item) => item.id === id)
              ?.eliminationId ?? 0,
          x: view.container.x,
          y: view.baseY,
          visible: view.container.visible,
          texture: view.texture,
        })),
        testHooks: {
          eliminate: (
            victimId: string,
            source: "bullet" | "grenade" | "toxic" = "bullet",
          ) => {
            this.room.send("debug-eliminate", { victimId, source });
          },
          teleport: (x: number, y: number) => {
            this.room.send("debug-teleport", { x, y });
          },
          teleportBot: (id: string, x: number, y: number) => {
            this.room.send("debug-teleport-bot", { id, x, y });
          },
          endMatch: () => {
            this.room.send("debug-end-match");
          },
          guard: () => {
            this.room.send("debug-guard");
          },
          giveWeapon: (id: string, weaponId: string) => {
            this.room.send("debug-give-weapon", { id, weaponId });
          },
          freeze: (id: string, frozen: boolean) => {
            this.room.send("debug-freeze", { id, frozen });
          },
          disableBotCuriosity: () => {
            this.room.send("debug-disable-bot-curiosity");
          },
          setZoom: (zoom: number) => {
            this.cameras.main.setZoom(
              Math.max(0.8, Math.min(3, zoom)),
            );
          },
          setRenderScale: (scale: number) => {
            this.renderScaler?.debugSetScale(scale);
          },
          setAim: (x: number, y: number) => {
            const local = this.localSnapshot();
            if (!local) return;
            this.testAimAngle = Math.atan2(
              y - (local.y - 58),
              x - local.x,
            );
            this.localAim = this.testAimAngle;
          },
          fireOnce: () => {
            this.testFireFrames = 3;
          },
          reloadOnce: () => {
            this.testReloadFrames = 3;
          },
          guardTarget: (id: string) => {
            this.room.send("debug-guard-target", { id });
          },
          pauseBotLoot: (paused: boolean) => {
            this.room.send("debug-pause-bot-loot", { paused });
          },
          pauseLoot: (paused: boolean) => {
            this.room.send("debug-pause-loot", { paused });
          },
          extendMatch: (durationMs: number) => {
            this.room.send("debug-extend-match", { durationMs });
          },
          resetPickups: () => {
            this.room.send("debug-reset-pickups");
          },
        },
        combatLog: this.combatLog,
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
    const frameMs = Math.min(delta, 250);
    const dtMs = Math.min(delta, 50);
    this.frameMsEma += (delta - this.frameMsEma) * 0.05;
    this.latchSentThisFrame = false;
    this.renderScaler?.observeFrame(delta);
    this.frameLog.push(Math.round(this.game.loop.rawDelta * 10) / 10);
    if (this.frameLog.length > 600) this.frameLog.shift();
    const localView = this.views.get(this.room.sessionId);
    const frame = this.inputController.sample(
      this.cameras.main,
      this.renderedLocal?.x ?? localView?.sprite.x ?? 640,
      this.renderedLocal?.y ?? localView?.sprite.y ?? 1340,
    );
    this.lastFrame = frame;
    this.hitFeedbackMs = Math.max(0, this.hitFeedbackMs - dtMs);
    this.hudTimer += dtMs;

    if (this.inputController.debugPressed()) {
      this.debugVisible = !this.debugVisible;
      this.publishHud(true);
    }

    const live = this.latestSnapshot?.phase === "live";
    const local = this.localSnapshot();
    if (local?.alive) {
      this.predictor ??= new LocalPredictor(motionFrom(local), this.movementWorld);
    } else {
      this.predictor = null;
      this.renderedLocal = null;
      this.packetTick = 0;
    }

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
      this.pendingSwap ||= frame.swapPressed;
    } else {
      this.clearPendingInput();
      clearTouchFireLatch();
    }

    if (live && this.predictor) {
      const due = this.predictor.bank(frameMs);
      for (let tick = 0; tick < due; tick += 1) this.stepLocalTick(frame);
    }
    if (this.predictor) {
      this.renderedLocal = this.predictor.render(frameMs);
      const aimX = this.renderedLocal.x + WEAPON_PIVOT_X;
      const aimY = this.renderedLocal.y - WEAPON_PIVOT_Y;
      this.localAim =
        this.testAimAngle ??
        frame.aimAngle ??
        Math.atan2(frame.aimWorld.y - aimY, frame.aimWorld.x - aimX);
      if (touchInput.aimStamp !== this.lastAimStamp) {
        this.lastAimStamp = touchInput.aimStamp;
        this.pushLatency(this.aimLatency, performance.now() - touchInput.aimStamp);
      }
    }

    this.predictLocalShot(live, local, localView, frame);
    this.wasFiring = frame.fire;

    if (this.latestSnapshot) {
      this.createNextRemoteView();
      const localId = this.room.sessionId;
      const playback = this.snapshotClock.playbackTime(performance.now());
      for (const participant of this.latestSnapshot.participants) {
        const view = this.views.get(participant.id);
        if (view) {
          const isLocal = participant.id === localId && participant.alive;
          const kinematics = isLocal ? this.predictor?.kinematics : undefined;
          view.update(
            participant,
            dtMs,
            isLocal ? this.localAim : null,
            isLocal && this.renderedLocal && kinematics
              ? {
                  x: this.renderedLocal.x,
                  y: this.renderedLocal.y,
                  grounded: kinematics.grounded,
                  thrusting: kinematics.thrusting,
                  vx: kinematics.vx,
                }
              : undefined,
            playback,
          );
        }
      }
      this.animatePickups(time);
      this.animateLoot(time);
      this.animateGrenades(dtMs);
      this.animateToxicClouds(time);
      this.drawProjectiles();
      this.updateCamera(dtMs, frame);
      this.drawCrosshair(frame);
      this.drawDebug();
    }

    if (this.hudTimer >= HUD_PUBLISH_INTERVAL_MS) {
      this.hudTimer = 0;
      this.publishHud(true);
    }

    this.updateCountdown();
    audio.setJetpackActive(
      Boolean(live && local?.alive && local.thrusting),
      0.8,
    );
  }

  private pushLatency(list: number[], ms: number): void {
    list.push(Math.round(ms * 10) / 10);
    if (list.length > 240) list.shift();
  }

  /** Shows the shot now. The server still decides whether it was one. */
  private predictLocalShot(
    live: boolean,
    local: ReturnType<OnlineScene["localSnapshot"]>,
    localView: CombatantView | undefined,
    frame: ControlFrame,
  ): void {
    const now = performance.now();
    while (
      this.unconfirmedShots.length > 0 &&
      now - this.unconfirmedShots[0] > CONFIRM_WINDOW_MS
    ) {
      this.unconfirmedShots.shift();
    }
    if (!live || !local?.alive || !frame.fire || !this.renderedLocal) return;
    const active = local.weapons[local.equippedSlot] ?? null;
    if (!active?.owned || active.reloading) return;
    if (active.ammo - this.unconfirmedShots.length <= 0) return;
    const definition = ALL_PLAYER_WEAPONS.find((weapon) => weapon.id === active.id);
    if (!definition) return;
    if (now - this.localShotAt < definition.fireIntervalMs) return;
    const previousShotAt = this.localShotAt;
    this.localShotAt = now;
    this.unconfirmedShots.push(now);

    const akimbo = definition.mechanic === "akimbo";
    if (akimbo) this.localBarrel = this.localBarrel === 0 ? 1 : 0;
    localView?.onShot(akimbo ? (this.localBarrel as 0 | 1) : 0);
    const muzzleX =
      this.renderedLocal.x + WEAPON_PIVOT_X + Math.cos(this.localAim) * 66;
    const muzzleY =
      this.renderedLocal.y - WEAPON_PIVOT_Y + Math.sin(this.localAim) * 66;
    this.playMuzzle(definition.id, muzzleX, muzzleY);
    this.playWeaponSound(definition.id, true);
    this.cameras.main.shake(30, 0.0007, true);
    if (touchInput.fireStamp !== this.lastFireStamp) {
      this.lastFireStamp = touchInput.fireStamp;
      // A press during the weapon's own cooldown measures the weapon, not input.
      if (touchInput.fireStamp - previousShotAt >= definition.fireIntervalMs) {
        this.pushLatency(this.fireLatency, now - touchInput.fireStamp);
      }
    }
  }

  private playMuzzle(weaponId: string, x: number, y: number): void {
    if (weaponId === "rocket-launcher") {
      this.effects.rocketMuzzle(x, y);
    } else if (weaponId === "heavy-cannon") {
      this.effects.heavyMuzzle(x, y);
    } else {
      this.effects.muzzle(x, y);
    }
  }

  /**
   * Counts down from the authoritative remaining time, extrapolated between
   * snapshots. Digit and sound change in the same frame. GO is never local: it
   * comes from the phase change in `onSnapshot`.
   */
  private updateCountdown(): void {
    const snapshot = this.latestSnapshot;
    if (snapshot?.phase !== "countdown") {
      this.lastAudioCountdownSecond = -1;
      this.countdownDisplayMs = null;
      return;
    }
    const age = Math.min(
      COUNTDOWN_MAX_EXTRAPOLATION_MS,
      performance.now() - this.snapshotAt,
    );
    const remaining = Math.max(0, snapshot.countdownRemainingMs - age);
    const previous = this.countdownDisplayMs;
    this.countdownDisplayMs =
      previous === null || remaining > previous + 1500
        ? remaining
        : Math.min(previous, remaining);
    const second = Math.ceil(this.countdownDisplayMs / 1000);
    if (second !== this.lastAudioCountdownSecond) {
      const first = this.lastAudioCountdownSecond === -1;
      this.lastAudioCountdownSecond = second;
      if (!first && second >= 1 && second <= 3) audio.play("countdown", 0.8);
      this.publishHud(true);
    }
    this.ensureBackdrop();
  }

  /**
   * A live full-screen blur is expensive on a phone GPU. This copies one frame
   * to a tiny canvas, once, and lets the browser scale it up, which looks like
   * a blur and costs nothing per frame.
   */
  private ensureBackdrop(): void {
    if (this.backdrop || this.backdropTimer !== null || !this.ready) return;
    this.backdropTimer = window.setTimeout(() => {
      this.backdropTimer = null;
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.captureBackdrop());
    }, BACKDROP_DELAY_MS);
  }

  private captureBackdrop(): void {
    if (this.latestSnapshot?.phase !== "countdown" || this.backdrop) return;
    const source = this.game.canvas;
    const parent = source.parentElement;
    const css = this.renderScaler?.cssSize;
    if (!parent) return;
    const width = Math.max(64, Math.round((css?.width ?? source.width) / BACKDROP_DIVISOR));
    const height = Math.max(36, Math.round((css?.height ?? source.height) / BACKDROP_DIVISOR));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.className = "match-backdrop";
    canvas.dataset.testid = "match-backdrop";
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    parent.appendChild(canvas);
    this.backdrop = canvas;
  }

  private clearBackdrop(): void {
    if (this.backdropTimer !== null) {
      window.clearTimeout(this.backdropTimer);
      this.backdropTimer = null;
    }
    this.backdrop?.remove();
    this.backdrop = null;
  }

  private applyCameraScale(): void {
    const pixelScale = this.renderScaler?.scale ?? 1;
    const zoom = this.renderScaler?.worldZoom ?? 1;
    this.cameras.main.setZoom(zoom * pixelScale);
    if (this.lastWorldZoom !== 0 && zoom !== this.lastWorldZoom) this.zoomChanges += 1;
    this.lastWorldZoom = zoom;
    for (const view of this.views.values()) view.setLabelScale(1 / Math.min(1, zoom));
  }

  private viewportTelemetry() {
    const canvas = this.game.canvas;
    const box = canvas.getBoundingClientRect();
    const visual = window.visualViewport;
    return {
      inner: { width: window.innerWidth, height: window.innerHeight },
      visual: {
        width: visual?.width ?? window.innerWidth,
        height: visual?.height ?? window.innerHeight,
        scale: visual?.scale ?? 1,
        offsetLeft: visual?.offsetLeft ?? 0,
        offsetTop: visual?.offsetTop ?? 0,
      },
      canvasCss: { width: box.width, height: box.height, left: box.left, top: box.top },
      canvasBacking: { width: canvas.width, height: canvas.height },
      devicePixelRatio: window.devicePixelRatio,
      renderScale: this.renderScaler?.scale ?? 1,
      worldZoom: this.renderScaler?.worldZoom ?? 1,
      cameraZoom: this.cameras.main.zoom,
      /** What a player sees: CSS pixels per world unit, read from the live page. */
      apparentScale: this.cameras.main.zoom / Math.max(0.001, canvas.width / Math.max(1, box.width)),
      zoomChanges: this.zoomChanges,
      documentWidth: document.documentElement.scrollWidth,
      history: this.renderScaler ? [...this.renderScaler.history] : [],
    };
  }

  private createView(participant: OnlineCombatantSnapshot, isLocal: boolean): void {
    const view = new CombatantView(this, participant, isLocal);
    const pixelScale = this.renderScaler?.scale ?? 1;
    view.setLabelScale(1 / Math.min(1, this.cameras.main.zoom / pixelScale));
    this.views.set(participant.id, view);
  }

  /**
   * Bots join at the moment a match goes live. Building all seven in one task
   * stalled the first live frames by 150 ms on a PC and 800 ms on a slow phone,
   * so GO appeared late and input went dead. One per frame is invisible.
   */
  private createNextRemoteView(): void {
    const missing = this.latestSnapshot?.participants.find(
      (participant) =>
        participant.id !== this.room.sessionId && !this.views.has(participant.id),
    );
    if (missing) this.createView(missing, false);
  }

  private clearPendingInput(): void {
    this.pendingJump = false;
    this.pendingReload = false;
    this.pendingWeapon = null;
    this.pendingMedkit = false;
    this.pendingGrenadeSlot = null;
    this.pendingGrenadeThrow = false;
    this.pendingSwap = false;
  }

  /**
   * A press reaches the first packet through the latch. The rest of that frame
   * stays clear, because a slow phone can send several packets in one frame and
   * the release of a tap cannot be seen until the next one. Every weapon is in
   * cooldown for those ticks, so a real hold loses nothing.
   */
  private packetFire(frame: ControlFrame): boolean {
    if (!touchInput.enabled) return frame.fire;
    if (touchInput.fireLatch) {
      this.latchSentThisFrame = true;
      return true;
    }
    return touchInput.fire && !this.latchSentThisFrame;
  }

  /**
   * Runs one fixed movement tick. Each packet covers a fixed number of ticks
   * and is sent as it opens, so the server simulates the same inputs for the
   * same number of ticks and replay after a snapshot lands exactly.
   */
  private stepLocalTick(frame: ControlFrame): void {
    const predictor = this.predictor;
    if (!predictor) return;
    if (this.packetTick === 0) {
      this.inputSeq += 1;
      this.packet = {
        seq: this.inputSeq,
        moveX: frame.moveX,
        jump: this.pendingJump,
        jumpHeld: frame.jumpHeld,
      };
      const payload: OnlineInputPayload = {
        seq: this.inputSeq,
        ticks: INPUT_TICKS_PER_PACKET,
        moveX: frame.moveX,
        jump: this.pendingJump,
        jumpHeld: frame.jumpHeld,
        fire: this.packetFire(frame) || this.testFireFrames > 0,
        reload: this.pendingReload || this.testReloadFrames > 0,
        weapon: this.pendingWeapon,
        aim: this.localAim,
        useMedkit: this.pendingMedkit,
        grenadeSlot: this.pendingGrenadeSlot,
        throwGrenade: this.pendingGrenadeThrow,
        swapWeapon: this.pendingSwap,
      };
      this.room.send("input", payload);
      clearTouchFireLatch();
      if (this.testFireFrames > 0) this.testFireFrames -= 1;
      if (this.testReloadFrames > 0) this.testReloadFrames -= 1;
      this.clearPendingInput();
    }
    const packet = this.packet;
    if (!packet) return;
    predictor.step(packet.seq, this.packetTick, {
      moveX: packet.moveX,
      jumpPressed: this.packetTick === 0 && packet.jump,
      jumpHeld: packet.jumpHeld,
    });
    this.packetTick = (this.packetTick + 1) % INPUT_TICKS_PER_PACKET;
  }

  /**
   * Time-based follow with restrained aim look-ahead. Replaces Phaser follow,
   * whose per-frame lerp changes with frame rate and whose rounded scroll
   * shimmers at non-integer zoom.
   */
  private updateCamera(dtMs: number, frame: ControlFrame): void {
    const camera = this.cameras.main;
    const target =
      this.renderedLocal ??
      this.views.get(this.room.sessionId)?.sprite ??
      null;
    if (!target) return;
    const visibleWidth = camera.width / Math.max(0.01, camera.zoom);
    const visibleHeight = camera.height / Math.max(0.01, camera.zoom);
    const dt = dtMs / 1000;

    let desiredLookX = 0;
    let desiredLookY = 0;
    if (this.renderedLocal) {
      if (frame.aimAngle !== null) {
        if (touchInput.aimActive) {
          desiredLookX = Math.cos(frame.aimAngle) * Math.min(150, visibleWidth * 0.18);
          desiredLookY = Math.sin(frame.aimAngle) * Math.min(64, visibleHeight * 0.12);
        }
      } else {
        const fromPlayerX = frame.aimWorld.x - this.renderedLocal.x;
        const fromPlayerY = frame.aimWorld.y - this.renderedLocal.y;
        desiredLookX = Math.max(-80, Math.min(80, fromPlayerX * 0.12));
        desiredLookY = Math.max(-44, Math.min(44, fromPlayerY * 0.12));
      }
    }
    const lookBlend = 1 - Math.exp(-dt * (desiredLookX || desiredLookY ? 5 : 2.5));
    this.lookX += (desiredLookX - this.lookX) * lookBlend;
    this.lookY += (desiredLookY - this.lookY) * lookBlend;

    const desiredX = target.x + this.lookX;
    const desiredY = target.y - 70 + this.lookY;
    if (!this.cameraFocus) {
      this.cameraFocus = { x: desiredX, y: desiredY };
    } else if (Math.hypot(desiredX - this.cameraFocus.x, desiredY - this.cameraFocus.y) > 900) {
      this.cameraFocus.x = desiredX;
      this.cameraFocus.y = desiredY;
    } else {
      const follow = 1 - Math.exp(-dt * 10);
      this.cameraFocus.x += (desiredX - this.cameraFocus.x) * follow;
      this.cameraFocus.y += (desiredY - this.cameraFocus.y) * follow;
    }

    const halfWidth = visibleWidth / 2;
    const halfHeight = visibleHeight / 2;
    const focusX =
      ARENA.width <= visibleWidth
        ? ARENA.width / 2
        : Math.max(halfWidth, Math.min(ARENA.width - halfWidth, this.cameraFocus.x));
    const focusY =
      ARENA.height <= visibleHeight
        ? ARENA.height / 2
        : Math.max(halfHeight, Math.min(ARENA.height - halfHeight, this.cameraFocus.y));
    camera.scrollX = focusX - camera.width / 2;
    camera.scrollY = focusY - camera.height / 2;
  }

  private onSnapshot(snapshot: OnlineSnapshot): void {
    const first = this.latestSnapshot === null;
    const now = performance.now();
    if (!first) {
      this.snapshotGapEma += (now - this.snapshotAt - this.snapshotGapEma) * 0.1;
    }
    this.latestSnapshot = snapshot;
    this.snapshotAt = now;
    this.probe.snapshot = snapshot;
    if (first && this.room.markSceneReady) {
      // Practice starts its short sequence once the boot screen has cleared, so
      // the 3 is not spent behind it. Online time belongs to the server.
      this.sceneReadyTimer = window.setTimeout(
        () => this.room.markSceneReady?.(),
        BOOT_SCREEN_MS,
      );
    }
    const serverMs = snapshot.tick * SERVER_TICK_MS;
    this.snapshotClock.observe(serverMs, now);
    const present = new Set(snapshot.participants.map((p) => p.id));

    for (const participant of snapshot.participants) {
      const isLocal = participant.id === this.room.sessionId;
      if (isLocal && !this.views.has(participant.id)) {
        this.createView(participant, true);
      }
      if (!isLocal) {
        this.views.get(participant.id)?.pushSample(serverMs, participant);
      }
    }
    for (const [id, view] of this.views) {
      if (!present.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }
    this.syncPickupViews(snapshot.pickups);
    this.syncLootViews(snapshot.loot, snapshot.elapsedMs);
    this.syncGrenadeViews(snapshot.grenades);
    this.syncToxicCloudViews(snapshot.toxicClouds);

    const local = snapshot.participants.find(
      (participant) => participant.id === this.room.sessionId,
    );
    if (!local || !local.alive) {
      this.predictor = null;
    } else if (!this.predictor) {
      this.predictor = new LocalPredictor(motionFrom(local), this.movementWorld);
    } else {
      this.predictor.reconcile(motionFrom(local));
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
      this.clearPendingInput();
      clearTouchFireLatch();
      this.wasFiring = false;
      this.clearBackdrop();
      audio.play("matchGo", 0.9);
    }
    if (snapshot.phase !== "countdown") this.clearBackdrop();
    const phaseChanged = this.previousPhase !== snapshot.phase;
    this.previousPhase = snapshot.phase;
    const localAlive = Boolean(local?.alive);
    const aliveChanged = localAlive !== this.lastLocalAlive;
    this.lastLocalAlive = localAlive;
    if (first || phaseChanged || aliveChanged) this.publishHud(true);
  }

  private syncPickupViews(pickups: OnlinePickupSnapshot[]): void {
    const present = new Set(pickups.map((pickup) => pickup.id));
    for (const pickup of pickups) {
      let view = this.pickupViews.get(pickup.id);
      if (!view) {
        const weaponId = weaponIdFromPickup(pickup.type);
        const weaponDefinition = weaponId
          ? ALL_PLAYER_WEAPONS.find((weapon) => weapon.id === weaponId)
          : null;
        const color =
          pickup.type === "contact-grenade"
            ? 0xff6b35
            : pickup.type === "frag-grenade"
              ? 0xf4e21c
              : pickup.type === "stinking-grenade"
                ? 0x9bff5a
                : weaponDefinition
                  ? weaponDefinition.id === "rocket-launcher"
                    ? 0xc7692f
                    : 0x9bd8f2
                  : 0xd7ff2e;
        const glow = this.add
          .image(0, 8, "fx-pickup-ring")
          .setTint(color)
          .setDisplaySize(50, 50);
        const texture =
          pickup.type === "contact-grenade"
            ? "pickup-grenade-contact"
            : pickup.type === "frag-grenade"
              ? "pickup-grenade-frag"
              : pickup.type === "stinking-grenade"
                ? "pickup-grenade-stinking"
                : weaponDefinition?.weaponTexture ?? "pickup-medkit";
        const image = this.add
          .image(0, weaponDefinition ? -10 : -4, texture)
          .setScale(weaponDefinition ? 0.9 : 0.46);
        const container = this.add
          .container(pickup.x, pickup.y, [glow, image])
          .setDepth(24);
        view = {
          container,
          glow,
          baseY: pickup.y,
          phase: this.pickupViews.size * 0.9,
          texture,
          active: pickup.active,
        };
        this.pickupViews.set(pickup.id, view);
      }
      view.active = pickup.active;
      view.container.setVisible(pickup.active);
    }
    for (const [id, view] of this.pickupViews) {
      if (present.has(id)) continue;
      view.container.destroy(true);
      this.pickupViews.delete(id);
    }
  }

  private animatePickups(time: number): void {
    const view = this.cameras.main.worldView;
    for (const pickup of this.pickupViews.values()) {
      const onScreen =
        pickup.container.x >= view.x - 120 &&
        pickup.container.x <= view.right + 120 &&
        pickup.baseY >= view.y - 120 &&
        pickup.baseY <= view.bottom + 120;
      pickup.container.setVisible(pickup.active && onScreen);
      if (!pickup.active || !onScreen) continue;
      pickup.container.y =
        pickup.baseY + Math.sin(time / 420 + pickup.phase) * 3;
      pickup.glow.setDisplaySize(
        50 + Math.sin(time / 520 + pickup.phase) * 4,
        50 + Math.sin(time / 520 + pickup.phase) * 4,
      );
    }
  }

  private syncLootViews(
    loot: OnlineLootSnapshot[],
    elapsedMs: number,
  ): void {
    const present = new Set(loot.map((item) => item.id));
    for (const item of loot) {
      let view = this.lootViews.get(item.id);
      if (!view) {
        const color =
          item.kind === "medkit"
            ? 0xd7ff2e
            : item.kind === "weapon"
              ? 0x9bd8f2
              : item.grenadeType === "contact"
                ? 0xff6b35
                : item.grenadeType === "frag"
                  ? 0xf4e21c
                  : 0x9bff5a;
        const weaponDefinition =
          item.weaponId
            ? ALL_PLAYER_WEAPONS.find((weapon) => weapon.id === item.weaponId)
            : null;
        const texture =
          item.kind === "weapon"
            ? weaponDefinition?.weaponTexture ?? "weapon-player"
            : item.kind === "medkit"
              ? "pickup-medkit"
              : item.grenadeType === "contact"
                ? "pickup-grenade-contact"
                : item.grenadeType === "frag"
                  ? "pickup-grenade-frag"
                  : "pickup-grenade-stinking";
        const beam = this.add
          .rectangle(0, 2, 3, item.kind === "weapon" ? 54 : 42, color, 0.18)
          .setOrigin(0.5, 1);
        const lootGlowSize = item.kind === "weapon" ? 58 : 48;
        const glow = this.add
          .image(0, 6, "fx-pickup-ring")
          .setTint(color)
          .setDisplaySize(lootGlowSize, lootGlowSize);
        const image = this.add
          .image(0, item.kind === "weapon" ? -14 : -6, texture)
          .setScale(item.kind === "weapon" ? 1.05 : 0.42);
        const container = this.add
          .container(item.x, item.y, [beam, glow, image])
          .setDepth(26);
        view = {
          container,
          glow,
          beam,
          baseY: item.y,
          phase: this.lootViews.size * 1.1,
          texture,
          kind: item.kind,
          weaponId: item.weaponId,
          expiresAtLocal: this.time.now + item.remainingMs,
          spawnedAtLocal: this.time.now - Math.max(0, elapsedMs - item.createdAtMs),
        };
        this.lootViews.set(item.id, view);
      }
      view.expiresAtLocal = this.time.now + item.remainingMs;
      view.container.setVisible(true);
    }
    for (const [id, view] of this.lootViews) {
      if (present.has(id)) continue;
      view.container.destroy(true);
      this.lootViews.delete(id);
    }
  }

  private animateLoot(time: number): void {
    const viewRect = this.cameras.main.worldView;
    for (const view of this.lootViews.values()) {
      const onScreen =
        view.container.x >= viewRect.x - 120 &&
        view.container.x <= viewRect.right + 120 &&
        view.baseY >= viewRect.y - 120 &&
        view.baseY <= viewRect.bottom + 120;
      view.container.setVisible(onScreen);
      if (!onScreen) continue;
      const age = time - view.spawnedAtLocal;
      const drop = age < 260 ? -18 * (1 - age / 260) : 0;
      view.container.y =
        view.baseY + drop + Math.sin(time / 360 + view.phase) * 2.4;
      const lootPulse = view.kind === "weapon" ? 58 : 48;
      const lootSize = lootPulse + Math.sin(time / 460 + view.phase) * 5;
      view.glow.setDisplaySize(lootSize, lootSize);
      const remaining = view.expiresAtLocal - time;
      view.container.setAlpha(
        remaining < 3000
          ? 0.55 + Math.abs(Math.sin(time / 160)) * 0.45
          : 1,
      );
      view.beam.setAlpha(
        remaining < 3000
          ? 0.1 + Math.abs(Math.sin(time / 160)) * 0.14
          : 0.18,
      );
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
    this.applyEvents(events);
    // Events are sparse and players feel them, so the HUD does not wait a tick.
    this.publishHud(true);
  }

  private applyEvents(events: OnlineEvent[]): void {
    let batchFeedback: {
      text: string;
      detail: string;
      priority: number;
    } | null = null;
    for (const event of events) {
      switch (event.type) {
        case "shot": {
          const own = event.ownerId === this.room.sessionId;
          // A predicted shot already showed this flash and played this sound.
          const predicted = own && this.unconfirmedShots.shift() !== undefined;
          const view = this.views.get(event.ownerId);
          if (!predicted) view?.onShot(event.barrel === 1 ? 1 : 0);
          this.combatLog.push({
            type: "shot",
            weaponId: event.weaponId,
            barrel: event.barrel,
            ownerId: event.ownerId,
            victimId: null,
            damage: null,
            atMs: this.latestSnapshot?.elapsedMs ?? 0,
          });
          if (this.combatLog.length > 80) this.combatLog.shift();
          if (!predicted) {
            this.playMuzzle(event.weaponId, event.x, event.y);
            this.playWeaponSound(event.weaponId, own);
          }
          break;
        }
        case "hit": {
          const view = this.views.get(event.victimId);
          view?.onHit();
          this.combatLog.push({
            type: "hit",
            weaponId: event.weaponId ?? null,
            barrel: null,
            ownerId: event.ownerId,
            victimId: event.victimId,
            damage: event.damage,
            atMs: this.latestSnapshot?.elapsedMs ?? 0,
          });
          if (this.combatLog.length > 80) this.combatLog.shift();
          const toxic = event.source === "toxic";
          if (event.source === "rocket") {
            this.effects.damageNumber(
              event.x,
              event.y - 12,
              event.damage,
              event.kind === "human" ? "#ffb4b6" : "#f5f3ec",
            );
            if (event.victimId === this.room.sessionId) {
              this.localDamageSeq += 1;
            }
            break;
          }
          if (event.weaponId === "heavy-cannon") {
            this.effects.heavyImpact(event.x, event.y);
          } else {
            this.effects.bulletImpact(event.x, event.y, "player");
          }
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
          if (event.victimId === this.room.sessionId) {
            audio.play(toxic ? "toxicTick" : "damage", toxic ? 0.6 : 1);
          }
          break;
        }
        case "elimination": {
          const localEffect =
            event.killerId === this.room.sessionId
              ? this.localSnapshot()?.eliminationEffectId
              : null;
          const effectStyle =
            localEffect === "elimination-copper"
              ? "copper"
              : localEffect === "elimination-toxic"
                ? "toxic"
                : undefined;
          this.effects.eliminationBurst(
            event.x,
            event.y - 52,
            event.weaponName.includes("STINKING") ? "toxic" : "impact",
            effectStyle,
          );
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
            audio.play("elimination", 1);
          }
          break;
        }
        case "respawn": {
          this.effects.spawn(event.x, event.y);
          break;
        }
        case "pickup-collected": {
          const pickupView = this.pickupViews.get(event.pickupId);
          if (pickupView) {
            pickupView.active = false;
            pickupView.container.setVisible(false);
          }
          this.effects.pickupCollected(event.x, event.y);
          if (event.playerId === this.room.sessionId) {
            const text = event.text ?? PICKUP_LABELS[event.itemType];
            const detail = event.detail ?? "+1";
            const priority = event.itemType === "vibe-lance" ? 3 : 2;
            if (!batchFeedback || priority > batchFeedback.priority) {
              batchFeedback = { text, detail, priority };
            }
            if (event.itemType === "medkit") audio.play("medkitPickup");
            else if (event.itemType.endsWith("-grenade")) audio.play("uiConfirm");
            else audio.play("weaponPickup");
          }
          break;
        }
        case "pickup-respawn": {
          const pickupView = this.pickupViews.get(event.pickupId);
          if (pickupView) {
            pickupView.active = true;
            pickupView.container.setVisible(true);
          }
          this.effects.ring(event.x, event.y, 0xd7ff2e);
          break;
        }
        case "medkit-used": {
          this.effects.heal(event.x, event.y);
          this.effects.healNumber(event.x, event.y - 18, event.healed);
          if (event.playerId === this.room.sessionId) {
            this.medkitFeedbackSeq += 1;
            this.medkitFeedbackAmount = event.healed;
            audio.play("medkitUse");
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
              audio.play(
                event.grenadeType === "contact"
                  ? "grenadeContact"
                  : "grenadeFrag",
                Math.max(0.35, 1 - distance / 1200),
              );
            } else {
              audio.play(
                event.grenadeType === "contact"
                  ? "grenadeContact"
                  : "grenadeFrag",
                0.35,
              );
            }
          }
          break;
        }
        case "rocket-exploded": {
          this.combatLog.push({
            type: "rocket-exploded",
            weaponId: "rocket-launcher",
            barrel: null,
            ownerId: event.ownerId,
            victimId: null,
            damage: null,
            atMs: this.latestSnapshot?.elapsedMs ?? 0,
          });
          if (this.combatLog.length > 80) this.combatLog.shift();
          this.effects.rocketExplosion(
            event.x,
            event.y,
            event.blastRadius,
          );
          audio.play("rocketImpact", 1);
          const local = this.localSnapshot();
          if (local) {
            const distance = Math.hypot(
              local.x - event.x,
              local.y - event.y,
            );
            if (distance < 1000) {
              this.cameras.main.shake(
                260,
                Math.max(0.002, 0.009 * (1 - distance / 1000)),
                true,
              );
            }
          }
          break;
        }
        case "toxic-cloud-created": {
          this.effects.toxicCloudCreated(event.x, event.y);
          audio.play("stinkActivate", 0.8);
          break;
        }
        case "toxic-cloud-expired": {
          this.effects.toxicCloudExpired(event.x, event.y);
          this.toxicCloudViews.get(event.cloudId)?.container.destroy(true);
          this.toxicCloudViews.delete(event.cloudId);
          break;
        }
        case "loot-collected": {
          const view = this.lootViews.get(event.lootId);
          if (view) {
            view.container.destroy(true);
            this.lootViews.delete(event.lootId);
          }
          this.effects.pickupCollected(event.x, event.y);
          if (event.playerId === this.room.sessionId) {
            const priority = event.kind === "weapon" ? 3 : 2;
            if (!batchFeedback || priority > batchFeedback.priority) {
              batchFeedback = {
                text: event.text,
                detail: event.detail,
                priority,
              };
            }
            audio.play(
              event.kind === "weapon"
                ? "weaponPickup"
                : event.kind === "medkit"
                  ? "medkitPickup"
                  : "uiConfirm",
            );
          }
          break;
        }
        case "loot-expired": {
          const view = this.lootViews.get(event.lootId);
          if (view) {
            view.container.destroy(true);
            this.lootViews.delete(event.lootId);
          }
          this.effects.lootExpired(event.x, event.y);
          break;
        }
        case "weapon-swapped": {
          this.effects.weaponSwap(event.x, event.y);
          if (event.playerId === this.room.sessionId) {
            this.cameras.main.flash(120, 155, 216, 242, false);
            audio.play("uiConfirm");
          }
          break;
        }
        case "match-end": {
          this.cameras.main.flash(220, 215, 255, 46, false);
          if (this.lastAudioMatchId !== event.matchId) {
            this.lastAudioMatchId = event.matchId;
            const placement =
              this.latestSnapshot?.standings.find(
                (entry) => entry.id === this.room.sessionId,
              )?.placement ?? 0;
            audio.play(placement === 1 ? "victory" : "defeat", 1);
          }
          this.publishHud(true);
          break;
        }
        case "player-joined":
        case "player-left":
          break;
      }
    }
    if (batchFeedback) {
      this.supplyFeedbackSeq += 1;
      this.supplyFeedbackText = batchFeedback.text;
      this.supplyFeedbackDetail = batchFeedback.detail;
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
    const activeWeapon = local
      ? local.weapons[local.equippedSlot] ?? null
      : null;
    const ranked = snapshot.standings.map((entry) => ({
      ...entry,
      isPlayer: entry.id === this.room.sessionId,
      kind: entry.kind,
    }));
    const playerStanding = ranked.find((entry) => entry.isPlayer);
    const weaponSlots: HudWeaponSlot[] = (local?.weapons ?? []).map(
      (weapon, index) => ({
        id: weapon.id,
        name: weapon.name,
        shortName: weapon.shortName,
        role: weapon.role,
        slot: weapon.slot,
        key: String(weapon.slot),
        ammo: weapon.ammo,
        magazineSize: weapon.magazineSize,
        active: index === local?.equippedSlot,
        owned: weapon.owned,
        reloading: weapon.reloading,
        reloadProgress: weapon.reloadProgress,
      }),
    );
    const weaponIds = (local?.weapons ?? []).map((weapon) =>
      weapon.owned ? weapon.id : null,
    );
    const nearbyLoot = this.nearbyWeaponPrompt(snapshot, local, weaponIds);
    const feed = snapshot.feed.slice(-5);
    const hud: HudSnapshot = {
      ...INITIAL_HUD,
      ready: this.ready,
      health: Math.max(0, Math.round(local?.health ?? 0)),
      maxHealth: local?.maxHealth ?? 100,
      fuel: Math.max(0, Math.round(local?.fuel ?? 0)),
      maxFuel: local?.maxFuel ?? 100,
      ammo: activeWeapon?.ammo ?? 0,
      magazineSize: activeWeapon?.magazineSize ?? 0,
      reloading: activeWeapon?.reloading ?? false,
      reloadProgress: activeWeapon
        ? activeWeapon.reloadProgress
        : 1,
      weaponId: activeWeapon?.owned ? activeWeapon.id : "",
      weaponName: activeWeapon?.owned ? activeWeapon.name : "NO WEAPON",
      weaponShortName: activeWeapon?.owned
        ? activeWeapon.shortName
        : "EMPTY",
      weaponRole: activeWeapon?.owned ? activeWeapon.role : "NO WEAPON",
      weaponSlot: (local?.equippedSlot ?? 0) + 1,
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
      matchCountdownMs: this.countdownDisplayMs ?? snapshot.countdownRemainingMs,
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
      supplyFeedbackDetail: this.supplyFeedbackDetail,
      nearbyLootText: nearbyLoot.text,
      nearbyLootCanSwap: nearbyLoot.canSwap,
    };
    this.bridge.publish(hud);
  }

  private nearbyWeaponPrompt(
    snapshot: OnlineSnapshot,
    local: OnlineCombatantSnapshot | null,
    weaponIds: (string | null)[],
  ): { text: string; canSwap: boolean } {
    if (!local || !local.alive) return { text: "", canSwap: false };
    const centerX = local.x;
    const centerY = local.y - 58;
    const radiusSq = LOOT_CONFIG.collectionRadius * LOOT_CONFIG.collectionRadius;
    const full = !hasEmptyWeaponSlot(weaponIds);
    let nearest: { id: string; name: string; x: number; y: number } | null =
      null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const item of snapshot.loot) {
      if (item.kind !== "weapon" || !item.weaponId) continue;
      const dx = item.x - centerX;
      const dy = item.y - centerY;
      const distance = dx * dx + dy * dy;
      if (distance > radiusSq || distance >= nearestDistance) continue;
      nearest = {
        id: item.weaponId,
        name: item.weaponName ?? item.weaponId,
        x: item.x,
        y: item.y,
      };
      nearestDistance = distance;
    }
    for (const pickup of snapshot.pickups) {
      if (!pickup.active) continue;
      const pickupWeaponId = weaponIdFromPickup(pickup.type);
      if (!pickupWeaponId) continue;
      const definition = ALL_PLAYER_WEAPONS.find(
        (weapon) => weapon.id === pickupWeaponId,
      );
      if (!definition) continue;
      const dx = pickup.x - centerX;
      const dy = pickup.y - centerY;
      const distance = dx * dx + dy * dy;
      if (distance > radiusSq || distance >= nearestDistance) continue;
      nearest = {
        id: definition.id,
        name: definition.name,
        x: pickup.x,
        y: pickup.y,
      };
      nearestDistance = distance;
    }
    if (!nearest) return { text: "", canSwap: false };
    if (full && !ownsWeapon(weaponIds, nearest.id)) {
      return {
        text: `E SWAP FOR ${nearest.name.toUpperCase()}`,
        canSwap: true,
      };
    }
    if (ownsWeapon(weaponIds, nearest.id)) {
      return {
        text: `${nearest.name.toUpperCase()} DUPLICATE IN RANGE`,
        canSwap: false,
      };
    }
    return {
      text: `${nearest.name.toUpperCase()} IN RANGE`,
      canSwap: false,
    };
  }

  private drawProjectiles(): void {
    this.bulletGraphics.clear();
    if (!this.latestSnapshot) return;
    const extrapolate = Math.min(0.08, (performance.now() - this.snapshotAt) / 1000);
    for (const projectile of this.latestSnapshot.projectiles) {
      const x = projectile.x + projectile.vx * extrapolate;
      const y = projectile.y + projectile.vy * extrapolate;
      const isRocket = projectile.weaponId === "rocket-launcher";
      const isHeavy = projectile.weaponId === "heavy-cannon";
      const isLance = projectile.weaponId === "vibe-lance";
      const isScatter = projectile.weaponId === "scatter-blaster";
      const isSmg =
        projectile.weaponId === "vibe-smg" ||
        projectile.weaponId === "akimbo-rifles";
      const color = isRocket
        ? 0xc7692f
        : isHeavy
          ? 0xf4e21c
          : isLance
            ? 0x9bd8f2
            : isScatter
              ? 0xc7692f
              : isSmg
                ? 0xd7ff2e
                : 0xd7ff2e;
      if (isRocket) {
        this.bulletGraphics.lineStyle(11, 0xc7692f, 0.18);
        this.bulletGraphics.lineBetween(
          x - projectile.vx * 0.11,
          y - projectile.vy * 0.11,
          x - projectile.vx * 0.035,
          y - projectile.vy * 0.035,
        );
        this.bulletGraphics.lineStyle(5, 0x9aa0a7, 0.24);
        this.bulletGraphics.lineBetween(
          x - projectile.vx * 0.16,
          y - projectile.vy * 0.16,
          x - projectile.vx * 0.06,
          y - projectile.vy * 0.06,
        );
        this.bulletGraphics.lineStyle(7, 0x0c0d0f, 1);
        this.bulletGraphics.lineBetween(
          x - projectile.vx * 0.03,
          y - projectile.vy * 0.03,
          x,
          y,
        );
        this.bulletGraphics.lineStyle(4, 0xe5484d, 1);
        this.bulletGraphics.lineBetween(
          x - projectile.vx * 0.026,
          y - projectile.vy * 0.026,
          x,
          y,
        );
        this.bulletGraphics.fillStyle(0xf4e21c, 1);
        this.bulletGraphics.fillCircle(
          x - projectile.vx * 0.032,
          y - projectile.vy * 0.032,
          4.2,
        );
        this.bulletGraphics.fillStyle(0xf5f3ec, 1);
        this.bulletGraphics.fillCircle(x, y, 2.2);
        continue;
      }
      this.bulletGraphics.lineStyle(
        isHeavy ? 8 : isLance ? 5 : isSmg ? 2.5 : 4,
        color,
        isHeavy ? 0.2 : 0.22,
      );
      this.bulletGraphics.lineBetween(
        x - projectile.vx * (isHeavy ? 0.04 : 0.014),
        y - projectile.vy * (isHeavy ? 0.04 : 0.014),
        x,
        y,
      );
      this.bulletGraphics.fillStyle(color, 1);
      this.bulletGraphics.fillCircle(
        x,
        y,
        isHeavy ? 4.6 : isLance ? 2.4 : isSmg ? 1.8 : 2.2,
      );
    }
  }

  private drawCrosshair(frame: ControlFrame): void {
    this.crosshair.clear();
    const local = this.localSnapshot();
    if (!local?.alive) return;
    const definition =
      ALL_PLAYER_WEAPONS.find((weapon) => weapon.id === local.weaponId) ??
      ALL_PLAYER_WEAPONS[0];
    const spread = 7 + Math.min(24, definition.spreadRadians * 100);
    const color = this.hitFeedbackMs > 0 ? 0xf5f3ec : 0xd7ff2e;
    const origin = this.renderedLocal ?? local;
    const pivotX = origin.x + WEAPON_PIVOT_X;
    const pivotY = origin.y - WEAPON_PIVOT_Y;
    const usesTouchAim = frame.aimAngle !== null;
    const reticleRange = this.testAimAngle !== null ? 400 : TOUCH_RETICLE_RANGE;
    const target =
      this.testAimAngle !== null || usesTouchAim
        ? {
            x: pivotX + Math.cos(this.localAim) * reticleRange,
            y: pivotY + Math.sin(this.localAim) * reticleRange,
          }
        : frame.aimWorld;
    const muzzle = {
      x: pivotX + Math.cos(this.localAim) * 66,
      y: pivotY + Math.sin(this.localAim) * 66,
    };
    this.crosshair.lineStyle(usesTouchAim ? 2 : 1, color, usesTouchAim ? 0.28 : 0.09);
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

  private playWeaponSound(weaponId: string, local: boolean): void {
    const volume = local ? 1 : 0.55;
    switch (weaponId) {
      case "scatter-blaster":
        audio.play("scatter", volume);
        break;
      case "vibe-lance":
        audio.play("lance", volume);
        break;
      case "akimbo-rifles":
        audio.play("akimbo", volume);
        break;
      case "vibe-smg":
        audio.play("smg", volume);
        break;
      case "heavy-cannon":
        audio.play("cannon", volume);
        break;
      case "rocket-launcher":
        audio.play("rocketLaunch", volume);
        break;
      default:
        audio.play("rifle", volume);
        break;
    }
  }

  private cleanup(): void {
    this.clearBackdrop();
    if (this.sceneReadyTimer !== null) window.clearTimeout(this.sceneReadyTimer);
    this.sceneReadyTimer = null;
    this.renderScaler?.setChangeListener(null);
    if (this.resizeHandler) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
      this.resizeHandler = null;
    }
    audio.setJetpackActive(false);
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
