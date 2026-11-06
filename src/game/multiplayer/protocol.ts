import type { GrenadeType } from "@/game/core/grenades";
import type { PickupType } from "@/game/core/pickups";

export const FFA_ROOM = "ffa";
export const LOBBY_ROOM = "lobby";
export const MAX_COMBATANTS = 8;
export const SNAPSHOT_INTERVAL_MS = 50;
export const SERVER_TICK_MS = 1000 / 60;
export const DEFAULT_MATCH_COUNTDOWN_MS = 10_000;

/**
 * Wire format revision. Clients that join with `netProtocol >= 2` receive the
 * compact split snapshot stream and may send tick-counted input. Anything else
 * keeps the original full `snapshot` message, so tabs already open during a
 * deploy keep working.
 */
export const NET_PROTOCOL_VERSION = 2;
/** Fixed simulation ticks covered by one client input packet (30 packets/s). */
export const INPUT_TICKS_PER_PACKET = 2;

export type MatchPhase = "countdown" | "live" | "ended";
export type EndReason = "time" | "score" | null;
export type PlayerKind = "human" | "bot";

export interface OnlineWeaponSnapshot {
  id: string;
  name: string;
  shortName: string;
  role: string;
  slot: number;
  ammo: number;
  magazineSize: number;
  reloading: boolean;
  reloadProgress: number;
  owned: boolean;
}

export interface OnlineStanding {
  id: string;
  name: string;
  score: number;
  deaths: number;
  alive: boolean;
  isPlayer: boolean;
  respawnIn: number;
  placement: number;
  kind: PlayerKind;
}

export interface OnlineFeedEntry {
  id: number;
  text: string;
  atMs: number;
  killerId: string;
  victimId: string;
}

export interface OnlineCombatantSnapshot {
  id: string;
  name: string;
  kind: PlayerKind;
  skinId: string;
  playerId: string | null;
  connected: boolean;
  level: number;
  badgeId: string | null;
  titleId: string | null;
  eliminationEffectId: string | null;
  trailId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  grounded: boolean;
  thrusting: boolean;
  aimAngle: number;
  invulnerable: number;
  respawnIn: number;
  lastProcessedInputSeq: number;
  /** Ticks of `lastProcessedInputSeq` already simulated. Absent on older servers. */
  lastProcessedInputTicks?: number;
  /** Prediction seed: remaining coyote time. Absent on older servers. */
  coyoteMs?: number;
  /** Prediction seed: jetpack idle timer. Absent on older servers. */
  thrustIdleMs?: number;
  fuel: number;
  maxFuel: number;
  weaponId: string;
  weapons: OnlineWeaponSnapshot[];
  equippedSlot: number;
  eliminations: number;
  deaths: number;
  accuracy: number;
  lastKillerName: string | null;
  medkits: number;
  grenadeContact: number;
  grenadeFrag: number;
  grenadeStinking: number;
  grenadeSelected: GrenadeType;
  grenadeCooldownMs: number;
}

export interface OnlineGrenadeSnapshot {
  id: number;
  type: GrenadeType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  ownerName: string;
  kind: PlayerKind;
  fuseRemainingMs: number | null;
  activationRemainingMs: number | null;
  armed: boolean;
}

export interface OnlineToxicCloudSnapshot {
  id: number;
  ownerId: string;
  ownerName: string;
  kind: PlayerKind;
  x: number;
  y: number;
  radius: number;
  createdAtMs: number;
  remainingMs: number;
  durationMs: number;
}

export interface OnlinePickupSnapshot {
  id: string;
  type: PickupType;
  x: number;
  y: number;
  active: boolean;
  respawnIn: number;
}

export interface OnlineLootSnapshot {
  id: string;
  kind: "weapon" | "medkit" | "grenade";
  weaponId: string | null;
  weaponName: string | null;
  ammo: number;
  grenadeType: GrenadeType | null;
  x: number;
  y: number;
  eliminationId: number;
  remainingMs: number;
  createdAtMs: number;
}

export interface OnlineProjectileSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  kind: PlayerKind;
  weaponId: string;
}

export interface OnlineSnapshot {
  tick: number;
  serverTime: number;
  matchId: string;
  matchNumber: number;
  elapsedMs: number;
  phase: MatchPhase;
  endReason: EndReason;
  remainingMs: number;
  durationMs: number;
  countdownRemainingMs: number;
  countdownDurationMs: number;
  scoreLimit: number;
  winnerName: string | null;
  participants: OnlineCombatantSnapshot[];
  projectiles: OnlineProjectileSnapshot[];
  grenades: OnlineGrenadeSnapshot[];
  toxicClouds: OnlineToxicCloudSnapshot[];
  pickups: OnlinePickupSnapshot[];
  loot: OnlineLootSnapshot[];
  standings: OnlineStanding[];
  feed: OnlineFeedEntry[];
  roomId: string;
  roomName: string;
  humans: number;
  bots: number;
  maxCombatants: number;
  joinable: boolean;
  serverTickMs: number;
}

