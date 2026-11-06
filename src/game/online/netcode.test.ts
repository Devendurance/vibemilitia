import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import { GameSimulation } from "@/game/multiplayer/GameSimulation";
import {
  encodeFast,
  encodeSelf,
  encodeSlow,
  SnapshotAssembler,
} from "@/game/multiplayer/snapshotCodec";
import { FIXED_TICK_MS, LocalPredictor } from "@/game/online/LocalPredictor";
import { RemoteInterpolator, SnapshotClock } from "@/game/online/RemoteInterpolator";

const world = {
  width: ARENA.width,
  height: ARENA.height,
  platforms: ARENA.platforms,
};

function liveSim(): GameSimulation {
  const sim = new GameSimulation({
    roomId: "net-test",
    roomName: "NET",
    countdownMs: 0,
    botsEnabled: false,
  });
  sim.addHuman("a", "ALPHA");
  for (let tick = 0; tick < 3; tick += 1) sim.tick(FIXED_TICK_MS);
  sim.debugTeleport("a", 3000, ARENA.groundY);
  for (let tick = 0; tick < 4; tick += 1) sim.tick(FIXED_TICK_MS);
  return sim;
}

function send(sim: GameSimulation, seq: number, moveX: number, jump = false): void {
  sim.applyInput("a", {
    seq,
    ticks: 2,
    moveX,
    jump,
    jumpHeld: false,
    fire: false,
    reload: false,
    weapon: null,
    aim: 0,
  });
}

const self = (sim: GameSimulation) =>
  sim.snapshot().participants.find((entry) => entry.id === "a")!;

describe("tick-counted server input", () => {
  it("simulates every packet even when a burst lands in one server tick", () => {
    const steady = liveSim();
    const bursty = liveSim();
    for (let seq = 1; seq <= 10; seq += 1) {
      send(steady, seq, -1);
      steady.tick(FIXED_TICK_MS);
      steady.tick(FIXED_TICK_MS);
    }
    for (let seq = 1; seq <= 10; seq += 1) send(bursty, seq, -1);
    for (let tick = 0; tick < 20; tick += 1) bursty.tick(FIXED_TICK_MS);
    expect(Math.abs(self(bursty).x - self(steady).x)).toBeLessThan(0.01);
  });

  it("lands in the same place when packets arrive late", () => {
    const steady = liveSim();
    const late = liveSim();
    for (let seq = 1; seq <= 10; seq += 1) {
      send(steady, seq, -1);
      steady.tick(FIXED_TICK_MS);
      steady.tick(FIXED_TICK_MS);
    }
    send(late, 1, -1);
    for (let tick = 0; tick < 12; tick += 1) late.tick(FIXED_TICK_MS);
    const heldAt = self(late).x;
    for (let seq = 2; seq <= 10; seq += 1) send(late, seq, -1);
    for (let tick = 0; tick < 18; tick += 1) late.tick(FIXED_TICK_MS);
    expect(heldAt).toBeGreaterThan(self(late).x);
    expect(Math.abs(self(late).x - self(steady).x)).toBeLessThan(0.01);
  });

  it("spends a persistent backlog to catch back up, without exceeding real time", () => {
    const sim = liveSim();
    let seq = 1;
    send(sim, seq, -1);
    for (let tick = 0; tick < 12; tick += 1) sim.tick(FIXED_TICK_MS);
    for (let index = 0; index < 5; index += 1) {
      seq += 1;
      send(sim, seq, -1);
    }
    const ack = () => self(sim).lastProcessedInputSeq;
    for (let tick = 0; tick < 240; tick += 1) {
      if (tick % 2 === 0) {
        seq += 1;
        send(sim, seq, -1);
      }
      sim.tick(FIXED_TICK_MS);
    }
    expect(seq - ack()).toBeLessThanOrEqual(3);
  });

  it("cannot move faster than real time by flooding packets", () => {
    const flooded = liveSim();
    const honest = liveSim();
    for (let seq = 1; seq <= 200; seq += 1) send(flooded, seq, -1);
    send(honest, 1, -1);
    for (let tick = 0; tick < 30; tick += 1) {
      flooded.tick(FIXED_TICK_MS);
      honest.tick(FIXED_TICK_MS);
      if (tick % 2 === 1) send(honest, 2 + (tick >> 1), -1);
    }
    const start = 3000;
    expect(start - self(flooded).x).toBeLessThanOrEqual(start - self(honest).x + 1);
  });

  it("stops a player whose input stream goes silent", () => {
    const sim = liveSim();
    for (let seq = 1; seq <= 30; seq += 1) {
      send(sim, seq, -1);
      sim.tick(FIXED_TICK_MS);
      sim.tick(FIXED_TICK_MS);
    }
    for (let tick = 0; tick < 90; tick += 1) sim.tick(FIXED_TICK_MS);
    const settled = self(sim).x;
    for (let tick = 0; tick < 30; tick += 1) sim.tick(FIXED_TICK_MS);
    expect(Math.abs(self(sim).x - settled)).toBeLessThan(1);
    expect(Math.abs(self(sim).vx)).toBeLessThan(1);
  });

  it("keeps legacy packets working for tabs opened before a deploy", () => {
    const sim = liveSim();
    sim.applyInput("a", {
      seq: 1,
      moveX: -1,
      jump: false,
      jumpHeld: false,
      fire: false,
      reload: false,
      weapon: null,
      aim: 0,
    });
    const start = self(sim).x;
    for (let tick = 0; tick < 30; tick += 1) sim.tick(FIXED_TICK_MS);
    expect(self(sim).x).toBeLessThan(start - 20);
  });
});

