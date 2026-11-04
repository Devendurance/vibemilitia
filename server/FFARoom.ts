import { Client, Room } from "colyseus";
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

interface RateBucket {
  windowStart: number;
  count: number;
}

interface AuthenticatedJoinOptions extends JoinOptions {
  name: string;
  roomName: string;
  skinId: string;
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

  async onCreate(options: JoinOptions & { roomName?: string }): Promise<void> {
    this.maxClients = MAX_COMBATANTS;
    this.autoDispose = true;
    const configured = Number(process.env.MATCH_COUNTDOWN_MS);
    this.countdownMs = Number.isFinite(configured)
      ? Math.max(0, Math.min(60_000, configured))
      : DEFAULT_MATCH_COUNTDOWN_MS;
    this.matchName = `${sanitizeGuestName(options.roomName ?? "SECTOR 07")
      .toUpperCase()} // ${this.roomId.slice(0, 4).toUpperCase()}`;
    await this.setMetadata(this.buildMetadata());
    this.setSimulationInterval((delta) => this.gameLoop(delta), 1000 / 60);
    this.onMessage("input", (client, payload) => this.onInput(client, payload));
    this.onMessage("rematch", () => this.onRematch());
  }

  onAuth(_client: Client, options: JoinOptions): AuthenticatedJoinOptions {
    if (this.simulation && this.simulation.phase === "ended") {
      throw new Error("MATCH_ENDED");
    }
    if (this.clients.length >= MAX_COMBATANTS) {
      throw new Error("ROOM_FULL");
    }
    return {
      name: sanitizeGuestName(options?.name ?? ""),
      roomName: this.matchName,
      skinId: getCharacterSkin(options?.skinId).skinId,
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
    );
    if (!result.ok) {
      throw new Error(result.error ?? "JOIN_REJECTED");
    }
    this.lastPhase = this.simulation.phase;
    client.send("snapshot", this.simulation.snapshot());
    client.send("events", this.simulation.drainEvents());
    this.queueMetadataUpdate();
  }

  onLeave(client: Client): void {
    this.rateBuckets.delete(client.sessionId);
    this.simulation?.removeHuman(client.sessionId);
    this.queueMetadataUpdate();
  }

  onDispose(): void {
    this.simulation = null;
    this.rateBuckets.clear();
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
