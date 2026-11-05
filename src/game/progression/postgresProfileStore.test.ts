import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MatchRecordInput } from "./profile";
import { PostgresProfileStore } from "../../../server/persistence/PostgresProfileStore";

const testUrl = process.env.TEST_DATABASE_URL;

function matchInput(
  playerId: string,
  matchId: string,
  overrides: Partial<MatchRecordInput> = {},
): MatchRecordInput {
  return {
    matchId,
    playerId,
    placement: 1,
    eliminations: 5,
    deaths: 0,
    humanEliminations: 2,
    botEliminations: 3,
    participationMs: 90_000,
    inputsReceived: 400,
    completed: true,
    skinId: "viber-123",
    weaponShots: { "vibe-rifle": 100, "vibe-smg": 20 },
    weaponHits: { "vibe-rifle": 30, "vibe-smg": 8 },
    weaponEliminations: { "vibe-rifle": 4, "vibe-smg": 1 },
    ...overrides,
  };
}

describe.skipIf(!testUrl)("PostgresProfileStore", () => {
  let pool: Pool;
  let store: PostgresProfileStore;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: testUrl,
      max: 6,
      ssl: { rejectUnauthorized: false },
    });
    store = new PostgresProfileStore({
      connectionString: testUrl!,
      max: 6,
      xpRules: { minParticipationMs: 0, minInputs: 0 },
    });
    await store.connect();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE TABLE players CASCADE");
    await pool.query("TRUNCATE TABLE client_events");
  });

  afterAll(async () => {
    await store.close();
    await pool.end();
  });

  it("creates a guest, hashes the token and persists a profile", async () => {
    const guest = await store.createGuest("NEON-1", "viber-123");
    expect(guest.token.startsWith("vm_guest_")).toBe(true);
    expect(guest.player.name).toBe("NEON-1");
    expect(guest.player.level).toBe(1);
    expect(guest.player.unlocked).toContain("title-rookie");
    const loaded = await store.getProfileByToken(guest.token);
    expect(loaded?.id).toBe(guest.player.id);
    expect(loaded?.xp).toBe(0);
    expect(await store.getProfileByToken("wrong")).toBeNull();
  });

  it("awards XP once under concurrent duplicate match writes", async () => {
    const guest = await store.createGuest();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        store.recordMatch(matchInput(guest.player.id, "room:duplicate")),
      ),
    );
    expect(results.filter((entry) => entry && !entry.duplicate)).toHaveLength(1);
    const profile = await store.getProfileById(guest.player.id);
    expect(profile?.xp).toBe(90);
    expect(profile?.matchesPlayed).toBe(1);
    expect(profile?.recentMatches).toHaveLength(1);
  }, 30000);

  it("serializes concurrent distinct rewards without losing XP", async () => {
    const guest = await store.createGuest();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        store.recordMatch(matchInput(guest.player.id, `room:match-${index}`)),
      ),
    );
    expect(results.every((entry) => entry && !entry.duplicate)).toBe(true);
    const profile = await store.getProfileById(guest.player.id);
    expect(profile?.xp).toBe(90 * 6);
    expect(profile?.matchesPlayed).toBe(6);
    expect(profile?.wins).toBe(6);
    expect(profile?.recentMatches).toHaveLength(6);
    expect(profile?.weaponStats[0]?.weaponId).toBe("vibe-rifle");
  }, 30000);

  it("keeps reward delivery durable and idempotent", async () => {
    const guest = await store.createGuest();
    expect(await store.getPendingAwards(guest.player.id)).toHaveLength(0);
    await store.recordMatch(matchInput(guest.player.id, "room:delivery"));
    const pending = await store.getPendingAwards(guest.player.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.matchId).toBe("room:delivery");
    await store.markAwardDelivered(guest.player.id, "room:delivery");
    expect(await store.getPendingAwards(guest.player.id)).toHaveLength(0);
    await store.markAwardDelivered(guest.player.id, "room:delivery");
    expect(await store.getPendingAwards(guest.player.id)).toHaveLength(0);
  }, 20000);

  it("validates cosmetics and preserves profile fields", async () => {
    const guest = await store.createGuest("KEEP", "viber-006");
    const rejected = await store.setEquipped(guest.player.id, {
      badgeId: "badge-sector-icon",
    });
    expect(rejected?.equipped.badgeId).toBe("badge-lime-recruit");
    const accepted = await store.setEquipped(guest.player.id, {
      titleId: "title-rookie",
      badgeId: "badge-lime-recruit",
    });
    expect(accepted?.equipped.badgeId).toBe("badge-lime-recruit");
    await store.updateIdentity(guest.player.id, "RENAMED", "viber-031");
    const profile = await store.getProfileByToken(guest.token);
    expect(profile?.name).toBe("RENAMED");
    expect(profile?.skinId).toBe("viber-031");
  }, 20000);

  it("stores anonymous beta feedback without personal fields", async () => {
    await store.recordClientEvent({
      kind: "feedback",
      message: "neon-beta-feedback",
      route: "/online",
      appVersion: "p5-beta",
      guestId: null,
      rating: 5,
    });
    const rows = await pool.query<{
      kind: string;
      message: string;
      route: string;
      app_version: string;
      guest_id: string | null;
      rating: number | null;
    }>(
      "SELECT kind, message, route, app_version, guest_id, rating FROM client_events WHERE message = $1",
      ["neon-beta-feedback"],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.guest_id).toBeNull();
    expect(rows.rows[0]?.rating).toBe(5);
    expect(rows.rows[0]?.app_version).toBe("p5-beta");
    expect(rows.rows[0]?.route).toBe("/online");
  });

  it("reports health with the postgres backend", async () => {
    const health = (await store.health()) as {
      ok: boolean;
      backend: string;
      players: number;
      matches: number;
    };
    expect(health.ok).toBe(true);
    expect(health.backend).toBe("postgres");
    expect(typeof health.players).toBe("number");
    expect(typeof health.matches).toBe("number");
  });
});
