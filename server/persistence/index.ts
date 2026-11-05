import { loadServerConfig, type ServerConfig } from "../config";
import { ProfileStore } from "./ProfileStore";
import { XP_RULES } from "../../src/game/progression/progression";

let store: ProfileStore | null = null;
let config: ServerConfig | null = null;

export function initializePersistence(env = process.env): {
  config: ServerConfig;
  store: ProfileStore;
} {
  config = loadServerConfig(env);
  store = new ProfileStore(config.databasePath, {
    minParticipationMs:
      config.xpMinParticipationMs ?? XP_RULES.minParticipationMs,
  });
  return { config, store };
}

export function getServerConfig(): ServerConfig {
  if (!config) throw new Error("Server config has not been initialized.");
  return config;
}

export function getProfileStore(): ProfileStore {
  if (!store) throw new Error("Profile store has not been initialized.");
  return store;
}

export function closePersistence(): void {
  store?.close();
  store = null;
  config = null;
}
