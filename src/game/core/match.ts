export type MatchPhase = "live" | "ended";
export type MatchEndReason = "time" | "score" | null;

export interface MatchTimerState {
  phase: MatchPhase;
  remainingMs: number;
  endReason: MatchEndReason;
}

export interface ParticipantSummary {
  id: string;
  name: string;
  score: number;
  deaths: number;
  order?: number;
}

export type RankedParticipant<T extends ParticipantSummary> = T & {
  placement: number;
};

export function createMatchTimer(durationMs: number): MatchTimerState {
  return {
    phase: "live",
    remainingMs: Math.max(0, durationMs),
    endReason: null,
  };
}

export function stepMatchTimer(state: MatchTimerState, dtMs: number): MatchTimerState {
  if (state.phase === "ended") {
    return state;
  }
  const remainingMs = Math.max(0, state.remainingMs - Math.max(0, dtMs));
  if (remainingMs <= 0) {
    return {
      phase: "ended",
      remainingMs: 0,
      endReason: "time",
    };
  }
  return { ...state, remainingMs };
}

export function endMatchForScore(state: MatchTimerState): MatchTimerState {
  if (state.phase === "ended") {
    return state;
  }
  return {
    phase: "ended",
    remainingMs: state.remainingMs,
    endReason: "score",
  };
}

export function reachedScoreLimit(scores: readonly number[], scoreLimit: number): boolean {
  return scores.some((score) => score >= scoreLimit);
}

/**
 * Placement is deterministic. Score leads, fewer deaths breaks the tie, then
 * participant id keeps the result stable for the HUD and tests.
 */
export function rankParticipants<T extends ParticipantSummary>(
  participants: readonly T[],
): Array<RankedParticipant<T>> {
  return [...participants]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
      return a.id.localeCompare(b.id);
    })
    .map((participant, index) => ({
      ...participant,
      placement: index + 1,
    }));
}

export function formatMatchClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
