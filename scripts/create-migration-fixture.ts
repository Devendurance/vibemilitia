import { rmSync } from "node:fs";
import { ProfileStore } from "../server/persistence/ProfileStore";

// Creates a deterministic SQLite fixture for validating the PostgreSQL
// migration path without touching the production SQLite database.
const path = "data/p5-migration-fixture.sqlite";
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${path}${suffix}`, { force: true });
}
const store = new ProfileStore(path, { minParticipationMs: 0, minInputs: 0 });
const one = store.createGuest("MIGRATE-A", "viber-123");
const two = store.createGuest("MIGRATE-B", "viber-006");
store.recordMatch({
  matchId: "migration-room:1",
  playerId: one.player.id,
  placement: 1,
  eliminations: 4,
  deaths: 1,
  humanEliminations: 1,
  botEliminations: 3,
  participationMs: 90_000,
  inputsReceived: 400,
  completed: true,
  skinId: "viber-123",
  weaponShots: { "vibe-rifle": 80 },
  weaponHits: { "vibe-rifle": 20 },
  weaponEliminations: { "vibe-rifle": 4 },
});
const profile = store.getProfileById(one.player.id);
console.log(
  JSON.stringify({
    path,
    players: [one.player.id, two.player.id],
    matches: 1,
    migratedPlayer: profile?.id,
    xp: profile?.xp,
  }),
);
store.close();
