export const FFA_ROOM = "ffa";
export const LOBBY_ROOM = "lobby";
export const MAX_COMBATANTS = 8;
export const SNAPSHOT_INTERVAL_MS = 50;
export const SERVER_TICK_MS = 1000 / 60;
export const DEFAULT_MATCH_COUNTDOWN_MS = 10_000;

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
  fuel: number;
  maxFuel: number;
  weaponId: string;
  weapons: OnlineWeaponSnapshot[];
  eliminations: number;
  deaths: number;
  accuracy: number;
  lastKillerName: string | null;
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
    }
  | {
      type: "hit";
      ownerId: string;
      victimId: string;
      x: number;
      y: number;
      damage: number;
      kind: PlayerKind;
    }
  | {
      type: "elimination";
      killerId: string;
      victimId: string;
      killerName: string;
      victimName: string;
      weaponName: string;
      atMs: number;
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
    };

export interface OnlineInputPayload {
  seq: number;
  moveX: number;
  jump: boolean;
  jumpHeld: boolean;
  fire: boolean;
  reload: boolean;
  weapon: number | null;
  aim: number;
}

export interface JoinOptions {
  name?: string;
  roomName?: string;
  open?: boolean;
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
