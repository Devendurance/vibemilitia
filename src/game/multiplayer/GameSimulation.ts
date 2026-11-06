import {
  PLAYER_CONFIG,
  PLAYER_WEAPONS,
  PROJECTILE_CONFIG,
  JETPACK_CONFIG,
  MATCH_CONFIG,
  DRONE_CONFIG,
  DRONE_WEAPON,
  DEFAULT_SIM_BOT_TUNING,
  findPlayerWeaponById,
  type SimBotTuning,
  type PlayerWeapon,
} from "@/game/config/gameplay";
import { ARENA } from "@/game/arena/arena";
import { pointInRect, segmentIntersectsRect, type Rect } from "@/game/arena/collision";
import {
  CHARACTER_ROSTER,
  HUMAN_DEFAULT_SKIN_ID,
  getCharacterSkin,
} from "@/game/characters/roster";
import { buildNavigationGrid, findPath, lineClear, type NavGrid, type NavPoint } from "@/game/ai/navigation";
import { applyDamage, stepHealthRegen } from "@/game/core/combat";
import {
  GRENADE_CONFIG,
  GRENADE_INVENTORY_CONFIG,
  STINKING_CLOUD_CONFIG,
  TOXIC_DAMAGE_PER_TICK,
  addGrenade,
  canAddGrenade,
  computeRadialDamage,
  consumeGrenade,
  createGrenadeInventory,
  grenadeInventoryTotal,
  grenadeTypeFromSlot,
  resolveCircleRect,
  type GrenadeInventory,
  type GrenadeType,
} from "@/game/core/grenades";
import {
  MEDKIT_CONFIG,
  PICKUP_LABELS,
  createPickups,
  findCollectiblePickup,
  grenadeTypeFromPickup,
  isWeaponPickup,
  pickupRespawnMs,
  resetPickups,
  stepPickupRespawns,
  weaponIdFromPickup,
  applyMedkit,
  type PickupRuntime,
  type PickupType,
} from "@/game/core/pickups";
import {
  LOOT_CONFIG,
  chooseGrenadeReward,
  clampWeaponAmmo,
  createEliminationLoot,
  expireLoot,
  findNearestActiveLoot,
  grenadeLabel,
  trimLootToCap,
  type LootRuntime,
} from "@/game/core/loot";
import {
  canEquipWeaponSlot,
  createStarterWeaponLoadout,
  findEmptyWeaponSlot,
  hasEmptyWeaponSlot,
  ownsWeapon,
  weaponPickupOutcome,
} from "@/game/core/weaponInventory";
import { createWeaponState, reloadProgress, stepWeapon, type WeaponState } from "@/game/core/weapon";
import {
  createMatchTimer,
  endMatchForScore,
  rankParticipants,
  reachedScoreLimit,
  stepMatchTimer,
  type MatchEndReason,
  type MatchTimerState,
  type ParticipantSummary,
} from "@/game/core/match";
import { selectSpawnPoint } from "@/game/core/spawn";
import {
  createHumanKinematics,
  stepHumanKinematics,
  humanBodyRect,
  HUMAN_HALF_WIDTH,
  HUMAN_HEIGHT,
  type HumanKinematics,
} from "@/game/multiplayer/humanMovement";
import type {
  EndReason,
  MatchPhase,
  OnlineCombatantSnapshot,
  OnlineEvent,
  OnlineFeedEntry,
  OnlineInputPayload,
  OnlineSnapshot,
  OnlineStanding,
  OnlineWeaponSnapshot,
  OnlineHumanMatchResult,
} from "@/game/multiplayer/protocol";
import {
  DEFAULT_MATCH_COUNTDOWN_MS,
  MAX_COMBATANTS,
} from "@/game/multiplayer/protocol";
import {
  DEFAULT_EQUIPPED,
  type EquippedCosmetics,
} from "@/game/progression/cosmetics";

interface HumanCosmetics {
  level: number;
  equipped: EquippedCosmetics;
}

interface AddHumanOptions {
  playerId?: string | null;
  cosmetics?: HumanCosmetics | null;
}

const BOT_WEAPON: PlayerWeapon = {
  ...PLAYER_WEAPONS[0],
  id: "vibe-rifle",
  name: "VIBE RIFLE",
  shortName: "RIFLE",
  role: "BOT / RIFLE",
  damage: DRONE_WEAPON.damage,
  fireIntervalMs: DRONE_WEAPON.fireIntervalMs,
  reloadMs: DRONE_WEAPON.reloadMs,
  projectileSpeed: DRONE_WEAPON.projectileSpeed,
  spreadRadians: DRONE_WEAPON.spreadRadians,
  pellets: 1,
  projectileLifetimeMs: 1800,
  projectileTexture: PLAYER_WEAPONS[0].projectileTexture,
  weaponTexture: PLAYER_WEAPONS[0].weaponTexture,
  muzzleColor: PLAYER_WEAPONS[0].muzzleColor,
  recoil: 0,
  mechanic: "rifle",
};

const CHARACTER_AIM_HEIGHT = 58;
const CHARACTER_PIVOT_X = 28;

function findPlayerWeapon(weaponId: string | null): PlayerWeapon | null {
  return findPlayerWeaponById(weaponId);
}

function emptyWeaponState(): WeaponState {
  return {
    ammo: 0,
    cooldownMs: 0,
    reloadRemainingMs: 0,
    reloading: false,
  };
}

function createWeaponStateFor(weaponId: string | null): WeaponState {
  const definition = findPlayerWeapon(weaponId);
  return definition ? createWeaponState(definition) : emptyWeaponState();
}

function createLoadoutStates(
  weaponIds: readonly (string | null)[],
): WeaponState[] {
  return weaponIds.map((weaponId) => createWeaponStateFor(weaponId));
}

const BOT_NAMES = [
  "NULL-7",
  "GLITCH-3",
  "SCRAP-9",
  "RUST-4",
  "BYTE-2",
  "KILO-8",
  "VOID-1",
  "NEON-5",
  "HEX-6",
  "MOTH-0",
];

const BOT_HALF_WIDTH = 28;
const BOT_HEIGHT = 36;
const BOT_FEET_OFFSET = BOT_HEIGHT / 2;

const BOT_SUPPLY_CONFIG = {
  medkitThreshold: 55,
  medkitSeekRange: 650,
  grenadeSeekRange: 420,
  weaponSeekRange: 560,
  grenadeDecisionMs: 9_000,
  grenadeDecisionJitterMs: 5_000,
  grenadeMinRange: 190,
  grenadeRetryMs: 3_500,
  cloudAvoidRange: 48,
  cloudAvoidMs: 650,
} as const;

const BOT_ADVANCED_RANGE: Record<string, { min: number; max: number }> = {
  "akimbo-rifles": { min: 70, max: 760 },
  "vibe-smg": { min: 50, max: 620 },
  "heavy-cannon": { min: 120, max: 1000 },
  "rocket-launcher": { min: 260, max: 900 },
  "vibe-lance": { min: 150, max: 1100 },
};

interface ProjectileRuntime {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  ownerKind: "human" | "bot";
  damage: number;
  weaponId: string;
  weaponName: string;
  mechanic: PlayerWeapon["mechanic"];
  rocket: PlayerWeapon["rocket"] | null;
  expiresAt: number;
}

interface GrenadeRuntime {
  id: number;
  type: GrenadeType;
  ownerId: string;
  ownerName: string;
  ownerKind: "human" | "bot";
  x: number;
  y: number;
  vx: number;
  vy: number;
  armed: boolean;
  armingRemainingMs: number;
  distanceTraveled: number;
  bounces: number;
  detonateAtMs: number;
  exploded: boolean;
}

interface ToxicCloudRuntime {
  id: number;
  ownerId: string;
  ownerName: string;
  ownerKind: "human" | "bot";
  x: number;
  y: number;
  radius: number;
  createdAtMs: number;
  expiresAtMs: number;
}

interface HumanRuntime {
  kind: "human";
  id: string;
  playerId: string | null;
  cosmetics: HumanCosmetics;
  connected: boolean;
  connectedMs: number;
  inputsReceived: number;
  humanEliminations: number;
  botEliminations: number;
  weaponShots: Record<string, number>;
  weaponHits: Record<string, number>;
  weaponEliminations: Record<string, number>;
  name: string;
  skinId: string;
  kin: HumanKinematics;
  health: number;
  maxHealth: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  respawnRemainingMs: number;
  lastDamageMs: number;
  aimAngle: number;
  weapons: WeaponState[];
  weaponIds: (string | null)[];
  equippedIndex: number;
  akimboBarrel: 0 | 1;
  input: OnlineInputPayload | null;
  lastInputSeq: number;
  moveQueue: QueuedMove[];
  moveDebtTicks: number;
  moveStarvedTicks: number;
  moveDepthFloor: number;
  moveDepthWindow: number;
  moveCatchUpTicks: number;
  ackSeq: number;
  ackTicks: number;
  queuedJump: boolean;
  queuedReload: boolean;
  queuedWeapon: number | null;
  eliminations: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  lastKillerName: string | null;
  deathRecorded: boolean;
  medkits: number;
  medkitCooldownRemainingMs: number;
  queuedMedkit: boolean;
  grenades: GrenadeInventory;
  selectedGrenade: GrenadeType;
  grenadeCooldownRemainingMs: number;
  queuedGrenadeThrow: boolean;
  queuedGrenadeSlot: number | null;
  throwRequestHeld: boolean;
  queuedSwapWeapon: boolean;
  swapRequestHeld: boolean;
}

interface BotRuntime {
  kind: "bot";
  id: string;
  name: string;
  skinId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  respawnRemainingMs: number;
  lastDamageMs: number;
  aimAngle: number;
  eliminations: number;
  deaths: number;
  lastKillerName: string | null;
  deathRecorded: boolean;
  weaponId: string;
  weaponState: WeaponState;
  akimboBarrel: 0 | 1;
  weaponCuriosity: boolean;
  frozen: boolean;
  targetId: string | null;
  path: NavPoint[];
  pathIndex: number;
  pathLength: number;
  repathMs: number;
  strafeSign: number;
  strafeMs: number;
  phase: number;
  fireCooldownMs: number;
  burstRemaining: number;
  burstTimerMs: number;
  lastGoal: NavPoint;
  stuckMs: number;
  lastX: number;
  lastY: number;
  thrusting: boolean;
  medkits: number;
  medkitCooldownRemainingMs: number;
  grenades: GrenadeInventory;
  grenadeCooldownRemainingMs: number;
  grenadeDecisionCooldownMs: number;
  cloudAvoidRemainingMs: number;
  cloudAvoidDirection: number;
}

type AnyCombatant = HumanRuntime | BotRuntime;

interface PickupGrantResult {
  ok: boolean;
  text: string;
  detail: string;
}

interface WeaponAcquireResult {
  ok: boolean;
  slot: number;
  mode: "empty" | "duplicate" | null;
  ammo: number;
}

const PICKUP_REJECTED: PickupGrantResult = {
  ok: false,
  text: "",
  detail: "",
};

interface SimulationOptions {
  roomId: string;
  roomName: string;
  botsEnabled?: boolean;
  countdownMs?: number;
  skinSeed?: number;
  /** Practice-only bot tuning. Online rooms always use the default. */
  botTuning?: SimBotTuning;
}

/** Movement covered by one client packet, simulated one tick per server tick. */
interface QueuedMove {
  seq: number;
  moveX: number;
  jump: boolean;
  jumpHeld: boolean;
  total: number;
  remaining: number;
  started: boolean;
}

/** Most movement a client may have banked: 500ms. Limits buffering and abuse. */
const MAX_QUEUED_MOVE_TICKS = 30;
/** After this long with no input, treat the player as idle. */
const MAX_STARVED_MOVE_TICKS = 30;
/** How long a backlog must persist before banked ticks are spent. */
const MOVE_DEPTH_WINDOW_TICKS = 60;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

function normalizeAim(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let angle = value % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}

function bodyRect(combatant: AnyCombatant): Rect {
  if (combatant.kind === "human") {
    return humanBodyRect(combatant.kin.x, combatant.kin.y);
  }
  const feetY = combatant.y + BOT_FEET_OFFSET;
  return {
    x: combatant.x - HUMAN_HALF_WIDTH,
    y: feetY - HUMAN_HEIGHT,
    width: HUMAN_HALF_WIDTH * 2,
    height: HUMAN_HEIGHT,
  };
}

function center(combatant: AnyCombatant): { x: number; y: number; aimY: number } {
  if (combatant.kind === "human") {
    return { x: combatant.kin.x, y: combatant.kin.y, aimY: combatant.kin.y - CHARACTER_AIM_HEIGHT };
  }
  return {
    x: combatant.x,
    y: combatant.y + BOT_FEET_OFFSET,
    aimY: combatant.y + BOT_FEET_OFFSET - CHARACTER_AIM_HEIGHT,
  };
}

function botWeaponOrigin(bot: BotRuntime): { x: number; y: number } {
  return {
    x: bot.x + CHARACTER_PIVOT_X,
    y: bot.y + BOT_FEET_OFFSET - CHARACTER_AIM_HEIGHT,
  };
}

export class GameSimulation {
  readonly roomId: string;
  readonly roomName: string;
  private matchNumber = 1;
  private humans = new Map<string, HumanRuntime>();
  private bots = new Map<string, BotRuntime>();
  private projectiles = new Map<number, ProjectileRuntime>();
  private activeGrenades = new Map<number, GrenadeRuntime>();
  private toxicClouds = new Map<number, ToxicCloudRuntime>();
  private nextToxicDamageAtMs: number | null = null;
  private pickups: PickupRuntime[] = createPickups(ARENA.pickupSpawns);
  private loot: LootRuntime[] = [];
  private timer: MatchTimerState = createMatchTimer(MATCH_CONFIG.durationMs);
  private countdown = false;
  private started = false;
  private countdownDurationMs: number;
  private countdownRemainingMs = 0;
  private elapsedMs = 0;
  private endReason: MatchEndReason = null;
  private winnerName: string | null = null;
  private tickCount = 0;
  private lastTickMs = 0;
  private feed: OnlineFeedEntry[] = [];
  private feedCounter = 0;
  private projectileCounter = 0;
  private grenadeCounter = 0;
  private toxicCloudCounter = 0;
  private lootCounter = 0;
  private eliminationCounter = 0;
  private botCounter = 0;
  private events: OnlineEvent[] = [];
  private platforms: Rect[] = ARENA.platforms.map((platform) => ({
    x: platform.x,
    y: platform.y,
    width: platform.width,
    height: platform.height,
  }));
  private navGrid: NavGrid;
  private rng = createRng(0x5eedc0de);
  private skinRng: () => number;
  private botsEnabled: boolean;
  private botsWeaponCuriosity = true;
  private botTuning: SimBotTuning;
  private botsLootPaused = false;
  private lootCollectionPaused = false;

