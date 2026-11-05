import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_EQUIPPED,
  isCosmeticUnlocked,
  unlockedIds,
  validateEquipped,
  type EquippedCosmetics,
} from "../../src/game/progression/cosmetics";
import {
  calculateMatchXp,
  progressForXp,
  type XpRules,
} from "../../src/game/progression/progression";
import type {
  GuestSession,
  MatchRecordInput,
  MatchRecordResult,
  MatchReward,
  PlayerProfile,
  PlayerRecentMatch,
  PlayerWeaponStat,
} from "../../src/game/progression/profile";

interface PlayerRow {
  id: string;
  token_hash: string;
  name: string;
  skin_id: string;
  xp: number;
  matches_played: number;
  wins: number;
  losses: number;
  eliminations: number;
  deaths: number;
  equipped_json: string;
  created_at: number;
  updated_at: number;
}

interface MatchRow {
  match_id: string;
  player_id: string;
  placement: number;
  eliminations: number;
  deaths: number;
  xp_earned: number;
  completed_at: number;
  reward_delivered: number;
}

interface WeaponRow {
  weapon_id: string;
  shots: number;
  hits: number;
  eliminations: number;
}

const TOKEN_PREFIX = "vm_guest_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeName(value: string): string {
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : "VIBER-GUEST";
}

function parseEquipped(value: string): EquippedCosmetics {
  try {
    const parsed = JSON.parse(value) as Partial<EquippedCosmetics>;
    return validateEquipped(parsed, 999);
  } catch {
    return { ...DEFAULT_EQUIPPED };
  }
}

export class ProfileStore {
  private readonly db: DatabaseSync;
  private readonly xpRules: Partial<XpRules>;

