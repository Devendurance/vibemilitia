import type { EquippedCosmetics } from "../../src/game/progression/cosmetics";
import type {
  GuestSession,
  MatchRecordInput,
  MatchRecordResult,
  MatchReward,
  PlayerProfile,
} from "../../src/game/progression/profile";
import { ProfileStore } from "./ProfileStore";
import type {
  ClientEventInput,
  LeaderboardRow,
  LeaderboardSettings,
  ProfileHealth,
  ProfileRepository,
} from "./repository";
export class SqliteProfileRepository implements ProfileRepository {
  readonly backend = "sqlite" as const;
  private readonly store: ProfileStore;

  constructor(store: ProfileStore) {
    this.store = store;
  }

  async createGuest(name: string, skinId: string): Promise<GuestSession> {
    return this.store.createGuest(name, skinId);
  }

  async getProfileByToken(token: string): Promise<PlayerProfile | null> {
    return this.store.getProfileByToken(token);
  }

  async getProfileById(id: string): Promise<PlayerProfile | null> {
    return this.store.getProfileById(id);
  }

  async updateIdentity(
    playerId: string,
    name: string,
    skinId: string,
  ): Promise<PlayerProfile | null> {
    return this.store.updateIdentity(playerId, name, skinId);
  }

  async setEquipped(
    playerId: string,
    requested: Partial<EquippedCosmetics>,
  ): Promise<PlayerProfile | null> {
    return this.store.setEquipped(playerId, requested);
  }

  async updateLeaderboardSettings(
    playerId: string,
    input: Partial<LeaderboardSettings>,
  ): Promise<PlayerProfile | null> {
    return this.store.updateLeaderboardSettings(playerId, input);
  }

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    return this.store.getLeaderboard(limit);
  }

  async recordMatch(input: MatchRecordInput): Promise<MatchRecordResult | null> {
    return this.store.recordMatch(input);
  }

  async getPendingAwards(playerId: string): Promise<MatchReward[]> {
    return this.store.getPendingAwards(playerId);
  }

  async markAwardsDelivered(playerId: string): Promise<void> {
    this.store.markAwardsDelivered(playerId);
  }

  async markAwardDelivered(playerId: string, matchId: string): Promise<void> {
    this.store.markAwardDelivered(playerId, matchId);
  }

  async recordClientEvent(input: ClientEventInput): Promise<void> {
    this.store.recordClientEvent(input);
  }

  async health(): Promise<ProfileHealth> {
    const value = this.store.health();
    return { ...value, backend: this.backend };
  }

  async close(): Promise<void> {
    this.store.close();
  }
}
