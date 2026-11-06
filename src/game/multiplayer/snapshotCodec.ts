import type {
  MatchPhase,
  OnlineCombatantSnapshot,
  OnlineSnapshot,
} from "@/game/multiplayer/protocol";

/**
 * Compact snapshot stream.
 *
 * A full snapshot is ~10 KB of msgpack with property names and float64
 * positions. Almost all of it is static or changes rarely. This splits it into
 * three messages that rebuild an equivalent `OnlineSnapshot` on the client, so
 * the rest of the client does not need to know:
 *
 * - fast: motion and clock, every snapshot, positional arrays and fixed point.
 * - slow: roster, standings, pickups, loot and feed, sent on change.
 * - self: the receiving player's inventory, sent on change.
 */
export const SNAPSHOT_FAST = "s1";
export const SNAPSHOT_SLOW = "s2";
export const SNAPSHOT_SELF = "s3";

type FastCombatant = [
  id: string,
  x10: number,
  y10: number,
  vx: number,
  vy: number,
  health: number,
  flags: number,
  aim1000: number,
  invulnerableMs: number,
  respawn10: number,
  ackSeq: number,
  ackTicks: number,
  fuel10: number,
  weaponId: string,
  coyoteMs: number,
  thrustIdleMs: number,
];

export interface FastSnapshot {
  k: number;
  st: number;
  el: number;
  ph: MatchPhase;
  rm: number;
  cd: number;
  tm: number;
  p: FastCombatant[];
  pr: OnlineSnapshot["projectiles"];
  g: OnlineSnapshot["grenades"];
  c: OnlineSnapshot["toxicClouds"];
}

type StaticCombatant = Omit<
  OnlineCombatantSnapshot,
  | "x"
  | "y"
  | "vx"
  | "vy"
  | "health"
  | "alive"
  | "grounded"
  | "thrusting"
  | "aimAngle"
  | "invulnerable"
  | "respawnIn"
  | "lastProcessedInputSeq"
  | "lastProcessedInputTicks"
  | "coyoteMs"
  | "thrustIdleMs"
  | "fuel"
  | "weaponId"
  | "weapons"
  | "equippedSlot"
  | "accuracy"
  | "grenadeSelected"
  | "grenadeCooldownMs"
>;

export interface SlowSnapshot {
  atMs: number;
  matchId: string;
  matchNumber: number;
  endReason: OnlineSnapshot["endReason"];
  durationMs: number;
  countdownDurationMs: number;
  scoreLimit: number;
  winnerName: string | null;
  roomId: string;
  roomName: string;
  humans: number;
  bots: number;
  maxCombatants: number;
  joinable: boolean;
  roster: StaticCombatant[];
  pickups: OnlineSnapshot["pickups"];
  loot: OnlineSnapshot["loot"];
  standings: OnlineSnapshot["standings"];
  feed: OnlineSnapshot["feed"];
}

export interface SelfSnapshot {
  atMs: number;
  id: string;
  weapons: OnlineCombatantSnapshot["weapons"];
  equippedSlot: number;
  accuracy: number;
  grenadeSelected: OnlineCombatantSnapshot["grenadeSelected"];
  grenadeCooldownMs: number;
}

const FLAG_ALIVE = 1;
const FLAG_GROUNDED = 2;
const FLAG_THRUSTING = 4;

const scaled = (value: number, scale: number): number =>
  Math.round(value * scale);