  constructor(databasePath: string, xpRules: Partial<XpRules> = {}) {
    const resolved =
      databasePath === ":memory:"
        ? databasePath
        : path.resolve(databasePath);
    if (resolved !== ":memory:") {
      mkdirSync(path.dirname(resolved), { recursive: true });
    }
    this.db = new DatabaseSync(resolved);
    this.xpRules = xpRules;
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const current = this.db
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get() as { version: number | null } | undefined;
    const version = current?.version ?? 0;
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          skin_id TEXT NOT NULL,
          xp INTEGER NOT NULL DEFAULT 0,
          matches_played INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          eliminations INTEGER NOT NULL DEFAULT 0,
          deaths INTEGER NOT NULL DEFAULT 0,
          equipped_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weapon_stats (
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          weapon_id TEXT NOT NULL,
          shots INTEGER NOT NULL DEFAULT 0,
          hits INTEGER NOT NULL DEFAULT 0,
          eliminations INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (player_id, weapon_id)
        );
        CREATE TABLE IF NOT EXISTS matches (
          match_id TEXT NOT NULL,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          placement INTEGER NOT NULL,
          eliminations INTEGER NOT NULL,
          deaths INTEGER NOT NULL,
          xp_earned INTEGER NOT NULL,
          completion_xp INTEGER NOT NULL DEFAULT 0,
          human_elimination_xp INTEGER NOT NULL DEFAULT 0,
          bot_elimination_xp INTEGER NOT NULL DEFAULT 0,
          placement_xp INTEGER NOT NULL DEFAULT 0,
          participation_ms INTEGER NOT NULL DEFAULT 0,
          inputs_received INTEGER NOT NULL DEFAULT 0,
          reward_delivered INTEGER NOT NULL DEFAULT 0,
          completed_at INTEGER NOT NULL,
          PRIMARY KEY (match_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_matches_player
          ON matches (player_id, completed_at DESC);
        CREATE TABLE IF NOT EXISTS cosmetics (
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          cosmetic_id TEXT NOT NULL,
          unlocked_at INTEGER NOT NULL,
          PRIMARY KEY (player_id, cosmetic_id)
        );
        INSERT INTO schema_migrations (version, applied_at)
        VALUES (1, unixepoch() * 1000);
      `);
    }
  }

  createGuest(name = "VIBER-GUEST", skinId = "viber-010"): GuestSession {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const now = Date.now();
    const id = `pl_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const equipped = { ...DEFAULT_EQUIPPED };
    this.db
      .prepare(
        `INSERT INTO players
          (id, token_hash, name, skin_id, xp, matches_played, wins, losses,
           eliminations, deaths, equipped_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?)`,
      )
      .run(
        id,
        hashToken(token),
        safeName(name),
        skinId,
        JSON.stringify(equipped),
        now,
        now,
      );
    this.insertCosmetics(id, unlockedIds(1), now);
    return {
      token,
      player: this.getProfileById(id)!,
      pendingAwards: [],
    };
  }

  getProfileByToken(token: string): PlayerProfile | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const row = this.db
      .prepare("SELECT * FROM players WHERE token_hash = ?")
      .get(hashToken(token)) as PlayerRow | undefined;
    return row ? this.toProfile(row) : null;
  }

  getProfileById(id: string): PlayerProfile | null {
    const row = this.db
      .prepare("SELECT * FROM players WHERE id = ?")
      .get(id) as PlayerRow | undefined;
    return row ? this.toProfile(row) : null;
  }

  updateIdentity(
    playerId: string,
    name: string,
    skinId: string,
  ): PlayerProfile | null {
    this.db
      .prepare(
        "UPDATE players SET name = ?, skin_id = ?, updated_at = ? WHERE id = ?",
      )
      .run(safeName(name), skinId, Date.now(), playerId);
    return this.getProfileById(playerId);
  }

  setEquipped(
    playerId: string,
    requested: Partial<EquippedCosmetics>,
  ): PlayerProfile | null {
    const profile = this.getProfileById(playerId);
    if (!profile) return null;
    const equipped = validateEquipped(requested, profile.level);
    this.db
      .prepare("UPDATE players SET equipped_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(equipped), Date.now(), playerId);
    return this.getProfileById(playerId);
  }

  recordMatch(input: MatchRecordInput): MatchRecordResult | null {
    const existing = this.db
      .prepare(
        "SELECT * FROM matches WHERE match_id = ? AND player_id = ?",
      )
      .get(input.matchId, input.playerId) as MatchRow | undefined;
    const current = this.getProfileById(input.playerId);
    if (!current) return null;

    if (existing) {
      return {
        duplicate: true,
        reward: {
          matchId: input.matchId,
          xpEarned: 0,
          breakdown: [],
          levelBefore: current.level,
          levelAfter: current.level,
          levelUp: false,
          profile: current,
        },
      };
    }

    const xpResult = calculateMatchXp({
      placement: input.placement,
      humanEliminations: input.humanEliminations,
      botEliminations: input.botEliminations,
      participationMs: input.participationMs,
      inputsReceived: input.inputsReceived,
      completed: input.completed,
      rules: this.xpRules,
    });
    const levelBefore = current.level;
    const xpEarned = xpResult.total;
    const nextXp = current.xp + xpEarned;
    const nextProgress = progressForXp(nextXp);
    const levelAfter = nextProgress.level;
    const win = input.placement === 1 ? 1 : 0;
    const now = Date.now();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `UPDATE players SET
            xp = ?,
            matches_played = matches_played + 1,
            wins = wins + ?,
            losses = losses + ?,
            eliminations = eliminations + ?,
            deaths = deaths + ?,
            skin_id = ?,
            updated_at = ?
           WHERE id = ?`,
        )
        .run(
          nextXp,
          win,
          1 - win,
          Math.max(0, input.eliminations),
          Math.max(0, input.deaths),
          input.skinId,
          now,
          input.playerId,
        );

      const weaponIds = new Set([
        ...Object.keys(input.weaponShots),
        ...Object.keys(input.weaponHits),
        ...Object.keys(input.weaponEliminations),
      ]);
      for (const weaponId of weaponIds) {
        this.db
          .prepare(
            `INSERT INTO weapon_stats (player_id, weapon_id, shots, hits, eliminations)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (player_id, weapon_id) DO UPDATE SET
               shots = shots + excluded.shots,
               hits = hits + excluded.hits,
               eliminations = eliminations + excluded.eliminations`,
          )
          .run(
            input.playerId,
            weaponId,
            Math.max(0, Math.floor(input.weaponShots[weaponId] ?? 0)),
            Math.max(0, Math.floor(input.weaponHits[weaponId] ?? 0)),
            Math.max(0, Math.floor(input.weaponEliminations[weaponId] ?? 0)),
          );
      }

      this.db
        .prepare(
          `INSERT INTO matches
            (match_id, player_id, placement, eliminations, deaths, xp_earned,
             completion_xp, human_elimination_xp, bot_elimination_xp,
             placement_xp, participation_ms, inputs_received, reward_delivered,
             completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(
          input.matchId,
          input.playerId,
          Math.max(1, Math.floor(input.placement)),
          Math.max(0, input.eliminations),
          Math.max(0, input.deaths),
          xpEarned,
          xpResult.breakdown.find((line) => line.id === "completion")?.xp ?? 0,
          xpResult.breakdown.find((line) => line.id === "human-eliminations")
            ?.xp ?? 0,
          xpResult.breakdown.find((line) => line.id === "bot-eliminations")?.xp ??
            0,
          xpResult.breakdown.find((line) => line.id === "placement")?.xp ?? 0,
          Math.max(0, Math.floor(input.participationMs)),
          Math.max(0, Math.floor(input.inputsReceived)),
          now,
        );

      if (levelAfter > levelBefore) {
        this.insertCosmetics(input.playerId, unlockedIds(levelAfter), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const profile = this.getProfileById(input.playerId);
    if (!profile) return null;
    return {
      duplicate: false,
      reward: {
        matchId: input.matchId,
        xpEarned,
        breakdown: xpResult.breakdown,
        levelBefore,
        levelAfter,
        levelUp: levelAfter > levelBefore,
        profile,
      },
    };
  }

  getPendingAwards(playerId: string): MatchReward[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM matches
         WHERE player_id = ? AND reward_delivered = 0
         ORDER BY completed_at ASC`,
      )
      .all(playerId) as unknown as MatchRow[];
    const profile = this.getProfileById(playerId);
    if (!profile) return [];
    return rows.map((row) => {
      const xpBefore = Math.max(0, profile.xp - row.xp_earned);
      return {
        matchId: row.match_id,
        xpEarned: row.xp_earned,
        breakdown: [],
        levelBefore: progressForXp(xpBefore).level,
        levelAfter: progressForXp(Math.max(0, profile.xp - row.xp_earned + row.xp_earned)).level,
        levelUp:
          progressForXp(profile.xp).level > progressForXp(xpBefore).level,
        profile,
      };
    });
  }

  markAwardsDelivered(playerId: string): void {
    this.db
      .prepare("UPDATE matches SET reward_delivered = 1 WHERE player_id = ?")
      .run(playerId);
  }

  markAwardDelivered(playerId: string, matchId: string): void {
    this.db
      .prepare(
        "UPDATE matches SET reward_delivered = 1 WHERE player_id = ? AND match_id = ?",
      )
      .run(playerId, matchId);
  }

  health(): { ok: boolean; players: number; matches: number } {
    const players = this.db
      .prepare("SELECT COUNT(*) AS count FROM players")
      .get() as { count: number };
    const matches = this.db
      .prepare("SELECT COUNT(*) AS count FROM matches")
      .get() as { count: number };
    return { ok: true, players: players.count, matches: matches.count };
  }

  backup(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    this.db.prepare("VACUUM INTO ?").run(resolved);
  }

  close(): void {
    this.db.close();
  }

  private insertCosmetics(
    playerId: string,
    ids: readonly string[],
    now: number,
  ): void {
    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO cosmetics (player_id, cosmetic_id, unlocked_at)
       VALUES (?, ?, ?)`,
    );
    for (const id of ids) {
      statement.run(playerId, id, now);
    }
  }

  private toProfile(row: PlayerRow): PlayerProfile {
    const progress = progressForXp(row.xp);
    const equipped = parseEquipped(row.equipped_json);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO cosmetics (player_id, cosmetic_id, unlocked_at)
         SELECT ?, value, ? FROM json_each(?)`,
      )
      .run(row.id, Date.now(), JSON.stringify(unlockedIds(progress.level)));
    const recentRows = this.db
      .prepare(
        `SELECT * FROM matches WHERE player_id = ?
         ORDER BY completed_at DESC LIMIT 10`,
      )
      .all(row.id) as unknown as MatchRow[];
    const weaponRows = this.db
      .prepare(
        `SELECT * FROM weapon_stats WHERE player_id = ?
         ORDER BY shots DESC LIMIT 6`,
      )
      .all(row.id) as unknown as WeaponRow[];
    const recentMatches: PlayerRecentMatch[] = recentRows.map((match) => ({
      matchId: match.match_id,
      placement: match.placement,
      eliminations: match.eliminations,
      deaths: match.deaths,
      xpEarned: match.xp_earned,
      completedAt: match.completed_at,
      outcome: match.placement === 1 ? "win" : "loss",
    }));
    const weaponStats: PlayerWeaponStat[] = weaponRows.map((weapon) => ({
      weaponId: weapon.weapon_id,
      shots: weapon.shots,
      hits: weapon.hits,
      eliminations: weapon.eliminations,
    }));
    const safeEquipped = validateEquipped(equipped, progress.level);
    return {
      id: row.id,
      name: row.name,
      skinId: row.skin_id,
      xp: progress.totalXp,
      level: progress.level,
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      eliminations: row.eliminations,
      deaths: row.deaths,
      equipped: safeEquipped,
      unlocked: unlockedIds(progress.level).filter((id) =>
        isCosmeticUnlocked(id, progress.level),
      ),
      recentMatches,
      weaponStats,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
