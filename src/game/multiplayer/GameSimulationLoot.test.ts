import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import { GRENADE_CONFIG } from "@/game/core/grenades";
import { LOOT_CONFIG } from "@/game/core/loot";
import { VIBE_LANCE_PICKUP_RESPAWN_MS } from "@/game/core/pickups";
import { createWeaponState } from "@/game/core/weapon";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { endMatchForScore } from "@/game/core/match";
import type { OnlineInputPayload } from "@/game/multiplayer/protocol";
import { GameSimulation } from "./GameSimulation";

interface HumanLootView {
  kin: { x: number; y: number; vx: number; vy: number; grounded: boolean };
  alive: boolean;
  health: number;
  invulnerableRemainingMs: number;
  respawnRemainingMs: number;
  deaths: number;
  eliminations: number;
  weaponIds: (string | null)[];
  equippedIndex: number;
  weapons: Array<{
    ammo: number;
    cooldownMs: number;
    reloadRemainingMs: number;
    reloading: boolean;
  }>;
  medkits: number;
  grenades: { contact: number; frag: number; stinking: number };
  deathRecorded: boolean;
}

interface BotLootView {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  deathRecorded: boolean;
  deaths: number;
}

interface LootTestView {
  id: string;
  kind: "weapon" | "medkit" | "grenade";
  weaponId: string | null;
  ammo: number;
  grenadeType: string | null;
  active: boolean;
  x: number;
  y: number;
  eliminationId: number;
  expiresAtMs: number;
}

function createLiveSim(roomId = "loot-room"): GameSimulation {
  return new GameSimulation({
    roomId,
    roomName: "Loot Arena",
    botsEnabled: false,
    countdownMs: 0,
  });
}

function runTicks(sim: GameSimulation, count: number): void {
  for (let index = 0; index < count; index += 1) {
    sim.tick(1000 / 60);
  }
}

function humanView(sim: GameSimulation, id: string): HumanLootView {
  const humans = (
    sim as unknown as { humans: Map<string, HumanLootView> }
  ).humans;
  const human = humans.get(id);
  if (!human) throw new Error(`missing human ${id}`);
  return human;
}

function createBot(sim: GameSimulation): BotLootView {
  (sim as unknown as { createBot: () => void }).createBot();
  const bots = (sim as unknown as { bots: Map<string, BotLootView> }).bots;
  const bot = [...bots.values()].at(-1);
  if (!bot) throw new Error("missing bot");
  return bot;
}

function lootItems(sim: GameSimulation): LootTestView[] {
  return (
    sim as unknown as { loot: LootTestView[] }
  ).loot.filter((item) => item.active);
}

function input(
  seq: number,
  overrides: Partial<OnlineInputPayload> = {},
): OnlineInputPayload {
  return {
    seq,
    moveX: 0,
    jump: false,
    jumpHeld: false,
    fire: false,
    reload: false,
    weapon: null,
    aim: 0,
    ...overrides,
  };
}

function setLoadout(
  human: HumanLootView,
  weaponIds: (string | null)[],
  equippedIndex = 0,
): void {
  human.weaponIds = weaponIds;
  human.weapons = weaponIds.map((weaponId) => {
    const definition = PLAYER_WEAPONS.find((weapon) => weapon.id === weaponId);
    return definition
      ? createWeaponState(definition)
      : {
          ammo: 0,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          reloading: false,
        };
  });
  human.equippedIndex = equippedIndex;
}

function launchLoot(
  sim: GameSimulation,
  victimId: string,
  killerId: string,
  source: "bullet" | "grenade" | "toxic" = "bullet",
): void {
  const result = sim.debugEliminate(victimId, killerId, source);
  if (!result) throw new Error("debug elimination failed");
}