export function encodeFast(full: OnlineSnapshot): FastSnapshot {
  return {
    k: full.tick,
    st: full.serverTime,
    el: Math.round(full.elapsedMs),
    ph: full.phase,
    rm: Math.round(full.remainingMs),
    cd: Math.round(full.countdownRemainingMs),
    tm: Math.round(full.serverTickMs * 100) / 100,
    p: full.participants.map((entry) => [
      entry.id,
      scaled(entry.x, 10),
      scaled(entry.y, 10),
      Math.round(entry.vx),
      Math.round(entry.vy),
      Math.round(entry.health * 10) / 10,
      (entry.alive ? FLAG_ALIVE : 0) |
        (entry.grounded ? FLAG_GROUNDED : 0) |
        (entry.thrusting ? FLAG_THRUSTING : 0),
      scaled(entry.aimAngle, 1000),
      Math.round(entry.invulnerable),
      scaled(entry.respawnIn, 10),
      entry.lastProcessedInputSeq,
      entry.lastProcessedInputTicks ?? 0,
      scaled(entry.fuel, 10),
      entry.weaponId,
      Math.round(entry.coyoteMs ?? 0),
      Math.round(entry.thrustIdleMs ?? 0),
    ]),
    pr: full.projectiles.map((projectile) => ({
      ...projectile,
      x: Math.round(projectile.x),
      y: Math.round(projectile.y),
      vx: Math.round(projectile.vx),
      vy: Math.round(projectile.vy),
    })),
    g: full.grenades.map((grenade) => ({
      ...grenade,
      x: Math.round(grenade.x),
      y: Math.round(grenade.y),
      vx: Math.round(grenade.vx),
      vy: Math.round(grenade.vy),
    })),
    c: full.toxicClouds.map((cloud) => ({
      ...cloud,
      remainingMs: Math.round(cloud.remainingMs),
    })),
  };
}

export function encodeSlow(full: OnlineSnapshot): SlowSnapshot {
  return {
    atMs: full.elapsedMs,
    matchId: full.matchId,
    matchNumber: full.matchNumber,
    endReason: full.endReason,
    durationMs: full.durationMs,
    countdownDurationMs: full.countdownDurationMs,
    scoreLimit: full.scoreLimit,
    winnerName: full.winnerName,
    roomId: full.roomId,
    roomName: full.roomName,
    humans: full.humans,
    bots: full.bots,
    maxCombatants: full.maxCombatants,
    joinable: full.joinable,
    roster: full.participants.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      skinId: entry.skinId,
      playerId: entry.playerId,
      connected: entry.connected,
      level: entry.level,
      badgeId: entry.badgeId,
      titleId: entry.titleId,
      eliminationEffectId: entry.eliminationEffectId,
      trailId: entry.trailId,
      maxHealth: entry.maxHealth,
      maxFuel: entry.maxFuel,
      eliminations: entry.eliminations,
      deaths: entry.deaths,
      lastKillerName: entry.lastKillerName,
      medkits: entry.medkits,
      grenadeContact: entry.grenadeContact,
      grenadeFrag: entry.grenadeFrag,
      grenadeStinking: entry.grenadeStinking,
    })),
    pickups: full.pickups,
    loot: full.loot,
    standings: full.standings,
    feed: full.feed,
  };
}

export function encodeSelf(
  full: OnlineSnapshot,
  sessionId: string,
): SelfSnapshot | null {
  const entry = full.participants.find((item) => item.id === sessionId);
  if (!entry) return null;
  return {
    atMs: full.elapsedMs,
    id: entry.id,
    weapons: entry.weapons,
    equippedSlot: entry.equippedSlot,
    accuracy: entry.accuracy,
    grenadeSelected: entry.grenadeSelected,
    grenadeCooldownMs: entry.grenadeCooldownMs,
  };
}

/**
 * Change key for the slow section. Timers that only count down are excluded,
 * because the client ages them itself between sends.
 */
export function slowChangeKey(slow: SlowSnapshot): string {
  return JSON.stringify({
    ...slow,
    atMs: 0,
    pickups: slow.pickups.map((pickup) => [pickup.id, pickup.active]),
    loot: slow.loot.map((item) => [item.id, item.ammo]),
    standings: slow.standings.map((entry) => [
      entry.id,
      entry.score,
      entry.deaths,
      entry.alive,
      entry.placement,
    ]),
  });
}

export function selfChangeKey(self: SelfSnapshot): string {
  return JSON.stringify({
    ...self,
    atMs: 0,
    grenadeCooldownMs: self.grenadeCooldownMs > 0,
  });
}

