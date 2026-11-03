export interface JetpackConfig {
  maxFuel: number;
  drainPerSecond: number;
  regenPerSecond: number;
  regenDelayMs: number;
}

export interface JetpackState {
  fuel: number;
  msSinceThrust: number;
}

export interface JetpackIntent {
  thrustRequested: boolean;
  dtMs: number;
}

export interface JetpackStep {
  state: JetpackState;
  thrusting: boolean;
}

export function createJetpackState(config: JetpackConfig): JetpackState {
  return { fuel: config.maxFuel, msSinceThrust: config.regenDelayMs };
}

/**
 * Fuel is a client presentation concern here but the math is pure so a future
 * server simulation can run exactly the same rules against an input frame.
 */
export function stepJetpack(
  state: JetpackState,
  intent: JetpackIntent,
  config: JetpackConfig,
): JetpackStep {
  const dtSeconds = Math.max(0, intent.dtMs) / 1000;
  const canThrust = intent.thrustRequested && state.fuel > 0.25;

  if (canThrust) {
    return {
      state: {
        fuel: Math.max(0, state.fuel - config.drainPerSecond * dtSeconds),
        msSinceThrust: 0,
      },
      thrusting: true,
    };
  }

  const msSinceThrust = state.msSinceThrust + Math.max(0, intent.dtMs);
  const readyToRegen = msSinceThrust >= config.regenDelayMs;
  const fuel = readyToRegen
    ? Math.min(config.maxFuel, state.fuel + config.regenPerSecond * dtSeconds)
    : state.fuel;

  return {
    state: { fuel, msSinceThrust },
    thrusting: false,
  };
}

export function fuelRatio(state: JetpackState, config: JetpackConfig): number {
  return Math.min(1, Math.max(0, state.fuel / config.maxFuel));
}
