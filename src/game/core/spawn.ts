import { segmentIntersectsRect, type Rect } from "@/game/arena/collision";

export interface SpawnCandidate {
  id: string;
  x: number;
  y: number;
}

export interface SpawnThreat {
  id: string;
  x: number;
  y: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface SpawnSelectionInput {
  candidates: readonly SpawnCandidate[];
  threats: readonly SpawnThreat[];
  blockers: readonly Rect[];
  lastDeath?: SpawnPoint | null;
  random?: () => number;
}

function distance(a: SpawnPoint, b: SpawnPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function scoreSpawnCandidate(
  candidate: SpawnCandidate,
  threats: readonly SpawnThreat[],
  blockers: readonly Rect[],
  lastDeath?: SpawnPoint | null,
  randomValue = 0.5,
): number {
  const eye = { x: candidate.x, y: candidate.y - 56 };
  let nearest = 1400;
  let visibleThreats = 0;
  let occupied = false;

  for (const threat of threats) {
    const distanceToThreat = distance(candidate, threat);
    nearest = Math.min(nearest, distanceToThreat);
    if (distanceToThreat < 150) {
      occupied = true;
    }
    const hasLineOfSight = !blockers.some((rect) =>
      segmentIntersectsRect(threat.x, threat.y, eye.x, eye.y, rect),
    );
    if (hasLineOfSight) {
      visibleThreats += 1;
    }
  }

  const deathDistance = lastDeath ? distance(candidate, lastDeath) : 900;
  let score = Math.min(nearest, 3200) + Math.min(420, deathDistance * 0.32);
  score -= visibleThreats * 210;
  if (occupied) {
    score -= 1200;
  }
  score += (randomValue - 0.5) * 50;
  return score;
}

/**
 * Selects a fair-enough respawn: far from live threats, out of their line of
 * fire where possible, and away from the last death. Ties use injected random
 * jitter so repeated deaths do not always land on the same pad.
 */
export function selectSpawnPoint(input: SpawnSelectionInput): SpawnCandidate {
  if (input.candidates.length === 0) {
    throw new Error("At least one spawn candidate is required");
  }
  const random = input.random ?? Math.random;
  let best = input.candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of input.candidates) {
    const score = scoreSpawnCandidate(
      candidate,
      input.threats,
      input.blockers,
      input.lastDeath,
      random(),
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
