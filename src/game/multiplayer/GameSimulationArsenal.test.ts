import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import { PROJECTILE_CONFIG } from "@/game/config/gameplay";
import { createWeaponState } from "@/game/core/weapon";
import { ALL_PLAYER_WEAPONS } from "@/game/config/gameplay";
import type { OnlineInputPayload } from "@/game/multiplayer/protocol";
import { GameSimulation } from "./GameSimulation";

interface HumanView {
  kin: { x: number; y: number; vx: number; vy: number; grounded: boolean };
  health: number;
  maxHealth: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  respawnRemainingMs: number;
  weaponIds: (string | null)[];
  equippedIndex: number;
  akimboBarrel: 0 | 1;
  weapons: Array<{
    ammo: number;
    cooldownMs: number;
    reloadRemainingMs: number;
    reloading: boolean;
  }>;
  grenades: { contact: number; frag: number; stinking: number };
}

interface BotView {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  invulnerableRemainingMs: number;
  weaponId: string;
  weaponState: {
    ammo: number;
    cooldownMs: number;
    reloadRemainingMs: number;
    reloading: boolean;
  };
  weaponCuriosity: boolean;
  akimboBarrel: 0 | 1;
  aimAngle: number;
}

interface LootView {
  id: string;
  weaponId: string | null;
  ammo: number;
  active: boolean;
}

function createSim(): GameSimulation {
  return new GameSimulation({
    roomId: "arsenal-room",
    roomName: "Arsenal",
    botsEnabled: false,
    countdownMs: 0,
  });
}

function human(sim: GameSimulation, id: string): HumanView {
  const humans = (sim as unknown as { humans: Map<string, HumanView> }).humans;
  const value = humans.get(id);
  if (!value) throw new Error(`missing human ${id}`);
  return value;
}

function createBot(sim: GameSimulation): BotView {
  (sim as unknown as { createBot: () => void }).createBot();
  const bots = (sim as unknown as { bots: Map<string, BotView> }).bots;
  const bot = [...bots.values()].at(-1);
  if (!bot) throw new Error("missing bot");
  return bot;
}

function runTicks(sim: GameSimulation, count: number): void {
  for (let index = 0; index < count; index += 1) sim.tick(1000 / 60);
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
  value: HumanView,
  weaponIds: (string | null)[],
  equippedIndex = 0,
): void {
  value.weaponIds = weaponIds;
  value.weapons = weaponIds.map((weaponId) => {
    const definition = ALL_PLAYER_WEAPONS.find(
      (weapon) => weapon.id === weaponId,
    );
    return definition
      ? createWeaponState(definition)
      : {
          ammo: 0,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          reloading: false,
        };
  });
  value.equippedIndex = equippedIndex;
  value.akimboBarrel = 0;
}

function placeHuman(
  sim: GameSimulation,
  id: string,
  x: number,
  y: number,
  aim = 0,
): void {
  const value = human(sim, id);
  value.kin.x = x;
  value.kin.y = y;
  value.kin.vx = 0;
  value.kin.vy = 0;
  value.kin.grounded = true;
  value.invulnerableRemainingMs = 0;
  const snapshot = sim.snapshot().participants.find((entry) => entry.id === id);
  if (snapshot) {
    // Aim is read from the last input on the next tick.
  }
  void aim;
}