  constructor(options: SimulationOptions) {
    this.roomId = options.roomId;
    this.roomName = options.roomName;
    this.botsEnabled = options.botsEnabled ?? true;
    this.countdownDurationMs = Math.max(
      0,
      options.countdownMs ?? DEFAULT_MATCH_COUNTDOWN_MS,
    );
    this.botTuning = options.botTuning ?? DEFAULT_SIM_BOT_TUNING;
    this.skinRng = createRng(
      options.skinSeed ?? seedFromString(options.roomId),
    );
    this.navGrid = buildNavigationGrid(
      ARENA.width,
      ARENA.height,
      this.platforms,
      42,
      64,
    );
  }

  get phase(): MatchPhase {
    if (this.timer.phase === "ended") return "ended";
    if (this.started) return "live";
    return "countdown";
  }

  get humansCount(): number {
    return this.humans.size;
  }

  get botsCount(): number {
    return this.bots.size;
  }

  get joinable(): boolean {
    return (
      this.phase !== "ended" &&
      (this.countdown || this.started) &&
      this.humans.size < MAX_COMBATANTS
    );
  }

  get matchId(): string {
    return `${this.roomId}:${this.matchNumber}`;
  }

  get humanSeats(): number {
    return this.humans.size;
  }

  hasHumanPlayer(playerId: string): boolean {
    for (const human of this.humans.values()) {
      if (human.playerId === playerId) return true;
    }
    return false;
  }

  get allHumansGone(): boolean {
    return this.humans.size === 0;
  }

  addHuman(
    id: string,
    requestedName: string,
    requestedSkinId?: string,
    options: AddHumanOptions = {},
  ): { ok: boolean; error?: string } {
    if (this.timer.phase === "ended") {
      return { ok: false, error: "MATCH_ENDED" };
    }
    if (this.humans.size >= MAX_COMBATANTS) {
      return { ok: false, error: "ROOM_FULL" };
    }
    if (this.humans.has(id)) {
      return { ok: false, error: "ALREADY_JOINED" };
    }

    const firstHuman = this.humans.size === 0;
    const name = requestedName.slice(0, 18) || `VIBER-${id.slice(0, 4)}`;
    const skinId = getCharacterSkin(requestedSkinId).skinId;
    const human = this.createHuman(id, name, skinId, options);
    this.humans.set(id, human);

    if (firstHuman) {
      this.timer = createMatchTimer(MATCH_CONFIG.durationMs);
      this.elapsedMs = 0;
      this.feed = [];
      this.feedCounter = 0;
      this.projectiles.clear();
      this.activeGrenades.clear();
      this.toxicClouds.clear();
      this.nextToxicDamageAtMs = null;
      this.loot = [];
      resetPickups(this.pickups);
      if (this.countdownDurationMs > 0) {
        this.countdown = true;
        this.countdownRemainingMs = this.countdownDurationMs;
        this.started = false;
      } else {
        this.countdown = false;
        this.countdownRemainingMs = 0;
      }
    } else if (this.botsEnabled && this.bots.size > 0) {
      const bot = [...this.bots.values()][0];
      this.bots.delete(bot.id);
    }

    this.spawnHuman(human);
    this.events.push({ type: "player-joined", id, name, human: true });

    if (
      !this.started &&
      (this.humans.size >= MAX_COMBATANTS ||
        (!this.countdown && this.countdownDurationMs <= 0))
    ) {
      this.startMatch();
    }
    return { ok: true };
  }

  removeHuman(id: string): void {
    const human = this.humans.get(id);
    if (!human) return;
    this.humans.delete(id);
    this.events.push({ type: "player-left", id, name: human.name });
    if (this.humans.size === 0) {
      this.countdown = false;
      this.started = false;
      this.countdownRemainingMs = 0;
      this.loot = [];
      return;
    }
    if (
      this.botsEnabled &&
      this.started &&
      this.timer.phase === "live" &&
      this.humans.size + this.bots.size < MAX_COMBATANTS
    ) {
      this.createBot();
    }
  }

  setHumanConnected(id: string, connected: boolean): boolean {
    const human = this.humans.get(id);
    if (!human) return false;
    human.connected = connected;
    if (!connected) {
      human.input = null;
      this.clearMoveQueue(human);
      human.queuedJump = false;
      human.queuedReload = false;
      human.queuedWeapon = null;
      human.queuedMedkit = false;
      human.queuedGrenadeThrow = false;
      human.queuedGrenadeSlot = null;
      human.queuedSwapWeapon = false;
      human.throwRequestHeld = false;
      human.swapRequestHeld = false;
    }
    return true;
  }

  reconnectHuman(oldId: string, newId: string): boolean {
    if (oldId === newId) return this.setHumanConnected(newId, true);
    const human = this.humans.get(oldId);
    if (!human || this.humans.has(newId)) return false;
    this.humans.delete(oldId);
    human.id = newId;
    human.connected = true;
    human.input = null;
    this.clearMoveQueue(human);
    this.humans.set(newId, human);
    return true;
  }

  matchResults(): OnlineHumanMatchResult[] {
    const ranked = this.getRanked();
    const placementById = new Map(
      ranked.map((entry) => [entry.id, entry.placement]),
    );
    return [...this.humans.values()].map((human) => ({
      id: human.id,
      playerId: human.playerId,
      name: human.name,
      skinId: human.skinId,
      placement: placementById.get(human.id) ?? 1,
      eliminations: human.eliminations,
      deaths: human.deaths,
      humanEliminations: human.humanEliminations,
      botEliminations: human.botEliminations,
      participationMs: Math.round(human.connectedMs),
      inputsReceived: human.inputsReceived,
      weaponShots: { ...human.weaponShots },
      weaponHits: { ...human.weaponHits },
      weaponEliminations: { ...human.weaponEliminations },
    }));
  }

  applyInput(id: string, payload: OnlineInputPayload): void {
    const human = this.humans.get(id);
    if (!human || !human.connected || !human.alive || this.phase !== "live") {
      return;
    }
    if (
      !Number.isFinite(payload.seq) ||
      !Number.isFinite(payload.moveX) ||
      !Number.isFinite(payload.aim)
    ) {
      return;
    }
    const seq = Math.floor(payload.seq);
    if (seq <= human.lastInputSeq || seq > human.lastInputSeq + 600) return;

    human.inputsReceived += 1;

    const tickCount =
      typeof payload.ticks === "number" && Number.isFinite(payload.ticks)
        ? Math.max(1, Math.min(8, Math.floor(payload.ticks)))
        : 0;
    if (tickCount > 0) {
      human.moveQueue.push({
        seq,
        moveX: Math.max(-1, Math.min(1, payload.moveX)),
        jump: Boolean(payload.jump),
        jumpHeld: Boolean(payload.jumpHeld),
        total: tickCount,
        remaining: tickCount,
        started: false,
      });
      this.trimMoveQueue(human);
    }

    human.input = {
      seq,
      moveX: Math.max(-1, Math.min(1, payload.moveX)),
      jump: Boolean(payload.jump),
      jumpHeld: Boolean(payload.jumpHeld),
      fire: Boolean(payload.fire),
      reload: Boolean(payload.reload),
      weapon:
        payload.weapon === null
          ? null
          : Math.max(0, Math.min(2, Math.floor(payload.weapon))),
      aim: normalizeAim(payload.aim),
    };
    human.lastInputSeq = seq;
    if (tickCount === 0) human.queuedJump ||= Boolean(payload.jump);
    human.queuedReload ||= Boolean(payload.reload);
    human.queuedMedkit ||= Boolean(payload.useMedkit);
    if (payload.weapon !== null && payload.weapon !== undefined) {
      human.queuedWeapon = Math.max(0, Math.min(2, Math.floor(payload.weapon)));
    }
    if (payload.grenadeSlot !== null && payload.grenadeSlot !== undefined) {
      const slot = Math.floor(payload.grenadeSlot);
      if (grenadeTypeFromSlot(slot)) {
        human.queuedGrenadeSlot = slot;
      }
    }
    const throwRequested = Boolean(payload.throwGrenade);
    if (throwRequested && !human.throwRequestHeld) {
      human.queuedGrenadeThrow = true;
    }
    human.throwRequestHeld = throwRequested;
    const swapRequested = Boolean(payload.swapWeapon);
    if (swapRequested && !human.swapRequestHeld) {
      human.queuedSwapWeapon = true;
    }
    human.swapRequestHeld = swapRequested;
  }

  rematch(): { ok: boolean; error?: string } {
    if (this.timer.phase !== "ended") return { ok: false, error: "MATCH_NOT_ENDED" };
    if (this.humans.size === 0) return { ok: false, error: "NO_HUMANS" };

    this.matchNumber += 1;
    this.timer = createMatchTimer(MATCH_CONFIG.durationMs);
    this.countdown = false;
    this.started = true;
    this.countdownRemainingMs = 0;
    this.endReason = null;
    this.winnerName = null;
    this.elapsedMs = 0;
    this.projectiles.clear();
    this.activeGrenades.clear();
    this.toxicClouds.clear();
    this.nextToxicDamageAtMs = null;
    this.loot = [];
    this.feed = [];
    this.feedCounter = 0;
    this.events = [];
    this.bots.clear();
    resetPickups(this.pickups);

    for (const human of this.humans.values()) {
      human.eliminations = 0;
      human.deaths = 0;
      human.shotsFired = 0;
      human.shotsHit = 0;
      human.humanEliminations = 0;
      human.botEliminations = 0;
      human.connectedMs = 0;
      human.inputsReceived = 0;
      human.weaponShots = {};
      human.weaponHits = {};
      human.weaponEliminations = {};
      human.lastKillerName = null;
      human.input = null;
      this.clearMoveQueue(human);
      this.resetHumanForRespawn(human);
    }
    this.fillBots();
    return { ok: true };
  }

  tick(dtMs: number): void {
    if (!this.countdown && !this.started) return;
    const startedAt = performance.now();
    this.tickCount += 1;

    if (this.countdown) {
      if (this.humans.size === 0) {
        this.countdown = false;
        this.countdownRemainingMs = 0;
        this.lastTickMs = performance.now() - startedAt;
        return;
      }
      this.countdownRemainingMs = Math.max(
        0,
        this.countdownRemainingMs - Math.max(0, dtMs),
      );
      if (this.countdownRemainingMs <= 0) {
        this.startMatch();
      }
      this.lastTickMs = performance.now() - startedAt;
      return;
    }

    if (!this.started || this.timer.phase !== "live") return;
    this.elapsedMs += dtMs;

    const timerBefore = this.timer;
    this.timer = stepMatchTimer(this.timer, dtMs);
    if (this.timer.phase === "ended" && timerBefore.phase === "live") {
      this.finishMatch("time");
      this.lastTickMs = performance.now() - startedAt;
      return;
    }

    for (const human of this.humans.values()) {
      if (human.connected) {
        human.connectedMs = Math.min(
          MATCH_CONFIG.durationMs,
          human.connectedMs + dtMs,
        );
      }
      this.stepHuman(human, dtMs);
    }
    for (const bot of this.bots.values()) {
      this.stepBot(bot, dtMs);
    }
    this.stepProjectiles(dtMs);
    this.stepGrenades(dtMs);
    this.stepToxicClouds();
    const respawnedPickups = stepPickupRespawns(this.pickups, dtMs);
    for (const pickup of respawnedPickups) {
      this.events.push({
        type: "pickup-respawn",
        pickupId: pickup.id,
        itemType: pickup.type,
        x: pickup.x,
        y: pickup.y,
      });
    }
    this.stepLoot();

    if (this.timer.phase === "live") {
      const scores = [...this.humans.values(), ...this.bots.values()].map(
        (combatant) => combatant.eliminations,
      );
      if (reachedScoreLimit(scores, MATCH_CONFIG.scoreLimit)) {
        this.timer = endMatchForScore(this.timer);
        this.finishMatch("score");
      }
    }
    this.lastTickMs = performance.now() - startedAt;
  }

  private startMatch(): void {
    if (this.started) return;
    this.started = true;
    this.countdown = false;
    this.countdownRemainingMs = 0;
    this.timer = createMatchTimer(MATCH_CONFIG.durationMs);
    this.elapsedMs = 0;
    this.projectiles.clear();
    this.activeGrenades.clear();
    this.toxicClouds.clear();
    this.nextToxicDamageAtMs = null;
    this.loot = [];
    this.feed = [];
    this.feedCounter = 0;
    resetPickups(this.pickups);
    this.fillBots();
  }

