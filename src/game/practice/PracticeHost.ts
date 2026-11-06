import { getCharacterSkin } from "@/game/characters/roster";
import {
  SIM_BOT_TUNING,
  type PracticeDifficulty,
} from "@/game/config/gameplay";
import { GameSimulation } from "@/game/multiplayer/GameSimulation";
import {
  SERVER_TICK_MS,
  type OnlineInputPayload,
} from "@/game/multiplayer/protocol";
import {
  CompactSnapshotStream,
  SNAPSHOT_FAST,
  SNAPSHOT_SELF,
  SNAPSHOT_SLOW,
} from "@/game/multiplayer/snapshotCodec";

export const PRACTICE_SESSION_ID = "practice-player";
const PRACTICE_COUNTDOWN_MS = 3000;
/** Local link, so snapshots can arrive more often than the online 20 Hz. */
const SNAPSHOT_INTERVAL_MS = 33;

export interface PracticeOptions {
  difficulty: PracticeDifficulty;
  playerName: string;
  skinId: string;
  /** Enables debug-* messages. Local development and suites only. */
  debug: boolean;
}

export type PracticeEmit = (type: string, message: unknown) => void;

/**
 * The practice match. Same `GameSimulation` and same message stream as an
 * online room, so seven weapons, three grenades, medkits, caches, loot, damage,
 * reloads and respawns are the real rules rather than a copy. There is no
 * profile id on the human and no network, so nothing can reach ranked XP.
 */
export class PracticeHost {
  private simulation: GameSimulation;
  private stream = new CompactSnapshotStream();
  private emit: PracticeEmit;
  private accumulator = 0;
  private sinceSnapshot = 0;
  private lastPhase: string;
  private paused = false;
  private debug: boolean;

  constructor(options: PracticeOptions, emit: PracticeEmit) {
    this.emit = emit;
    this.debug = options.debug;
    this.simulation = new GameSimulation({
      roomId: `practice-${options.difficulty}-${Date.now().toString(36)}`,
      roomName: "SECTOR 07",
      countdownMs: PRACTICE_COUNTDOWN_MS,
      botTuning: SIM_BOT_TUNING[options.difficulty],
    });
    this.simulation.addHuman(
      PRACTICE_SESSION_ID,
      options.playerName,
      getCharacterSkin(options.skinId).skinId,
      { playerId: null, cosmetics: null },
    );
    this.lastPhase = this.simulation.phase;
    this.sendFull();
  }

  private sendFull(): void {
    this.emit("snapshot", this.simulation.snapshot());
    this.flushEvents();
  }

  private flushEvents(): void {
    const events = this.simulation.drainEvents();
    if (events.length > 0) this.emit("events", events);
  }

  private sendFrame(force: boolean): void {
    const full = this.simulation.snapshot();
    const frame = this.stream.frame(full, Date.now(), force);
    if (frame.slow) this.emit(SNAPSHOT_SLOW, frame.slow);
    const self = this.stream.selfFor(full, PRACTICE_SESSION_ID, force);
    if (self) this.emit(SNAPSHOT_SELF, self);
    this.emit(SNAPSHOT_FAST, frame.fast);
  }

  advance(deltaMs: number): void {
    if (this.paused) return;
    this.accumulator += Math.min(deltaMs, 100);
    let iterations = 0;
    while (this.accumulator >= SERVER_TICK_MS && iterations < 6) {
      this.simulation.tick(SERVER_TICK_MS);
      this.accumulator -= SERVER_TICK_MS;
      iterations += 1;
    }
    this.flushEvents();
    const phase = this.simulation.phase;
    const phaseChanged = phase !== this.lastPhase;
    this.lastPhase = phase;
    this.sinceSnapshot += deltaMs;
    if (phaseChanged || this.sinceSnapshot >= SNAPSHOT_INTERVAL_MS) {
      this.sinceSnapshot = 0;
      this.sendFrame(phaseChanged);
    }
  }

  handle(type: string, message: unknown): void {
    switch (type) {
      case "input":
        this.simulation.applyInput(
          PRACTICE_SESSION_ID,
          message as OnlineInputPayload,
        );
        return;
      case "resync":
        this.sendFull();
        return;
      case "rematch":
        if (this.simulation.rematch().ok) this.sendFull();
        return;
      case "pause":
        this.paused = Boolean(message);
        return;
      default:
        if (this.debug) this.handleDebug(type, message);
    }
  }

  private handleDebug(type: string, message: unknown): void {
    const sim = this.simulation;
    const value = (message ?? {}) as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : PRACTICE_SESSION_ID;
    switch (type) {
      case "debug-eliminate":
        sim.debugEliminate(
          String(value.victimId ?? PRACTICE_SESSION_ID),
          PRACTICE_SESSION_ID,
          value.source === "grenade" || value.source === "toxic"
            ? value.source
            : "bullet",
        );
        break;
      case "debug-teleport":
        sim.debugTeleport(PRACTICE_SESSION_ID, Number(value.x), Number(value.y));
        break;
      case "debug-teleport-bot":
        sim.debugTeleport(id, Number(value.x), Number(value.y));
        break;
      case "debug-end-match":
        sim.debugEndMatch();
        break;
      case "debug-guard":
        sim.debugSetInvulnerable(PRACTICE_SESSION_ID, 600_000);
        break;
      case "debug-guard-target":
        sim.debugSetInvulnerable(id, 600_000);
        break;
      case "debug-give-weapon":
        sim.debugGiveWeapon(id, String(value.weaponId));
        break;
      case "debug-freeze":
        sim.debugFreeze(id, Boolean(value.frozen));
        break;
      case "debug-disable-bot-curiosity":
        sim.debugDisableBotWeaponCuriosity();
        break;
      case "debug-pause-bot-loot":
        sim.debugPauseBotLoot(Boolean(value.paused));
        break;
      case "debug-pause-loot":
        sim.debugPauseLootCollection(Boolean(value.paused));
        break;
      case "debug-extend-match":
        sim.debugExtendMatch(Number(value.durationMs));
        break;
      case "debug-reset-pickups":
        sim.debugResetPickups();
        break;
      default:
        break;
    }
  }
}
