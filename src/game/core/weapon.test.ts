import { describe, expect, it } from "vitest";
import { createWeaponState, reloadProgress, stepWeapon } from "./weapon";

const weapon = {
  id: "test",
  name: "TEST",
  magazineSize: 3,
  damage: 10,
  fireIntervalMs: 100,
  reloadMs: 500,
  projectileSpeed: 1000,
  spreadRadians: 0,
};

describe("weapon state", () => {
  it("fires on the cadence and consumes ammo", () => {
    let state = createWeaponState(weapon);
    const first = stepWeapon(state, weapon, { fire: true, reload: false, dtMs: 16 });
    expect(first.fired).toBe(true);
    state = first.state;
    expect(state.ammo).toBe(2);

    const tooSoon = stepWeapon(state, weapon, { fire: true, reload: false, dtMs: 50 });
    expect(tooSoon.fired).toBe(false);
    expect(tooSoon.state.ammo).toBe(2);

    const ready = stepWeapon(tooSoon.state, weapon, { fire: true, reload: false, dtMs: 60 });
    expect(ready.fired).toBe(true);
    expect(ready.state.ammo).toBe(1);
  });

  it("auto-reloads when the magazine is empty", () => {
    const state = { ...createWeaponState(weapon), ammo: 1, cooldownMs: 0 };
    const empty = stepWeapon(state, weapon, { fire: true, reload: false, dtMs: 16 });
    expect(empty.fired).toBe(true);
    expect(empty.state.ammo).toBe(0);
    expect(empty.state.reloading).toBe(false);

    const reload = stepWeapon(empty.state, weapon, { fire: false, reload: false, dtMs: 16 });
    expect(reload.startedReload).toBe(true);
    expect(reload.state.reloading).toBe(true);

    const done = stepWeapon(reload.state, weapon, { fire: false, reload: false, dtMs: 500 });
    expect(done.finishedReload).toBe(true);
    expect(done.state.ammo).toBe(3);
    expect(done.state.reloading).toBe(false);
  });

  it("honours a manual reload and does not fire while reloading", () => {
    const state = { ...createWeaponState(weapon), ammo: 1 };
    const started = stepWeapon(state, weapon, { fire: true, reload: true, dtMs: 16 });
    expect(started.startedReload).toBe(true);
    expect(started.fired).toBe(false);

    expect(reloadProgress(started.state, weapon)).toBe(0);
    const partial = stepWeapon(started.state, weapon, { fire: false, reload: false, dtMs: 200 });
    const progress = reloadProgress(partial.state, weapon);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);

    const done = stepWeapon(partial.state, weapon, { fire: true, reload: false, dtMs: 400 });
    expect(done.state.ammo).toBe(3);
    expect(done.fired).toBe(false);
  });

  it("does not reload a full magazine", () => {
    const step = stepWeapon(createWeaponState(weapon), weapon, { fire: false, reload: true, dtMs: 16 });
    expect(step.startedReload).toBe(false);
    expect(step.state.reloading).toBe(false);
  });
});
