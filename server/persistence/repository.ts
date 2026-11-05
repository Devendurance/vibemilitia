import type { EquippedCosmetics } from "../../src/game/progression/cosmetics";
import type {
  GuestSession,
  MatchRecordInput,
  MatchRecordResult,
  MatchReward,
  PlayerProfile,
} from "../../src/game/progression/profile";

export interface LeaderboardSettings {
  xHandle: string | null;
  xPublic: boolean;
  leaderboardVisible: boolean;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  xp: number;
  wins: number;
  losses: number;
  eliminations: number;
  deaths: number;
  matches_played: number;
  x_handle: string | null;
  x_public: boolean | number;
}

export interface ProfileHealth {
  ok: boolean;
  backend: "sqlite" | "postgres";
  players: number;
  matches: number;
}

export interface ClientEventInput {
  kind: "error" | "feedback";
  message: string;
  route: string;
  appVersion: string;
  guestId: string | null;
  rating: number | null;
}

export interface ProfileRepository {
  readonly backend: "sqlite" | "postgres";
  createGuest(name: string, skinId: string): Promise<GuestSession>;
  getProfileByToken(token: string): Promise<PlayerProfile | null>;
  getProfileById(id: string): Promise<PlayerProfile | null>;
  updateIdentity(
    playerId: string,
    name: string,
    skinId: string,
  ): Promise<PlayerProfile | null>;
  setEquipped(
    playerId: string,
    requested: Partial<EquippedCosmetics>,
  ): Promise<PlayerProfile | null>;
  updateLeaderboardSettings(
    playerId: string,
    input: Partial<LeaderboardSettings>,
  ): Promise<PlayerProfile | null>;
  getLeaderboard(limit: number): Promise<LeaderboardRow[]>;
  recordMatch(input: MatchRecordInput): Promise<MatchRecordResult | null>;
  getPendingAwards(playerId: string): Promise<MatchReward[]>;
  markAwardsDelivered(playerId: string): Promise<void>;
  markAwardDelivered(playerId: string, matchId: string): Promise<void>;
  recordClientEvent(input: ClientEventInput): Promise<void>;
  health(): Promise<ProfileHealth>;
  close(): Promise<void>;
}
