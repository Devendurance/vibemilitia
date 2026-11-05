import { loadServerConfig, type ServerConfig } from "../config";
import { ProfileStore } from "./ProfileStore";
import { SqliteProfileRepository } from "./SqliteProfileRepository";
import { PostgresProfileStore } from "./PostgresProfileStore";
import type { ProfileRepository } from "./repository";
import { XP_RULES } from "../../src/game/progression/progression";

let store: ProfileRepository | null = null;
let config: ServerConfig | null = null;

export async function initializePersistence(env = process.env): Promise<{
  config: ServerConfig;
  store: ProfileRepository;
}> {
  config = loadServerConfig(env);
  const xpRules = {
    minParticipationMs:
      config.xpMinParticipationMs ?? XP_RULES.minParticipationMs,
  };
  if (config.databaseUrl) {
    const postgres = new PostgresProfileStore({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      ssl: config.databaseSsl,
      xpRules,
    });
    await postgres.connect();
    store = postgres;
  } else {
    store = new SqliteProfileRepository(
      new ProfileStore(config.databasePath, xpRules),
    );
  }
  return { config, store };
}

export function getServerConfig(): ServerConfig {
  if (!config) throw new Error("Server config has not been initialized.");
  return config;
}

export function getProfileStore(): ProfileRepository {
  if (!store) throw new Error("Profile store has not been initialized.");
  return store;
}

export async function closePersistence(): Promise<void> {
  await store?.close();
  store = null;
  config = null;
}