/** Rebuilds full snapshots on the client from the three compact messages. */
export class SnapshotAssembler {
  private slow: SlowSnapshot | null = null;
  private self: SelfSnapshot | null = null;
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /** A full snapshot (join, reconnect, rematch) seeds both slow sections. */
  seed(full: OnlineSnapshot): void {
    this.slow = encodeSlow(full);
    this.self = encodeSelf(full, this.sessionId);
  }

  applySlow(slow: SlowSnapshot): void {
    this.slow = slow;
  }

  applySelf(self: SelfSnapshot): void {
    this.self = self;
  }

  assemble(fast: FastSnapshot): OnlineSnapshot | null {
    const slow = this.slow;
    if (!slow) return null;
    const rosterById = new Map(slow.roster.map((entry) => [entry.id, entry]));
    const aged = Math.max(0, fast.el - slow.atMs);
    const selfAged = this.self ? Math.max(0, fast.el - this.self.atMs) : 0;
    const participants: OnlineCombatantSnapshot[] = [];
    for (const row of fast.p) {
      const stat = rosterById.get(row[0]);
      if (!stat) continue;
      const own = row[0] === this.sessionId ? this.self : null;
      participants.push({
        ...stat,
        weapons: own?.weapons ?? [],
        equippedSlot: own?.equippedSlot ?? 0,
        accuracy: own?.accuracy ?? 0,
        grenadeSelected: own?.grenadeSelected ?? "contact",
        grenadeCooldownMs: own
          ? Math.max(0, own.grenadeCooldownMs - selfAged)
          : 0,
        x: row[1] / 10,
        y: row[2] / 10,
        vx: row[3],
        vy: row[4],
        health: row[5],
        alive: (row[6] & FLAG_ALIVE) !== 0,
        grounded: (row[6] & FLAG_GROUNDED) !== 0,
        thrusting: (row[6] & FLAG_THRUSTING) !== 0,
        aimAngle: row[7] / 1000,
        invulnerable: row[8],
        respawnIn: row[9] / 10,
        lastProcessedInputSeq: row[10],
        lastProcessedInputTicks: row[11],
        fuel: row[12] / 10,
        weaponId: row[13],
        coyoteMs: row[14],
        thrustIdleMs: row[15],
      });
    }
    const liveById = new Map(
      fast.p.map((row) => [
        row[0],
        { alive: (row[6] & FLAG_ALIVE) !== 0, respawnIn: row[9] / 10 },
      ]),
    );
    return {
      tick: fast.k,
      serverTime: fast.st,
      elapsedMs: fast.el,
      phase: fast.ph,
      remainingMs: fast.rm,
      countdownRemainingMs: fast.cd,
      serverTickMs: fast.tm,
      matchId: slow.matchId,
      matchNumber: slow.matchNumber,
      endReason: slow.endReason,
      durationMs: slow.durationMs,
      countdownDurationMs: slow.countdownDurationMs,
      scoreLimit: slow.scoreLimit,
      winnerName: slow.winnerName,
      roomId: slow.roomId,
      roomName: slow.roomName,
      humans: slow.humans,
      bots: slow.bots,
      maxCombatants: slow.maxCombatants,
      joinable: slow.joinable,
      participants,
      projectiles: fast.pr,
      grenades: fast.g,
      toxicClouds: fast.c,
      pickups: slow.pickups.map((pickup) =>
        pickup.active
          ? pickup
          : {
              ...pickup,
              respawnIn: Math.max(0, pickup.respawnIn - aged / 1000),
            },
      ),
      loot: slow.loot.map((item) => ({
        ...item,
        remainingMs: Math.max(0, item.remainingMs - aged),
      })),
      standings: slow.standings.map((entry) => {
        const live = liveById.get(entry.id);
        return live ? { ...entry, ...live } : entry;
      }),
      feed: slow.feed,
    };
  }
}
