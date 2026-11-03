export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyDamage(health: number, amount: number): number {
  return clamp(health - Math.max(0, amount), 0, Number.MAX_SAFE_INTEGER);
}

export function stepHealthRegen(
  health: number,
  maxHealth: number,
  msSinceDamage: number,
  dtMs: number,
  delayMs: number,
  perSecond: number,
): number {
  if (msSinceDamage < delayMs || health >= maxHealth) {
    return health;
  }
  return Math.min(maxHealth, health + perSecond * (Math.max(0, dtMs) / 1000));
}

export function stepRespawnTimer(remainingMs: number, dtMs: number): number {
  return Math.max(0, remainingMs - Math.max(0, dtMs));
}

export function isLowHealth(health: number, maxHealth: number): boolean {
  return health / maxHealth <= 0.3;
}

export function isCriticalFuel(fuel: number, maxFuel: number): boolean {
  return fuel / maxFuel <= 0.18;
}
