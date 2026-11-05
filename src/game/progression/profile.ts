import type { EquippedCosmetics } from "@/game/progression/cosmetics";
import type { MatchXpResult } from "@/game/progression/progression";

export interface PlayerRecentMatch {
  matchId: string;
  placement: number;
  eliminations: number;
  deaths: number;
  xpEarned: number;
  completedAt: number;
  outcome: "win" | "loss";
}

export interface PlayerWeaponStat {
  weaponId: string;
  shots: number;
  hits: number;
  eliminations: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  skinId: string;
  xp: number;
  level: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  eliminations: number;
  deaths: number;
  equipped: EquippedCosmetics;
  unlocked: string[];
  recentMatches: PlayerRecentMatch[];
  weaponStats: PlayerWeaponStat[];
  createdAt: number;
  updatedAt: number;
}

export interface GuestSession {
  player: PlayerProfile;
  token: string;
  pendingAwards: MatchReward[];
}

export interface MatchReward {
  matchId: string;
  xpEarned: number;
  breakdown: MatchXpResult["breakdown"];
  levelBefore: number;
  levelAfter: number;
  levelUp: boolean;
  profile: PlayerProfile;
}

export interface MatchRecordInput {
  matchId: string;
  playerId: string;
  placement: number;
  eliminations: number;
  deaths: number;
  humanEliminations: number;
  botEliminations: number;
  participationMs: number;
  inputsReceived: number;
  completed: boolean;
  skinId: string;
  weaponShots: Record<string, number>;
  weaponHits: Record<string, number>;
  weaponEliminations: Record<string, number>;
}

export interface MatchRecordResult {
  reward: MatchReward;
  duplicate: boolean;
}
