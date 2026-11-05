import type { EquippedCosmetics } from "../../src/game/progression/cosmetics";
import type {
  GuestSession,
  MatchRecordInput,
  MatchRecordResult,
  MatchReward,
  PlayerProfile,
} from "../../src/game/progression/profile";

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
  recordMatch(input: MatchRecordInput): Promise<MatchRecordResult | null>;
  getPendingAwards(playerId: string): Promise<MatchReward[]>;
  markAwardsDelivered(playerId: string): Promise<void>;
  markAwardDelivered(playerId: string, matchId: string): Promise<void>;
  recordClientEvent(input: ClientEventInput): Promise<void>;
  health(): Promise<ProfileHealth>;
  close(): Promise<void>;
}
