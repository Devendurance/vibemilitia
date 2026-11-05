import { Client, CloseCode, Room } from "colyseus";
import { getCharacterSkin } from "../src/game/characters/roster";
import { GameSimulation } from "../src/game/multiplayer/GameSimulation";
import {
  DEFAULT_MATCH_COUNTDOWN_MS,
  MAX_COMBATANTS,
  SNAPSHOT_INTERVAL_MS,
  sanitizeGuestName,
  type JoinOptions,
  type OnlineInputPayload,
  type OnlineRoomMetadata,
} from "../src/game/multiplayer/protocol";
import type { MatchReward } from "../src/game/progression/profile";
import { getProfileStore } from "./persistence";
import { getServerConfig } from "./persistence";
import { resumeRegistry } from "./resumeRegistry";
import { log } from "./log";

interface RateBucket {
  windowStart: number;
  count: number;
}

interface AuthenticatedJoinOptions extends JoinOptions {
  name: string;
  roomName: string;
  skinId: string;
  playerId: string | null;
  level: number;
  equipped: {
    titleId: string;
    badgeId: string;
    eliminationId: string;
    trailId: string;
  };
}

export class FFARoom extends Room {
  private simulation: GameSimulation | null = null;
  private accumulator = 0;
  private lastSnapshotAt = 0;
  private lastMetadataAt = 0;
  private rateBuckets = new Map<string, RateBucket>();
  private matchName = "SECTOR 07";
  private countdownMs = DEFAULT_MATCH_COUNTDOWN_MS;
  private lastPhase: string | null = null;
  private metadataChain: Promise<void> = Promise.resolve();
  private lastRecordedMatchId: string | null = null;
  private settlementInFlight = false;
  private rewardsByPlayer = new Map<string, MatchReward>();
  private reservations = new Set<string>();

