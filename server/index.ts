import "./loadEnv";
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

async function bootstrap(): Promise<void> {
  const { config, store } = await initializePersistence();
  const { allowedOrigins } = config;

const asyncRoute =
  (
    handler: (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => Promise<void>,
  ) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };

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

const requireProfile = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  const token = readBearerToken(request);
  if (!token) {
    response.status(401).json({ error: "GUEST_TOKEN_REQUIRED" });
    return;
  }
  const player = await store.getProfileByToken(token);
  if (!player) {
    response.status(401).json({ error: "GUEST_TOKEN_INVALID" });
    return;
  }
  response.locals.playerId = player.id;
  response.locals.token = token;
  next();
};

app.get("/health", (_request: Request, response: Response) => {
  response.json({
    ok: true,
    service: "vibe-militia-server",
    mode: FFA_ROOM,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get(
  "/ready",
  asyncRoute(async (_request: Request, response: Response) => {
    const health = await store.health();
    response.json({
      ok: health.ok,
      database: {
        backend: health.backend,
        players: health.players,
        matches: health.matches,
      },
      persistence: health.backend,
    });
  }),
);

app.get("/api/config", (_request: Request, response: Response) => {
  response.json({
    reconnectGraceSeconds: config.reconnectGraceSeconds,
    matchCountdownMs: config.matchCountdownMs,
    persistence: store.backend,
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

app.post(
  "/api/guest",
  guestRateLimit,
  asyncRoute(async (request: Request, response: Response) => {
    const body = request.body as { name?: unknown; skinId?: unknown };
    const name = typeof body?.name === "string" ? body.name : "VIBER-GUEST";
    const skinId = getCharacterSkin(
      typeof body?.skinId === "string" ? body.skinId : undefined,
    ).skinId;
    const guest = await store.createGuest(name, skinId);
    log.info("guest.created", { playerId: guest.player.id });
    response.status(201).json(guest);
  }),
);

app.get(
  "/api/profile",
  asyncRoute(requireProfile),
  asyncRoute(async (_request: Request, response: Response) => {
    const player = await store.getProfileById(
      response.locals.playerId as string,
    );
    if (!player) {
      response.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    response.json({
      player,
      pendingAwards: await store.getPendingAwards(player.id),
    });
  }),
);

app.patch(
  "/api/profile",
  asyncRoute(requireProfile),
  asyncRoute(async (request: Request, response: Response) => {
    const playerId = response.locals.playerId as string;
    const body = request.body as {
      name?: unknown;
      skinId?: unknown;
      equipped?: unknown;
      claimAwards?: unknown;
    };
    const current = await store.getProfileById(playerId);
    if (!current) {
      response.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    const name =
      typeof body?.name === "string" ? body.name : current.name;
    const skinId = getCharacterSkin(
      typeof body?.skinId === "string" ? body.skinId : current.skinId,
    ).skinId;
    await store.updateIdentity(playerId, name, skinId);
    if (body?.equipped && typeof body.equipped === "object") {
      const equipped = await store.setEquipped(
        playerId,
        body.equipped as Partial<EquippedCosmetics>,
      );
      if (!equipped) {
        response.status(400).json({ error: "COSMETIC_REJECTED" });
        return;
      }
    }
    if (body?.claimAwards === true) {
      await store.markAwardsDelivered(playerId);
    }
    const player = await store.getProfileById(playerId);
    response.json({
      player,
      pendingAwards:
        body?.claimAwards === true
          ? []
          : await store.getPendingAwards(playerId),
    });
  }),
);

const clientEventBuckets = new Map<string, { at: number; count: number }>();
function clientEventRateLimit(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const reported = (request.body as { clientId?: unknown } | undefined)?.clientId;
  const key =
    typeof reported === "string"
      ? reported.replace(/[^\w-]/g, "").slice(0, 64) || "anonymous"
      : "anonymous";
  const now = Date.now();
  const bucket = clientEventBuckets.get(key);
  if (!bucket || now - bucket.at >= 60_000) {
    clientEventBuckets.set(key, { at: now, count: 1 });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > 20) {
    response.status(429).json({ error: "CLIENT_EVENT_RATE_LIMITED" });
    return;
  }
  next();
}

app.post(
  "/api/client-error",
  clientEventRateLimit,
  asyncRoute(async (request: Request, response: Response) => {
    const body = request.body as {
      message?: unknown;
      route?: unknown;
      appVersion?: unknown;
    };
    if (typeof body?.message !== "string" || body.message.length === 0) {
      response.status(400).json({ error: "MESSAGE_REQUIRED" });
      return;
    }
    const token = readBearerToken(request);
    const profile = token ? await store.getProfileByToken(token) : null;
    await store.recordClientEvent({
      kind: "error",
      message: body.message,
      route:
        typeof body.route === "string"
          ? body.route.split("?")[0] ?? "/"
          : "/unknown",
      appVersion:
        typeof body.appVersion === "string" ? body.appVersion : "unknown",
      guestId: profile?.id ?? null,
      rating: null,
    });
    response.status(204).end();
  }),
);

app.post(
  "/api/feedback",
  clientEventRateLimit,
  asyncRoute(async (request: Request, response: Response) => {
    const body = request.body as {
      rating?: unknown;
      message?: unknown;
      route?: unknown;
      appVersion?: unknown;
    };
    const rating =
      typeof body?.rating === "number" &&
      body.rating >= 1 &&
      body.rating <= 5
        ? Math.floor(body.rating)
        : null;
    const message =
      typeof body?.message === "string" ? body.message.slice(0, 600) : "";
    if (rating === null && message.length === 0) {
      response.status(400).json({ error: "FEEDBACK_REQUIRED" });
      return;
    }
    const token = readBearerToken(request);
    const profile = token ? await store.getProfileByToken(token) : null;
    await store.recordClientEvent({
      kind: "feedback",
      message,
      route:
        typeof body?.route === "string"
          ? body.route.split("?")[0] ?? "/"
          : "/unknown",
      appVersion:
        typeof body?.appVersion === "string" ? body.appVersion : "unknown",
      guestId: profile?.id ?? null,
      rating,
    });
    response.status(204).end();
  }),
);

app.use(
  (
    error: unknown,
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    log.error("api.request_failed", {
      method: request.method,
      path: request.path,
      message: error instanceof Error ? error.message : "unknown",
    });
    if (response.headersSent) {
      next(error);
      return;
    }
    response.status(503).json({ error: "SERVICE_UNAVAILABLE" });
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
  await server.listen(config.port, config.hostname);
  log.info("server.ready", {
    port: config.port,
    origins: allowedOrigins.join(","),
    production: config.production,
    persistence: store.backend,
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
    await closePersistence();
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

  await main();
}

void bootstrap().catch((error: unknown) => {
  log.error("server.boot_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  console.error(error);
  process.exit(1);
});