describe("advanced weapon simulation", () => {
  it("alternates akimbo barrels on the server and offsets projectile origins", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const value = human(sim, "one");
    setLoadout(value, ["akimbo-rifles", null, null]);
    placeHuman(sim, "one", 400, ARENA.groundY);
    sim.applyInput("one", input(1, { fire: true, aim: 0 }));
    runTicks(sim, 12);
    const events = sim.drainEvents();
    const shots = events.filter((event) => event.type === "shot");
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(
      shots.slice(0, 4).map((event) =>
        event.type === "shot" ? event.barrel : null,
      ),
    ).toEqual([0, 1, 0, 1].slice(0, Math.min(4, shots.length)));
    expect(value.weaponIds[0]).toBe("akimbo-rifles");
    expect(value.weapons[0].ammo).toBeLessThan(36);
    const projectiles = sim.snapshot().projectiles;
    expect(projectiles.length).toBeGreaterThanOrEqual(2);
    expect(projectiles[0].y).not.toBe(projectiles[1].y);
    expect(value.akimboBarrel).toBe(
      shots.length % 2 === 0 ? 0 : 1,
    );
  });

  it("enforces SMG cadence and keeps the room projectile count bounded", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    setLoadout(human(sim, "one"), ["vibe-smg", null, null]);
    placeHuman(sim, "one", 1200, ARENA.groundY);
    sim.applyInput("one", input(1, { fire: true, aim: 0 }));
    runTicks(sim, 60);
    const shots = sim
      .drainEvents()
      .filter((event) => event.type === "shot").length;
    expect(shots).toBeGreaterThanOrEqual(12);
    expect(shots).toBeLessThanOrEqual(15);
    expect(sim.snapshot().projectiles.length).toBeLessThanOrEqual(
      PROJECTILE_CONFIG.maxActiveProjectiles,
    );

    const projectiles = (
      sim as unknown as { projectiles: Map<number, unknown> }
    ).projectiles;
    projectiles.clear();
    for (
      let index = 0;
      index < PROJECTILE_CONFIG.maxActiveProjectiles;
      index += 1
    ) {
      projectiles.set(index, {
        id: index,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ownerId: "none",
        ownerKind: "bot",
        damage: 0,
        weaponId: "vibe-smg",
        weaponName: "VIBE SMG",
        mechanic: "smg",
        rocket: null,
        expiresAt: 999999,
      });
    }
    const before = projectiles.size;
    sim.applyInput("one", input(2, { fire: true, aim: 0 }));
    runTicks(sim, 2);
    expect(projectiles.size).toBe(before);
  });

  it("deals one 60 damage heavy cannon hit", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    setLoadout(human(sim, "one"), ["heavy-cannon", null, null]);
    placeHuman(sim, "one", 1400, ARENA.groundY);
    const victim = human(sim, "two");
    placeHuman(sim, "two", 1600, ARENA.groundY);
    victim.health = 200;
    victim.maxHealth = 200;
    sim.applyInput("one", input(1, { fire: true, aim: 0 }));
    runTicks(sim, 20);
    const events = sim.drainEvents();
    const hits = events.filter(
      (event) =>
        event.type === "hit" &&
        event.victimId === "two" &&
        event.weaponId === "heavy-cannon",
    );
    expect(hits).toHaveLength(1);
    if (hits[0]?.type === "hit") {
      expect(hits[0].damage).toBe(60);
    }
    expect(victim.health).toBe(140);
  });

  it("explodes rockets once, applies falloff damage and preserves grenades", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    setLoadout(human(sim, "one"), ["rocket-launcher", null, null]);
    placeHuman(sim, "one", 1900, ARENA.groundY);
    const victim = human(sim, "two");
    placeHuman(sim, "two", 2250, ARENA.groundY);
    victim.health = 200;
    victim.maxHealth = 200;
    const grenadesBefore = { ...human(sim, "one").grenades };
    sim.applyInput("one", input(1, { fire: true, aim: 0 }));
    runTicks(sim, 40);
    const events = sim.drainEvents();
    const explosions = events.filter(
      (event) => event.type === "rocket-exploded",
    );
    const hits = events.filter(
      (event) =>
        event.type === "hit" &&
        event.victimId === "two" &&
        event.source === "rocket",
    );
    expect(explosions).toHaveLength(1);
    expect(hits).toHaveLength(1);
    if (hits[0]?.type === "hit") {
      expect(hits[0].damage).toBe(120);
    }
    expect(victim.health).toBe(80);
    expect(human(sim, "one").grenades).toEqual(grenadesBefore);
    expect(sim.snapshot().loot).toHaveLength(0);
    if (explosions[0]?.type === "rocket-exploded") {
      expect(explosions[0].blastRadius).toBe(180);
    }
  });

  it("supports rocket self-damage and correct attribution", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    setLoadout(human(sim, "one"), ["rocket-launcher", null, null]);
    placeHuman(sim, "one", 1900, ARENA.groundY);
    sim.applyInput("one", input(1, { fire: true, aim: Math.PI / 2 }));
    runTicks(sim, 20);
    const events = sim.drainEvents();
    const hits = events.filter(
      (event) => event.type === "hit" && event.victimId === "one",
    );
    expect(hits).toHaveLength(1);
    if (hits[0]?.type === "hit") {
      expect(hits[0].source).toBe("rocket");
      expect(hits[0].ownerId).toBe("one");
      expect(hits[0].damage).toBeGreaterThan(0);
      expect(hits[0].damage).toBeLessThan(120);
    }
    expect(human(sim, "one").health).toBeLessThan(100);
    expect(events.some((event) => event.type === "rocket-exploded")).toBe(
      true,
    );
  });

  it("drops advanced weapons with their authoritative ammo", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const victim = human(sim, "two");
    setLoadout(victim, ["rocket-launcher", null, null]);
    victim.weapons[0].ammo = 2;
    victim.invulnerableRemainingMs = 0;
    sim.debugTeleport("two", 1200, ARENA.groundY);
    expect(sim.debugEliminate("two", "one", "bullet")).toBe(true);
    const loot = (
      sim as unknown as { loot: LootView[] }
    ).loot.filter((item) => item.active);
    const weapon = loot.find((item) => item.weaponId === "rocket-launcher");
    expect(weapon?.ammo).toBe(2);
    expect(loot).toHaveLength(3);
  });

  it("drops a bot's advanced weapon with its remaining ammo", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const bot = createBot(sim);
    bot.weaponId = "heavy-cannon";
    bot.weaponState = createWeaponState(
      ALL_PLAYER_WEAPONS.find(
        (weapon) => weapon.id === "heavy-cannon",
      )!,
    );
    bot.weaponState.ammo = 3;
    bot.invulnerableRemainingMs = 0;
    sim.debugTeleport(bot.id, 1200, ARENA.groundY);
    expect(sim.debugEliminate(bot.id, "one", "grenade")).toBe(true);
    const loot = (
      sim as unknown as { loot: LootView[] }
    ).loot.filter((item) => item.active);
    const weapon = loot.find((item) => item.weaponId === "heavy-cannon");
    expect(weapon?.ammo).toBe(3);
  });

  it("lets a curious bot acquire and fire an advanced weapon", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const bot = createBot(sim);
    bot.weaponCuriosity = true;
    const cache = sim
      .snapshot()
      .pickups.find(
        (pickup) => pickup.type === "akimbo-rifles" && pickup.active,
      );
    if (!cache) throw new Error("missing akimbo cache");
    bot.x = cache.x;
    bot.y = cache.y - 2;
    (sim as unknown as { collectNearbyPickups: (bot: BotView) => void })
      .collectNearbyPickups(bot);
    expect(bot.weaponId).toBe("akimbo-rifles");
    bot.aimAngle = 0;
    const step = (
      sim as unknown as {
        stepBotAdvancedWeapon: (
          bot: BotView,
          dtMs: number,
          hasLoS: boolean,
          distance: number,
        ) => void;
      }
    ).stepBotAdvancedWeapon.bind(sim);
    for (let index = 0; index < 14; index += 1) {
      step(bot, 1000 / 60, true, 300);
    }
    const shots = sim
      .drainEvents()
      .filter(
        (event) =>
          event.type === "shot" && event.ownerId === bot.id,
      );
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(
      shots.every(
        (event) =>
          event.type === "shot" && event.weaponId === "akimbo-rifles",
      ),
    ).toBe(true);
    expect(
      shots.slice(0, 2).map((event) =>
        event.type === "shot" ? event.barrel : null,
      ),
    ).toEqual([0, 1]);
  });

  it("does not let a non-curious bot take advanced weapons", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    const bot = createBot(sim);
    bot.weaponCuriosity = false;
    bot.x = 1110;
    bot.y = 1222;
    (sim as unknown as { collectNearbyPickups: (bot: BotView) => void })
      .collectNearbyPickups(bot);
    expect(bot.weaponId).toBe("vibe-rifle");
  });

  it("preserves advanced ammo across slot switches and resets on respawn", () => {
    const sim = createSim();
    sim.addHuman("one", "ONE");
    sim.addHuman("two", "TWO");
    const value = human(sim, "one");
    setLoadout(value, ["vibe-smg", "heavy-cannon", null]);
    value.weapons[0].ammo = 7;
    value.weapons[1].ammo = 2;
    sim.applyInput("one", input(1, { weapon: 1 }));
    runTicks(sim, 1);
    expect(value.equippedIndex).toBe(1);
    expect(value.weapons[1].ammo).toBe(2);
    sim.applyInput("one", input(2, { weapon: 0 }));
    runTicks(sim, 1);
    expect(value.weapons[0].ammo).toBe(7);

    value.invulnerableRemainingMs = 0;
    expect(sim.debugEliminate("one", "two", "bullet")).toBe(true);
    runTicks(sim, 180);
    expect(value.alive).toBe(true);
    expect(value.weaponIds).toEqual([
      "vibe-rifle",
      "scatter-blaster",
      null,
    ]);
    expect(value.equippedIndex).toBe(0);
    expect(value.weapons[0].ammo).toBe(20);
  });
});
