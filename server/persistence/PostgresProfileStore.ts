import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  DEFAULT_EQUIPPED,
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
import {
  TOKEN_PREFIX,
  hashToken,
  parseEquipped,
  safeName,
} from "./codec";
import type {
  ClientEventInput,
  LeaderboardRow,
  LeaderboardSettings,
  ProfileHealth,
  ProfileRepository,
} from "./repository";

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
  equipped_json: EquippedCosmetics | string;
  x_handle: string | null;
  x_public: boolean;
  leaderboard_visible: boolean;
  created_at: string | number;
  updated_at: string | number;
}

interface MatchRow {
  match_id: string;
  player_id: string;
  placement: number;
  eliminations: number;
  deaths: number;
  xp_earned: number;
  completion_xp: number;
  human_elimination_xp: number;
  bot_elimination_xp: number;
  placement_xp: number;
  completed_at: string | number;
  reward_delivered: boolean;
}

interface WeaponRow {
  weapon_id: string;
  shots: number;
  hits: number;
  eliminations: number;
}

export interface PostgresProfileOptions {
  connectionString: string;
  max?: number;
  ssl?: boolean;
  xpRules?: Partial<XpRules>;
}

export class PostgresProfileStore implements ProfileRepository {
  readonly backend = "postgres" as const;
  private readonly pool: Pool;
  private readonly xpRules: Partial<XpRules>;