describe("client prediction against an authoritative simulation", () => {
  /** Plays input through a delayed link with the real simulation behind it. */
  function play(oneWayTicks: number, script: (tick: number) => number) {
    const sim = liveSim();
    const start = self(sim);
    const predictor = new LocalPredictor(
      {
        ...start,
        ackSeq: 0,
        ackTicks: 0,
      },
      world,
    );
    const toServer: Array<{ at: number; seq: number; moveX: number }> = [];
    const toClient: Array<{ at: number; motion: ReturnType<typeof self> }> = [];
    const onScreen: number[] = [];
    const corrections: number[] = [];
    let seq = 0;
    let packetTick = 0;
    let moveX = 0;
    for (let tick = 0; tick < 300; tick += 1) {
      if (packetTick === 0) {
        seq += 1;
        moveX = script(tick);
        toServer.push({ at: tick + oneWayTicks, seq, moveX });
      }
      predictor.step(seq, packetTick, { moveX, jumpPressed: false, jumpHeld: false });
      packetTick = (packetTick + 1) % 2;
      while (toServer[0] && toServer[0].at <= tick) {
        const packet = toServer.shift()!;
        send(sim, packet.seq, packet.moveX);
      }
      sim.tick(FIXED_TICK_MS);
      if (tick % 3 === 0) {
        toClient.push({ at: tick + oneWayTicks, motion: self(sim) });
      }
      while (toClient[0] && toClient[0].at <= tick) {
        const { motion } = toClient.shift()!;
        predictor.reconcile({
          ...motion,
          ackSeq: motion.lastProcessedInputSeq,
          ackTicks: motion.lastProcessedInputTicks,
        });
        corrections.push(predictor.lastCorrection);
      }
      onScreen.push(predictor.render(FIXED_TICK_MS).x);
    }
    return { predictor, onScreen, corrections, sim };
  }

  it("does not drag a running player backwards at 500ms RTT", () => {
    const { onScreen, corrections } = play(15, (tick) => (tick < 200 ? -1 : 0));
    const steady = onScreen.slice(60, 190);
    const backward = steady
      .slice(1)
      .filter((x, index) => x - steady[index] > 0.05).length;
    expect(backward).toBe(0);
    expect(Math.max(...corrections.slice(10))).toBeLessThan(1);
  });

  it("stays exact through heavy jitter", () => {
    const sim = liveSim();
    const predictor = new LocalPredictor(
      { ...self(sim), ackSeq: 0, ackTicks: 0 },
      world,
    );
    const toServer: Array<{ at: number; seq: number; moveX: number; jump: boolean }> = [];
    const toClient: Array<{ at: number; motion: ReturnType<typeof self> }> = [];
    let seq = 0;
    let packetTick = 0;
    let moveX = 0;
    let jump = false;
    let lastServerAt = 0;
    let lastClientAt = 0;
    let random = 12345;
    const next = () => {
      random = (random * 1103515245 + 12345) & 0x7fffffff;
      return random / 0x7fffffff;
    };
    let worst = 0;
    for (let tick = 0; tick < 900; tick += 1) {
      if (packetTick === 0) {
        seq += 1;
        moveX = Math.floor(tick / 70) % 2 === 0 ? -1 : 0.6;
        jump = tick % 170 === 0;
        lastServerAt = Math.max(lastServerAt, tick + 8 + Math.floor(next() * 12));
        toServer.push({ at: lastServerAt, seq, moveX, jump });
      }
      predictor.step(seq, packetTick, {
        moveX,
        jumpPressed: packetTick === 0 && jump,
        jumpHeld: false,
      });
      packetTick = (packetTick + 1) % 2;
      while (toServer[0] && toServer[0].at <= tick) {
        const packet = toServer.shift()!;
        send(sim, packet.seq, packet.moveX, packet.jump);
      }
      sim.tick(FIXED_TICK_MS);
      if (tick % 3 === 0) {
        lastClientAt = Math.max(lastClientAt, tick + 8 + Math.floor(next() * 12));
        toClient.push({ at: lastClientAt, motion: self(sim) });
      }
      while (toClient[0] && toClient[0].at <= tick) {
        const { motion } = toClient.shift()!;
        predictor.reconcile({
          ...motion,
          ackSeq: motion.lastProcessedInputSeq,
          ackTicks: motion.lastProcessedInputTicks,
        });
        if (tick > 40) worst = Math.max(worst, predictor.lastCorrection);
      }
    }
    expect(worst).toBeLessThan(1.5);
  });

  it("converges with the server once input stops", () => {
    const { predictor, sim } = play(15, (tick) => (tick < 150 ? -1 : 0));
    expect(Math.abs(predictor.kinematics.x - self(sim).x)).toBeLessThan(1);
  });

  it("absorbs an authoritative shove without a visible jump", () => {
    const predictor = new LocalPredictor(
      {
        x: 1000,
        y: ARENA.groundY,
        vx: 0,
        vy: 0,
        grounded: true,
        thrusting: false,
        fuel: 100,
        ackSeq: 0,
      },
      world,
    );
    predictor.reconcile({
      x: 1040,
      y: ARENA.groundY,
      vx: 0,
      vy: 0,
      grounded: true,
      thrusting: false,
      fuel: 100,
      ackSeq: 0,
    });
    const first = predictor.render(FIXED_TICK_MS).x;
    expect(first).toBeLessThan(1012);
    let last = first;
    for (let frame = 0; frame < 60; frame += 1) last = predictor.render(FIXED_TICK_MS).x;
    expect(last).toBeCloseTo(1040, 0);
  });

  it("snaps real teleports instead of gliding across the arena", () => {
    const predictor = new LocalPredictor(
      {
        x: 1000,
        y: ARENA.groundY,
        vx: 0,
        vy: 0,
        grounded: true,
        thrusting: false,
        fuel: 100,
        ackSeq: 0,
      },
      world,
    );
    predictor.reconcile({
      x: 2500,
      y: ARENA.groundY,
      vx: 0,
      vy: 0,
      grounded: true,
      thrusting: false,
      fuel: 100,
      ackSeq: 0,
    });
    expect(predictor.render(FIXED_TICK_MS).x).toBeCloseTo(2500, 0);
    expect(predictor.snaps).toBe(1);
  });
});