export type OnlineEvent =
  | {
      type: "shot";
      ownerId: string;
      weaponId: string;
      x: number;
      y: number;
      angle: number;
      barrel: number | null;
    }
  | {
      type: "hit";
      ownerId: string;
      victimId: string;
      x: number;
      y: number;
      damage: number;
      kind: PlayerKind;
      source: "bullet" | "grenade" | "toxic" | "rocket";
      weaponId?: string;
    }
  | {
      type: "elimination";
      eliminationId: number;
      killerId: string;
      victimId: string;
      killerName: string;
      victimName: string;
      weaponName: string;
      atMs: number;
      x: number;
      y: number;
      lootIds: string[];
    }
  | {
      type: "respawn";
      id: string;
      name: string;
      x: number;
      y: number;
      kind: PlayerKind;
    }
  | {
      type: "match-end";
      matchId: string;
      reason: EndReason;
      winnerName: string | null;
    }
  | {
      type: "player-joined";
      id: string;
      name: string;
      human: boolean;
    }
  | {
      type: "player-left";
      id: string;
      name: string;
    }
  | {
      type: "pickup-collected";
      pickupId: string;
      itemType: PickupType;
      playerId: string;
      playerName: string;
      x: number;
      y: number;
      text?: string;
      detail?: string;
    }
  | {
      type: "pickup-respawn";
      pickupId: string;
      itemType: PickupType;
      x: number;
      y: number;
    }
  | {
      type: "medkit-used";
      playerId: string;
      playerName: string;
      healed: number;
      health: number;
      x: number;
      y: number;
    }
  | {
      type: "grenade-thrown";
      grenadeId: number;
      grenadeType: GrenadeType;
      ownerId: string;
      ownerName: string;
      kind: PlayerKind;
      x: number;
      y: number;
      vx: number;
      vy: number;
      fuseMs: number | null;
    }
  | {
      type: "grenade-exploded";
      grenadeId: number;
      grenadeType: GrenadeType;
      ownerId: string;
      ownerName: string;
      kind: PlayerKind;
      x: number;
      y: number;
      blastRadius: number;
    }
  | {
      type: "rocket-exploded";
      projectileId: number;
      ownerId: string;
      ownerName: string;
      kind: PlayerKind;
      x: number;
      y: number;
      blastRadius: number;
    }
  | {
      type: "toxic-cloud-created";
      cloudId: number;
      ownerId: string;
      ownerName: string;
      kind: PlayerKind;
      x: number;
      y: number;
      radius: number;
      durationMs: number;
    }
  | {
      type: "toxic-cloud-expired";
      cloudId: number;
      x: number;
      y: number;
    }
  | {
      type: "loot-collected";
      lootId: string;
      kind: "weapon" | "medkit" | "grenade";
      playerId: string;
      playerName: string;
      x: number;
      y: number;
      weaponId: string | null;
      grenadeType: GrenadeType | null;
      text: string;
      detail: string;
    }
  | {
      type: "loot-expired";
      lootId: string;
      x: number;
      y: number;
    }
  | {
      type: "weapon-swapped";
      playerId: string;
      playerName: string;
      slot: number;
      fromWeaponId: string;
      toWeaponId: string;
      x: number;
      y: number;
    };

export interface OnlineInputPayload {
  seq: number;
  /**
   * Fixed ticks this packet's movement covers. When present the server queues
   * movement and simulates exactly one tick per server tick, which keeps
   * prediction in lockstep through TCP jitter. Bounded on the server.
   */
  ticks?: number;
  moveX: number;
  jump: boolean;
  jumpHeld: boolean;
  fire: boolean;
  reload: boolean;
  weapon: number | null;
  aim: number;
  useMedkit?: boolean;
  grenadeSlot?: number | null;
  throwGrenade?: boolean;
  swapWeapon?: boolean;
}

export interface JoinOptions {
  name?: string;
  roomName?: string;
  skinId?: string;
  open?: boolean;
  guestToken?: string;
  netProtocol?: number;
}

export interface OnlineHumanMatchResult {
  id: string;
  playerId: string | null;
  name: string;
  skinId: string;
  placement: number;
  eliminations: number;
  deaths: number;
  humanEliminations: number;
  botEliminations: number;
  participationMs: number;
  inputsReceived: number;
  weaponShots: Record<string, number>;
  weaponHits: Record<string, number>;
  weaponEliminations: Record<string, number>;
}

export interface OnlineRoomMetadata {
  name: string;
  mode: "ffa";
  phase: MatchPhase | "waiting";
  humans: number;
  bots: number;
  maxCombatants: number;
  joinable: boolean;
  open: boolean;
  remainingMs: number;
  countdownMs: number;
}

export function sanitizeGuestName(value: unknown): string {
  if (typeof value !== "string") return "VIBER-GUEST";
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : "VIBER-GUEST";
}
