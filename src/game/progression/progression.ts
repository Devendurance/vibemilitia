/**
 * Cosmetic-only progression rules shared by the game server and the browser.
 * Nothing in this module may affect health, damage, movement or weapon stats.
 */

export interface XpRules {
  matchCompletion: number;
  humanElimination: number;
  botElimination: number;
  placementBonus: readonly [number, number, number];
  maxHumanEliminationXp: number;
  maxBotEliminationXp: number;
  maxMatchXp: number;
  minParticipationMs: number;
  minInputs: number;
  maxLevel: number;
}

export const XP_RULES: XpRules = {
  matchCompletion: 30,
  humanElimination: 10,
  botElimination: 5,
  placementBonus: [25, 15, 10],
  maxHumanEliminationXp: 80,
  maxBotEliminationXp: 40,
  maxMatchXp: 200,
  minParticipationMs: 45_000,
  minInputs: 20,
  maxLevel: 50,
};

export interface MatchXpInput {
  placement: number;
  humanEliminations: number;
  botEliminations: number;
  participationMs: number;
  inputsReceived: number;
  completed: boolean;
  rules?: Partial<XpRules>;
}

export interface XpBreakdownLine {
  id: "completion" | "human-eliminations" | "bot-eliminations" | "placement";
  label: string;
  xp: number;
}

export interface MatchXpResult {
  eligible: boolean;
  reason: "ok" | "incomplete" | "participation";
  total: number;
  breakdown: XpBreakdownLine[];
}

function resolveRules(overrides?: Partial<XpRules>): XpRules {
  return { ...XP_RULES, ...overrides };
}

export function calculateMatchXp(input: MatchXpInput): MatchXpResult {
  const rules = resolveRules(input.rules);
  if (!input.completed) {
    return { eligible: false, reason: "incomplete", total: 0, breakdown: [] };
  }
  if (
    input.participationMs < rules.minParticipationMs ||
    input.inputsReceived < rules.minInputs
  ) {
    return { eligible: false, reason: "participation", total: 0, breakdown: [] };
  }

  const humanEliminations = Math.max(0, Math.floor(input.humanEliminations));
  const botEliminations = Math.max(0, Math.floor(input.botEliminations));
  const humanXp = Math.min(
    rules.maxHumanEliminationXp,
    humanEliminations * rules.humanElimination,
  );
  const botXp = Math.min(
    rules.maxBotEliminationXp,
    botEliminations * rules.botElimination,
  );
  const placementIndex = Math.max(0, Math.min(2, Math.floor(input.placement) - 1));
  const placementXp = rules.placementBonus[placementIndex] ?? 0;

  const breakdown: XpBreakdownLine[] = [
    {
      id: "completion" as const,
      label: "Match completed",
      xp: rules.matchCompletion,
    },
  ];
  if (humanXp > 0) {
    breakdown.push({
      id: "human-eliminations",
      label: `${humanEliminations} human elimination${humanEliminations === 1 ? "" : "s"}`,
      xp: humanXp,
    });
  }
  if (botXp > 0) {
    breakdown.push({
      id: "bot-eliminations",
      label: `${botEliminations} bot elimination${botEliminations === 1 ? "" : "s"}`,
      xp: botXp,
    });
  }
  if (placementXp > 0) {
    breakdown.push({
      id: "placement",
      label: `Placement #${Math.floor(input.placement)}`,
      xp: placementXp,
    });
  }

  const uncapped = breakdown.reduce((sum, line) => sum + line.xp, 0);
  const total = Math.min(rules.maxMatchXp, uncapped);
  return { eligible: true, reason: "ok", total, breakdown };
}

/** XP needed to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 100 + (safeLevel - 1) * 50;
}

/** Cumulative XP required to reach a level. Level 1 starts at 0. */
export function totalXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  let total = 0;
  for (let current = 1; current < safeLevel; current += 1) {
    total += xpForNextLevel(current);
  }
  return total;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  levelXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNext: number;
  atMaxLevel: boolean;
}

export function progressForXp(
  totalXp: number,
  maxLevel = XP_RULES.maxLevel,
): LevelProgress {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  while (level < maxLevel && safeXp >= totalXpForLevel(level + 1)) {
    level += 1;
  }
  const base = totalXpForLevel(level);
  const nextLevelXp = xpForNextLevel(level);
  const atMaxLevel = level >= maxLevel;
  const levelXp = Math.max(0, safeXp - base);
  return {
    level,
    totalXp: safeXp,
    levelXp,
    nextLevelXp,
    progress: atMaxLevel
      ? 1
      : Math.max(0, Math.min(1, levelXp / nextLevelXp)),
    xpToNext: atMaxLevel ? 0 : Math.max(0, nextLevelXp - levelXp),
    atMaxLevel,
  };
}
