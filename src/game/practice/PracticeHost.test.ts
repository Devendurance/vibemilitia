import { describe, expect, it } from "vitest";
import { SIM_BOT_TUNING, type PracticeDifficulty } from "@/game/config/gameplay";
import { SERVER_TICK_MS, type OnlineSnapshot } from "@/game/multiplayer/protocol";
import { PRACTICE_SESSION_ID, PracticeHost } from "@/game/practice/PracticeHost";

function runMatch(difficulty: PracticeDifficulty, seconds: number) {
  const messages: Array<{ type: string; message: unknown }> = [];
  const host = new PracticeHost(
    { difficulty, playerName: "ENDY", skinId: "viber-031", debug: true },
    (type, message) => messages.push({ type, message }),
  );
  host.handle("scene-ready", undefined);
  const ticks = Math.round((seconds * 1000) / SERVER_TICK_MS) + 200;
  for (let tick = 0; tick < ticks; tick += 1) host.advance(SERVER_TICK_MS);
  host.handle("resync", undefined);
  const last = messages.filter((entry) => entry.type === "snapshot").at(-1);
  return { snapshot: last?.message as OnlineSnapshot, messages, host };
}

describe("practice match", () => {
  it("runs the online simulation with seven bots and the chosen Viber", () => {
    const { snapshot } = runMatch("normal", 4);
    const me = snapshot.participants.find((entry) => entry.id === PRACTICE_SESSION_ID)!;
    expect(snapshot.phase).toBe("live");
    expect(snapshot.bots).toBe(7);
    expect(me.skinId).toBe("viber-031");
    expect(me.weapons.filter((weapon) => weapon.owned).length).toBeGreaterThan(0);
    expect(snapshot.pickups.length).toBeGreaterThan(20);
  });

  it("has no profile identity, so it can never reach ranked XP", () => {
    const { snapshot } = runMatch("hard", 4);
    expect(
      snapshot.participants.every((entry) => entry.playerId === null),
    ).toBe(true);
  });

  it("uses a compact stream after the first frame", () => {
    const { messages } = runMatch("normal", 2);
    expect(messages.some((entry) => entry.type === "s1")).toBe(true);
    expect(messages.filter((entry) => entry.type === "snapshot").length).toBeLessThanOrEqual(2);
  });

  it("restarts mid-match from the practice menu", () => {
    const { host, messages } = runMatch("normal", 3);
    host.handle("rematch", undefined);
    const last = messages.filter((entry) => entry.type === "snapshot").at(-1)
      ?.message as OnlineSnapshot;
    expect(last.phase).toBe("live");
    expect(last.matchNumber).toBe(2);
    expect(last.remainingMs).toBeGreaterThan(89_000);
  });

  it("holds its countdown until the scene can show it", () => {
    const messages: Array<{ type: string; message: unknown }> = [];
    const host = new PracticeHost(
      { difficulty: "normal", playerName: "ENDY", skinId: "viber-010", debug: false },
      (type, message) => messages.push({ type, message }),
    );
    const remaining = () => {
      host.handle("resync", undefined);
      const last = messages.filter((entry) => entry.type === "snapshot").at(-1);
      return (last?.message as OnlineSnapshot).countdownRemainingMs;
    };
    const start = remaining();
    for (let tick = 0; tick < 600; tick += 1) host.advance(SERVER_TICK_MS);
    expect(remaining()).toBe(start);
    host.handle("scene-ready", undefined);
    for (let tick = 0; tick < 60; tick += 1) host.advance(SERVER_TICK_MS);
    expect(remaining()).toBeLessThan(start);
  });

  it("ignores debug messages unless enabled", () => {
    const events: unknown[] = [];
    const host = new PracticeHost(
      { difficulty: "normal", playerName: "ENDY", skinId: "viber-010", debug: false },
      (type, message) => events.push([type, message]),
    );
    host.handle("scene-ready", undefined);
    for (let tick = 0; tick < 300; tick += 1) host.advance(SERVER_TICK_MS);
    host.handle("debug-end-match", undefined);
    for (let tick = 0; tick < 5; tick += 1) host.advance(SERVER_TICK_MS);
    host.handle("resync", undefined);
    const last = events.filter((entry) => (entry as string[])[0] === "snapshot").at(-1) as [
      string,
      OnlineSnapshot,
    ];
    expect(last[1].phase).toBe("live");
  });

  it("makes higher tiers meaningfully more dangerous", () => {
    const damageTaken = (difficulty: PracticeDifficulty) => {
      const { snapshot } = runMatch(difficulty, 45);
      const totals = snapshot.standings.reduce((sum, entry) => sum + entry.score, 0);
      return totals;
    };
    const easy = damageTaken("easy");
    const merciless = damageTaken("merciless");
    expect(merciless).toBeGreaterThan(easy * 1.5);
  });

  it("orders tuning from gentle to ruthless", () => {
    const order: PracticeDifficulty[] = ["easy", "normal", "hard", "merciless"];
    for (let index = 1; index < order.length; index += 1) {
      const lower = SIM_BOT_TUNING[order[index - 1]];
      const higher = SIM_BOT_TUNING[order[index]];
      expect(higher.reactionMs).toBeLessThan(lower.reactionMs);
      expect(higher.aimErrorRadians).toBeLessThan(lower.aimErrorRadians);
      expect(higher.fireIntervalMs).toBeLessThanOrEqual(lower.fireIntervalMs);
      expect(higher.hoverSpeed).toBeGreaterThanOrEqual(lower.hoverSpeed);
    }
  });
});