  constructor(options: PostgresProfileOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.max ?? 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: false,
      ...(options.ssl === false
        ? {}
        : {
            ssl: {
              rejectUnauthorized: false,
            },
          }),
    });
    this.pool.on("error", (error) => {
      console.error(
        JSON.stringify({
          at: new Date().toISOString(),
          level: "error",
          service: "vibe-militia-server",
          message: "postgres.pool_error",
          error: error.message,
        }),
      );
    });
    this.xpRules = options.xpRules ?? {};
  }

  async connect(): Promise<void> {
    await this.pool.query("SELECT 1");
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at BIGINT NOT NULL
        )
      `);
      const current = await client.query<{ version: number | null }>(
        "SELECT MAX(version) AS version FROM schema_migrations",
      );
      const version = current.rows[0]?.version ?? 0;
      if (version < 1) {
        const statements = [
          `CREATE TABLE IF NOT EXISTS players (
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
            equipped_json JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS weapon_stats (
            player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            weapon_id TEXT NOT NULL,
            shots INTEGER NOT NULL DEFAULT 0,
            hits INTEGER NOT NULL DEFAULT 0,
            eliminations INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (player_id, weapon_id)
          )`,
          `CREATE TABLE IF NOT EXISTS matches (
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
            reward_delivered BOOLEAN NOT NULL DEFAULT FALSE,
            completed_at BIGINT NOT NULL,
            PRIMARY KEY (match_id, player_id)
          )`,
          `CREATE INDEX IF NOT EXISTS idx_matches_player
            ON matches (player_id, completed_at DESC)`,
          `CREATE TABLE IF NOT EXISTS cosmetics (
            player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            cosmetic_id TEXT NOT NULL,
            unlocked_at BIGINT NOT NULL,
            PRIMARY KEY (player_id, cosmetic_id)
          )`,
        ];
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO schema_migrations (version, applied_at)
           VALUES (1, $1)
           ON CONFLICT (version) DO NOTHING`,
          [Date.now()],
        );
      }
      if (version < 2) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS client_events (
            id BIGSERIAL PRIMARY KEY,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            route TEXT NOT NULL,
            app_version TEXT NOT NULL,
            guest_id TEXT,
            rating INTEGER,
            created_at BIGINT NOT NULL
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_client_events_created
            ON client_events (created_at DESC)
        `);
        await client.query(
          `INSERT INTO schema_migrations (version, applied_at)
           VALUES (2, $1)
           ON CONFLICT (version) DO NOTHING`,
          [Date.now()],
        );
      }
      if (version < 3) {
        await client.query(
          "ALTER TABLE players ADD COLUMN IF NOT EXISTS x_handle TEXT",
        );
        await client.query(
          "ALTER TABLE players ADD COLUMN IF NOT EXISTS x_public BOOLEAN NOT NULL DEFAULT FALSE",
        );
        await client.query(
          "ALTER TABLE players ADD COLUMN IF NOT EXISTS leaderboard_visible BOOLEAN NOT NULL DEFAULT TRUE",
        );
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_players_leaderboard
            ON players (leaderboard_visible, xp DESC, wins DESC)
        `);
        await client.query(
          `INSERT INTO schema_migrations (version, applied_at)
           VALUES (3, $1)
           ON CONFLICT (version) DO NOTHING`,
          [Date.now()],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createGuest(name = "VIBER-GUEST", skinId = "viber-010"): Promise<GuestSession> {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const now = Date.now();
    const id = `pl_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const equipped = { ...DEFAULT_EQUIPPED };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO players
          (id, token_hash, name, skin_id, xp, matches_played, wins, losses,
           eliminations, deaths, equipped_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0, $5, $6, $6)`,
        [
          id,
          hashToken(token),
          safeName(name),
          skinId,
          JSON.stringify(equipped),
          now,
        ],
      );
      await this.insertCosmetics(client, id, unlockedIds(1), now);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return {
      token,
      player: (await this.getProfileById(id))!,
      pendingAwards: [],
    };
  }

  async getProfileByToken(token: string): Promise<PlayerProfile | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const result = await this.pool.query<PlayerRow>(
      "SELECT * FROM players WHERE token_hash = $1",
      [hashToken(token)],
    );
    return result.rows[0] ? this.toProfile(result.rows[0]) : null;
  }

  async getProfileById(id: string): Promise<PlayerProfile | null> {
    const result = await this.pool.query<PlayerRow>(
      "SELECT * FROM players WHERE id = $1",
      [id],
    );
    return result.rows[0] ? this.toProfile(result.rows[0]) : null;
  }

  async updateIdentity(
    playerId: string,
    name: string,
    skinId: string,
  ): Promise<PlayerProfile | null> {
    await this.pool.query(
      "UPDATE players SET name = $1, skin_id = $2, updated_at = $3 WHERE id = $4",
      [safeName(name), skinId, Date.now(), playerId],
    );
    return this.getProfileById(playerId);
  }

  async updateLeaderboardSettings(
    playerId: string,
    input: Partial<LeaderboardSettings>,
  ): Promise<PlayerProfile | null> {
    const current = await this.getProfileById(playerId);
    if (!current) return null;
    await this.pool.query(
      `UPDATE players
       SET x_handle = $1, x_public = $2, leaderboard_visible = $3, updated_at = $4
       WHERE id = $5`,
      [
        input.xHandle === undefined ? current.xHandle : input.xHandle,
        input.xPublic === undefined ? current.xPublic : Boolean(input.xPublic),
        input.leaderboardVisible === undefined
          ? current.leaderboardVisible
          : Boolean(input.leaderboardVisible),
        Date.now(),
        playerId,
      ],
    );
    return this.getProfileById(playerId);
  }

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await this.pool.query<LeaderboardRow>(
      `SELECT id, name, xp, wins, losses, eliminations, deaths,
              matches_played, x_handle, x_public
       FROM players
       WHERE leaderboard_visible = TRUE AND matches_played > 0
       ORDER BY xp DESC, wins DESC, eliminations DESC, created_at ASC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows;
  }

  async setEquipped(
    playerId: string,
    requested: Partial<EquippedCosmetics>,
  ): Promise<PlayerProfile | null> {
    const profile = await this.getProfileById(playerId);
    if (!profile) return null;
    const equipped = validateEquipped(requested, profile.level);
    await this.pool.query(
      "UPDATE players SET equipped_json = $1, updated_at = $2 WHERE id = $3",
      [JSON.stringify(equipped), Date.now(), playerId],
    );
    return this.getProfileById(playerId);
  }

  async recordMatch(input: MatchRecordInput): Promise<MatchRecordResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const playerResult = await client.query<PlayerRow>(
        "SELECT * FROM players WHERE id = $1 FOR UPDATE",
        [input.playerId],
      );
      const player = playerResult.rows[0];
      if (!player) {
        await client.query("ROLLBACK");
        return null;
      }
      const existing = await client.query<MatchRow>(
        "SELECT * FROM matches WHERE match_id = $1 AND player_id = $2",
        [input.matchId, input.playerId],
      );
      if (existing.rows[0]) {
        const profile = await this.toProfileWithClient(client, player);
        await client.query("COMMIT");
        return {
          duplicate: true,
          reward: {
            matchId: input.matchId,
            xpEarned: 0,
            breakdown: [],
            levelBefore: profile.level,
            levelAfter: profile.level,
            levelUp: false,
            profile,
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
      const currentProgress = progressForXp(player.xp);
      const levelBefore = currentProgress.level;
      const nextXp = currentProgress.totalXp + xpResult.total;
      const levelAfter = progressForXp(nextXp).level;
      const win = input.placement === 1 ? 1 : 0;
      const now = Date.now();

      await client.query(
        `UPDATE players SET
          xp = $1,
          matches_played = matches_played + 1,
          wins = wins + $2,
          losses = losses + $3,
          eliminations = eliminations + $4,
          deaths = deaths + $5,
          skin_id = $6,
          updated_at = $7
         WHERE id = $8`,
        [
          nextXp,
          win,
          1 - win,
          Math.max(0, input.eliminations),
          Math.max(0, input.deaths),
          input.skinId,
          now,
          input.playerId,
        ],
      );

      const weaponIds = new Set([
        ...Object.keys(input.weaponShots),
        ...Object.keys(input.weaponHits),
        ...Object.keys(input.weaponEliminations),
      ]);
      for (const weaponId of weaponIds) {
        await client.query(
          `INSERT INTO weapon_stats (player_id, weapon_id, shots, hits, eliminations)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (player_id, weapon_id) DO UPDATE SET
             shots = weapon_stats.shots + EXCLUDED.shots,
             hits = weapon_stats.hits + EXCLUDED.hits,
             eliminations = weapon_stats.eliminations + EXCLUDED.eliminations`,
          [
            input.playerId,
            weaponId,
            Math.max(0, Math.floor(input.weaponShots[weaponId] ?? 0)),
            Math.max(0, Math.floor(input.weaponHits[weaponId] ?? 0)),
            Math.max(0, Math.floor(input.weaponEliminations[weaponId] ?? 0)),
          ],
        );
      }

      await client.query(
        `INSERT INTO matches
          (match_id, player_id, placement, eliminations, deaths, xp_earned,
           completion_xp, human_elimination_xp, bot_elimination_xp,
           placement_xp, participation_ms, inputs_received, reward_delivered,
           completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, $13)`,
        [
          input.matchId,
          input.playerId,
          Math.max(1, Math.floor(input.placement)),
          Math.max(0, input.eliminations),
          Math.max(0, input.deaths),
          xpResult.total,
          xpResult.breakdown.find((line) => line.id === "completion")?.xp ?? 0,
          xpResult.breakdown.find((line) => line.id === "human-eliminations")
            ?.xp ?? 0,
          xpResult.breakdown.find((line) => line.id === "bot-eliminations")?.xp ??
            0,
          xpResult.breakdown.find((line) => line.id === "placement")?.xp ?? 0,
          Math.max(0, Math.floor(input.participationMs)),
          Math.max(0, Math.floor(input.inputsReceived)),
          now,
        ],
      );
      if (levelAfter > levelBefore) {
        await this.insertCosmetics(
          client,
          input.playerId,
          unlockedIds(levelAfter),
          now,
        );
      }
      const updatedPlayer = await client.query<PlayerRow>(
        "SELECT * FROM players WHERE id = $1",
        [input.playerId],
      );
      const profile = await this.toProfileWithClient(
        client,
        updatedPlayer.rows[0]!,
      );
      await client.query("COMMIT");
      return {
        duplicate: false,
        reward: {
          matchId: input.matchId,
          xpEarned: xpResult.total,
          breakdown: xpResult.breakdown,
          levelBefore,
          levelAfter,
          levelUp: levelAfter > levelBefore,
          profile,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingAwards(playerId: string): Promise<MatchReward[]> {
    const rows = await this.pool.query<MatchRow>(
      `SELECT * FROM matches
       WHERE player_id = $1 AND reward_delivered = FALSE
       ORDER BY completed_at ASC`,
      [playerId],
    );
    const profile = await this.getProfileById(playerId);
    if (!profile) return [];
    return rows.rows.map((row) => {
      const xpBefore = Math.max(0, profile.xp - row.xp_earned);
      return {
        matchId: row.match_id,
        xpEarned: row.xp_earned,
        breakdown: [
          { id: "completion" as const, label: "Match completed", xp: row.completion_xp },
          {
            id: "human-eliminations" as const,
            label: "Human eliminations",
            xp: row.human_elimination_xp,
          },
          {
            id: "bot-eliminations" as const,
            label: "Bot eliminations",
            xp: row.bot_elimination_xp,
          },
          {
            id: "placement" as const,
            label: `Placement #${row.placement}`,
            xp: row.placement_xp,
          },
        ].filter((line) => line.xp > 0),
        levelBefore: progressForXp(xpBefore).level,
        levelAfter: progressForXp(profile.xp).level,
        levelUp: progressForXp(profile.xp).level > progressForXp(xpBefore).level,
        profile,
      };
    });
  }

  async markAwardsDelivered(playerId: string): Promise<void> {
    await this.pool.query(
      "UPDATE matches SET reward_delivered = TRUE WHERE player_id = $1",
      [playerId],
    );
  }

  async markAwardDelivered(playerId: string, matchId: string): Promise<void> {
    await this.pool.query(
      "UPDATE matches SET reward_delivered = TRUE WHERE player_id = $1 AND match_id = $2",
      [playerId, matchId],
    );
  }

  async recordClientEvent(input: ClientEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO client_events
        (kind, message, route, app_version, guest_id, rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.kind,
        input.message.slice(0, 600),
        input.route.slice(0, 200),
        input.appVersion.slice(0, 60),
        input.guestId,
        input.rating,
        Date.now(),
      ],
    );
  }

  async health(): Promise<ProfileHealth> {
    const [players, matches] = await Promise.all([
      this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM players"),
      this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM matches"),
    ]);
    return {
      ok: true,
      backend: this.backend,
      players: Number(players.rows[0]?.count ?? 0),
      matches: Number(matches.rows[0]?.count ?? 0),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async insertCosmetics(
    client: PoolClient,
    playerId: string,
    ids: readonly string[],
    now: number,
  ): Promise<void> {
    for (const id of ids) {
      await client.query(
        `INSERT INTO cosmetics (player_id, cosmetic_id, unlocked_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, cosmetic_id) DO NOTHING`,
        [playerId, id, now],
      );
    }
  }

  private async toProfile(row: PlayerRow): Promise<PlayerProfile> {
    const [recentRows, weaponRows] = await Promise.all([
      this.pool.query<MatchRow>(
        `SELECT * FROM matches WHERE player_id = $1
         ORDER BY completed_at DESC LIMIT 10`,
        [row.id],
      ),
      this.pool.query<WeaponRow>(
        `SELECT * FROM weapon_stats WHERE player_id = $1
         ORDER BY shots DESC LIMIT 6`,
        [row.id],
      ),
    ]);
    return this.buildProfile(row, recentRows.rows, weaponRows.rows);
  }

  private async toProfileWithClient(
    client: PoolClient,
    row: PlayerRow,
  ): Promise<PlayerProfile> {
    const recentRows = await client.query<MatchRow>(
      `SELECT * FROM matches WHERE player_id = $1
       ORDER BY completed_at DESC LIMIT 10`,
      [row.id],
    );
    const weaponRows = await client.query<WeaponRow>(
      `SELECT * FROM weapon_stats WHERE player_id = $1
       ORDER BY shots DESC LIMIT 6`,
      [row.id],
    );
    return this.buildProfile(row, recentRows.rows, weaponRows.rows);
  }

  private buildProfile(
    row: PlayerRow,
    recentRows: MatchRow[],
    weaponRows: WeaponRow[],
  ): PlayerProfile {
    const progress = progressForXp(row.xp);
    const equipped =
      typeof row.equipped_json === "string"
        ? parseEquipped(row.equipped_json)
        : validateEquipped(row.equipped_json, progress.level);
    const recentMatches: PlayerRecentMatch[] = recentRows.map((match) => ({
      matchId: match.match_id,
      placement: match.placement,
      eliminations: match.eliminations,
      deaths: match.deaths,
      xpEarned: match.xp_earned,
      completedAt: Number(match.completed_at),
      outcome: match.placement === 1 ? "win" : "loss",
    }));
    const weaponStats: PlayerWeaponStat[] = weaponRows.map((weapon) => ({
      weaponId: weapon.weapon_id,
      shots: weapon.shots,
      hits: weapon.hits,
      eliminations: weapon.eliminations,
    }));
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
      equipped: validateEquipped(equipped, progress.level),
      unlocked: unlockedIds(progress.level),
      recentMatches,
      weaponStats,
      xHandle: row.x_handle ?? null,
      xPublic: Boolean(row.x_public),
      leaderboardVisible:
        row.leaderboard_visible === undefined
          ? true
          : Boolean(row.leaderboard_visible),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