describe("compact snapshot stream", () => {
  it("rebuilds an equivalent snapshot at a fraction of the size", () => {
    const sim = new GameSimulation({ roomId: "codec", roomName: "CODEC", countdownMs: 0 });
    sim.addHuman("a", "ALPHA");
    for (let tick = 0; tick < 120; tick += 1) sim.tick(FIXED_TICK_MS);
    const full = sim.snapshot();
    const assembler = new SnapshotAssembler("a");
    assembler.applySlow(encodeSlow(full));
    assembler.applySelf(encodeSelf(full, "a")!);
    const rebuilt = assembler.assemble(encodeFast(full))!;
    expect(rebuilt.participants).toHaveLength(full.participants.length);
    expect(rebuilt.standings).toHaveLength(full.standings.length);
    expect(rebuilt.pickups).toEqual(full.pickups);
    const original = full.participants.find((entry) => entry.id === "a")!;
    const copy = rebuilt.participants.find((entry) => entry.id === "a")!;
    expect(copy.x).toBeCloseTo(original.x, 0);
    expect(copy.weapons).toEqual(original.weapons);
    expect(copy.name).toBe(original.name);
    expect(copy.skinId).toBe(original.skinId);
    expect(JSON.stringify(encodeFast(full)).length).toBeLessThan(
      JSON.stringify(full).length * 0.2,
    );
  });

  it("does not publish an empty loadout before the player's own section", () => {
    const sim = new GameSimulation({ roomId: "codec", roomName: "CODEC", countdownMs: 0 });
    sim.addHuman("a", "ALPHA");
    sim.tick(FIXED_TICK_MS);
    const full = sim.snapshot();
    const assembler = new SnapshotAssembler("a");
    assembler.applySlow(encodeSlow(full));
    expect(assembler.assemble(encodeFast(full))).toBeNull();
    assembler.applySelf(encodeSelf(full, "a")!);
    expect(assembler.assemble(encodeFast(full))).not.toBeNull();
  });

  it("does not assemble before the slow section is known", () => {
    const sim = new GameSimulation({ roomId: "codec", roomName: "CODEC", countdownMs: 0 });
    sim.addHuman("a", "ALPHA");
    sim.tick(FIXED_TICK_MS);
    expect(new SnapshotAssembler("a").assemble(encodeFast(sim.snapshot()))).toBeNull();
  });
});

