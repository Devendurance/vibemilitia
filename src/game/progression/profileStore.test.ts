import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileStore } from "../../../server/persistence/ProfileStore";
import type { MatchRecordInput } from "./profile";

const dirs: string[] = [];

function tempDb(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibe-militia-profile-"));
  dirs.push(dir);
  return path.join(dir, "profiles.sqlite");
}

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
    deaths: 1,
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

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ProfileStore", () => {
  it("creates an opaque guest token and rejects invalid tokens", () => {
    const store = new ProfileStore(":memory:");
    const guest = store.createGuest("VIBER-321", "viber-123");
    expect(guest.token.startsWith("vm_guest_")).toBe(true);
    expect(guest.player.name).toBe("VIBER-321");
    expect(guest.player.level).toBe(1);
    expect(store.getProfileByToken(guest.token)?.id).toBe(guest.player.id);
    expect(store.getProfileByToken("vm_guest_forged")).toBeNull();
    expect(store.getProfileByToken("wrong")).toBeNull();
    store.close();
  });

  it("awards server-side XP and records the match once", () => {
    const store = new ProfileStore(":memory:");
    const guest = store.createGuest();
    const first = store.recordMatch(matchInput(guest.player.id, "room:1"));
    expect(first?.duplicate).toBe(false);
    expect(first?.reward.xpEarned).toBe(30 + 20 + 15 + 25);
    expect(first?.reward.profile.xp).toBe(90);
    expect(first?.reward.profile.matchesPlayed).toBe(1);
    expect(first?.reward.profile.wins).toBe(1);
    expect(first?.reward.profile.recentMatches[0]?.matchId).toBe("room:1");
    expect(first?.reward.profile.weaponStats[0]?.weaponId).toBe("vibe-rifle");

    const duplicate = store.recordMatch(matchInput(guest.player.id, "room:1"));
    expect(duplicate?.duplicate).toBe(true);
    expect(duplicate?.reward.xpEarned).toBe(0);
    expect(store.getProfileById(guest.player.id)?.xp).toBe(90);
    expect(store.getProfileById(guest.player.id)?.matchesPlayed).toBe(1);
    store.close();
  });

  it("persists profile, level and recent matches across reopen", () => {
    const dbPath = tempDb();
    const store = new ProfileStore(dbPath);
    const guest = store.createGuest("PERSIST", "viber-006");
    store.recordMatch(matchInput(guest.player.id, "room:persist"));
    store.close();

    const reopened = new ProfileStore(dbPath);
    const profile = reopened.getProfileByToken(guest.token);
    expect(profile?.xp).toBe(90);
    expect(profile?.level).toBe(1);
    expect(profile?.recentMatches).toHaveLength(1);
    expect(profile?.skinId).toBe("viber-123");
    reopened.close();
  });

  it("levels up and unlocks cosmetics from total XP", () => {
    const store = new ProfileStore(":memory:", {
      minParticipationMs: 0,
      minInputs: 0,
    });
    const guest = store.createGuest();
    let profile = guest.player;
    for (let index = 0; index < 8; index += 1) {
      store.recordMatch(
        matchInput(profile.id, `room:level-${index}`, {
          placement: 1,
          humanEliminations: 5,
          botEliminations: 0,
        }),
      );
      profile = store.getProfileById(profile.id)!;
    }
    expect(profile.xp).toBeGreaterThanOrEqual(600);
    expect(profile.level).toBeGreaterThanOrEqual(4);
    expect(profile.unlocked).toContain("elimination-copper");
    expect(profile.unlocked).toContain("badge-copper-strike");
    store.close();
  });

  it("validates cosmetics against level and rejects locked gear", () => {
    const store = new ProfileStore(":memory:");
    const guest = store.createGuest();
    const rejected = store.setEquipped(guest.player.id, {
      badgeId: "badge-sector-icon",
    });
    expect(rejected?.equipped.badgeId).toBe("badge-lime-recruit");
    const accepted = store.setEquipped(guest.player.id, {
      badgeId: "badge-lime-recruit",
      titleId: "title-rookie",
    });
    expect(accepted?.equipped.badgeId).toBe("badge-lime-recruit");
    store.close();
  });

  it("records a zero-XP participation failure without blocking the match", () => {
    const store = new ProfileStore(":memory:");
    const guest = store.createGuest();
    const result = store.recordMatch(
      matchInput(guest.player.id, "room:short", {
        participationMs: 1_000,
        inputsReceived: 2,
      }),
    );
    expect(result?.reward.xpEarned).toBe(0);
    expect(result?.reward.profile.matchesPlayed).toBe(1);
    expect(result?.reward.profile.xp).toBe(0);
    store.close();
  });

  it("reports duplicate protection per player and per match", () => {
    const store = new ProfileStore(":memory:");
    const one = store.createGuest("ONE");
    const two = store.createGuest("TWO");
    store.recordMatch(matchInput(one.player.id, "room:shared"));
    const other = store.recordMatch(matchInput(two.player.id, "room:shared"));
    expect(other?.duplicate).toBe(false);
    expect(other?.reward.xpEarned).toBeGreaterThan(0);
    store.close();
  });
});
