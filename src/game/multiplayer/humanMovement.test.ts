import { describe, expect, it } from "vitest";
import { createHumanKinematics, stepHumanKinematics } from "./humanMovement";

const world = {
  width: 1000,
  height: 500,
  platforms: [
    { x: 0, y: 300, width: 1000, height: 100 },
    { x: 300, y: 150, width: 40, height: 120 },
  ],
};

function tick(
  state: ReturnType<typeof createHumanKinematics>,
  input: { moveX: number; jumpPressed?: boolean; jumpHeld?: boolean },
  count = 1,
) {
  for (let index = 0; index < count; index += 1) {
    stepHumanKinematics(
      state,
      {
        moveX: input.moveX,
        jumpPressed: input.jumpPressed ?? false,
        jumpHeld: input.jumpHeld ?? false,
      },
      1000 / 60,
      world,
    );
  }
}

describe("authoritative human movement", () => {
  it("falls onto the ground and runs horizontally", () => {
    const state = createHumanKinematics(100, 280);
    tick(state, { moveX: 0 }, 20);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(300);
    tick(state, { moveX: 1 }, 45);
    expect(state.x).toBeGreaterThan(130);
    expect(state.y).toBe(300);
  });

  it("jumps and consumes jetpack fuel while thrusting", () => {
    const state = createHumanKinematics(100, 300);
    tick(state, { moveX: 0 }, 2);
    tick(state, { moveX: 0, jumpPressed: true, jumpHeld: true }, 1);
    expect(state.grounded).toBe(false);
    expect(state.vy).toBeLessThan(0);
    tick(state, { moveX: 0, jumpHeld: true }, 30);
    expect(state.jetpack.fuel).toBeLessThan(100);
    expect(state.y).toBeLessThan(300);
  });

  it("resolves platform sides instead of passing through them", () => {
    const state = createHumanKinematics(100, 300);
    tick(state, { moveX: 0 }, 2);
    tick(state, { moveX: 1 }, 90);
    expect(state.x).toBeLessThanOrEqual(274);
  });
});