describe("remote playback", () => {
  it("moves at constant speed between 20Hz samples", () => {
    const remote = new RemoteInterpolator();
    for (let index = 0; index < 8; index += 1) {
      remote.push(index * 50, index * 20, 0, 400, 0, 0);
    }
    const positions = [120, 136, 152, 168, 184].map((t) => remote.sample(t)!.x);
    const steps = positions.slice(1).map((x, index) => x - positions[index]);
    for (const step of steps) expect(step).toBeCloseTo(6.4, 3);
  });

  it("rotates the short way across the angle seam", () => {
    const remote = new RemoteInterpolator();
    remote.push(0, 0, 0, 0, 0, 3.0);
    remote.push(50, 0, 0, 0, 0, -3.0);
    const aim = remote.sample(25)!.aim;
    expect(Math.abs(aim)).toBeGreaterThan(3);
  });

  it("does not slide across the map on a respawn", () => {
    const remote = new RemoteInterpolator();
    remote.push(0, 100, 0, 0, 0, 0);
    remote.push(50, 110, 0, 0, 0, 0);
    remote.push(100, 2500, 0, 0, 0, 0);
    expect(remote.sample(90)!.x).toBe(2500);
  });

  it("never runs playback time backwards while adapting", () => {
    const clock = new SnapshotClock();
    let previous = -Infinity;
    for (let index = 0; index < 400; index += 1) {
      const local = index * 16.7;
      const server = Math.floor(local / 50) * 50;
      const spike = index > 100 && index < 120 ? 180 : 0;
      clock.observe(server, local + 30 + spike);
      const playback = clock.playbackTime(local)!;
      expect(playback).toBeGreaterThanOrEqual(previous);
      previous = playback;
    }
  });

  it("widens the playback delay on a jittery link", () => {
    const steady = new SnapshotClock();
    const jittery = new SnapshotClock();
    for (let index = 0; index < 200; index += 1) {
      const server = index * 50;
      steady.observe(server, server + 100);
      jittery.observe(server, server + 100 + (index % 2 === 0 ? 0 : 70));
    }
    expect(steady.playbackDelayMs).toBeCloseTo(100, 0);
    expect(jittery.playbackDelayMs).toBeGreaterThan(steady.playbackDelayMs + 20);
  });
});
