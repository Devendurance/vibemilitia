import {
  PLAYER_CONFIG,
  PLAYER_WEAPONS,
  JETPACK_CONFIG,
  MATCH_CONFIG,
  DRONE_CONFIG,
  DRONE_WEAPON,
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
  addGrenade,
  canAddGrenade,
  computeBlastDamage,
  consumeGrenade,
  createGrenadeInventory,
  grenadeTypeFromSlot,
  resolveCircleRect,
  type GrenadeInventory,
  type GrenadeType,
} from "@/game/core/grenades";
import {
  MEDKIT_CONFIG,
  createPickups,
  findCollectiblePickup,
  grenadeTypeFromPickup,
  resetPickups,
  stepPickupRespawns,
  applyMedkit,
  type PickupRuntime,
} from "@/game/core/pickups";
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
} from "@/game/multiplayer/protocol";
import {
  DEFAULT_MATCH_COUNTDOWN_MS,
  MAX_COMBATANTS,
} from "@/game/multiplayer/protocol";

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
};

const CHARACTER_AIM_HEIGHT = 58;
const CHARACTER_PIVOT_X = 28;

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
  expiresAt: number;
}

interface GrenadeRuntime {
  id: number;
  type: GrenadeType;
  ownerId: string;
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

interface HumanRuntime {
  kind: "human";
  id: string;
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
  equippedIndex: number;
  input: OnlineInputPayload | null;
  lastInputSeq: number;
  queuedJump: boolean;
  queuedReload: boolean;
  queuedWeapon: number | null;
  eliminations: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  lastKillerName: string | null;
  medkits: number;
  medkitCooldownRemainingMs: number;
  queuedMedkit: boolean;
  grenades: GrenadeInventory;
  selectedGrenade: GrenadeType;
  grenadeCooldownRemainingMs: number;
  queuedGrenadeThrow: boolean;
  queuedGrenadeSlot: number | null;
  throwRequestHeld: boolean;
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
}

type AnyCombatant = HumanRuntime | BotRuntime;

interface SimulationOptions {
  roomId: string;
  roomName: string;
  botsEnabled?: boolean;
  countdownMs?: number;
  skinSeed?: number;
}

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
  private humans = new Map<string, HumanRuntime>();
  private bots = new Map<string, BotRuntime>();
  private projectiles = new Map<number, ProjectileRuntime>();
  private activeGrenades = new Map<number, GrenadeRuntime>();
  private pickups: PickupRuntime[] = createPickups(ARENA.pickupSpawns);
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

