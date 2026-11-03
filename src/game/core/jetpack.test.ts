import { describe, expect, it } from "vitest";
import { createJetpackState, fuelRatio, stepJetpack } from "./jetpack";

const config = {
  maxFuel: 100,
  drainPerSecond: 40,
  regenPerSecond: 20,
  regenDelayMs: 500,
};

describe("jetpack fuel", () => {
  it("drains while thrusting", () => {
    const step = stepJetpack(createJetpackState(config), { thrustRequested: true, dtMs: 1000 }, config);
    expect(step.thrusting).toBe(true);
    expect(step.state.fuel).toBeCloseTo(60);
    expect(step.state.msSinceThrust).toBe(0);
  });

  it("stops thrusting when empty and cannot go negative", () => {
    const step = stepJetpack({ fuel: 2, msSinceThrust: 0 }, { thrustRequested: true, dtMs: 1000 }, config);
    expect(step.thrusting).toBe(true);
    expect(step.state.fuel).toBe(0);

    const next = stepJetpack(step.state, { thrustRequested: true, dtMs: 100 }, config);
    expect(next.thrusting).toBe(false);
  });

  it("does not regenerate until the delay has elapsed", () => {
    const step = stepJetpack({ fuel: 40, msSinceThrust: 200 }, { thrustRequested: false, dtMs: 200 }, config);
    expect(step.state.fuel).toBe(40);
    expect(step.state.msSinceThrust).toBe(400);
  });

  it("regenerates after the delay and caps at max", () => {
    const step = stepJetpack({ fuel: 40, msSinceThrust: 500 }, { thrustRequested: false, dtMs: 1000 }, config);
    expect(step.state.fuel).toBeCloseTo(60);

    const full = stepJetpack({ fuel: 99, msSinceThrust: 999 }, { thrustRequested: false, dtMs: 1000 }, config);
    expect(full.state.fuel).toBe(100);
  });

  it("reports a clamped ratio", () => {
    expect(fuelRatio({ fuel: 50, msSinceThrust: 0 }, config)).toBe(0.5);
    expect(fuelRatio({ fuel: 140, msSinceThrust: 0 }, config)).toBe(1);
  });
});