  async onCreate(options: JoinOptions & { roomName?: string }): Promise<void> {
    this.maxClients = MAX_COMBATANTS;
    this.autoDispose = true;
    const configured =
      getServerConfig().matchCountdownMs ??
      Number(process.env.MATCH_COUNTDOWN_MS);
    this.countdownMs = Number.isFinite(configured)
      ? Math.max(0, Math.min(60_000, configured))
      : DEFAULT_MATCH_COUNTDOWN_MS;
    this.matchName = `${sanitizeGuestName(options.roomName ?? "SECTOR 07")
      .toUpperCase()} // ${this.roomId.slice(0, 4).toUpperCase()}`;
    await this.setMetadata(this.buildMetadata());
    this.setSimulationInterval((delta) => this.gameLoop(delta), 1000 / 60);
    this.onMessage("input", (client, payload) => this.onInput(client, payload));
    this.onMessage("rematch", () => this.onRematch());
    this.onMessage("request-resume", (client) => {
      const playerId =
        this.simulation
          ?.matchResults()
          .find((entry) => entry.id === client.sessionId)?.playerId ?? null;
      this.issueResume(client, playerId);
    });
    if (process.env.VIBE_MILITIA_TEST_HOOKS === "1") {
      this.onMessage("debug-eliminate", (client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { victimId?: unknown; source?: unknown };
        const victimId =
          typeof value.victimId === "string" ? value.victimId : client.sessionId;
        const source =
          value.source === "grenade" || value.source === "toxic"
            ? value.source
            : "bullet";
        this.simulation.debugEliminate(victimId, client.sessionId, source);
      });
      this.onMessage("debug-teleport", (client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { x?: unknown; y?: unknown };
        if (typeof value.x !== "number" || typeof value.y !== "number") return;
        this.simulation.debugTeleport(client.sessionId, value.x, value.y);
      });
      this.onMessage("debug-teleport-bot", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as {
          id?: unknown;
          x?: unknown;
          y?: unknown;
        };
        if (
          typeof value.id !== "string" ||
          typeof value.x !== "number" ||
          typeof value.y !== "number"
        ) {
          return;
        }
        this.simulation.debugTeleport(value.id, value.x, value.y);
      });
      this.onMessage("debug-end-match", () => {
        this.simulation?.debugEndMatch();
      });
      this.onMessage("debug-guard", (client) => {
        this.simulation?.debugSetInvulnerable(client.sessionId, 600_000);
      });
      this.onMessage("debug-guard-target", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { id?: unknown };
        if (typeof value.id !== "string") return;
        this.simulation.debugSetInvulnerable(value.id, 600_000);
      });
      this.onMessage("debug-give-weapon", (client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { id?: unknown; weaponId?: unknown };
        if (typeof value.weaponId !== "string") return;
        const targetId =
          typeof value.id === "string" ? value.id : client.sessionId;
        this.simulation.debugGiveWeapon(targetId, value.weaponId);
      });
      this.onMessage("debug-freeze", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { id?: unknown; frozen?: unknown };
        if (typeof value.id !== "string") return;
        this.simulation.debugFreeze(value.id, Boolean(value.frozen));
      });
      this.onMessage("debug-disable-bot-curiosity", () => {
        this.simulation?.debugDisableBotWeaponCuriosity();
      });
      this.onMessage("debug-pause-bot-loot", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { paused?: unknown };
        this.simulation.debugPauseBotLoot(Boolean(value.paused));
      });
      this.onMessage("debug-pause-loot", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { paused?: unknown };
        this.simulation.debugPauseLootCollection(Boolean(value.paused));
      });
      this.onMessage("debug-extend-match", (_client, payload) => {
        if (!this.simulation || !payload || typeof payload !== "object") return;
        const value = payload as { durationMs?: unknown };
        if (typeof value.durationMs !== "number") return;
        this.simulation.debugExtendMatch(value.durationMs);
      });
      this.onMessage("debug-reset-pickups", () => {
        this.simulation?.debugResetPickups();
      });
    }
  }

  onAuth(
    _client: Client,
    options: JoinOptions,
  ): Promise<AuthenticatedJoinOptions> {
    return this.authenticate(options);
  }

  private async authenticate(
    options: JoinOptions,
  ): Promise<AuthenticatedJoinOptions> {
    if (this.simulation && this.simulation.phase === "ended") {
      throw new Error("MATCH_ENDED");
    }
    const humanSeats = this.simulation?.humanSeats ?? 0;
    if (humanSeats + this.reservations.size >= MAX_COMBATANTS) {
      throw new Error("ROOM_FULL");
    }
    let playerId: string | null = null;
    let level = 1;
    let equipped = {
      titleId: "title-rookie",
      badgeId: "badge-lime-recruit",
      eliminationId: "elimination-lime",
      trailId: "trail-lime",
    };
    if (options?.guestToken) {
      const profile = await getProfileStore().getProfileByToken(
        options.guestToken,
      );
      if (!profile) {
        throw new Error("GUEST_TOKEN_INVALID");
      }
      playerId = profile.id;
      level = profile.level;
      equipped = { ...profile.equipped };
      if (this.simulation?.hasHumanPlayer(playerId)) {
        throw new Error("ALREADY_IN_ROOM");
      }
      this.reservations.add(playerId);
    }
    return {
      name: sanitizeGuestName(options?.name ?? ""),
      roomName: this.matchName,
      skinId: getCharacterSkin(options?.skinId).skinId,
      playerId,
      level,
      equipped,
    };
  }

  onJoin(
    client: Client,
    options: JoinOptions,
    auth?: AuthenticatedJoinOptions,
  ): void {
    if (!this.simulation) {
      this.simulation = new GameSimulation({
        roomId: this.roomId,
        roomName: this.matchName,
        countdownMs: this.countdownMs,
      });
    }
    const name =
      auth?.name ?? sanitizeGuestName(options?.name ?? "");
    const skinId =
      auth?.skinId ?? getCharacterSkin(options?.skinId).skinId;
    const result = this.simulation.addHuman(
      client.sessionId,
      name,
      skinId,
      {
        playerId: auth?.playerId ?? null,
        cosmetics: auth
          ? { level: auth.level, equipped: auth.equipped }
          : null,
      },
    );
    if (!result.ok) {
      if (auth?.playerId) this.reservations.delete(auth.playerId);
      throw new Error(result.error ?? "JOIN_REJECTED");
    }
    if (auth?.playerId) this.reservations.delete(auth.playerId);
    this.lastPhase = this.simulation.phase;
    client.send("snapshot", this.simulation.snapshot());
    client.send("events", this.simulation.drainEvents());
    if (auth?.playerId) {
      const reward = this.rewardsByPlayer.get(auth.playerId);
      if (reward) client.send("profile-update", reward);
      this.issueResume(client, auth.playerId);
    }
    this.queueMetadataUpdate();
  }

  private issueResume(client: Client, playerId: string | null): void {
    if (!playerId) return;
    const graceSeconds = getServerConfig().reconnectGraceSeconds;
    const expiresAt = Date.now() + graceSeconds * 1000;
    const resume = resumeRegistry.issue({
      playerId,
      roomId: this.roomId,
      sessionId: client.sessionId,
      reconnectionToken: client.reconnectionToken,
      expiresAt,
    });
    if (!resume.handle) return;
    client.send("resume-ready", {
      handle: resume.handle,
      roomId: this.roomId,
      expiresAt: resume.expiresAt,
      graceSeconds,
    });
  }

  onDrop(client: Client, code?: number): void {
    if (code === CloseCode.CONSENTED) return;
    this.rateBuckets.delete(client.sessionId);
    this.simulation?.setHumanConnected(client.sessionId, false);
    const graceSeconds = getServerConfig().reconnectGraceSeconds;
    resumeRegistry.refresh(
      this.roomId,
      client.sessionId,
      Date.now() + graceSeconds * 1000,
    );
    log.info("human.drop", {
      roomId: this.roomId,
      sessionId: client.sessionId,
      graceSeconds,
    });
    void this.allowReconnection(client, graceSeconds)
      .then(async (reconnected) => {
        this.simulation?.setHumanConnected(reconnected.sessionId, true);
        reconnected.send("snapshot", this.simulation?.snapshot() ?? null);
        const profileId =
          this.simulation
            ?.matchResults()
            .find((entry) => entry.id === reconnected.sessionId)?.playerId ??
          null;
        this.issueResume(reconnected, profileId);
        const reward = profileId
          ? this.rewardsByPlayer.get(profileId)
          : undefined;
        if (reward && profileId) {
          reconnected.send("profile-update", reward);
          await getProfileStore()
            .markAwardDelivered(profileId, reward.matchId)
            .catch((error: unknown) => {
              log.error("profile.reward_delivery_failed", {
                roomId: this.roomId,
                playerId: profileId,
                message:
                  error instanceof Error ? error.message : "unknown",
              });
            });
        }
        log.info("human.reconnected", {
          roomId: this.roomId,
          sessionId: reconnected.sessionId,
        });
      })
      .catch(() => {
        this.releaseClient(client.sessionId);
      });
  }

  onLeave(client: Client, code?: number): void {
    if (code !== CloseCode.CONSENTED) {
      // onDrop owns the grace period and calls releaseClient on timeout.
      // Colyseus also calls onLeave after a rejected reconnection, and
      // releaseClient is idempotent.
      this.releaseClient(client.sessionId);
      return;
    }
    this.releaseClient(client.sessionId);
  }

  private releaseClient(sessionId: string): void {
    this.rateBuckets.delete(sessionId);
    resumeRegistry.dropSession(this.roomId, sessionId);
    if (!this.simulation) return;
    const human = this.simulation
      .matchResults()
      .find((entry) => entry.id === sessionId);
    if (!human) return;
    this.simulation.removeHuman(sessionId);
    this.queueMetadataUpdate();
    log.info("human.left", {
      roomId: this.roomId,
      sessionId,
      playerId: human.playerId,
    });
  }

  onDispose(): void {
    this.simulation = null;
    this.rateBuckets.clear();
    this.reservations.clear();
    this.rewardsByPlayer.clear();
    resumeRegistry.dropRoom(this.roomId);
  }

  private gameLoop(deltaMs: number): void {
    if (!this.simulation) return;
    this.accumulator += Math.min(deltaMs, 100);
    let iterations = 0;
    while (this.accumulator >= 1000 / 60 && iterations < 5) {
      this.simulation.tick(1000 / 60);
      this.accumulator -= 1000 / 60;
      iterations += 1;
    }

    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      this.broadcast("events", events);
    }

    const phase = this.simulation.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase === "ended") this.queueMatchSettlement();
      this.queueMetadataUpdate();
    }

    const now = Date.now();
    if (now - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.lastSnapshotAt = now;
      this.broadcast("snapshot", this.simulation.snapshot());
    }
    if (now - this.lastMetadataAt >= 1000) {
      this.lastMetadataAt = now;
      this.queueMetadataUpdate();
    }
  }

  private queueMatchSettlement(): void {
    if (this.settlementInFlight) return;
    this.settlementInFlight = true;
    void this.recordCompletedMatch()
      .catch((error: unknown) => {
        this.lastRecordedMatchId = null;
        log.error("match.settlement_failed", {
          roomId: this.roomId,
          message: error instanceof Error ? error.message : "unknown",
        });
        this.clock.setTimeout(() => this.queueMatchSettlement(), 5000);
      })
      .finally(() => {
        this.settlementInFlight = false;
      });
  }

  private async recordCompletedMatch(): Promise<void> {
    const simulation = this.simulation;
    if (!simulation || simulation.phase !== "ended") return;
    const matchId = simulation.matchId;
    if (this.lastRecordedMatchId === matchId) return;
    this.lastRecordedMatchId = matchId;
    const store = getProfileStore();
    for (const result of simulation.matchResults()) {
      if (!result.playerId) continue;
      const recorded = await store.recordMatch({
        matchId,
        playerId: result.playerId,
        placement: result.placement,
        eliminations: result.eliminations,
        deaths: result.deaths,
        humanEliminations: result.humanEliminations,
        botEliminations: result.botEliminations,
        participationMs: result.participationMs,
        inputsReceived: result.inputsReceived,
        completed: true,
        skinId: result.skinId,
        weaponShots: result.weaponShots,
        weaponHits: result.weaponHits,
        weaponEliminations: result.weaponEliminations,
      });
      if (!recorded) continue;
      if (recorded.duplicate) continue;
      this.rewardsByPlayer.set(result.playerId, recorded.reward);
      const client = this.clients.find(
        (entry) => entry.sessionId === result.id,
      );
      if (client) {
        client.send("profile-update", recorded.reward);
        await store.markAwardDelivered(result.playerId, matchId);
      }
      log.info("match.recorded", {
        roomId: this.roomId,
        matchId,
        playerId: result.playerId,
        xp: recorded.reward.xpEarned,
        level: recorded.reward.levelAfter,
      });
    }
  }

  private onInput(client: Client, payload: unknown): void {
    if (!this.simulation || this.simulation.phase !== "live") return;
    if (!this.consumeRateLimit(client.sessionId)) return;
    if (!payload || typeof payload !== "object") return;
    const value = payload as OnlineInputPayload;
    if (
      typeof value.seq !== "number" ||
      typeof value.moveX !== "number" ||
      typeof value.aim !== "number" ||
      !Number.isFinite(value.seq) ||
      !Number.isFinite(value.moveX) ||
      !Number.isFinite(value.aim)
    ) {
      return;
    }
    this.simulation.applyInput(client.sessionId, {
      seq: value.seq,
      moveX: value.moveX,
      jump: Boolean(value.jump),
      jumpHeld: Boolean(value.jumpHeld),
      fire: Boolean(value.fire),
      reload: Boolean(value.reload),
      weapon:
        value.weapon === null || value.weapon === undefined
          ? null
          : Number(value.weapon),
      aim: value.aim,
      useMedkit: Boolean(value.useMedkit),
      grenadeSlot:
        value.grenadeSlot === null || value.grenadeSlot === undefined
          ? null
          : Number(value.grenadeSlot),
      throwGrenade: Boolean(value.throwGrenade),
      swapWeapon: Boolean(value.swapWeapon),
    });
  }

  private onRematch(): void {
    if (!this.simulation) return;
    const result = this.simulation.rematch();
    if (!result.ok) return;
    this.broadcast("snapshot", this.simulation.snapshot());
    this.broadcast("events", this.simulation.drainEvents());
    this.queueMetadataUpdate();
  }

  private consumeRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const bucket = this.rateBuckets.get(sessionId);
    if (!bucket || now - bucket.windowStart >= 1000) {
      this.rateBuckets.set(sessionId, { windowStart: now, count: 1 });
      return true;
    }
    if (bucket.count >= 45) return false;
    bucket.count += 1;
    return true;
  }

  private buildMetadata(): OnlineRoomMetadata {
    const snapshot = this.simulation?.snapshot();
    const joinable = snapshot?.joinable ?? true;
    return {
      name: this.matchName,
      mode: "ffa",
      phase: snapshot?.phase ?? "waiting",
      humans: snapshot?.humans ?? 0,
      bots: snapshot?.bots ?? 0,
      maxCombatants: MAX_COMBATANTS,
      joinable,
      open: joinable,
      remainingMs: snapshot?.remainingMs ?? 90_000,
      countdownMs: snapshot?.countdownRemainingMs ?? 0,
    };
  }

  private queueMetadataUpdate(): void {
    this.lastMetadataAt = Date.now();
    const metadata = this.buildMetadata();
    this.metadataChain = this.metadataChain
      .then(() => this.setMetadata(metadata))
      .catch(() => undefined);
  }
}
