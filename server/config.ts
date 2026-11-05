import path from "node:path";

export interface ServerConfig {
  port: number;
  databasePath: string;
  databaseUrl: string | null;
  databasePoolMax: number;
  databaseSsl: boolean;
  allowedOrigins: string[];
  reconnectGraceSeconds: number;
  publicOrigin: string | null;
  production: boolean;
  trustProxy: boolean;
  matchCountdownMs: number | null;
  xpMinParticipationMs: number | null;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function parseOrigins(value: string | undefined, production: boolean): string[] {
  if (!value) {
    if (production) {
      throw new Error(
        "ALLOWED_ORIGINS is required in production. Set a comma-separated list of trusted frontend origins.",
      );
    }
    return [
      "http://localhost:3000",
      "http://localhost:3101",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3101",
    ];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === "*") {
        throw new Error("ALLOWED_ORIGINS must not contain a wildcard.");
      }
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`Invalid ALLOWED_ORIGINS entry: ${origin}`);
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`ALLOWED_ORIGINS entry must use http or https: ${origin}`);
      }
      return parsed.origin;
    });
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const production = env.NODE_ENV === "production";
  const publicOrigin = env.PUBLIC_GAME_SERVER_URL?.trim() || null;
  if (publicOrigin) {
    try {
      new URL(publicOrigin);
    } catch {
      throw new Error("PUBLIC_GAME_SERVER_URL must be an absolute URL.");
    }
  }
  const countdown = env.MATCH_COUNTDOWN_MS;
  const xpMin = env.XP_MIN_PARTICIPATION_MS;
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (databaseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("DATABASE_URL must use the postgres protocol.");
    }
  }
  return {
    port: parseInteger(env.PORT, 2567),
    databasePath:
      env.DATABASE_PATH?.trim() ||
      path.join(process.cwd(), "data", "vibe-militia.sqlite"),
    databaseUrl,
    databasePoolMax: Math.max(
      1,
      Math.min(20, parseInteger(env.DATABASE_POOL_MAX, 8)),
    ),
    databaseSsl: env.DATABASE_SSL !== "0",
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS, production),
    reconnectGraceSeconds: Math.max(
      1,
      Math.min(120, parseInteger(env.RECONNECT_GRACE_SECONDS, 20)),
    ),
    publicOrigin,
    production,
    trustProxy: env.TRUST_PROXY === "1",
    matchCountdownMs:
      countdown === undefined || countdown === ""
        ? null
        : Math.max(0, Math.min(60_000, parseInteger(countdown, 10_000))),
    xpMinParticipationMs:
      xpMin === undefined || xpMin === ""
        ? null
        : Math.max(0, parseInteger(xpMin, 45_000)),
  };
}
