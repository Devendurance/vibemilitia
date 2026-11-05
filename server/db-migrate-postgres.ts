import "./loadEnv";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { PostgresProfileStore } from "./persistence/PostgresProfileStore";

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

interface WeaponRow {
  player_id: string;
  weapon_id: string;
  shots: number;
  hits: number;
  eliminations: number;
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
  participation_ms: number;
  inputs_received: number;
  reward_delivered: number;
  completed_at: number;
}

interface CosmeticRow {
  player_id: string;
  cosmetic_id: string;
  unlocked_at: number;
}

const apply = process.argv.includes("--apply");
const sourceArg = process.argv.find((value) => value.startsWith("--from="));
const sourcePath = path.resolve(
  sourceArg?.slice("--from=".length) ||
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "vibe-militia.sqlite"),
);
const targetUrl = process.env.DATABASE_URL;

if (!existsSync(sourcePath)) {
  console.error(`SQLite source not found: ${sourcePath}`);
  process.exit(1);
}
if (!targetUrl) {
  console.error("DATABASE_URL is required for the PostgreSQL target.");
  process.exit(1);
}

const source = new DatabaseSync(sourcePath, { readOnly: true });
const target = new Pool({
  connectionString: targetUrl,
  max: 4,
  ssl: { rejectUnauthorized: false },
});

async function countTarget(): Promise<Record<string, number>> {
  const result = await target.query<{
    players: string;
    weapons: string;
    matches: string;
    cosmetics: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM players)::text AS players,
      (SELECT COUNT(*) FROM weapon_stats)::text AS weapons,
      (SELECT COUNT(*) FROM matches)::text AS matches,
      (SELECT COUNT(*) FROM cosmetics)::text AS cosmetics
  `);
  const row = result.rows[0];
  return {
    players: Number(row?.players ?? 0),
    weapons: Number(row?.weapons ?? 0),
    matches: Number(row?.matches ?? 0),
    cosmetics: Number(row?.cosmetics ?? 0),
  };
}

async function main(): Promise<void> {
  const players = source
    .prepare("SELECT * FROM players")
    .all() as unknown as PlayerRow[];
  const weapons = source
    .prepare("SELECT * FROM weapon_stats")
    .all() as unknown as WeaponRow[];
  const matches = source
    .prepare("SELECT * FROM matches")
    .all() as unknown as MatchRow[];
  const cosmetics = source
    .prepare("SELECT * FROM cosmetics")
    .all() as unknown as CosmeticRow[];

  const sourceCounts = {
    players: players.length,
    weapons: weapons.length,
    matches: matches.length,
    cosmetics: cosmetics.length,
  };
  console.log("SQLite source", sourceCounts, sourcePath);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to migrate into PostgreSQL.");
    return;
  }

  const postgres = new PostgresProfileStore({
    connectionString: targetUrl!,
    max: 4,
    ssl: true,
  });
  await postgres.connect();
  try {
    const before = await countTarget();
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      for (const row of players) {
        await client.query(
          `INSERT INTO players
            (id, token_hash, name, skin_id, xp, matches_played, wins, losses,
             eliminations, deaths, equipped_json, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            row.token_hash,
            row.name,
            row.skin_id,
            row.xp,
            row.matches_played,
            row.wins,
            row.losses,
            row.eliminations,
            row.deaths,
            row.equipped_json,
            row.created_at,
            row.updated_at,
          ],
        );
      }
      for (const row of weapons) {
        await client.query(
          `INSERT INTO weapon_stats
            (player_id, weapon_id, shots, hits, eliminations)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (player_id, weapon_id) DO UPDATE SET
             shots = GREATEST(weapon_stats.shots, EXCLUDED.shots),
             hits = GREATEST(weapon_stats.hits, EXCLUDED.hits),
             eliminations = GREATEST(weapon_stats.eliminations, EXCLUDED.eliminations)`,
          [
            row.player_id,
            row.weapon_id,
            row.shots,
            row.hits,
            row.eliminations,
          ],
        );
      }
      for (const row of matches) {
        await client.query(
          `INSERT INTO matches
            (match_id, player_id, placement, eliminations, deaths, xp_earned,
             completion_xp, human_elimination_xp, bot_elimination_xp,
             placement_xp, participation_ms, inputs_received, reward_delivered,
             completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (match_id, player_id) DO NOTHING`,
          [
            row.match_id,
            row.player_id,
            row.placement,
            row.eliminations,
            row.deaths,
            row.xp_earned,
            row.completion_xp,
            row.human_elimination_xp,
            row.bot_elimination_xp,
            row.placement_xp,
            row.participation_ms,
            row.inputs_received,
            Boolean(row.reward_delivered),
            row.completed_at,
          ],
        );
      }
      for (const row of cosmetics) {
        await client.query(
          `INSERT INTO cosmetics (player_id, cosmetic_id, unlocked_at)
           VALUES ($1,$2,$3)
           ON CONFLICT (player_id, cosmetic_id) DO NOTHING`,
          [row.player_id, row.cosmetic_id, row.unlocked_at],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const after = await countTarget();
    const delta = {
      players: after.players - before.players,
      weapons: after.weapons - before.weapons,
      matches: after.matches - before.matches,
      cosmetics: after.cosmetics - before.cosmetics,
    };
    console.log("PostgreSQL target", { before, after, delta });
    const valid =
      after.players >= sourceCounts.players &&
      after.weapons >= sourceCounts.weapons &&
      after.matches >= sourceCounts.matches &&
      after.cosmetics >= sourceCounts.cosmetics;
    if (!valid) {
      throw new Error("Migration validation failed: target counts are short.");
    }
    console.log("Migration validated. SQLite source was not modified.");
  } finally {
    await postgres.close();
  }
}

void main()
  .catch((error) => {
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(() => {
    source.close();
    void target.end();
  });