  constructor(options: SimulationOptions) {
    this.roomId = options.roomId;
    this.roomName = options.roomName;
    this.botsEnabled = options.botsEnabled ?? true;
    this.countdownDurationMs = Math.max(
      0,
      options.countdownMs ?? DEFAULT_MATCH_COUNTDOWN_MS,
    );
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

  get allHumansGone(): boolean {
    return this.humans.size === 0;
  }

  addHuman(
    id: string,
    requestedName: string,
    requestedSkinId?: string,
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
    const human = this.createHuman(id, name, skinId);
    this.humans.set(id, human);

    if (firstHuman) {
      this.timer = createMatchTimer(MATCH_CONFIG.durationMs);
      this.elapsedMs = 0;
      this.feed = [];
      this.feedCounter = 0;
      this.projectiles.clear();
      this.activeGrenades.clear();
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

  applyInput(id: string, payload: OnlineInputPayload): void {
    const human = this.humans.get(id);
    if (!human || !human.alive || this.phase !== "live") return;
    if (
      !Number.isFinite(payload.seq) ||
      !Number.isFinite(payload.moveX) ||
      !Number.isFinite(payload.aim)
    ) {
      return;
    }
    const seq = Math.floor(payload.seq);
    if (seq <= human.lastInputSeq || seq > human.lastInputSeq + 600) return;

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
    human.queuedJump ||= Boolean(payload.jump);
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
  }

  rematch(): { ok: boolean; error?: string } {
    if (this.timer.phase !== "ended") return { ok: false, error: "MATCH_NOT_ENDED" };
    if (this.humans.size === 0) return { ok: false, error: "NO_HUMANS" };

    this.timer = createMatchTimer(MATCH_CONFIG.durationMs);
    this.countdown = false;
    this.started = true;
    this.countdownRemainingMs = 0;
    this.endReason = null;
    this.winnerName = null;
    this.elapsedMs = 0;
    this.projectiles.clear();
    this.activeGrenades.clear();
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
      human.lastKillerName = null;
      human.input = null;
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
      this.stepHuman(human, dtMs);
    }
    for (const bot of this.bots.values()) {
      this.stepBot(bot, dtMs);
    }
    this.stepProjectiles(dtMs);
    this.stepGrenades(dtMs);
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
        kind: grenade.ownerKind,
        fuseRemainingMs:
          grenade.type === "frag"
            ? Math.max(0, grenade.detonateAtMs - this.elapsedMs)
            : null,
        armed: grenade.armed,
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active,
        respawnIn: pickup.active ? 0 : pickup.respawnRemainingMs / 1000,
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

  private createHuman(id: string, name: string, skinId: string): HumanRuntime {
    return {
      kind: "human",
      id,
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
      weapons: PLAYER_WEAPONS.map((weapon) => createWeaponState(weapon)),
      equippedIndex: 0,
      input: null,
      lastInputSeq: 0,
      queuedJump: false,
      queuedReload: false,
      queuedWeapon: null,
      eliminations: 0,
      deaths: 0,
      shotsFired: 0,
      shotsHit: 0,
      lastKillerName: null,
      medkits: 0,
      medkitCooldownRemainingMs: 0,
      queuedMedkit: false,
      grenades: createGrenadeInventory(),
      selectedGrenade: "contact",
      grenadeCooldownRemainingMs: 0,
      queuedGrenadeThrow: false,
      queuedGrenadeSlot: null,
      throwRequestHeld: false,
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
    for (let index = 0; index < human.weapons.length; index += 1) {
      human.weapons[index] = createWeaponState(PLAYER_WEAPONS[index]);
    }
    human.equippedIndex = 0;
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
    bot.path = [];
    bot.pathIndex = 0;
    bot.pathLength = 0;
    bot.repathMs = 0;
    bot.targetId = null;
    bot.stuckMs = 0;
    bot.lastX = bot.x;
    bot.lastY = bot.y;
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
    const jump = human.queuedJump;
    human.queuedJump = false;

    const movement = input
      ? {
          moveX: input.moveX,
          jumpPressed: jump,
          jumpHeld: input.jumpHeld,
        }
      : { moveX: 0, jumpPressed: false, jumpHeld: false };

    const result = stepHumanKinematics(human.kin, movement, dtMs, {
      width: ARENA.width,
      height: ARENA.height,
      platforms: this.platforms,
    });
    if (result.jumped) {
      human.kin.grounded = false;
    }

    if (human.queuedWeapon !== null) {
      human.equippedIndex = Math.max(0, Math.min(2, human.queuedWeapon));
      human.queuedWeapon = null;
    }
    const definition = PLAYER_WEAPONS[human.equippedIndex];
    const weaponState = human.weapons[human.equippedIndex];
    const fire = Boolean(input?.fire);
    const reload = human.queuedReload;
    human.queuedReload = false;
    const weapon = stepWeapon(weaponState, definition, {
      fire,
      reload,
      dtMs,
    });
    human.weapons[human.equippedIndex] = weapon.state;
    if (weapon.fired) {
      human.shotsFired += definition.pellets;
      this.fireWeapon(
        human.id,
        "human",
        definition,
        human.kin.x + 28,
        human.kin.y - 58,
        human.aimAngle,
      );
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
      this.tryUseMedkit(human);
    }
    this.collectNearbyPickups(human);
  }

  private tryUseMedkit(human: HumanRuntime): void {
    const result = applyMedkit({
      health: human.health,
      maxHealth: human.maxHealth,
      carried: human.medkits,
      cooldownRemainingMs: human.medkitCooldownRemainingMs,
    });
    if (!result.ok) return;
    human.health = result.health;
    human.medkits = result.carried;
    human.medkitCooldownRemainingMs = MEDKIT_CONFIG.useCooldownMs;
    this.events.push({
      type: "medkit-used",
      playerId: human.id,
      playerName: human.name,
      healed: result.healed,
      health: result.health,
      x: human.kin.x,
      y: human.kin.y - CHARACTER_AIM_HEIGHT,
    });
  }

  private collectNearbyPickups(human: HumanRuntime): void {
    while (true) {
      const pickup = findCollectiblePickup(
        this.pickups,
        human.kin.x,
        human.kin.y - CHARACTER_AIM_HEIGHT,
        (candidate) => this.canCollectPickup(human, candidate.type),
      );
      if (!pickup) return;
      if (!this.grantPickup(human, pickup.type)) {
        pickup.active = true;
        pickup.respawnRemainingMs = 0;
        return;
      }
      this.events.push({
        type: "pickup-collected",
        pickupId: pickup.id,
        itemType: pickup.type,
        playerId: human.id,
        playerName: human.name,
        x: pickup.x,
        y: pickup.y,
      });
    }
  }

  private canCollectPickup(
    human: HumanRuntime,
    type: PickupRuntime["type"],
  ): boolean {
    if (type === "medkit") {
      return human.medkits < MEDKIT_CONFIG.maxCarried;
    }
    return grenadeTypeFromPickup(type) !== null && canAddGrenade(human.grenades);
  }

  private grantPickup(
    human: HumanRuntime,
    type: PickupRuntime["type"],
  ): boolean {
    if (type === "medkit") {
      if (human.medkits >= MEDKIT_CONFIG.maxCarried) return false;
      human.medkits = Math.min(MEDKIT_CONFIG.maxCarried, human.medkits + 1);
      return true;
    }
    const grenadeType = grenadeTypeFromPickup(type);
    if (!grenadeType || !canAddGrenade(human.grenades)) return false;
    human.grenades = addGrenade(human.grenades, grenadeType);
    return true;
  }

  private tryThrowGrenade(human: HumanRuntime): void {
    if (!human.alive || this.phase !== "live") return;
    if (human.grenadeCooldownRemainingMs > 0) return;
    if (
      this.activeGrenades.size >=
      GRENADE_INVENTORY_CONFIG.maxActiveGrenades
    ) {
      return;
    }
    const type = human.selectedGrenade;
    const nextInventory = consumeGrenade(human.grenades, type);
    if (!nextInventory) return;
    const definition = GRENADE_CONFIG[type];
    human.grenades = nextInventory;
    human.grenadeCooldownRemainingMs = definition.throwCooldownMs;

    const aim = human.aimAngle;
    const originX = Math.max(
      definition.radius,
      Math.min(
        ARENA.width - definition.radius,
        human.kin.x + CHARACTER_PIVOT_X + Math.cos(aim) * 26,
      ),
    );
    const originY = Math.max(
      definition.radius,
      Math.min(
        ARENA.height - definition.radius,
        human.kin.y - CHARACTER_AIM_HEIGHT + Math.sin(aim) * 26,
      ),
    );
    const grenade: GrenadeRuntime = {
      id: ++this.grenadeCounter,
      type,
      ownerId: human.id,
      ownerKind: "human",
      x: originX,
      y: originY,
      vx: Math.cos(aim) * definition.throwSpeed + human.kin.vx * 0.22,
      vy: Math.sin(aim) * definition.throwSpeed + human.kin.vy * 0.15,
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
      kind: grenade.ownerKind,
      x: grenade.x,
      y: grenade.y,
      vx: grenade.vx,
      vy: grenade.vy,
      fuseMs: definition.fuseMs,
    });
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
        this.detonateGrenade(grenade);
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
      kind: grenade.ownerKind,
      x: grenade.x,
      y: grenade.y,
      blastRadius: definition.blastRadius,
    });
    if (this.timer.phase !== "live") return;

    for (const victim of [
      ...this.humans.values(),
      ...this.bots.values(),
    ]) {
      if (this.timer.phase !== "live") break;
      if (!victim.alive) continue;
      const position = center(victim);
      const distance =
        victim.id === directVictimId
          ? 0
          : Math.hypot(
              position.x - grenade.x,
              position.aimY - grenade.y,
            );
      if (distance > definition.blastRadius) continue;
      let damage = computeBlastDamage(distance, definition);
      if (damage <= 0) continue;
      if (
        distance > 0 &&
        this.isBlastObstructed(
          grenade.x,
          grenade.y,
          position.x,
          position.aimY,
        )
      ) {
        damage = Math.round(damage * definition.coverMultiplier);
      }
      if (damage <= 0) continue;
      this.damageCombatant(
        victim,
        damage,
        grenade.ownerId,
        definition.name,
        false,
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

  private fireWeapon(
    ownerId: string,
    ownerKind: "human" | "bot",
    weapon: PlayerWeapon,
    x: number,
    y: number,
    aim: number,
  ): void {
    const pivotX = x + Math.cos(aim) * 66;
    const pivotY = y + Math.sin(aim) * 66;
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
    });
  }

  private stepProjectiles(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const projectile of [...this.projectiles.values()]) {
      const speed = Math.hypot(projectile.vx, projectile.vy);
      const substeps = Math.max(1, Math.ceil((speed * dt) / 8));
      let hit = false;
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
          this.damageCombatant(
            combatant,
            projectile.damage,
            projectile.ownerId,
            projectile.weaponName,
          );
          hit = true;
          break;
        }
      }
      if (hit || this.elapsedMs >= projectile.expiresAt) {
        this.projectiles.delete(projectile.id);
      }
    }
  }

  private damageCombatant(
    victim: AnyCombatant,
    amount: number,
    attackerId: string,
    weaponName: string,
    trackAccuracy = true,
  ): void {
    if (!victim.alive || victim.invulnerableRemainingMs > 0) return;
    const attacker = this.findCombatant(attackerId);
    if (attacker?.kind === "human" && trackAccuracy) {
      attacker.shotsHit += 1;
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
      this.recordElimination(attackerId, victim, weaponName);
    }
  }

  private recordElimination(
    killerId: string,
    victim: AnyCombatant,
    weaponName: string,
  ): void {
    if (this.timer.phase !== "live") return;
    if (killerId === victim.id) {
      victim.deaths += 1;
      victim.lastKillerName = null;
      this.feedCounter += 1;
      const atMs = this.elapsedMs;
      this.feed.push({
        id: this.feedCounter,
        text: `${victim.name} was caught in their own blast`,
        atMs,
        killerId,
        victimId: victim.id,
      });
      this.feed = this.feed.slice(-6);
      this.events.push({
        type: "elimination",
        killerId,
        victimId: victim.id,
        killerName: victim.name,
        victimName: victim.name,
        weaponName,
        atMs,
      });
      return;
    }
    const killer = this.findCombatant(killerId);
    if (!killer) return;
    killer.eliminations += 1;
    victim.deaths += 1;
    victim.lastKillerName = killer.name;
    this.feedCounter += 1;
    const atMs = this.elapsedMs;
    this.feed.push({
      id: this.feedCounter,
      text: `${killer.name} eliminated ${victim.name}`,
      atMs,
      killerId,
      victimId: victim.id,
    });
    this.feed = this.feed.slice(-6);

    this.events.push({
      type: "elimination",
      killerId,
      victimId: victim.id,
      killerName: killer.name,
      victimName: victim.name,
      weaponName,
      atMs,
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
    resetPickups(this.pickups);
    this.events.push({
      type: "match-end",
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

    bot.invulnerableRemainingMs = Math.max(0, bot.invulnerableRemainingMs - dtMs);
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
    const flightTime =
      Math.hypot(position.x - origin.x, position.aimY - origin.y) /
      BOT_WEAPON.projectileSpeed;
    const targetVX = target.kind === "human" ? target.kin.vx : target.vx;
    const targetVY = target.kind === "human" ? target.kin.vy : target.vy;
    bot.aimAngle = Math.atan2(
      position.aimY + targetVY * flightTime * 0.35 - origin.y,
      position.x + targetVX * flightTime * 0.35 - origin.x,
    );

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
        x: position.x + bot.strafeSign * DRONE_CONFIG.standoffDistance,
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
      bot.repathMs = DRONE_CONFIG.repathMs;
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

    const desiredX = Math.max(60, Math.min(ARENA.width - 60, goal.x));
    const desiredY = Math.max(90, Math.min(ARENA.groundY - 80, goal.y));
    const dx = desiredX - bot.x;
    const dy = desiredY - bot.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = direct ? DRONE_CONFIG.hoverSpeed : DRONE_CONFIG.hoverSpeed * 1.05;
    const desiredVX = (dx / length) * speed;
    const desiredVY = (dy / length) * speed;
    const accel = 380 * dt;
    bot.vx = approach(bot.vx, desiredVX, accel);
    bot.vy = approach(bot.vy, desiredVY, accel);
    bot.thrusting = desiredVY < -18;

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

    if (hasLoS && distance < DRONE_CONFIG.aggroRange) {
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
          bot.burstTimerMs = DRONE_CONFIG.burstSpacingMs;
          if (bot.burstRemaining <= 0) bot.fireCooldownMs = DRONE_CONFIG.fireIntervalMs;
        }
      } else if (bot.fireCooldownMs <= 0) {
        bot.burstRemaining = DRONE_CONFIG.burstCount;
        bot.burstTimerMs = 70;
      }
    } else {
      bot.burstRemaining = 0;
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

  private combatantSnapshot(combatant: AnyCombatant): OnlineCombatantSnapshot {
    const position = center(combatant);
    const human = combatant.kind === "human" ? combatant : null;
    const bot = combatant.kind === "bot" ? combatant : null;
    const equippedIndex = human?.equippedIndex ?? 0;
    const weaponDef = human ? PLAYER_WEAPONS[equippedIndex] : PLAYER_WEAPONS[0];
    const weapons: OnlineWeaponSnapshot[] = human
      ? human.weapons.map((state, index) => this.weaponSnapshot(state, PLAYER_WEAPONS[index]))
      : [];
    const shots = human ? human.shotsFired : 0;
    const hits = human ? human.shotsHit : 0;
    return {
      id: combatant.id,
      name: combatant.name,
      kind: combatant.kind,
      skinId: human ? human.skinId : bot!.skinId,
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
      lastProcessedInputSeq: human?.lastInputSeq ?? 0,
      fuel: human?.kin.jetpack.fuel ?? 0,
      maxFuel: JETPACK_CONFIG.maxFuel,
      weaponId: human ? weaponDef.id : BOT_WEAPON.id,
      weapons,
      eliminations: combatant.eliminations,
      deaths: combatant.deaths,
      accuracy: shots > 0 ? hits / shots : 0,
      lastKillerName: combatant.lastKillerName,
      medkits: human?.medkits ?? 0,
      grenadeContact: human?.grenades.contact ?? 0,
      grenadeFrag: human?.grenades.frag ?? 0,
      grenadeSelected: human?.selectedGrenade ?? "contact",
      grenadeCooldownMs: human?.grenadeCooldownRemainingMs ?? 0,
    };
  }

  private weaponSnapshot(
    state: WeaponState,
    definition: PlayerWeapon,
  ): OnlineWeaponSnapshot {
    return {
      id: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      role: definition.role,
      slot: definition.slot,
      ammo: state.ammo,
      magazineSize: definition.magazineSize,
      reloading: state.reloading,
      reloadProgress: reloadProgress(state, definition),
    };
  }
}
