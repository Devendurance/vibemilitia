export interface WeaponDefinition {
  id: string;
  name: string;
  magazineSize: number;
  damage: number;
  fireIntervalMs: number;
  reloadMs: number;
  projectileSpeed: number;
  spreadRadians: number;
}

export interface WeaponState {
  ammo: number;
  cooldownMs: number;
  reloadRemainingMs: number;
  reloading: boolean;
}

export interface WeaponIntent {
  fire: boolean;
  reload: boolean;
  dtMs: number;
}

export interface WeaponStep {
  state: WeaponState;
  fired: boolean;
  startedReload: boolean;
  finishedReload: boolean;
}

export function createWeaponState(definition: WeaponDefinition): WeaponState {
  return {
    ammo: definition.magazineSize,
    cooldownMs: 0,
    reloadRemainingMs: 0,
    reloading: false,
  };
}

export function stepWeapon(
  state: WeaponState,
  definition: WeaponDefinition,
  intent: WeaponIntent,
): WeaponStep {
  const dtMs = Math.max(0, intent.dtMs);
  let ammo = state.ammo;
  let cooldownMs = Math.max(0, state.cooldownMs - dtMs);
  let reloadRemainingMs = Math.max(0, state.reloadRemainingMs - dtMs);
  let reloading = state.reloading;
  let startedReload = false;
  let finishedReload = false;

  if (reloading && reloadRemainingMs <= 0) {
    ammo = definition.magazineSize;
    reloading = false;
    finishedReload = true;
  }

  const wantsReload = intent.reload || ammo <= 0;
  if (!reloading && wantsReload && ammo < definition.magazineSize) {
    reloading = true;
    reloadRemainingMs = definition.reloadMs;
    startedReload = true;
  }

  let fired = false;
  if (!reloading && !finishedReload && intent.fire && cooldownMs <= 0 && ammo > 0) {
    ammo -= 1;
    cooldownMs = definition.fireIntervalMs;
    fired = true;
  }

  return {
    state: { ammo, cooldownMs, reloadRemainingMs, reloading },
    fired,
    startedReload,
    finishedReload,
  };
}

export function reloadProgress(
  state: WeaponState,
  definition: WeaponDefinition,
): number {
  if (!state.reloading) {
    return 1;
  }
  const remaining = Math.min(definition.reloadMs, state.reloadRemainingMs);
  return 1 - remaining / definition.reloadMs;
}
