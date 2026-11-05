import { LobbyRoom, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express, { type NextFunction, type Request, type Response } from "express";
import { FFARoom } from "./FFARoom";
import { FFA_ROOM, LOBBY_ROOM } from "../src/game/multiplayer/protocol";
import { getCharacterSkin } from "../src/game/characters/roster";
import type { EquippedCosmetics } from "../src/game/progression/cosmetics";
import {
  closePersistence,
  initializePersistence,
} from "./persistence";
import { log } from "./log";

const { config, store } = initializePersistence();
const { allowedOrigins } = config;

function isAllowedOrigin(origin: string | null | undefined): boolean {
  // Native and same-origin clients may omit Origin. Browsers always send it.
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

const transport = new WebSocketTransport({
  beforeUpgrade: (request) => {
    const origin = request.headers.get("origin");
    if (!isAllowedOrigin(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    return undefined;
  },
});
const app = transport.getExpressApp();

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);
app.use((request: Request, response: Response, next: NextFunction) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS",
    );
    response.setHeader("Access-Control-Max-Age", "600");
  }
  if (request.method === "OPTIONS") {
    response.status(origin && allowedOrigins.includes(origin) ? 204 : 403).end();
    return;
  }
  next();
});
app.use(express.json({ limit: "16kb" }));

const apiBuckets = new Map<string, { at: number; count: number }>();
function apiRateLimit(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const key = request.ip ?? "unknown";
  const now = Date.now();
  const bucket = apiBuckets.get(key);
  if (!bucket || now - bucket.at >= 60_000) {
    apiBuckets.set(key, { at: now, count: 1 });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > 120) {
    response.status(429).json({ error: "RATE_LIMITED" });
    return;
  }
  next();
}
app.use("/api", apiRateLimit);

function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 20 ? token : null;
}

function requireProfile(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const token = readBearerToken(request);
  if (!token) {
    response.status(401).json({ error: "GUEST_TOKEN_REQUIRED" });
    return;
  }
  const player = store.getProfileByToken(token);
  if (!player) {
    response.status(401).json({ error: "GUEST_TOKEN_INVALID" });
    return;
  }
  response.locals.playerId = player.id;
  response.locals.token = token;
  next();
}

app.get("/health", (_request: Request, response: Response) => {
  response.json({
    ok: true,
    service: "vibe-militia-server",
    mode: FFA_ROOM,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("/ready", (_request: Request, response: Response) => {
  try {
    const health = store.health();
    response.json({
      ok: health.ok,
      database: { players: health.players, matches: health.matches },
      persistence: config.databasePath.includes(":memory:")
        ? "memory"
        : "sqlite",
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : "DATABASE_UNAVAILABLE",
    });
  }
});

app.get("/api/config", (_request: Request, response: Response) => {
  response.json({
    reconnectGraceSeconds: config.reconnectGraceSeconds,
    matchCountdownMs: config.matchCountdownMs,
    persistence: config.databasePath.includes(":memory:") ? "memory" : "sqlite",
  });
});

const guestBuckets = new Map<string, { at: number; count: number }>();
function guestRateLimit(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const key = request.ip ?? "unknown";
  const now = Date.now();
  const bucket = guestBuckets.get(key);
  if (!bucket || now - bucket.at >= 60_000) {
    guestBuckets.set(key, { at: now, count: 1 });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > 10) {
    response.status(429).json({ error: "GUEST_RATE_LIMITED" });
    return;
  }
  next();
}

app.post("/api/guest", guestRateLimit, (request: Request, response: Response) => {
  const body = request.body as { name?: unknown; skinId?: unknown };
  const name = typeof body?.name === "string" ? body.name : "VIBER-GUEST";
  const skinId = getCharacterSkin(
    typeof body?.skinId === "string" ? body.skinId : undefined,
  ).skinId;
  const guest = store.createGuest(name, skinId);
  log.info("guest.created", { playerId: guest.player.id });
  response.status(201).json(guest);
});

app.get(
  "/api/profile",
  requireProfile,
  (_request: Request, response: Response) => {
    const player = store.getProfileById(response.locals.playerId as string);
    if (!player) {
      response.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    response.json({
      player,
      pendingAwards: store.getPendingAwards(player.id),
    });
  },
);

app.patch(
  "/api/profile",
  requireProfile,
  (request: Request, response: Response) => {
    const playerId = response.locals.playerId as string;
    const body = request.body as {
      name?: unknown;
      skinId?: unknown;
      equipped?: unknown;
      claimAwards?: unknown;
    };
    const current = store.getProfileById(playerId);
    if (!current) {
      response.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    const name =
      typeof body?.name === "string" ? body.name : current.name;
    const skinId = getCharacterSkin(
      typeof body?.skinId === "string" ? body.skinId : current.skinId,
    ).skinId;
    store.updateIdentity(playerId, name, skinId);
    if (body?.equipped && typeof body.equipped === "object") {
      const equipped = store.setEquipped(
        playerId,
        body.equipped as Partial<EquippedCosmetics>,
      );
      if (!equipped) {
        response.status(400).json({ error: "COSMETIC_REJECTED" });
        return;
      }
    }
    if (body?.claimAwards === true) {
      store.markAwardsDelivered(playerId);
    }
    const player = store.getProfileById(playerId);
    response.json({
      player,
      pendingAwards: body?.claimAwards === true ? [] : store.getPendingAwards(playerId),
    });
  },
);

const server = new Server({ transport });
server.define(LOBBY_ROOM, LobbyRoom);
server
  .define(FFA_ROOM, FFARoom)
  .filterBy(["open"])
  .sortBy({ clients: -1 })
  .enableRealtimeListing();

async function main(): Promise<void> {
  await server.listen(config.port);
  log.info("server.ready", {
    port: config.port,
    origins: allowedOrigins.join(","),
    production: config.production,
  });
  console.log(`Vibe Militia server listening on port ${config.port}`);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("server.shutdown", { signal });
  try {
    await server.gracefullyShutdown(false);
  } finally {
    closePersistence();
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  log.error("server.uncaught_exception", { message: error.message });
  console.error(error);
});
process.on("unhandledRejection", (reason) => {
  log.error("server.unhandled_rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
});

void main();