describe("P3C-A weapon inventory and elimination loot", () => {
  it("starts online humans with the starter loadout and an empty third slot", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const snapshot = sim.snapshot();
    const human = snapshot.participants[0];
    expect(human.weapons).toHaveLength(3);
    expect(human.weapons.map((weapon) => weapon.id)).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "",
    ]);
    expect(human.weapons.map((weapon) => weapon.owned)).toEqual([
      true,
      true,
      false,
    ]);
    expect(human.equippedSlot).toBe(0);
    expect(human.weaponId).toBe("vibe-rifle");
    expect(human.weapons[0].magazineSize).toBe(20);
    expect(human.weapons[2].ammo).toBe(0);
  });

  it("creates exactly one weapon, medkit and grenade from a hostile elimination", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const victim = humanView(sim, "two");
    setLoadout(victim, ["vibe-lance", "scatter-blaster", null], 0);
    victim.weapons[0].ammo = 3;
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("one", 1600, ARENA.groundY);
    sim.debugTeleport("two", 1610, ARENA.groundY);

    launchLoot(sim, "two", "one");
    const events = sim.drainEvents();
    const elimination = events.find((event) => event.type === "elimination");
    const loot = lootItems(sim);
    expect(loot).toHaveLength(3);
    expect(loot.map((item) => item.kind).sort()).toEqual([
      "grenade",
      "medkit",
      "weapon",
    ]);
    const weapon = loot.find((item) => item.kind === "weapon");
    expect(weapon).toMatchObject({
      weaponId: "vibe-lance",
      ammo: 3,
      eliminationId: 1,
    });
    expect(loot.every((item) => item.eliminationId === 1)).toBe(true);
    expect(elimination).toMatchObject({
      type: "elimination",
      eliminationId: 1,
      killerId: "one",
      victimId: "two",
    });
    if (elimination?.type === "elimination") {
      expect(elimination.lootIds.sort()).toEqual(
        loot.map((item) => item.id).sort(),
      );
    }
    expect(humanView(sim, "one").eliminations).toBe(1);
    expect(humanView(sim, "two").deaths).toBe(1);
    expect(sim.snapshot().feed[0].text).toContain("ONE eliminated TWO");
  });

  it("drops a bot's actual Vibe Rifle and produces the same three-item bundle", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const bot = createBot(sim);
    bot.invulnerableRemainingMs = 0;
    sim.debugTeleport("one", 1200, ARENA.groundY);
    sim.debugTeleport(bot.id, 1210, ARENA.groundY);
    launchLoot(sim, bot.id, "one", "grenade");
    const loot = lootItems(sim);
    expect(loot).toHaveLength(3);
    expect(loot.find((item) => item.kind === "weapon")?.weaponId).toBe(
      "vibe-rifle",
    );
    expect(humanView(sim, "one").eliminations).toBe(1);
    expect(bot.deaths).toBe(1);
  });

  it("self-elimination cannot farm reward bundles or kill credit", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const before = humanView(sim, "one").eliminations;
    launchLoot(sim, "one", "one", "grenade");
    expect(lootItems(sim)).toHaveLength(0);
    expect(humanView(sim, "one").deaths).toBe(1);
    expect(humanView(sim, "one").eliminations).toBe(before);
    const elimination = sim
      .drainEvents()
      .find((event) => event.type === "elimination");
    if (elimination?.type === "elimination") {
      expect(elimination.lootIds).toHaveLength(0);
      expect(elimination.killerId).toBe(elimination.victimId);
    }
  });

  it("ignores duplicate death events without creating duplicate loot", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    humanView(sim, "two").invulnerableRemainingMs = 0;
    launchLoot(sim, "two", "one");
    expect(lootItems(sim)).toHaveLength(3);
    expect(sim.debugEliminate("two", "one")).toBe(false);
    expect(lootItems(sim)).toHaveLength(3);
    expect(humanView(sim, "two").deaths).toBe(1);
    expect(humanView(sim, "one").eliminations).toBe(1);
  });

  it("collects a dropped weapon into an empty slot with authoritative ammo", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const victim = humanView(sim, "two");
    setLoadout(victim, ["vibe-lance", "scatter-blaster", null], 0);
    victim.weapons[0].ammo = 2;
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("one", 1800, ARENA.groundY - 40);
    sim.debugTeleport("two", 1800, ARENA.groundY - 40);
    launchLoot(sim, "two", "one");
    const weapon = lootItems(sim).find((item) => item.kind === "weapon");
    expect(weapon).toBeTruthy();
    const collector = humanView(sim, "one");
    collector.kin.x = weapon!.x;
    collector.kin.y = weapon!.y + 16;
    runTicks(sim, 1);
    expect(collector.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "vibe-lance",
    ]);
    expect(collector.equippedIndex).toBe(2);
    expect(collector.weapons[2].ammo).toBe(2);
    const snapshotWeapon = sim.snapshot().participants.find(
      (participant) => participant.id === "one",
    )?.weapons[2];
    expect(snapshotWeapon).toMatchObject({
      id: "vibe-lance",
      ammo: 2,
      magazineSize: 4,
      owned: true,
    });
  });

  it("leaves full-capacity supplies on the ground for other players", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const victim = humanView(sim, "two");
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("two", 900, ARENA.groundY);
    launchLoot(sim, "two", "one");
    const collector = humanView(sim, "one");
    collector.medkits = 2;
    collector.grenades = { contact: 3, frag: 0, stinking: 0 };
    const medkit = lootItems(sim).find((item) => item.kind === "medkit");
    expect(medkit).toBeTruthy();
    collector.kin.x = medkit!.x;
    collector.kin.y = medkit!.y + 16;
    runTicks(sim, 1);
    expect(collector.medkits).toBe(2);
    expect(collector.grenades.contact).toBe(3);
    expect(lootItems(sim)).toHaveLength(2);
    expect(lootItems(sim).map((item) => item.kind).sort()).toEqual([
      "grenade",
      "medkit",
    ]);
  });

  it("requires a deliberate E swap when all weapon slots are occupied", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const collector = humanView(sim, "one");
    setLoadout(
      collector,
      ["vibe-rifle", "scatter-blaster", "vibe-rifle"],
      0,
    );
    const victim = humanView(sim, "two");
    setLoadout(victim, ["vibe-lance", "scatter-blaster", null], 0);
    victim.weapons[0].ammo = 4;
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("one", 1200, ARENA.groundY);
    sim.debugTeleport("two", 1210, ARENA.groundY);
    launchLoot(sim, "two", "one");
    const lance = lootItems(sim).find((item) => item.kind === "weapon");
    expect(lance?.weaponId).toBe("vibe-lance");
    collector.kin.x = lance!.x;
    collector.kin.y = lance!.y + 16;
    runTicks(sim, 1);
    expect(collector.weaponIds[0]).toBe("vibe-rifle");
    expect(lootItems(sim).some((item) => item.kind === "weapon")).toBe(true);
    sim.applyInput("one", input(1, { swapWeapon: true }));
    runTicks(sim, 1);
    expect(collector.weaponIds[0]).toBe("vibe-lance");
    expect(collector.weapons[0].ammo).toBe(4);
    expect(collector.weaponIds.filter((id) => id === "vibe-rifle")).toEqual([
      "vibe-rifle",
    ]);
    expect(lootItems(sim).some((item) => item.kind === "weapon")).toBe(false);
    const swapped = sim
      .drainEvents()
      .find((event) => event.type === "weapon-swapped");
    expect(swapped).toMatchObject({
      type: "weapon-swapped",
      playerId: "one",
      slot: 0,
      fromWeaponId: "vibe-rifle",
      toWeaponId: "vibe-lance",
    });
  });

  it("refills a duplicate owned weapon without adding or replacing slots", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const collector = humanView(sim, "one");
    setLoadout(
      collector,
      ["vibe-rifle", "scatter-blaster", "vibe-rifle"],
      2,
    );
    collector.weapons[2].ammo = 1;
    const victim = humanView(sim, "two");
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("one", 1200, ARENA.groundY);
    sim.debugTeleport("two", 1210, ARENA.groundY);
    launchLoot(sim, "two", "one");
    const rifle = lootItems(sim).find((item) => item.kind === "weapon");
    expect(rifle?.weaponId).toBe("vibe-rifle");
    collector.kin.x = rifle!.x;
    collector.kin.y = rifle!.y + 16;
    runTicks(sim, 1);
    expect(collector.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "vibe-rifle",
    ]);
    expect(collector.weapons[2].ammo).toBe(20);
    expect(lootItems(sim).some((item) => item.kind === "weapon")).toBe(false);
  });

  it("rejects unowned slot selection and cannot fire an empty slot", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.applyInput("one", input(1, { weapon: 2 }));
    runTicks(sim, 1);
    expect(humanView(sim, "one").equippedIndex).toBe(0);
    expect(sim.snapshot().projectiles).toHaveLength(0);

    const human = humanView(sim, "one");
    setLoadout(human, [null, null, null], 0);
    sim.applyInput("one", input(2, { fire: true, weapon: 2 }));
    runTicks(sim, 4);
    expect(human.equippedIndex).toBe(0);
    expect(sim.snapshot().projectiles).toHaveLength(0);
    expect(human.weapons[0].ammo).toBe(0);
  });

  it("restores the configured starter loadout on death and respawn", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const human = humanView(sim, "one");
    setLoadout(human, ["vibe-lance", "vibe-rifle", "scatter-blaster"], 2);
    human.weapons[2].ammo = 1;
    human.medkits = 2;
    human.invulnerableRemainingMs = 0;
    launchLoot(sim, "one", "two");
    expect(human.alive).toBe(false);
    runTicks(sim, 180);
    expect(human.alive).toBe(true);
    expect(human.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      null,
    ]);
    expect(human.equippedIndex).toBe(0);
    expect(human.weapons[0].ammo).toBe(20);
    expect(human.medkits).toBe(0);
  });

  it("expires loot on server simulation time", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    humanView(sim, "two").invulnerableRemainingMs = 0;
    launchLoot(sim, "two", "one");
    expect(lootItems(sim)).toHaveLength(3);
    const ticks = Math.ceil(LOOT_CONFIG.lifetimeMs / (1000 / 60));
    runTicks(sim, ticks - 2);
    expect(lootItems(sim)).toHaveLength(3);
    runTicks(sim, 4);
    expect(lootItems(sim)).toHaveLength(0);
    expect(sim.snapshot().loot).toHaveLength(0);
  });

  it("shows remaining loot to a late joiner", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    humanView(sim, "two").invulnerableRemainingMs = 0;
    launchLoot(sim, "two", "one");
    const ids = lootItems(sim).map((item) => item.id).sort();
    sim.addHuman("late", "LATE");
    const snapshot = sim.snapshot();
    expect(snapshot.loot.map((item) => item.id).sort()).toEqual(ids);
    expect(snapshot.loot.every((item) => item.remainingMs > 0)).toBe(true);
  });

  it("awards one contested medkit to only one player", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    sim.addHuman("three", "THREE");
    humanView(sim, "three").invulnerableRemainingMs = 0;
    sim.debugTeleport("three", 1700, ARENA.groundY);
    launchLoot(sim, "three", "one");
    const medkit = lootItems(sim).find((item) => item.kind === "medkit");
    expect(medkit).toBeTruthy();
    for (const id of ["one", "two"]) {
      const human = humanView(sim, id);
      human.kin.x = medkit!.x;
      human.kin.y = medkit!.y + 16;
    }
    runTicks(sim, 2);
    const carriers = ["one", "two"].filter(
      (id) => humanView(sim, id).medkits === 1,
    );
    expect(carriers).toHaveLength(1);
    expect(lootItems(sim).some((item) => item.kind === "medkit")).toBe(false);
  });

  it("does not collect loot while dead or after the match ends", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    humanView(sim, "two").invulnerableRemainingMs = 0;
    sim.debugTeleport("two", 500, ARENA.groundY);
    launchLoot(sim, "two", "one");
    const medkit = lootItems(sim).find((item) => item.kind === "medkit");
    const human = humanView(sim, "one");
    human.alive = false;
    human.respawnRemainingMs = 5_000;
    human.kin.x = medkit!.x;
    human.kin.y = medkit!.y + 16;
    runTicks(sim, 1);
    expect(human.medkits).toBe(0);
    expect(lootItems(sim).some((item) => item.kind === "medkit")).toBe(true);

    human.alive = true;
    human.respawnRemainingMs = 0;
    (sim as unknown as { timer: unknown }).timer = endMatchForScore(
      (sim as unknown as { timer: Parameters<typeof endMatchForScore>[0] })
        .timer,
    );
    (sim as unknown as { finishMatch: (reason: string) => void }).finishMatch(
      "score",
    );
    expect(sim.phase).toBe("ended");
    expect(sim.snapshot().loot).toHaveLength(0);
  });

  it("collects an authored Vibe Lance world pickup and respawns it later", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const pickup = sim
      .snapshot()
      .pickups.find((candidate) => candidate.type === "vibe-lance");
    expect(pickup).toBeTruthy();
    const human = humanView(sim, "one");
    human.kin.x = pickup!.x;
    human.kin.y = pickup!.y + 16;
    runTicks(sim, 1);
    expect(human.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "vibe-lance",
    ]);
    expect(human.equippedIndex).toBe(2);
    const after = sim.snapshot().pickups.find(
      (candidate) => candidate.id === pickup!.id,
    );
    expect(after?.active).toBe(false);
    expect(after?.respawnIn).toBeCloseTo(
      VIBE_LANCE_PICKUP_RESPAWN_MS / 1000,
      0,
    );
  });

  it("uses a deliberate swap for a full-loadout Vibe Lance pickup", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const pickup = sim
      .snapshot()
      .pickups.find((candidate) => candidate.type === "vibe-lance");
    expect(pickup).toBeTruthy();
    const human = humanView(sim, "one");
    setLoadout(
      human,
      ["vibe-rifle", "scatter-blaster", "vibe-rifle"],
      1,
    );
    human.kin.x = pickup!.x;
    human.kin.y = pickup!.y + 16;
    runTicks(sim, 1);
    expect(human.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      "vibe-rifle",
    ]);
    expect(
      sim.snapshot().pickups.find((candidate) => candidate.id === pickup!.id)
        ?.active,
    ).toBe(true);
    sim.applyInput("one", input(1, { swapWeapon: true }));
    runTicks(sim, 1);
    expect(human.weaponIds).toEqual([
      "vibe-rifle",
      "vibe-lance",
      "vibe-rifle",
    ]);
    expect(human.equippedIndex).toBe(1);
    const swappedPickup = sim
      .snapshot()
      .pickups.find((candidate) => candidate.id === pickup!.id);
    expect(swappedPickup?.active).toBe(false);
    expect(swappedPickup?.respawnIn).toBeGreaterThan(20);
  });

  it("keeps dynamic loot independent between concurrent rooms", () => {
    const roomA = createLiveSim("room-a");
    const roomB = createLiveSim("room-b");
    for (const sim of [roomA, roomB]) {
      sim.addHuman("one", "ONE");
      sim.addHuman("two", "TWO");
      humanView(sim, "two").invulnerableRemainingMs = 0;
    }
    launchLoot(roomA, "two", "one");
    expect(roomA.snapshot().loot).toHaveLength(3);
    expect(roomB.snapshot().loot).toHaveLength(0);
    launchLoot(roomB, "two", "one", "toxic");
    expect(roomA.snapshot().loot.every((item) => item.eliminationId === 1)).toBe(
      true,
    );
    expect(roomB.snapshot().loot.every((item) => item.eliminationId === 1)).toBe(
      true,
    );
  });

  it("clears loot and restores loadouts on rematch", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const human = humanView(sim, "one");
    setLoadout(human, ["vibe-lance", "vibe-rifle", "scatter-blaster"], 0);
    humanView(sim, "two").invulnerableRemainingMs = 0;
    launchLoot(sim, "two", "one");
    expect(sim.snapshot().loot).toHaveLength(3);
    (sim as unknown as { timer: unknown }).timer = endMatchForScore(
      (sim as unknown as { timer: Parameters<typeof endMatchForScore>[0] })
        .timer,
    );
    (sim as unknown as { finishMatch: (reason: string) => void }).finishMatch(
      "score",
    );
    const result = sim.rematch();
    expect(result.ok).toBe(true);
    expect(sim.snapshot().loot).toHaveLength(0);
    expect(human.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      null,
    ]);
    expect(human.equippedIndex).toBe(0);
  });

  it("preserves grenade configuration and the authored lance pickup count", () => {
    const sim = createLiveSim();
    sim.addHuman("one", "ONE");
    const pickups = sim.snapshot().pickups;
    expect(pickups.filter((pickup) => pickup.type === "vibe-lance")).toHaveLength(
      2,
    );
    expect(
      pickups.filter((pickup) => pickup.type === "vibe-lance").every(
        (pickup) => pickup.active,
      ),
    ).toBe(true);
    expect(GRENADE_CONFIG.contact.maxDamage).toBe(180);
    expect(GRENADE_CONFIG.frag.fuseMs).toBe(5_000);
    expect(GRENADE_CONFIG.stinking.maxLifetimeMs).toBeGreaterThan(0);
  });
});
