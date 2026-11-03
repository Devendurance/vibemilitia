import { describe, expect, it } from "vitest";
import { ARENA } from "@/game/arena/arena";
import { segmentIntersectsRect } from "@/game/arena/collision";
import { buildNavigationGrid, findPath, lineClear, nearestOpenCell } from "./navigation";

describe("bot navigation", () => {
  it("routes around a suspended platform", () => {
    const platform = { x: 300, y: 100, width: 120, height: 100 };
    const grid = buildNavigationGrid(800, 400, [platform], 30, 40);
    const path = findPath(grid, { x: 100, y: 200 }, { x: 700, y: 200 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);

    let previous = { x: 100, y: 200 };
    for (const point of path!) {
      expect(
        segmentIntersectsRect(previous.x, previous.y, point.x, point.y, platform),
      ).toBe(false);
      previous = point;
    }
  });

  it("builds a clear direct path when no obstacle exists", () => {
    const grid = buildNavigationGrid(800, 400, [], 30, 40);
    const path = findPath(grid, { x: 100, y: 200 }, { x: 700, y: 200 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)?.x).toBeGreaterThan(600);
    expect(path!.at(-1)?.y).toBeCloseTo(200, 0);
  });

  it("marks platform cells blocked with clearance", () => {
    const platform = { x: 100, y: 100, width: 160, height: 40 };
    const grid = buildNavigationGrid(400, 300, [platform], 20, 40);
    const centerCol = Math.floor(180 / 40);
    const centerRow = Math.floor(120 / 40);
    expect(grid.blocked[centerRow * grid.cols + centerCol]).toBe(1);
  });

  it("detects blocked line segments against inflated obstacles", () => {
    const grid = buildNavigationGrid(400, 300, [{ x: 120, y: 80, width: 100, height: 100 }], 20, 40);
    expect(lineClear({ x: 20, y: 140 }, { x: 380, y: 140 }, grid.obstacles)).toBe(false);
    expect(lineClear({ x: 20, y: 40 }, { x: 380, y: 40 }, grid.obstacles)).toBe(true);
  });

  it("keeps the real Sector 07 arena connected for respawns and pursuit", () => {
    const grid = buildNavigationGrid(
      ARENA.width,
      ARENA.height,
      ARENA.platforms,
      42,
      64,
    );
    for (const spawn of ARENA.spawnPoints) {
      expect(nearestOpenCell(grid, { x: spawn.x, y: spawn.y - 44 })).not.toBeNull();
    }
    const playerGoal = {
      x: ARENA.playerSpawn.x,
      y: ARENA.playerSpawn.y - 44,
    };
    for (const bot of ARENA.droneSpawns) {
      const path = findPath(grid, { x: bot.x, y: bot.y }, playerGoal);
      expect(path, `${bot.name} should reach the player spawn`).not.toBeNull();
      expect(path!.length).toBeGreaterThan(0);
    }
  });
});