  snapshot(): OnlineSnapshot {
    const participants = [...this.humans.values(), ...this.bots.values()];
    const summaries: ParticipantSummary[] = participants.map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      score: combatant.eliminations,
      deaths: combatant.deaths,
      order: combatant.kind === "human" ? 0 : 1,
    }));
    const ranked = rankParticipants(summaries);
    const standings: OnlineStanding[] = ranked.map((entry) => {
      const combatant = this.findCombatant(entry.id);
      return {
        ...entry,
        alive: combatant?.alive ?? false,
        isPlayer: false,
        respawnIn: combatant ? combatant.respawnRemainingMs / 1000 : 0,
        kind: combatant?.kind ?? "bot",
      };
    });

    const snapshots = participants.map((combatant) => this.combatantSnapshot(combatant));

    return {
      tick: this.tickCount,
      serverTime: Date.now(),
      matchId: this.matchId,
      matchNumber: this.matchNumber,
      elapsedMs: this.elapsedMs,
      phase: this.phase,
      endReason: this.endReason,
      remainingMs: this.timer.remainingMs,
      durationMs: MATCH_CONFIG.durationMs,
      countdownRemainingMs: this.countdownRemainingMs,
      countdownDurationMs: this.countdownDurationMs,
      scoreLimit: MATCH_CONFIG.scoreLimit,
      winnerName: this.winnerName,
      participants: snapshots,
      projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        ownerId: projectile.ownerId,
        kind: projectile.ownerKind,
        weaponId: projectile.weaponId,
      })),
      grenades: [...this.activeGrenades.values()].map((grenade) => ({
        id: grenade.id,
        type: grenade.type,
        x: grenade.x,
        y: grenade.y,
        vx: grenade.vx,
        vy: grenade.vy,
        ownerId: grenade.ownerId,
        ownerName: grenade.ownerName,
        kind: grenade.ownerKind,
        fuseRemainingMs:
          grenade.type === "frag"
            ? Math.max(0, grenade.detonateAtMs - this.elapsedMs)
            : null,
        activationRemainingMs:
          grenade.type === "stinking"
            ? Math.max(0, grenade.detonateAtMs - this.elapsedMs)
            : null,
        armed: grenade.armed,
      })),
      toxicClouds: [...this.toxicClouds.values()].map((cloud) => ({
        id: cloud.id,
        ownerId: cloud.ownerId,
        ownerName: cloud.ownerName,
        kind: cloud.ownerKind,
        x: cloud.x,
        y: cloud.y,
        radius: cloud.radius,
        createdAtMs: cloud.createdAtMs,
        remainingMs: Math.max(0, cloud.expiresAtMs - this.elapsedMs),
        durationMs: STINKING_CLOUD_CONFIG.durationMs,
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.active ? 0 : pickup.respawnRemainingMs / 1000,
      })),
      loot: this.loot
        .filter((item) => item.active)
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          weaponId: item.weaponId,
          weaponName:
            findPlayerWeapon(item.weaponId)?.name ?? null,
          ammo: item.ammo,
          grenadeType: item.grenadeType,
          x: item.x,
          y: item.y,
          eliminationId: item.eliminationId,
          remainingMs: Math.max(0, item.expiresAtMs - this.elapsedMs),
          createdAtMs: item.createdAtMs,
        })),
      standings,
      feed: this.feed.slice(-6),
      roomId: this.roomId,
      roomName: this.roomName,
      humans: this.humans.size,
      bots: this.bots.size,
      maxCombatants: MAX_COMBATANTS,
      joinable: this.joinable,
      serverTickMs: this.lastTickMs,
    };
  }

  drainEvents(): OnlineEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private createHuman(
    id: string,
    name: string,
    skinId: string,
    options: AddHumanOptions = {},
  ): HumanRuntime {
    const weaponIds = createStarterWeaponLoadout();
    return {
      kind: "human",
      id,
      playerId: options.playerId ?? null,
      cosmetics: options.cosmetics ?? {
        level: 1,
        equipped: { ...DEFAULT_EQUIPPED },
      },
      connected: true,
      connectedMs: 0,
      inputsReceived: 0,
      humanEliminations: 0,
      botEliminations: 0,
      weaponShots: {},
      weaponHits: {},
      weaponEliminations: {},
      name,
      skinId,
      kin: createHumanKinematics(ARENA.playerSpawn.x, ARENA.playerSpawn.y),
      health: PLAYER_CONFIG.maxHealth,
      maxHealth: PLAYER_CONFIG.maxHealth,
      alive: true,
      invulnerableRemainingMs: PLAYER_CONFIG.invulnerabilityMs,
      respawnRemainingMs: 0,
      lastDamageMs: PLAYER_CONFIG.damageRegenDelayMs,
      aimAngle: 0,
      weapons: createLoadoutStates(weaponIds),
      weaponIds,
      equippedIndex: 0,
      akimboBarrel: 0,
      input: null,
      lastInputSeq: 0,
      moveQueue: [],
      moveDebtTicks: 0,
      moveStarvedTicks: 0,
      moveDepthFloor: Number.POSITIVE_INFINITY,
      moveDepthWindow: 0,
      moveCatchUpTicks: 0,
      ackSeq: 0,
      ackTicks: 0,
      queuedJump: false,
      queuedReload: false,
      queuedWeapon: null,
      eliminations: 0,
      deaths: 0,
      shotsFired: 0,
      shotsHit: 0,
      lastKillerName: null,
      deathRecorded: false,
      medkits: 0,
      medkitCooldownRemainingMs: 0,
      queuedMedkit: false,
      grenades: createGrenadeInventory(),
      selectedGrenade: "contact",
      grenadeCooldownRemainingMs: 0,
      queuedGrenadeThrow: false,
      queuedGrenadeSlot: null,
      throwRequestHeld: false,
      queuedSwapWeapon: false,
      swapRequestHeld: false,
    };
  }

  private chooseBotSkinId(): string {
    const used = new Set<string>();
    for (const human of this.humans.values()) used.add(human.skinId);
    for (const bot of this.bots.values()) used.add(bot.skinId);

    const available = CHARACTER_ROSTER.filter(
      (skin) => !used.has(skin.skinId),
    );
    const preferred = available.filter(
      (skin) => skin.skinId !== HUMAN_DEFAULT_SKIN_ID,
    );
    const pool =
      preferred.length > 0
        ? preferred
        : available.length > 0
          ? available
          : CHARACTER_ROSTER.filter(
              (skin) => skin.skinId !== HUMAN_DEFAULT_SKIN_ID,
            );
    const fallback = pool.length > 0 ? pool : CHARACTER_ROSTER;
    return fallback[Math.floor(this.skinRng() * fallback.length)].skinId;
  }

  private createBot(): void {
    const index = this.botCounter++;
    const used = new Set([...this.bots.values()].map((bot) => bot.name));
    const name =
      BOT_NAMES.find((candidate) => !used.has(candidate)) ??
      `BOT-${String(index).padStart(2, "0")}`;
    const bot: BotRuntime = {
      kind: "bot",
      id: `bot-${index}-${name.toLowerCase()}`,
      name,
      skinId: this.chooseBotSkinId(),
      x: ARENA.width / 2,
      y: 900,
      vx: 0,
      vy: 0,
      health: DRONE_CONFIG.maxHealth,
      maxHealth: DRONE_CONFIG.maxHealth,
      alive: true,
      invulnerableRemainingMs: DRONE_CONFIG.invulnerabilityMs,
      respawnRemainingMs: 0,
      lastDamageMs: DRONE_CONFIG.fireIntervalMs,
      aimAngle: 0,
      eliminations: 0,
      deaths: 0,
      lastKillerName: null,
      deathRecorded: false,
      weaponId: BOT_WEAPON.id,
      weaponState: createWeaponState(BOT_WEAPON),
      akimboBarrel: 0,
      weaponCuriosity:
        this.botsWeaponCuriosity && this.rng() < 0.6,
      frozen: false,
      targetId: null,
      path: [],
      pathIndex: 0,
      pathLength: 0,
      repathMs: 0,
      strafeSign: this.rng() < 0.5 ? -1 : 1,
      strafeMs: 900 + this.rng() * 1400,
      phase: this.rng() * Math.PI * 2,
      fireCooldownMs: 700 + this.rng() * 1000,
      burstRemaining: 0,
      burstTimerMs: 0,
      lastGoal: { x: 0, y: 0 },
      stuckMs: 0,
      lastX: 0,
      lastY: 0,
      thrusting: false,
      medkits: 0,
      medkitCooldownRemainingMs: 0,
      grenades: createGrenadeInventory(),
      grenadeCooldownRemainingMs: 0,
      grenadeDecisionCooldownMs: 6_000 + this.rng() * 7_000,
      cloudAvoidRemainingMs: 0,
      cloudAvoidDirection: 1,
    };
    this.spawnBot(bot);
    this.bots.set(bot.id, bot);
  }

  private fillBots(): void {
    if (!this.botsEnabled) return;
    while (this.humans.size + this.bots.size < MAX_COMBATANTS) {
      this.createBot();
    }
  }

  private spawnHuman(human: HumanRuntime): void {
    const spawn = this.pickSpawn(human.id);
    const kin = createHumanKinematics(spawn.x, spawn.y);
    kin.vy = 0;
    human.kin = kin;
    human.health = human.maxHealth;
    human.alive = true;
    human.invulnerableRemainingMs = PLAYER_CONFIG.invulnerabilityMs;
    human.respawnRemainingMs = 0;
    human.lastDamageMs = PLAYER_CONFIG.damageRegenDelayMs;
    this.clearMoveQueue(human);
    human.queuedJump = false;
    human.queuedReload = false;
    human.queuedWeapon = null;
    human.queuedMedkit = false;
    human.medkits = 0;
    human.medkitCooldownRemainingMs = 0;
    human.grenades = createGrenadeInventory();
    human.selectedGrenade = "contact";
    human.grenadeCooldownRemainingMs = 0;
    human.queuedGrenadeThrow = false;
    human.queuedGrenadeSlot = null;
    human.throwRequestHeld = false;
    human.queuedSwapWeapon = false;
    human.swapRequestHeld = false;
    human.deathRecorded = false;
    human.weaponIds = createStarterWeaponLoadout();
    human.weapons = createLoadoutStates(human.weaponIds);
    human.equippedIndex = 0;
    human.akimboBarrel = 0;
    this.events.push({
      type: "respawn",
      id: human.id,
      name: human.name,
      x: spawn.x,
      y: spawn.y,
      kind: "human",
    });
  }

  private resetHumanForRespawn(human: HumanRuntime): void {
    this.spawnHuman(human);
  }

  private spawnBot(bot: BotRuntime): void {
    const spawn = this.pickSpawn(bot.id);
    bot.x = spawn.x;
    bot.y = spawn.y - BOT_FEET_OFFSET;
    bot.vx = 0;
    bot.vy = 0;
    bot.health = bot.maxHealth;
    bot.alive = true;
    bot.invulnerableRemainingMs = DRONE_CONFIG.invulnerabilityMs;
    bot.respawnRemainingMs = 0;
    bot.lastDamageMs = 0;
    bot.deathRecorded = false;
    bot.weaponId = BOT_WEAPON.id;
    bot.weaponState = createWeaponState(BOT_WEAPON);
    bot.akimboBarrel = 0;
    bot.frozen = false;
    bot.path = [];
    bot.pathIndex = 0;
    bot.pathLength = 0;
    bot.repathMs = 0;
    bot.targetId = null;
    bot.stuckMs = 0;
    bot.lastX = bot.x;
    bot.lastY = bot.y;
    bot.medkits = 0;
    bot.medkitCooldownRemainingMs = 0;
    bot.grenades = createGrenadeInventory();
    bot.grenadeCooldownRemainingMs = 0;
    bot.grenadeDecisionCooldownMs = 6_000 + this.rng() * 7_000;
    bot.cloudAvoidRemainingMs = 0;
    bot.cloudAvoidDirection = this.rng() < 0.5 ? -1 : 1;
    this.events.push({
      type: "respawn",
      id: bot.id,
      name: bot.name,
      x: bot.x,
      y: bot.y + BOT_FEET_OFFSET,
      kind: "bot",
    });
  }

  private pickSpawn(excludedId: string): { x: number; y: number } {
    const threats = [...this.humans.values(), ...this.bots.values()]
      .filter((combatant) => combatant.alive && combatant.id !== excludedId)
      .map((combatant) => {
        const position = center(combatant);
        return { id: combatant.id, x: position.x, y: position.aimY };
      });
    return selectSpawnPoint({
      candidates: ARENA.spawnPoints,
      threats,
      blockers: this.platforms,
      random: this.rng,
    });
  }

  /**
   * Movement is consumed one client tick per server tick, so simulated movement
   * is a pure function of the input stream however packets arrive. That is what
   * lets client replay land exactly through TCP jitter.
   *
   * When input is late the player holds still for that tick and the tick is
   * banked. A stall therefore cannot be followed by a correction, and the
   * backlog it leaves acts as a jitter buffer. If the backlog stays deeper than
   * needed, banked ticks are spent to catch up, never exceeding real time.
   */
  private nextHumanMovement(human: HumanRuntime): {
    moveX: number;
    jumpPressed: boolean;
    jumpHeld: boolean;
  } | null {
    const carriedJump = human.queuedJump;
    human.queuedJump = false;
    const usesTickedInput = human.ackSeq > 0 || human.moveQueue.length > 0;
    if (!usesTickedInput) {
      const input = human.input;
      return input
        ? { moveX: input.moveX, jumpPressed: carriedJump, jumpHeld: input.jumpHeld }
        : { moveX: 0, jumpPressed: false, jumpHeld: false };
    }

    const frame = human.moveQueue[0];
    if (!frame) {
      human.moveStarvedTicks += 1;
      if (human.moveStarvedTicks > MAX_STARVED_MOVE_TICKS) {
        // A silent client: stop banking and let gravity and friction apply.
        human.moveDebtTicks = 0;
        return { moveX: 0, jumpPressed: false, jumpHeld: false };
      }
      human.moveDebtTicks = Math.min(
        MAX_QUEUED_MOVE_TICKS,
        human.moveDebtTicks + 1,
      );
      human.queuedJump = carriedJump;
      return null;
    }

    const jumpPressed = carriedJump || (!frame.started && frame.jump);
    frame.started = true;
    frame.remaining -= 1;
    human.ackSeq = frame.seq;
    human.ackTicks = frame.total - frame.remaining;
    human.moveStarvedTicks = 0;
    if (frame.remaining <= 0) human.moveQueue.shift();
    return { moveX: frame.moveX, jumpPressed, jumpHeld: frame.jumpHeld };
  }

  /** Spends banked ticks when the backlog has stayed deeper than jitter needs. */
  private shouldCatchUp(human: HumanRuntime): boolean {
    const depth = human.moveQueue.reduce((sum, move) => sum + move.remaining, 0);
    human.moveDepthFloor = Math.min(human.moveDepthFloor, depth);
    human.moveDepthWindow += 1;
    if (human.moveDepthWindow >= MOVE_DEPTH_WINDOW_TICKS) {
      human.moveCatchUpTicks = Number.isFinite(human.moveDepthFloor)
        ? Math.max(0, human.moveDepthFloor - 2)
        : 0;
      human.moveDepthFloor = Number.POSITIVE_INFINITY;
      human.moveDepthWindow = 0;
    }
    if (human.moveCatchUpTicks <= 0 || human.moveDebtTicks <= 0 || depth <= 0) {
      return false;
    }
    human.moveCatchUpTicks -= 1;
    human.moveDebtTicks -= 1;
    return true;
  }

  /**
   * The room caps how much time one loop may simulate, so a stalled server
   * loses real time. Clients keep sending through a stall. Without this credit
   * that backlog could never be spent and the queue trim would discard real
   * movement. Only time that really passed is credited, so it cannot be abused.
   */
  creditStall(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const ticks = Math.floor(ms / (1000 / 60));
    for (const human of this.humans.values()) {
      human.moveDebtTicks = Math.min(
        MAX_QUEUED_MOVE_TICKS,
        human.moveDebtTicks + ticks,
      );
    }
  }

  private trimMoveQueue(human: HumanRuntime): void {
    let banked = human.moveQueue.reduce((sum, move) => sum + move.remaining, 0);
    while (banked > MAX_QUEUED_MOVE_TICKS && human.moveQueue.length > 1) {
      const dropped = human.moveQueue.shift();
      if (!dropped) break;
      banked -= dropped.remaining;
      if (!dropped.started && dropped.jump) human.queuedJump = true;
      human.ackSeq = dropped.seq;
      human.ackTicks = dropped.total;
    }
  }

  private clearMoveQueue(human: HumanRuntime): void {
    human.moveQueue = [];
    human.moveDebtTicks = 0;
    human.moveStarvedTicks = 0;
    human.moveDepthFloor = Number.POSITIVE_INFINITY;
    human.moveDepthWindow = 0;
    human.moveCatchUpTicks = 0;
  }

  private stepHuman(human: HumanRuntime, dtMs: number): void {
    if (!human.alive) {
      human.respawnRemainingMs = Math.max(0, human.respawnRemainingMs - dtMs);
      if (human.respawnRemainingMs <= 0) this.spawnHuman(human);
      return;
    }

    human.invulnerableRemainingMs = Math.max(0, human.invulnerableRemainingMs - dtMs);
    human.lastDamageMs += dtMs;
    human.medkitCooldownRemainingMs = Math.max(
      0,
      human.medkitCooldownRemainingMs - dtMs,
    );
    human.grenadeCooldownRemainingMs = Math.max(
      0,
      human.grenadeCooldownRemainingMs - dtMs,
    );
    human.health = stepHealthRegen(
      human.health,
      human.maxHealth,
      human.lastDamageMs,
      dtMs,
      PLAYER_CONFIG.damageRegenDelayMs,
      PLAYER_CONFIG.healthRegenPerSecond,
    );

    const input = human.input;
    if (input) {
      human.aimAngle = input.aim;
    }
    const moveWorld = {
      width: ARENA.width,
      height: ARENA.height,
      platforms: this.platforms,
    };
    const stepsDue = this.shouldCatchUp(human) ? 2 : 1;
    for (let step = 0; step < stepsDue; step += 1) {
      const movement = this.nextHumanMovement(human);
      if (!movement) continue;
      const result = stepHumanKinematics(human.kin, movement, dtMs, moveWorld);
      if (result.jumped) human.kin.grounded = false;
    }

    if (human.queuedWeapon !== null) {
      const requested = Math.max(0, Math.min(2, human.queuedWeapon));
      if (canEquipWeaponSlot(human.weaponIds, requested)) {
        if (requested !== human.equippedIndex) {
          human.akimboBarrel = 0;
        }
        human.equippedIndex = requested;
      }
      human.queuedWeapon = null;
    }
    const equippedId = human.weaponIds[human.equippedIndex] ?? null;
    const definition = findPlayerWeapon(equippedId);
    const weaponState = human.weapons[human.equippedIndex] ?? emptyWeaponState();
    const fire = Boolean(input?.fire);
    const reload = human.queuedReload;
    human.queuedReload = false;
    if (definition) {
      const weapon = stepWeapon(weaponState, definition, {
        fire,
        reload,
        dtMs,
      });
      human.weapons[human.equippedIndex] = weapon.state;
      if (weapon.fired) {
        human.shotsFired += definition.pellets;
        human.weaponShots[definition.id] =
          (human.weaponShots[definition.id] ?? 0) + definition.pellets;
        const barrel: 0 | 1 =
          definition.mechanic === "akimbo" ? human.akimboBarrel : 0;
        this.fireWeapon(
          human.id,
          "human",
          definition,
          human.kin.x + 28,
          human.kin.y - 58,
          human.aimAngle,
          barrel,
        );
        if (definition.mechanic === "akimbo") {
          human.akimboBarrel = human.akimboBarrel === 0 ? 1 : 0;
        }
      }
    } else {
      human.weapons[human.equippedIndex] = emptyWeaponState();
    }

    if (human.queuedGrenadeSlot !== null) {
      const selected = grenadeTypeFromSlot(human.queuedGrenadeSlot);
      if (selected) human.selectedGrenade = selected;
      human.queuedGrenadeSlot = null;
    }
    if (human.queuedGrenadeThrow) {
      human.queuedGrenadeThrow = false;
      this.tryThrowGrenade(human);
    }

    if (human.queuedMedkit) {
      human.queuedMedkit = false;
      this.tryUseMedkitFor(human);
    }
    this.collectNearbyPickups(human);
    this.collectNearbyLoot(human);
    if (human.queuedSwapWeapon) {
      human.queuedSwapWeapon = false;
      this.trySwapWeapon(human);
    }
  }

  private tryUseMedkitFor(combatant: AnyCombatant): void {
    const result = applyMedkit({
      health: combatant.health,
      maxHealth: combatant.maxHealth,
      carried: combatant.medkits,
      cooldownRemainingMs: combatant.medkitCooldownRemainingMs,
    });
    if (!result.ok) return;
    const position = center(combatant);
    combatant.health = result.health;
    combatant.medkits = result.carried;
    combatant.medkitCooldownRemainingMs = MEDKIT_CONFIG.useCooldownMs;
    this.events.push({
      type: "medkit-used",
      playerId: combatant.id,
      playerName: combatant.name,
      healed: result.healed,
      health: result.health,
      x: position.x,
      y: position.aimY,
    });
  }

  private collectNearbyPickups(combatant: AnyCombatant): void {
    while (true) {
      const position = center(combatant);
      const pickup = findCollectiblePickup(
        this.pickups,
        position.x,
        position.aimY,
        (candidate) => this.canCollectPickup(combatant, candidate.type),
      );
      if (!pickup) return;
      const granted = this.grantPickup(combatant, pickup.type);
      if (!granted.ok) {
        pickup.active = true;
        pickup.respawnRemainingMs = 0;
        return;
      }
      this.events.push({
        type: "pickup-collected",
        pickupId: pickup.id,
        itemType: pickup.type,
        playerId: combatant.id,
        playerName: combatant.name,
        x: pickup.x,
        y: pickup.y,
        text: granted.text,
        detail: granted.detail,
      });
    }
  }

  private canCollectPickup(
    combatant: AnyCombatant,
    type: PickupType,
  ): boolean {
    if (isWeaponPickup(type)) {
      const weaponId = weaponIdFromPickup(type);
      if (!weaponId) return false;
      if (combatant.kind === "human") {
        return (
          weaponPickupOutcome(combatant.weaponIds, weaponId) !==
          "needs-swap"
        );
      }
      return this.canBotAcquireWeapon(combatant, weaponId);
    }
    if (type === "medkit") {
      return combatant.medkits < MEDKIT_CONFIG.maxCarried;
    }
    return (
      grenadeTypeFromPickup(type) !== null &&
      canAddGrenade(combatant.grenades)
    );
  }

  private grantPickup(
    combatant: AnyCombatant,
    type: PickupType,
  ): PickupGrantResult {
    if (isWeaponPickup(type)) {
      const weaponId = weaponIdFromPickup(type);
      const definition = findPlayerWeapon(weaponId);
      if (!weaponId || !definition) return PICKUP_REJECTED;
      if (combatant.kind === "bot") {
        return this.grantBotWeapon(
          combatant,
          weaponId,
          definition.magazineSize,
        );
      }
      const acquired = this.acquireWeapon(
        combatant,
        definition.id,
        definition.magazineSize,
      );
      if (!acquired.ok) return PICKUP_REJECTED;
      return acquired.mode === "duplicate"
        ? { ok: true, text: "AMMO RESTORED", detail: definition.name }
        : { ok: true, text: "WEAPON ACQUIRED", detail: definition.name };
    }
    if (type === "medkit") {
      if (combatant.medkits >= MEDKIT_CONFIG.maxCarried) {
        return PICKUP_REJECTED;
      }
      combatant.medkits = Math.min(
        MEDKIT_CONFIG.maxCarried,
        combatant.medkits + 1,
      );
      return { ok: true, text: "MEDKIT +1", detail: PICKUP_LABELS.medkit };
    }
    const grenadeType = grenadeTypeFromPickup(type);
    if (!grenadeType || !canAddGrenade(combatant.grenades)) {
      return PICKUP_REJECTED;
    }
    combatant.grenades = addGrenade(combatant.grenades, grenadeType);
    return {
      ok: true,
      text: `${grenadeLabel(grenadeType)} +1`,
      detail: PICKUP_LABELS[type],
    };
  }

  private canBotAcquireWeapon(
    bot: BotRuntime,
    weaponId: string,
  ): boolean {
    if (!bot.weaponCuriosity) return false;
    return bot.weaponId === weaponId || bot.weaponId === BOT_WEAPON.id;
  }

  private grantBotWeapon(
    bot: BotRuntime,
    weaponId: string,
    ammo: number,
  ): PickupGrantResult {
    const definition = findPlayerWeapon(weaponId);
    if (!definition || !this.canBotAcquireWeapon(bot, weaponId)) {
      return PICKUP_REJECTED;
    }
    if (bot.weaponId === weaponId) {
      bot.weaponState.ammo = definition.magazineSize;
      bot.weaponState.reloading = false;
      bot.weaponState.reloadRemainingMs = 0;
      return { ok: true, text: "AMMO RESTORED", detail: definition.name };
    }
    bot.weaponId = weaponId;
    bot.weaponState = createWeaponState(definition);
    bot.weaponState.ammo = clampWeaponAmmo(
      ammo,
      definition.magazineSize,
    );
    bot.akimboBarrel = 0;
    return { ok: true, text: "WEAPON ACQUIRED", detail: definition.name };
  }

  private acquireWeapon(
    human: HumanRuntime,
    weaponId: string,
    ammo: number,
  ): WeaponAcquireResult {
    const definition = findPlayerWeapon(weaponId);
    if (!definition) return { ok: false, slot: -1, mode: null, ammo: 0 };
    const emptySlot = findEmptyWeaponSlot(human.weaponIds);
    if (emptySlot !== -1) {
      human.weaponIds[emptySlot] = weaponId;
      const state = createWeaponState(definition);
      state.ammo = clampWeaponAmmo(ammo, definition.magazineSize);
      human.weapons[emptySlot] = state;
      human.equippedIndex = emptySlot;
      return {
        ok: true,
        slot: emptySlot,
        mode: "empty",
        ammo: state.ammo,
      };
    }
    const ownedSlots = human.weaponIds
      .map((id, index) => (id === weaponId ? index : -1))
      .filter((index) => index !== -1);
    if (ownedSlots.length > 0) {
      const targetSlot = ownedSlots.includes(human.equippedIndex)
        ? human.equippedIndex
        : ownedSlots.sort(
            (left, right) =>
              (human.weapons[left]?.ammo ?? 0) -
                (human.weapons[right]?.ammo ?? 0) || left - right,
          )[0];
      const state = human.weapons[targetSlot] ?? emptyWeaponState();
      state.ammo = definition.magazineSize;
      state.reloading = false;
      state.reloadRemainingMs = 0;
      human.weapons[targetSlot] = state;
      return {
        ok: true,
        slot: targetSlot,
        mode: "duplicate",
        ammo: definition.magazineSize,
      };
    }
    return { ok: false, slot: -1, mode: null, ammo: 0 };
  }

  private canCollectLoot(
    combatant: AnyCombatant,
    item: LootRuntime,
  ): boolean {
    if (!item.active) return false;
    if (item.kind === "medkit") {
      return combatant.medkits < MEDKIT_CONFIG.maxCarried;
    }
    if (item.kind === "grenade") {
      return (
        item.grenadeType !== null &&
        canAddGrenade(combatant.grenades)
      );
    }
    if (!item.weaponId) return false;
    if (combatant.kind === "bot") {
      return this.canBotAcquireWeapon(combatant, item.weaponId);
    }
    return (
      weaponPickupOutcome(combatant.weaponIds, item.weaponId) !==
      "needs-swap"
    );
  }

  private collectNearbyLoot(combatant: AnyCombatant): void {
    if (this.lootCollectionPaused) return;
    if (combatant.kind === "bot" && this.botsLootPaused) return;
    while (true) {
      const position = center(combatant);
      const item = findNearestActiveLoot(
        this.loot,
        position.x,
        position.aimY,
        LOOT_CONFIG.collectionRadius,
        (candidate) => this.canCollectLoot(combatant, candidate),
      );
      if (!item) return;
      const granted = this.grantLoot(combatant, item);
      if (!granted.ok) return;
      item.active = false;
      this.events.push({
        type: "loot-collected",
        lootId: item.id,
        kind: item.kind,
        playerId: combatant.id,
        playerName: combatant.name,
        x: item.x,
        y: item.y,
        weaponId: item.weaponId,
        grenadeType: item.grenadeType,
        text: granted.text,
        detail: granted.detail,
      });
    }
  }

  private grantLoot(
    combatant: AnyCombatant,
    item: LootRuntime,
  ): PickupGrantResult {
    if (item.kind === "medkit") {
      if (combatant.medkits >= MEDKIT_CONFIG.maxCarried) {
        return PICKUP_REJECTED;
      }
      combatant.medkits = Math.min(
        MEDKIT_CONFIG.maxCarried,
        combatant.medkits + 1,
      );
      return { ok: true, text: "MEDKIT +1", detail: "FIELD REPAIR" };
    }
    if (item.kind === "grenade") {
      if (!item.grenadeType || !canAddGrenade(combatant.grenades)) {
        return PICKUP_REJECTED;
      }
      combatant.grenades = addGrenade(
        combatant.grenades,
        item.grenadeType,
      );
      return {
        ok: true,
        text: `${grenadeLabel(item.grenadeType)} +1`,
        detail: "THROWABLE",
      };
    }
    if (!item.weaponId) return PICKUP_REJECTED;
    const definition = findPlayerWeapon(item.weaponId);
    if (!definition) return PICKUP_REJECTED;
    if (combatant.kind === "bot") {
      return this.grantBotWeapon(
        combatant,
        item.weaponId,
        item.ammo,
      );
    }
    const acquired = this.acquireWeapon(
      combatant,
      item.weaponId,
      item.ammo,
    );
    if (!acquired.ok) return PICKUP_REJECTED;
    return acquired.mode === "duplicate"
      ? { ok: true, text: "AMMO RESTORED", detail: definition.name }
      : { ok: true, text: "WEAPON ACQUIRED", detail: definition.name };
  }

  /**
   * Explicit E interaction. It only runs with a full loadout, so no weapon can
   * be lost without intent. The replaced weapon is scrapped instead of being
   * re-dropped, which makes duplication impossible.
   */
  private trySwapWeapon(human: HumanRuntime): void {
    if (!human.alive || this.phase !== "live") return;
    if (hasEmptyWeaponSlot(human.weaponIds)) return;
    const position = center(human);
    let best: {
      loot: LootRuntime | null;
      pickup: PickupRuntime | null;
      weaponId: string;
      ammo: number;
      distance: number;
    } | null = null;

    for (const item of this.loot) {
      if (!item.active || item.kind !== "weapon" || !item.weaponId) continue;
      if (ownsWeapon(human.weaponIds, item.weaponId)) continue;
      const distance = Math.hypot(item.x - position.x, item.y - position.aimY);
      if (distance > LOOT_CONFIG.collectionRadius) continue;
      if (best && distance >= best.distance) continue;
      best = {
        loot: item,
        pickup: null,
        weaponId: item.weaponId,
        ammo: item.ammo,
        distance,
      };
    }
    for (const pickup of this.pickups) {
      if (!pickup.active || !isWeaponPickup(pickup.type)) continue;
      const pickupWeaponId = weaponIdFromPickup(pickup.type);
      const definition = findPlayerWeapon(pickupWeaponId);
      if (!definition) continue;
      if (ownsWeapon(human.weaponIds, definition.id)) continue;
      const distance = Math.hypot(pickup.x - position.x, pickup.y - position.aimY);
      if (distance > LOOT_CONFIG.collectionRadius) continue;
      if (best && distance >= best.distance) continue;
      best = {
        loot: null,
        pickup,
        weaponId: definition.id,
        ammo: definition.magazineSize,
        distance,
      };
    }

    if (!best) return;
    const definition = findPlayerWeapon(best.weaponId);
    if (!definition) return;
    const slot = human.equippedIndex;
    const fromWeaponId = human.weaponIds[slot];
    if (!fromWeaponId) return;
    human.weaponIds[slot] = best.weaponId;
    const state = createWeaponState(definition);
    state.ammo = clampWeaponAmmo(best.ammo, definition.magazineSize);
    human.weapons[slot] = state;
    human.equippedIndex = slot;
    human.akimboBarrel = 0;

    if (best.loot) {
      best.loot.active = false;
      this.events.push({
        type: "loot-collected",
        lootId: best.loot.id,
        kind: "weapon",
        playerId: human.id,
        playerName: human.name,
        x: best.loot.x,
        y: best.loot.y,
        weaponId: best.weaponId,
        grenadeType: null,
        text: "WEAPON SWAPPED",
        detail: definition.name,
      });
    }
    if (best.pickup) {
      best.pickup.active = false;
      best.pickup.respawnRemainingMs = pickupRespawnMs(best.pickup.type);
      this.events.push({
        type: "pickup-collected",
        pickupId: best.pickup.id,
        itemType: best.pickup.type,
        playerId: human.id,
        playerName: human.name,
        x: best.pickup.x,
        y: best.pickup.y,
        text: "WEAPON SWAPPED",
        detail: definition.name,
      });
    }
    this.events.push({
      type: "weapon-swapped",
      playerId: human.id,
      playerName: human.name,
      slot,
      fromWeaponId,
      toWeaponId: best.weaponId,
      x: position.x,
      y: position.aimY,
    });
  }

  private stepLoot(): void {
    const expired = expireLoot(this.loot, this.elapsedMs);
    for (const item of expired) {
      this.events.push({
        type: "loot-expired",
        lootId: item.id,
        x: item.x,
        y: item.y,
      });
    }
    if (this.loot.some((item) => !item.active)) {
      this.loot = this.loot.filter((item) => item.active);
    }
  }

  private spawnEliminationLoot(
    eliminationId: number,
    victim: AnyCombatant,
  ): LootRuntime[] {
    const position = center(victim);
    const weaponId =
      victim.kind === "human"
        ? victim.weaponIds[victim.equippedIndex] ?? BOT_WEAPON.id
        : victim.weaponId;
    const definition = findPlayerWeapon(weaponId) ?? findPlayerWeapon(BOT_WEAPON.id);
    if (!definition) return [];
    const weaponAmmo =
      victim.kind === "human"
        ? victim.weapons[victim.equippedIndex]?.ammo ?? 0
        : victim.weaponState.ammo;
    const created = createEliminationLoot({
      eliminationId,
      roomId: this.roomId,
      x: position.x,
      y: victim.kind === "human" ? victim.kin.y : victim.y + BOT_FEET_OFFSET,
      weaponId: definition.id,
      weaponAmmo: clampWeaponAmmo(weaponAmmo, definition.magazineSize),
      grenadeType: chooseGrenadeReward(victim.grenades),
      nowMs: this.elapsedMs,
      platforms: this.platforms,
      arenaWidth: ARENA.width,
      arenaHeight: ARENA.height,
      createId: () => `loot-${this.roomId}-${++this.lootCounter}`,
    });
    this.loot.push(...created);
    const trimmed = trimLootToCap(this.loot);
    for (const item of trimmed) {
      this.events.push({
        type: "loot-expired",
        lootId: item.id,
        x: item.x,
        y: item.y,
      });
    }
    if (this.loot.some((item) => !item.active)) {
      this.loot = this.loot.filter((item) => item.active);
    }
    return created.filter((item) => item.active);
  }

  private tryThrowGrenade(human: HumanRuntime): void {
    this.throwGrenadeFromCombatant(human, human.selectedGrenade);
  }

  private throwGrenadeFromCombatant(
    combatant: AnyCombatant,
    type: GrenadeType,
    aim = combatant.aimAngle,
  ): boolean {
    if (!combatant.alive || this.phase !== "live") return false;
    if (combatant.grenadeCooldownRemainingMs > 0) return false;
    if (
      this.activeGrenades.size >=
      GRENADE_INVENTORY_CONFIG.maxActiveGrenades
    ) {
      return false;
    }
    if (
      type === "stinking" &&
      this.toxicClouds.size + this.pendingStinkingGrenades() >=
        STINKING_CLOUD_CONFIG.maxActiveClouds
    ) {
      return false;
    }
    const nextInventory = consumeGrenade(combatant.grenades, type);
    if (!nextInventory) return false;
    const definition = GRENADE_CONFIG[type];
    const origin = this.combatantThrowOrigin(combatant, aim);
    combatant.grenades = nextInventory;
    combatant.grenadeCooldownRemainingMs = definition.throwCooldownMs;

    const grenade: GrenadeRuntime = {
      id: ++this.grenadeCounter,
      type,
      ownerId: combatant.id,
      ownerName: combatant.name,
      ownerKind: combatant.kind,
      x: origin.x,
      y: origin.y,
      vx: Math.cos(aim) * definition.throwSpeed + origin.vx * 0.22,
      vy: Math.sin(aim) * definition.throwSpeed + origin.vy * 0.15,
      armed: false,
      armingRemainingMs: definition.armingMs,
      distanceTraveled: 0,
      bounces: 0,
      detonateAtMs:
        this.elapsedMs + (definition.fuseMs ?? definition.maxLifetimeMs),
      exploded: false,
    };
    this.activeGrenades.set(grenade.id, grenade);
    this.events.push({
      type: "grenade-thrown",
      grenadeId: grenade.id,
      grenadeType: grenade.type,
      ownerId: grenade.ownerId,
      ownerName: grenade.ownerName,
      kind: grenade.ownerKind,
      x: grenade.x,
      y: grenade.y,
      vx: grenade.vx,
      vy: grenade.vy,
      fuseMs: definition.fuseMs,
    });
    return true;
  }

  private combatantThrowOrigin(
    combatant: AnyCombatant,
    aim: number,
  ): { x: number; y: number; vx: number; vy: number } {
    const baseX =
      combatant.kind === "human"
        ? combatant.kin.x + CHARACTER_PIVOT_X
        : combatant.x + CHARACTER_PIVOT_X;
    const baseY =
      combatant.kind === "human"
        ? combatant.kin.y - CHARACTER_AIM_HEIGHT
        : combatant.y + BOT_FEET_OFFSET - CHARACTER_AIM_HEIGHT;
    const vx = combatant.kind === "human" ? combatant.kin.vx : combatant.vx;
    const vy = combatant.kind === "human" ? combatant.kin.vy : combatant.vy;
    return {
      x: Math.max(
        10,
        Math.min(
          ARENA.width - 10,
          baseX + Math.cos(aim) * 26,
        ),
      ),
      y: Math.max(
        10,
        Math.min(
          ARENA.height - 10,
          baseY + Math.sin(aim) * 26,
        ),
      ),
      vx,
      vy,
    };
  }

  private pendingStinkingGrenades(): number {
    let count = 0;
    for (const grenade of this.activeGrenades.values()) {
      if (grenade.type === "stinking") count += 1;
    }
    return count;
  }

  private stepGrenades(dtMs: number): void {
    if (this.activeGrenades.size === 0) return;
    for (const grenade of [...this.activeGrenades.values()]) {
      if (grenade.exploded) continue;
      const definition = GRENADE_CONFIG[grenade.type];
      const dt = dtMs / 1000;
      const speed = Math.hypot(grenade.vx, grenade.vy);
      const substeps = Math.max(
        1,
        Math.min(
          24,
          Math.ceil((speed * dt + Math.abs(grenade.vy) * dt) / 5),
        ),
      );
      for (
        let step = 0;
        step < substeps && !grenade.exploded;
        step += 1
      ) {
        const stepDt = dt / substeps;
        const stepMs = dtMs / substeps;
        grenade.vy += definition.gravity * stepDt;
        const previousX = grenade.x;
        const previousY = grenade.y;
        grenade.x += grenade.vx * stepDt;
        grenade.y += grenade.vy * stepDt;
        grenade.distanceTraveled += Math.hypot(
          grenade.x - previousX,
          grenade.y - previousY,
        );
        grenade.armingRemainingMs = Math.max(
          0,
          grenade.armingRemainingMs - stepMs,
        );
        if (
          !grenade.armed &&
          grenade.armingRemainingMs <= 0 &&
          grenade.distanceTraveled >= definition.armingDistance
        ) {
          grenade.armed = true;
        }
        this.clampGrenadeToWorld(grenade, definition);

        for (const platform of this.platforms) {
          const hit = resolveCircleRect(
            grenade.x,
            grenade.y,
            definition.radius,
            platform,
          );
          if (!hit) continue;
          if (grenade.type === "contact") {
            grenade.x = hit.x;
            grenade.y = hit.y;
            this.detonateGrenade(grenade);
            break;
          }
          this.applyGrenadeBounce(grenade, hit, definition);
          grenade.bounces += 1;
        }
        if (grenade.exploded) break;

        for (const combatant of [
          ...this.humans.values(),
          ...this.bots.values(),
        ]) {
          if (!combatant.alive) continue;
          if (combatant.id === grenade.ownerId && !grenade.armed) continue;
          const hit = resolveCircleRect(
            grenade.x,
            grenade.y,
            definition.radius,
            bodyRect(combatant),
          );
          if (!hit) continue;
          if (grenade.type === "contact") {
            grenade.x = hit.x;
            grenade.y = hit.y;
            this.detonateGrenade(grenade, combatant.id);
            break;
          }
          this.applyGrenadeBounce(grenade, hit, definition);
          grenade.bounces += 1;
        }
      }

      if (!grenade.exploded && this.elapsedMs >= grenade.detonateAtMs) {
        if (grenade.type === "stinking") {
          this.activateStinkingGrenade(grenade);
        } else {
          this.detonateGrenade(grenade);
        }
      }
    }
  }

  private clampGrenadeToWorld(
    grenade: GrenadeRuntime,
    definition: (typeof GRENADE_CONFIG)[GrenadeType],
  ): void {
    if (grenade.x < definition.radius) {
      grenade.x = definition.radius;
      grenade.vx = Math.abs(grenade.vx) * definition.restitution;
    } else if (grenade.x > ARENA.width - definition.radius) {
      grenade.x = ARENA.width - definition.radius;
      grenade.vx = -Math.abs(grenade.vx) * definition.restitution;
    }
    if (grenade.y < definition.radius) {
      grenade.y = definition.radius;
      grenade.vy = Math.abs(grenade.vy) * definition.restitution;
    } else if (grenade.y > ARENA.height - definition.radius) {
      grenade.y = ARENA.height - definition.radius;
      grenade.vy = -Math.abs(grenade.vy) * definition.restitution;
    }
  }

  private applyGrenadeBounce(
    grenade: GrenadeRuntime,
    hit: { x: number; y: number; normalX: number; normalY: number },
    definition: (typeof GRENADE_CONFIG)[GrenadeType],
  ): void {
    grenade.x = hit.x;
    grenade.y = hit.y;
    const dot =
      grenade.vx * hit.normalX + grenade.vy * hit.normalY;
    if (dot < 0) {
      grenade.vx -=
        (1 + definition.restitution) * dot * hit.normalX;
      grenade.vy -=
        (1 + definition.restitution) * dot * hit.normalY;
    }
    if (Math.abs(hit.normalY) > 0.5) {
      grenade.vx *= definition.friction;
      if (Math.abs(grenade.vy) < 75) grenade.vy = 0;
      if (Math.abs(grenade.vx) < 12) grenade.vx = 0;
    } else {
      grenade.vy *= 0.9;
    }
  }

  private detonateGrenade(
    grenade: GrenadeRuntime,
    directVictimId?: string,
  ): void {
    if (grenade.exploded) return;
    grenade.exploded = true;
    this.activeGrenades.delete(grenade.id);
    const definition = GRENADE_CONFIG[grenade.type];
    this.events.push({
      type: "grenade-exploded",
      grenadeId: grenade.id,
      grenadeType: grenade.type,
      ownerId: grenade.ownerId,
      ownerName: grenade.ownerName,
      kind: grenade.ownerKind,
      x: grenade.x,
      y: grenade.y,
      blastRadius: definition.blastRadius,
    });
    if (this.timer.phase !== "live") return;

    this.applyRadialDamage({
      x: grenade.x,
      y: grenade.y,
      ownerId: grenade.ownerId,
      ownerName: grenade.ownerName,
      radius: definition.blastRadius,
      maxDamage: definition.maxDamage,
      minDamage: definition.minDamage,
      falloffExponent: definition.falloffExponent,
      coverMultiplier: definition.coverMultiplier,
      weaponName: definition.name,
      weaponId: undefined,
      source: "grenade",
      directVictimId,
    });
  }

  private detonateRocket(
    projectile: ProjectileRuntime,
    directVictimId?: string,
  ): void {
    const rocket = projectile.rocket;
    if (!rocket) return;
    this.events.push({
      type: "rocket-exploded",
      projectileId: projectile.id,
      ownerId: projectile.ownerId,
      ownerName:
        this.findCombatant(projectile.ownerId)?.name ?? "ROCKET",
      kind: projectile.ownerKind,
      x: projectile.x,
      y: projectile.y,
      blastRadius: rocket.blastRadius,
    });
    if (this.timer.phase !== "live") return;
    this.applyRadialDamage({
      x: projectile.x,
      y: projectile.y,
      ownerId: projectile.ownerId,
      ownerName:
        this.findCombatant(projectile.ownerId)?.name ?? "ROCKET",
      radius: rocket.blastRadius,
      maxDamage: rocket.maxDamage,
      minDamage: rocket.minDamage,
      falloffExponent: rocket.falloffExponent,
      coverMultiplier: rocket.coverMultiplier,
      weaponName: projectile.weaponName,
      weaponId: projectile.weaponId,
      source: "rocket",
      directVictimId,
    });
  }

  private applyRadialDamage(options: {
    x: number;
    y: number;
    ownerId: string;
    ownerName: string;
    radius: number;
    maxDamage: number;
    minDamage: number;
    falloffExponent: number;
    coverMultiplier: number;
    weaponName: string;
    weaponId?: string;
    source: "grenade" | "rocket";
    directVictimId?: string;
  }): void {
    for (const victim of [
      ...this.humans.values(),
      ...this.bots.values(),
    ]) {
      if (this.timer.phase !== "live") break;
      if (!victim.alive) continue;
      const position = center(victim);
      const distance =
        victim.id === options.directVictimId
          ? 0
          : Math.hypot(
              position.x - options.x,
              position.aimY - options.y,
            );
      if (distance > options.radius) continue;
      let damage = computeRadialDamage(
        distance,
        options.radius,
        options.maxDamage,
        options.minDamage,
        options.falloffExponent,
      );
      if (damage <= 0) continue;
      if (
        distance > 0 &&
        this.isBlastObstructed(
          options.x,
          options.y,
          position.x,
          position.aimY,
        )
      ) {
        damage = Math.round(damage * options.coverMultiplier);
      }
      if (damage <= 0) continue;
      this.damageCombatant(
        victim,
        damage,
        options.ownerId,
        options.weaponName,
        false,
        options.ownerName,
        options.source,
        options.weaponId,
      );
    }
  }

  private isBlastObstructed(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): boolean {
    return this.platforms.some((platform) =>
      segmentIntersectsRect(x1, y1, x2, y2, platform, -2),
    );
  }

  private activateStinkingGrenade(grenade: GrenadeRuntime): void {
    if (grenade.exploded) return;
    grenade.exploded = true;
    this.activeGrenades.delete(grenade.id);
    if (
      this.toxicClouds.size >=
      STINKING_CLOUD_CONFIG.maxActiveClouds
    ) {
      return;
    }
    const cloud: ToxicCloudRuntime = {
      id: ++this.toxicCloudCounter,
      ownerId: grenade.ownerId,
      ownerName: grenade.ownerName,
      ownerKind: grenade.ownerKind,
      x: grenade.x,
      y: grenade.y,
      radius: STINKING_CLOUD_CONFIG.radius,
      createdAtMs: this.elapsedMs,
      expiresAtMs:
        this.elapsedMs + STINKING_CLOUD_CONFIG.durationMs,
    };
    this.toxicClouds.set(cloud.id, cloud);
    if (this.nextToxicDamageAtMs === null) {
      this.nextToxicDamageAtMs =
        this.elapsedMs + STINKING_CLOUD_CONFIG.damageIntervalMs;
    }
    this.events.push({
      type: "toxic-cloud-created",
      cloudId: cloud.id,
      ownerId: cloud.ownerId,
      ownerName: cloud.ownerName,
      kind: cloud.ownerKind,
      x: cloud.x,
      y: cloud.y,
      radius: cloud.radius,
      durationMs: STINKING_CLOUD_CONFIG.durationMs,
    });
  }

  private stepToxicClouds(): void {
    if (this.toxicClouds.size === 0) {
      this.nextToxicDamageAtMs = null;
      return;
    }

    for (const cloud of [...this.toxicClouds.values()]) {
      if (this.elapsedMs < cloud.expiresAtMs) continue;
      this.toxicClouds.delete(cloud.id);
      this.events.push({
        type: "toxic-cloud-expired",
        cloudId: cloud.id,
        x: cloud.x,
        y: cloud.y,
      });
    }

    if (this.toxicClouds.size === 0) {
      this.nextToxicDamageAtMs = null;
      return;
    }
    if (this.nextToxicDamageAtMs === null) {
      this.nextToxicDamageAtMs =
        this.elapsedMs + STINKING_CLOUD_CONFIG.damageIntervalMs;
    }

    let guard = 0;
    while (
      this.elapsedMs >= this.nextToxicDamageAtMs &&
      guard < 8
    ) {
      this.applyToxicDamageTick();
      this.nextToxicDamageAtMs +=
        STINKING_CLOUD_CONFIG.damageIntervalMs;
      guard += 1;
    }
  }

  private applyToxicDamageTick(): void {
    if (this.timer.phase !== "live" || this.toxicClouds.size === 0) {
      return;
    }
    for (const victim of [
      ...this.humans.values(),
      ...this.bots.values(),
    ]) {
      if (this.timer.phase !== "live") break;
      if (!victim.alive) continue;
      const position = center(victim);
      let responsible: ToxicCloudRuntime | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const cloud of this.toxicClouds.values()) {
        if (this.elapsedMs >= cloud.expiresAtMs) continue;
        const distance = Math.hypot(
          position.x - cloud.x,
          position.aimY - cloud.y,
        );
        if (distance > cloud.radius) continue;
        if (this.isToxicObstructed(cloud, position)) continue;
        if (
          distance < bestDistance ||
          (distance === bestDistance &&
            responsible !== null &&
            cloud.id < responsible.id)
        ) {
          bestDistance = distance;
          responsible = cloud;
        }
      }
      if (!responsible) continue;
      this.damageCombatant(
        victim,
        TOXIC_DAMAGE_PER_TICK,
        responsible.ownerId,
        "STINKING GRENADE",
        false,
        responsible.ownerName,
        "toxic",
      );
    }
  }

  private isToxicObstructed(
    cloud: ToxicCloudRuntime,
    position: { x: number; aimY: number },
  ): boolean {
    if (!STINKING_CLOUD_CONFIG.terrainBlocksDamage) return false;
    return this.platforms.some((platform) =>
      segmentIntersectsRect(
        cloud.x,
        cloud.y,
        position.x,
        position.aimY,
        platform,
        -2,
      ),
    );
  }

  private nearestToxicCloud(
    x: number,
    y: number,
    extraRadius = 0,
  ): ToxicCloudRuntime | null {
    let nearest: ToxicCloudRuntime | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cloud of this.toxicClouds.values()) {
      const distance = Math.hypot(cloud.x - x, cloud.y - y);
      if (distance > cloud.radius + extraRadius) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = cloud;
      }
    }
    return nearest;
  }

  private fireWeapon(
    ownerId: string,
    ownerKind: "human" | "bot",
    weapon: PlayerWeapon,
    x: number,
    y: number,
    aim: number,
    barrel: 0 | 1 = 0,
  ): void {
    if (
      this.projectiles.size + weapon.pellets >
      PROJECTILE_CONFIG.maxActiveProjectiles
    ) {
      return;
    }
    const side = weapon.mechanic === "akimbo" && barrel === 1 ? 1 : -1;
    const separation =
      weapon.mechanic === "akimbo" ? weapon.barrelSeparation ?? 10 : 0;
    const pivotX =
      x + Math.cos(aim) * 66 - Math.sin(aim) * separation * side;
    const pivotY =
      y + Math.sin(aim) * 66 + Math.cos(aim) * separation * side;
    for (let index = 0; index < weapon.pellets; index += 1) {
      let offset: number;
      if (weapon.pellets === 1) {
        offset = (this.rng() - 0.5) * 2 * weapon.spreadRadians;
      } else {
        const step = (weapon.spreadRadians * 2) / Math.max(1, weapon.pellets - 1);
        offset = -weapon.spreadRadians + step * index;
        offset += (this.rng() - 0.5) * weapon.spreadRadians * 0.18;
      }
      const angle = aim + offset;
      const projectile: ProjectileRuntime = {
        id: ++this.projectileCounter,
        x: pivotX,
        y: pivotY,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        ownerId,
        ownerKind,
        damage: weapon.damage,
        weaponId: weapon.id,
        weaponName: weapon.name,
        mechanic: weapon.mechanic,
        rocket: weapon.rocket ?? null,
        expiresAt: this.elapsedMs + weapon.projectileLifetimeMs,
      };
      this.projectiles.set(projectile.id, projectile);
    }
    this.events.push({
      type: "shot",
      ownerId,
      weaponId: weapon.id,
      x: pivotX,
      y: pivotY,
      angle: aim,
      barrel: weapon.mechanic === "akimbo" ? barrel : null,
    });
  }

  private stepProjectiles(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const projectile of [...this.projectiles.values()]) {
      const speed = Math.hypot(projectile.vx, projectile.vy);
      const substeps = Math.max(1, Math.ceil((speed * dt) / 8));
      let hit = false;
      let directVictimId: string | undefined;
      for (let step = 0; step < substeps && !hit; step += 1) {
        projectile.x += (projectile.vx * dt) / substeps;
        projectile.y += (projectile.vy * dt) / substeps;
        if (
          projectile.x < 0 ||
          projectile.x > ARENA.width ||
          projectile.y < 0 ||
          projectile.y > ARENA.height ||
          this.platforms.some((platform) => pointInRect(projectile.x, projectile.y, platform))
        ) {
          hit = true;
          break;
        }
        for (const combatant of [...this.humans.values(), ...this.bots.values()]) {
          if (!combatant.alive || combatant.id === projectile.ownerId) continue;
          const rect = bodyRect(combatant);
          if (!pointInRect(projectile.x, projectile.y, rect)) continue;
          directVictimId = combatant.id;
          hit = true;
          break;
        }
      }
      if (hit || this.elapsedMs >= projectile.expiresAt) {
        this.projectiles.delete(projectile.id);
        this.resolveProjectileImpact(projectile, directVictimId);
      }
    }
  }

  private resolveProjectileImpact(
    projectile: ProjectileRuntime,
    directVictimId?: string,
  ): void {
    if (projectile.mechanic === "rocket") {
      this.detonateRocket(projectile, directVictimId);
      return;
    }
    if (!directVictimId) return;
    const victim = this.findCombatant(directVictimId);
    if (!victim) return;
    this.damageCombatant(
      victim,
      projectile.damage,
      projectile.ownerId,
      projectile.weaponName,
      true,
      undefined,
      "bullet",
      projectile.weaponId,
    );
  }

  private damageCombatant(
    victim: AnyCombatant,
    amount: number,
    attackerId: string,
    weaponName: string,
    trackAccuracy = true,
    attackerName?: string,
    source: "bullet" | "grenade" | "toxic" | "rocket" = "bullet",
    weaponId?: string,
  ): void {
    if (!victim.alive || victim.invulnerableRemainingMs > 0) return;
    const attacker = this.findCombatant(attackerId);
    if (attacker?.kind === "human" && trackAccuracy) {
      attacker.shotsHit += 1;
      if (weaponId) {
        attacker.weaponHits[weaponId] =
          (attacker.weaponHits[weaponId] ?? 0) + 1;
      }
    }

    victim.health = applyDamage(victim.health, amount);
    victim.lastDamageMs = 0;
    const victimFeetY =
      victim.kind === "human" ? victim.kin.y : victim.y + BOT_FEET_OFFSET;
    this.events.push({
      type: "hit",
      ownerId: attackerId,
      victimId: victim.id,
      x: victim.kind === "human" ? victim.kin.x : victim.x,
      y: victimFeetY - CHARACTER_AIM_HEIGHT,
      damage: amount,
      kind: victim.kind,
      source,
      weaponId,
    });

    if (victim.health <= 0) {
      if (victim.kind === "human") {
        victim.kin.vx = 0;
        victim.kin.vy = 0;
        victim.alive = false;
        victim.respawnRemainingMs = PLAYER_CONFIG.respawnMs;
      } else {
        victim.vx = 0;
        victim.vy = 0;
        victim.alive = false;
        victim.respawnRemainingMs = DRONE_CONFIG.respawnMs;
        victim.burstRemaining = 0;
      }
      this.recordElimination(
        attackerId,
        victim,
        weaponName,
        attackerName,
        weaponId,
      );
    }
  }

  private recordElimination(
    killerId: string,
    victim: AnyCombatant,
    weaponName: string,
    killerNameOverride?: string,
    weaponId?: string,
  ): void {
    if (this.timer.phase !== "live") return;
    if (victim.deathRecorded) return;
    victim.deathRecorded = true;
    const victimPosition = center(victim);
    const feetY =
      victim.kind === "human" ? victim.kin.y : victim.y + BOT_FEET_OFFSET;
    if (killerId === victim.id) {
      victim.deaths += 1;
      victim.lastKillerName = null;
      this.feedCounter += 1;
      const atMs = this.elapsedMs;
      const cause = weaponName.includes("STINKING")
        ? "toxic cloud"
        : "blast";
      this.feed.push({
        id: this.feedCounter,
        text: `${victim.name} was caught in their own ${cause}`,
        atMs,
        killerId,
        victimId: victim.id,
      });
      this.feed = this.feed.slice(-6);
      this.events.push({
        type: "elimination",
        eliminationId: ++this.eliminationCounter,
        killerId,
        victimId: victim.id,
        killerName: victim.name,
        victimName: victim.name,
        weaponName,
        atMs,
        x: victimPosition.x,
        y: feetY,
        lootIds: [],
      });
      return;
    }
    const killer = this.findCombatant(killerId);
    if (!killer && !killerNameOverride) return;
    const killerName = killer?.name ?? killerNameOverride!;
    if (killer) killer.eliminations += 1;
    if (killer?.kind === "human") {
      if (victim.kind === "human") {
        killer.humanEliminations += 1;
      } else {
        killer.botEliminations += 1;
      }
      if (weaponId) {
        killer.weaponEliminations[weaponId] =
          (killer.weaponEliminations[weaponId] ?? 0) + 1;
      }
    }
    victim.deaths += 1;
    victim.lastKillerName = killerName;
    this.feedCounter += 1;
    const atMs = this.elapsedMs;
    this.feed.push({
      id: this.feedCounter,
      text: `${killerName} eliminated ${victim.name}`,
      atMs,
      killerId,
      victimId: victim.id,
    });
    this.feed = this.feed.slice(-6);

    const eliminationId = ++this.eliminationCounter;
    const loot = this.spawnEliminationLoot(eliminationId, victim);
    this.events.push({
      type: "elimination",
      eliminationId,
      killerId,
      victimId: victim.id,
      killerName,
      victimName: victim.name,
      weaponName,
      atMs,
      x: victimPosition.x,
      y: feetY,
      lootIds: loot.map((item) => item.id),
    });

    const scores = [...this.humans.values(), ...this.bots.values()].map(
      (combatant) => combatant.eliminations,
    );
    if (reachedScoreLimit(scores, MATCH_CONFIG.scoreLimit)) {
      this.timer = endMatchForScore(this.timer);
      this.finishMatch("score");
    }
  }

  private finishMatch(reason: EndReason): void {
    if (this.timer.phase !== "ended" || this.endReason !== null) return;
    this.endReason = reason;
    this.winnerName = this.getRanked()[0]?.name ?? null;
    this.projectiles.clear();
    this.activeGrenades.clear();
    this.toxicClouds.clear();
    this.nextToxicDamageAtMs = null;
    this.loot = [];
    resetPickups(this.pickups);
    this.events.push({
      type: "match-end",
      matchId: this.matchId,
      reason,
      winnerName: this.winnerName,
    });
  }

  private getRanked(): OnlineStanding[] {
    const participants = [...this.humans.values(), ...this.bots.values()];
    return rankParticipants(
      participants.map((combatant) => ({
        id: combatant.id,
        name: combatant.name,
        score: combatant.eliminations,
        deaths: combatant.deaths,
        order: combatant.kind === "human" ? 0 : 1,
      })),
    ).map((entry) => {
      const combatant = this.findCombatant(entry.id);
      return {
        ...entry,
        alive: combatant?.alive ?? false,
        isPlayer: false,
        respawnIn: combatant ? combatant.respawnRemainingMs / 1000 : 0,
        kind: combatant?.kind ?? "bot",
      };
    });
  }

  private stepBot(bot: BotRuntime, dtMs: number): void {
    if (!bot.alive) {
      bot.respawnRemainingMs = Math.max(0, bot.respawnRemainingMs - dtMs);
      if (bot.respawnRemainingMs <= 0) this.spawnBot(bot);
      return;
    }

    if (bot.frozen) {
      bot.vx = 0;
      bot.vy = 0;
      bot.thrusting = false;
      bot.burstRemaining = 0;
      return;
    }

    bot.invulnerableRemainingMs = Math.max(0, bot.invulnerableRemainingMs - dtMs);
    bot.medkitCooldownRemainingMs = Math.max(
      0,
      bot.medkitCooldownRemainingMs - dtMs,
    );
    bot.grenadeCooldownRemainingMs = Math.max(
      0,
      bot.grenadeCooldownRemainingMs - dtMs,
    );
    bot.grenadeDecisionCooldownMs = Math.max(
      0,
      bot.grenadeDecisionCooldownMs - dtMs,
    );
    bot.cloudAvoidRemainingMs = Math.max(
      0,
      bot.cloudAvoidRemainingMs - dtMs,
    );
    if (
      bot.health < BOT_SUPPLY_CONFIG.medkitThreshold &&
      bot.medkits > 0 &&
      bot.medkitCooldownRemainingMs <= 0
    ) {
      this.tryUseMedkitFor(bot);
    }
    this.collectNearbyPickups(bot);
    this.collectNearbyLoot(bot);
    const dt = Math.min(dtMs, 50) / 1000;
    const target = this.chooseBotTarget(bot);
    if (!target) {
      bot.vx = 0;
      bot.vy = 0;
      bot.thrusting = false;
      return;
    }

    const position = center(target);
    const origin = botWeaponOrigin(bot);
    const botWeapon = this.botWeaponDefinition(bot);
    const flightTime =
      Math.hypot(position.x - origin.x, position.aimY - origin.y) /
      botWeapon.projectileSpeed;
    const targetVX = target.kind === "human" ? target.kin.vx : target.vx;
    const targetVY = target.kind === "human" ? target.kin.vy : target.vy;
    bot.aimAngle = Math.atan2(
      position.aimY +
        targetVY * flightTime * this.botTuning.leadFactor -
        origin.y,
      position.x + targetVX * flightTime * this.botTuning.leadFactor - origin.x,
    );
    if (this.botTuning.aimErrorRadians > 0) {
      bot.aimAngle +=
        Math.sin(this.elapsedMs * 0.0031 + bot.phase * 7) *
        this.botTuning.aimErrorRadians;
    }

    const distance = Math.hypot(position.x - bot.x, position.y - bot.y);
    const hasLoS = !this.platforms.some((platform) =>
      segmentIntersectsRect(
        origin.x,
        origin.y,
        position.x,
        position.aimY,
        platform,
      ),
    );

    bot.strafeMs -= dtMs;
    if (bot.strafeMs <= 0) {
      bot.strafeSign *= -1;
      bot.strafeMs = 1200 + this.rng() * 1200;
    }

    let goal: NavPoint | null = null;
    let direct = false;
    if (hasLoS && distance < 520 && distance > 140) {
      const desired = {
        x: position.x + bot.strafeSign * this.botTuning.standoffDistance,
        y: position.aimY - 120 + Math.sin(this.elapsedMs * 0.002 + bot.phase) * 28,
      };
      if (lineClear({ x: bot.x, y: bot.y }, desired, this.navGrid.obstacles)) {
        goal = desired;
        direct = true;
        bot.path = [];
        bot.pathIndex = 0;
        bot.pathLength = 0;
      }
    }

    bot.repathMs -= dtMs;
    const goalMoved = Math.hypot(bot.lastGoal.x - position.x, bot.lastGoal.y - position.aimY);
    if (!direct && (bot.repathMs <= 0 || goalMoved > 140)) {
      const navGoal = { x: position.x, y: position.aimY - 35 };
      bot.path = findPath(this.navGrid, { x: bot.x, y: bot.y }, navGoal) ?? [];
      bot.pathIndex = 0;
      bot.pathLength = bot.path.length;
      bot.repathMs = this.botTuning.repathMs;
      bot.lastGoal = navGoal;
    }

    if (!direct && bot.path.length > 0) {
      while (bot.pathIndex < bot.path.length) {
        const point = bot.path[bot.pathIndex];
        if (Math.hypot(point.x - bot.x, point.y - bot.y) < 26) {
          bot.pathIndex += 1;
          continue;
        }
        goal = point;
        break;
      }
      if (!goal) {
        bot.path = [];
        bot.pathLength = 0;
      }
    }

    if (!goal) {
      goal = {
        x: bot.x + (position.x >= bot.x ? 40 : -40),
        y: bot.y - 30,
      };
      direct = true;
    }

    const supplyGoal = this.findBotSupplyGoal(bot);
    if (supplyGoal) {
      goal = supplyGoal;
      direct = true;
    }

    const botCenter = center(bot);
    const nearbyCloud = this.nearestToxicCloud(
      botCenter.x,
      botCenter.aimY,
      BOT_SUPPLY_CONFIG.cloudAvoidRange,
    );
    if (nearbyCloud) {
      bot.cloudAvoidRemainingMs = BOT_SUPPLY_CONFIG.cloudAvoidMs;
      bot.cloudAvoidDirection =
        botCenter.x < nearbyCloud.x ? -1 : 1;
    }

    const desiredX = Math.max(60, Math.min(ARENA.width - 60, goal.x));
    const desiredY = Math.max(90, Math.min(ARENA.groundY - 80, goal.y));
    const dx = desiredX - bot.x;
    const dy = desiredY - bot.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const hoverSpeed = this.botTuning.hoverSpeed;
    const speed = direct ? hoverSpeed : hoverSpeed * 1.05;
    const desiredVX =
      bot.cloudAvoidRemainingMs > 0
        ? bot.cloudAvoidDirection * speed * 1.2
        : (dx / length) * speed;
    const desiredVY =
      bot.cloudAvoidRemainingMs > 0 ? -70 : (dy / length) * speed;
    const accel = 380 * dt;
    bot.vx = approach(bot.vx, desiredVX, accel);
    bot.vy = approach(bot.vy, desiredVY, accel);
    bot.thrusting = desiredVY < -18 || bot.cloudAvoidRemainingMs > 0;

    this.moveBot(bot, dtMs);

    const stuck = Math.hypot(bot.x - bot.lastX, bot.y - bot.lastY) < 0.6;
    bot.stuckMs = stuck ? bot.stuckMs + dtMs : 0;
    if (bot.stuckMs > 650) {
      bot.repathMs = 0;
      bot.vy = -150;
      bot.stuckMs = 0;
    }
    bot.lastX = bot.x;
    bot.lastY = bot.y;

    if (bot.weaponId !== BOT_WEAPON.id) {
      this.stepBotAdvancedWeapon(bot, dtMs, hasLoS, distance);
    } else if (hasLoS && distance < DRONE_CONFIG.aggroRange) {
      bot.fireCooldownMs = Math.max(0, bot.fireCooldownMs - dtMs);
      if (bot.burstRemaining > 0) {
        bot.burstTimerMs -= dtMs;
        if (bot.burstTimerMs <= 0) {
          const muzzleOrigin = botWeaponOrigin(bot);
          this.fireWeapon(
            bot.id,
            "bot",
            BOT_WEAPON,
            muzzleOrigin.x,
            muzzleOrigin.y,
            bot.aimAngle,
          );
          bot.burstRemaining -= 1;
          bot.burstTimerMs = this.botTuning.burstSpacingMs;
          if (bot.burstRemaining <= 0) {
            bot.fireCooldownMs = this.botTuning.fireIntervalMs;
          }
        }
      } else if (bot.fireCooldownMs <= 0) {
        bot.burstRemaining = this.botTuning.burstCount;
        bot.burstTimerMs = this.botTuning.reactionMs;
      }
    } else {
      bot.burstRemaining = 0;
    }

    if (
      this.botTuning.grenades &&
      hasLoS &&
      distance >= BOT_SUPPLY_CONFIG.grenadeMinRange
    ) {
      this.stepBotGrenade(bot, target, distance);
    }
  }

  private botWeaponDefinition(bot: BotRuntime): PlayerWeapon {
    if (bot.weaponId === BOT_WEAPON.id) return BOT_WEAPON;
    return findPlayerWeapon(bot.weaponId) ?? BOT_WEAPON;
  }

  private stepBotAdvancedWeapon(
    bot: BotRuntime,
    dtMs: number,
    hasLoS: boolean,
    distance: number,
  ): void {
    const definition = findPlayerWeapon(bot.weaponId);
    if (!definition) return;
    const range = BOT_ADVANCED_RANGE[definition.id] ?? {
      min: 60,
      max: 900,
    };
    const canFire =
      hasLoS &&
      distance >= range.min &&
      distance <= range.max &&
      distance < DRONE_CONFIG.aggroRange;
    const step = stepWeapon(bot.weaponState, definition, {
      fire: canFire,
      reload: bot.weaponState.ammo <= 0,
      dtMs,
    });
    bot.weaponState = step.state;
    if (!step.fired) return;
    const barrel: 0 | 1 =
      definition.mechanic === "akimbo" ? bot.akimboBarrel : 0;
    const origin = botWeaponOrigin(bot);
    this.fireWeapon(
      bot.id,
      "bot",
      definition,
      origin.x,
      origin.y,
      bot.aimAngle,
      barrel,
    );
    if (definition.mechanic === "akimbo") {
      bot.akimboBarrel = bot.akimboBarrel === 0 ? 1 : 0;
    }
  }

  private findBotSupplyGoal(bot: BotRuntime): NavPoint | null {
    const position = center(bot);
    if (
      bot.health < BOT_SUPPLY_CONFIG.medkitThreshold &&
      bot.medkits < MEDKIT_CONFIG.maxCarried
    ) {
      const medkit = this.findNearestPickup(
        position.x,
        position.aimY,
        (pickup) => pickup.type === "medkit",
        BOT_SUPPLY_CONFIG.medkitSeekRange,
      );
      if (medkit) return { x: medkit.x, y: medkit.y };
    }
    if (grenadeInventoryTotal(bot.grenades) < 2) {
      const grenade = this.findNearestPickup(
        position.x,
        position.aimY,
        (pickup) => grenadeTypeFromPickup(pickup.type) !== null,
        BOT_SUPPLY_CONFIG.grenadeSeekRange,
      );
      if (grenade) return { x: grenade.x, y: grenade.y };
    }
    if (
      bot.weaponCuriosity &&
      bot.weaponId === BOT_WEAPON.id
    ) {
      const weaponPickup = this.findNearestPickup(
        position.x,
        position.aimY,
        (pickup) => isWeaponPickup(pickup.type),
        BOT_SUPPLY_CONFIG.weaponSeekRange,
      );
      if (weaponPickup) {
        return { x: weaponPickup.x, y: weaponPickup.y };
      }
      if (!this.botsLootPaused) {
        const weaponLoot = findNearestActiveLoot(
          this.loot,
          position.x,
          position.aimY,
          BOT_SUPPLY_CONFIG.weaponSeekRange,
          (item) =>
            item.kind === "weapon" &&
            Boolean(item.weaponId) &&
            this.canBotAcquireWeapon(bot, item.weaponId!),
        );
        if (weaponLoot) return { x: weaponLoot.x, y: weaponLoot.y };
      }
    }
    return null;
  }

  private findNearestPickup(
    x: number,
    y: number,
    accept: (pickup: PickupRuntime) => boolean,
    range: number,
  ): PickupRuntime | null {
    let nearest: PickupRuntime | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const pickup of this.pickups) {
      if (!pickup.active || !accept(pickup)) continue;
      const distance = Math.hypot(pickup.x - x, pickup.y - y);
      if (distance > range || distance >= bestDistance) continue;
      bestDistance = distance;
      nearest = pickup;
    }
    return nearest;
  }

  private stepBotGrenade(
    bot: BotRuntime,
    target: AnyCombatant,
    distance: number,
  ): void {
    if (bot.grenadeDecisionCooldownMs > 0) return;
    const inventory = bot.grenades;
    let type: GrenadeType | null = null;
    if (distance < 330 && inventory.contact > 0) {
      type = "contact";
    } else if (distance < 480 && inventory.frag > 0) {
      type = "frag";
    } else if (distance < 620 && inventory.stinking > 0) {
      type = "stinking";
    }
    if (!type) return;

    const definition = GRENADE_CONFIG[type];
    const origin = center(bot);
    const targetPosition = center(target);
    const targetVX =
      target.kind === "human" ? target.kin.vx : target.vx;
    const targetVY =
      target.kind === "human" ? target.kin.vy : target.vy;
    const flight = Math.max(0.12, distance / definition.throwSpeed);
    const aimX = targetPosition.x + targetVX * flight * 0.35;
    const aimY =
      targetPosition.aimY +
      targetVY * flight * 0.35 -
      0.5 * definition.gravity * flight * flight;
    const aim = Math.atan2(aimY - origin.aimY, aimX - origin.x);

    if (this.throwGrenadeFromCombatant(bot, type, aim)) {
      bot.grenadeDecisionCooldownMs =
        BOT_SUPPLY_CONFIG.grenadeDecisionMs +
        this.rng() * BOT_SUPPLY_CONFIG.grenadeDecisionJitterMs;
    } else {
      bot.grenadeDecisionCooldownMs = BOT_SUPPLY_CONFIG.grenadeRetryMs;
    }
  }

  private chooseBotTarget(bot: BotRuntime): AnyCombatant | null {
    const alive = [...this.humans.values(), ...this.bots.values()].filter(
      (combatant) => combatant.alive && combatant.id !== bot.id,
    );
    if (alive.length === 0) {
      bot.targetId = null;
      return null;
    }
    const current = alive.find((combatant) => combatant.id === bot.targetId);
    let nearest = alive[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const combatant of alive) {
      const position = center(combatant);
      const distance = Math.hypot(position.x - bot.x, position.y - bot.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = combatant;
      }
    }
    if (current) {
      const position = center(current);
      const currentDistance = Math.hypot(position.x - bot.x, position.y - bot.y);
      if (currentDistance <= nearestDistance * 1.45) {
        bot.targetId = current.id;
        return current;
      }
    }
    bot.targetId = nearest.id;
    return nearest;
  }

  private moveBot(bot: BotRuntime, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    let x = bot.x + bot.vx * dt;
    for (const platform of this.platforms) {
      if (
        x + BOT_HALF_WIDTH > platform.x &&
        x - BOT_HALF_WIDTH < platform.x + platform.width &&
        bot.y + BOT_HEIGHT / 2 > platform.y &&
        bot.y - BOT_HEIGHT / 2 < platform.y + platform.height
      ) {
        if (bot.vx > 0) x = platform.x - BOT_HALF_WIDTH;
        else if (bot.vx < 0) x = platform.x + platform.width + BOT_HALF_WIDTH;
        bot.vx = 0;
      }
    }
    bot.x = Math.max(BOT_HALF_WIDTH, Math.min(ARENA.width - BOT_HALF_WIDTH, x));

    let y = bot.y + bot.vy * dt;
    for (const platform of this.platforms) {
      if (
        bot.x + BOT_HALF_WIDTH > platform.x &&
        bot.x - BOT_HALF_WIDTH < platform.x + platform.width &&
        y + BOT_HEIGHT / 2 > platform.y &&
        y - BOT_HEIGHT / 2 < platform.y + platform.height
      ) {
        if (bot.vy > 0) y = platform.y - BOT_HEIGHT / 2;
        else if (bot.vy < 0) y = platform.y + platform.height + BOT_HEIGHT / 2;
        bot.vy = 0;
      }
    }
    bot.y = Math.max(BOT_HEIGHT / 2, Math.min(ARENA.groundY - BOT_HEIGHT / 2, y));
  }

  private isBotGrounded(bot: BotRuntime): boolean {
    const feetY = bot.y + BOT_FEET_OFFSET;
    if (Math.abs(feetY - ARENA.groundY) <= 1.5) return true;
    return this.platforms.some(
      (platform) =>
        bot.x + BOT_HALF_WIDTH > platform.x &&
        bot.x - BOT_HALF_WIDTH < platform.x + platform.width &&
        Math.abs(feetY - platform.y) <= 1.5,
    );
  }

  private findCombatant(id: string): AnyCombatant | undefined {
    return this.humans.get(id) ?? this.bots.get(id);
  }

  /**
   * Verification-only helpers. They are reachable from the room only when
   * VIBE_MILITIA_TEST_HOOKS=1. Normal gameplay never calls them.
   */
  debugEliminate(
    victimId: string,
    killerId: string,
    source: "bullet" | "grenade" | "toxic" = "bullet",
  ): boolean {
    if (this.phase !== "live") return false;
    const victim = this.findCombatant(victimId);
    if (!victim || !victim.alive) return false;
    const killer = this.findCombatant(killerId);
    const weaponName =
      source === "grenade"
        ? "FRAG GRENADE"
        : source === "toxic"
          ? "STINKING GRENADE"
          : "VIBE RIFLE";
    victim.invulnerableRemainingMs = 0;
    this.damageCombatant(
      victim,
      victim.health + 1,
      killerId,
      weaponName,
      false,
      killer?.name,
      source,
    );
    return true;
  }

  debugTeleport(id: string, x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const combatant = this.findCombatant(id);
    if (!combatant || !combatant.alive) return false;
    const clampedX = Math.max(40, Math.min(ARENA.width - 40, x));
    const clampedY = Math.max(80, Math.min(ARENA.groundY, y));
    if (combatant.kind === "human") {
      this.clearMoveQueue(combatant);
      combatant.kin.x = clampedX;
      combatant.kin.y = clampedY;
      combatant.kin.vx = 0;
      combatant.kin.vy = 0;
      combatant.kin.grounded = true;
    } else {
      combatant.x = clampedX;
      combatant.y = clampedY - BOT_FEET_OFFSET;
      combatant.vx = 0;
      combatant.vy = 0;
      combatant.path = [];
      combatant.pathIndex = 0;
    }
    return true;
  }

  debugEndMatch(): boolean {
    if (this.phase !== "live") return false;
    this.timer = endMatchForScore(this.timer);
    this.finishMatch("time");
    return true;
  }

  debugSetInvulnerable(id: string, durationMs: number): boolean {
    if (!Number.isFinite(durationMs)) return false;
    const combatant = this.findCombatant(id);
    if (!combatant) return false;
    combatant.invulnerableRemainingMs = Math.max(
      combatant.invulnerableRemainingMs,
      Math.max(0, durationMs),
    );
    return true;
  }

  debugGiveWeapon(id: string, weaponId: string): boolean {
    const combatant = this.findCombatant(id);
    const definition = findPlayerWeapon(weaponId);
    if (!combatant || !definition) return false;
    if (combatant.kind === "human") {
      const emptySlot = findEmptyWeaponSlot(combatant.weaponIds);
      const slot = emptySlot !== -1 ? emptySlot : combatant.equippedIndex;
      combatant.weaponIds[slot] = definition.id;
      combatant.weapons[slot] = createWeaponState(definition);
      combatant.equippedIndex = slot;
      combatant.akimboBarrel = 0;
      return true;
    }
    combatant.weaponId = definition.id;
    combatant.weaponState = createWeaponState(definition);
    combatant.akimboBarrel = 0;
    return true;
  }

  debugFreeze(id: string, frozen: boolean): boolean {
    const combatant = this.findCombatant(id);
    if (!combatant || combatant.kind !== "bot") return false;
    combatant.frozen = frozen;
    combatant.vx = 0;
    combatant.vy = 0;
    combatant.thrusting = false;
    if (frozen) combatant.invulnerableRemainingMs = 0;
    return true;
  }

  debugDisableBotWeaponCuriosity(): void {
    this.botsWeaponCuriosity = false;
    for (const bot of this.bots.values()) {
      bot.weaponCuriosity = false;
    }
  }

  debugPauseBotLoot(paused: boolean): void {
    this.botsLootPaused = paused;
  }

  debugPauseLootCollection(paused: boolean): void {
    this.lootCollectionPaused = paused;
  }

  debugExtendMatch(durationMs: number): boolean {
    if (this.timer.phase !== "live" || !Number.isFinite(durationMs)) {
      return false;
    }
    this.timer = {
      ...this.timer,
      remainingMs: Math.max(this.timer.remainingMs, durationMs),
    };
    return true;
  }

  debugResetPickups(): void {
    resetPickups(this.pickups);
  }

  private combatantSnapshot(combatant: AnyCombatant): OnlineCombatantSnapshot {
    const position = center(combatant);
    const human = combatant.kind === "human" ? combatant : null;
    const bot = combatant.kind === "bot" ? combatant : null;
    const equippedIndex = human?.equippedIndex ?? 0;
    const equippedId = human?.weaponIds[equippedIndex] ?? null;
    const weapons: OnlineWeaponSnapshot[] = human
      ? human.weaponIds.map((weaponId, index) =>
          this.weaponSnapshot(
            weaponId,
            human.weapons[index] ?? emptyWeaponState(),
            index,
          ),
        )
      : [];
    const shots = human ? human.shotsFired : 0;
    const hits = human ? human.shotsHit : 0;
    const combatantGrenades = human?.grenades ?? bot!.grenades;
    return {
      id: combatant.id,
      name: combatant.name,
      kind: combatant.kind,
      skinId: human ? human.skinId : bot!.skinId,
      playerId: human?.playerId ?? null,
      connected: human?.connected ?? true,
      level: human?.cosmetics.level ?? 0,
      badgeId: human?.cosmetics.equipped.badgeId ?? null,
      titleId: human?.cosmetics.equipped.titleId ?? null,
      eliminationEffectId:
        human?.cosmetics.equipped.eliminationId ?? null,
      trailId: human?.cosmetics.equipped.trailId ?? null,
      x: position.x,
      y: position.y,
      vx: combatant.kind === "human" ? human!.kin.vx : bot!.vx,
      vy: combatant.kind === "human" ? human!.kin.vy : bot!.vy,
      health: combatant.health,
      maxHealth: combatant.maxHealth,
      alive: combatant.alive,
      grounded: human?.kin.grounded ?? this.isBotGrounded(bot!),
      thrusting: human?.kin.thrusting ?? bot?.thrusting ?? false,
      aimAngle: human?.aimAngle ?? bot?.aimAngle ?? 0,
      invulnerable: combatant.invulnerableRemainingMs,
      respawnIn: combatant.respawnRemainingMs / 1000,
      lastProcessedInputSeq: human?.ackSeq || human?.lastInputSeq || 0,
      lastProcessedInputTicks: human?.ackTicks ?? 0,
      coyoteMs: human?.kin.coyoteMs ?? 0,
      thrustIdleMs: human?.kin.jetpack.msSinceThrust ?? 0,
      fuel: human?.kin.jetpack.fuel ?? 0,
      maxFuel: JETPACK_CONFIG.maxFuel,
      weaponId: human ? equippedId ?? "" : bot!.weaponId,
      weapons,
      equippedSlot: equippedIndex,
      eliminations: combatant.eliminations,
      deaths: combatant.deaths,
      accuracy: shots > 0 ? hits / shots : 0,
      lastKillerName: combatant.lastKillerName,
      medkits: human?.medkits ?? bot!.medkits,
      grenadeContact: combatantGrenades.contact,
      grenadeFrag: combatantGrenades.frag,
      grenadeStinking: combatantGrenades.stinking,
      grenadeSelected: human?.selectedGrenade ?? "contact",
      grenadeCooldownMs:
        human?.grenadeCooldownRemainingMs ??
        bot!.grenadeCooldownRemainingMs,
    };
  }

  private weaponSnapshot(
    weaponId: string | null,
    state: WeaponState,
    slotIndex: number,
  ): OnlineWeaponSnapshot {
    const definition = findPlayerWeapon(weaponId);
    if (!definition) {
      return {
        id: "",
        name: "EMPTY",
        shortName: "EMPTY",
        role: "NO WEAPON",
        slot: slotIndex + 1,
        ammo: 0,
        magazineSize: 0,
        reloading: false,
        reloadProgress: 1,
        owned: false,
      };
    }
    return {
      id: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      role: definition.role,
      slot: slotIndex + 1,
      ammo: state.ammo,
      magazineSize: definition.magazineSize,
      reloading: state.reloading,
      reloadProgress: reloadProgress(state, definition),
      owned: true,
    };
  }
}
