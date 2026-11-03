import type { MatchEndReason, MatchPhase } from "@/game/core/match";
import type { ProjectileOwnerKind } from "@/game/systems/ProjectileSystem";

export interface HudWeaponSlot {
  id: string;
  name: string;
  shortName: string;
  role: string;
  slot: number;
  key: string;
  ammo: number;
  magazineSize: number;
  active: boolean;
}

export interface HudStanding {
  id: string;
  name: string;
  score: number;
  deaths: number;
  alive: boolean;
  isPlayer: boolean;
  respawnIn: number;
  placement: number;
}

export interface HudFeedEntry {
  id: number;
  text: string;
  atMs: number;
  killerId: string;
  victimId: string;
}

export interface HudPlayerKill {
  victimName: string;
  weaponName: string;
  atMs: number;
}

export interface HudSnapshot {
  ready: boolean;
  health: number;
  maxHealth: number;
  fuel: number;
  maxFuel: number;
  ammo: number;
  magazineSize: number;
  reloading: boolean;
  reloadProgress: number;
  weaponId: string;
  weaponName: string;
  weaponShortName: string;
  weaponRole: string;
  weaponSlot: number;
  weaponSlots: HudWeaponSlot[];
  isDead: boolean;
  respawnIn: number;
  playerX: number;
  playerY: number;
  grounded: boolean;
  thrusting: boolean;
  aimAngle: number;
  matchPhase: MatchPhase;
  matchTimeRemainingMs: number;
  matchDurationMs: number;
  matchScoreLimit: number;
  matchEndReason: MatchEndReason;
  standings: HudStanding[];
  playerPlacement: number;
  playerEliminations: number;
  playerDeaths: number;
  playerAccuracy: number;
  winnerName: string | null;
  lastKillerName: string | null;
  feed: HudFeedEntry[];
  lastPlayerKill: HudPlayerKill | null;
  uptimeMs: number;
  debug: boolean;
  damageSeq: number;
}

export const INITIAL_HUD: HudSnapshot = {
  ready: false,
  health: 100,
  maxHealth: 100,
  fuel: 100,
  maxFuel: 100,
  ammo: 20,
  magazineSize: 20,
  reloading: false,
  reloadProgress: 1,
  weaponId: "vibe-rifle",
  weaponName: "VIBE RIFLE",
  weaponShortName: "RIFLE",
  weaponRole: "FULL AUTO / MID RANGE",
  weaponSlot: 1,
  weaponSlots: [],
  isDead: false,
  respawnIn: 0,
  playerX: 0,
  playerY: 0,
  grounded: false,
  thrusting: false,
  aimAngle: 0,
  matchPhase: "live",
  matchTimeRemainingMs: 90_000,
  matchDurationMs: 90_000,
  matchScoreLimit: 10,
  matchEndReason: null,
  standings: [],
  playerPlacement: 1,
  playerEliminations: 0,
  playerDeaths: 0,
  playerAccuracy: 0,
  winnerName: null,
  lastKillerName: null,
  feed: [],
  lastPlayerKill: null,
  uptimeMs: 0,
  debug: false,
  damageSeq: 0,
};

export type GameCommand =
  | { type: "toggle-debug" }
  | { type: "set-debug"; value: boolean }
  | { type: "respawn" }
  | { type: "equip-weapon"; slot: number }
  | { type: "restart-match" }
  | { type: "force-match-end" };

export interface DebugProbe {
  hud: HudSnapshot;
  player: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    onGround: boolean;
    thrusting: boolean;
    health: number;
    fuel: number;
    ammo: number;
    reloading: boolean;
    dead: boolean;
    aimAngle: number;
    visible: boolean;
    alpha: number;
    bodyEnabled: boolean;
    bodyMoves: boolean;
    texture: string;
    weaponId: string;
    weaponSlot: number;
    eliminations: number;
    deaths: number;
    shotsFired: number;
    shotsHit: number;
  };
  drones: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    health: number;
    alive: boolean;
    sight: boolean;
    shotsFired: number;
    cooldown: number;
    targetId: string | null;
    pathLength: number;
    thrusting: boolean;
    invulnerable: number;
    bodyX: number;
    bodyY: number;
    bodyWidth: number;
    bodyHeight: number;
    eliminations: number;
    deaths: number;
  }>;
  projectiles: Array<{
    x: number;
    y: number;
    ownerId: string;
    ownerKind: ProjectileOwnerKind;
    weaponId: string;
  }>;
  platforms: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  spawnPoints: Array<{ id: string; x: number; y: number }>;
  camera: { scrollX: number; scrollY: number; zoom: number };
  match: {
    phase: MatchPhase;
    remainingMs: number;
    endReason: MatchEndReason;
    playerPlacement: number;
    winnerName: string | null;
  };
  counters: {
    droneBulletHitsPlayer: number;
    playerBulletHitsDrone: number;
    droneShots: number;
    playerBulletHitsBot: number;
    botBulletHitsBot: number;
    playerShots: number;
    playerHits: number;
  };
  debugVisible: boolean;
}

export class GameBridge {
  private latest: HudSnapshot = INITIAL_HUD;
  private snapshotListeners = new Set<(snapshot: HudSnapshot) => void>();
  private commandListeners = new Set<(command: GameCommand) => void>();

  getSnapshot(): HudSnapshot {
    return this.latest;
  }

  publish(snapshot: HudSnapshot): void {
    this.latest = snapshot;
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }

  subscribe(listener: (snapshot: HudSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.latest);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  send(command: GameCommand): void {
    for (const listener of this.commandListeners) {
      listener(command);
    }
  }

  onCommand(listener: (command: GameCommand) => void): () => void {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }
}
