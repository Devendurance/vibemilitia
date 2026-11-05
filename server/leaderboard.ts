import { progressForXp } from "../src/game/progression/progression";
import type { LeaderboardResult } from "../src/game/progression/profile";
import type { LeaderboardRow } from "./persistence/repository";

/**
 * Builds the public leaderboard from server-owned match records only. Browser
 * values are never accepted. Rows are already filtered to players who opted in
 * and completed at least one online match.
 */
export function buildLeaderboard(
  rows: readonly LeaderboardRow[],
  generatedAt = Date.now(),
): LeaderboardResult {
  return {
    period: "all-time",
    metric: "xp",
    generatedAt,
    entries: rows.map((row, index) => {
      const progress = progressForXp(row.xp);
      const deaths = Number(row.deaths) || 0;
      const eliminations = Number(row.eliminations) || 0;
      return {
        rank: index + 1,
        name: row.name,
        level: progress.level,
        xp: progress.totalXp,
        wins: Number(row.wins) || 0,
        losses: Number(row.losses) || 0,
        eliminations,
        deaths,
        kd:
          deaths > 0
            ? Math.round((eliminations / deaths) * 100) / 100
            : eliminations,
        matchesPlayed: Number(row.matches_played) || 0,
        xHandle: row.x_public ? row.x_handle : null,
        xVerified: false as const,
      };
    }),
  };
}
