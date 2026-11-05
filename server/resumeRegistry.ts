import { createHash, randomBytes } from "node:crypto";

interface ResumeEntry {
  handleHash: string;
  playerId: string;
  roomId: string;
  sessionId: string;
  reconnectionToken: string;
  expiresAt: number;
}

export interface ResumeHandle {
  handle: string;
  expiresAt: number;
}

function hashHandle(handle: string): string {
  return createHash("sha256").update(handle).digest("hex");
}

function sessionKey(roomId: string, sessionId: string): string {
  return `${roomId}:${sessionId}`;
}

/**
 * In-memory, single-process resume registry. The Colyseus reconnection token is
 * only released by the HTTP API when the caller presents the guest bearer token
 * that owns the reserved seat. Handles are random, single-use and expire with
 * the room's reconnection grace period.
 */
class ResumeRegistry {
  private entries = new Map<string, ResumeEntry>();
  private bySession = new Map<string, string>();

  issue(input: {
    playerId: string;
    roomId: string;
    sessionId: string;
    reconnectionToken: string;
    expiresAt: number;
  }): ResumeHandle {
    this.dropSession(input.roomId, input.sessionId);
    if (!input.playerId || !input.reconnectionToken) {
      return { handle: "", expiresAt: 0 };
    }
    const handle = randomBytes(32).toString("base64url");
    const handleHash = hashHandle(handle);
    this.entries.set(handleHash, {
      handleHash,
      playerId: input.playerId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      reconnectionToken: input.reconnectionToken,
      expiresAt: input.expiresAt,
    });
    this.bySession.set(
      sessionKey(input.roomId, input.sessionId),
      handleHash,
    );
    return { handle, expiresAt: input.expiresAt };
  }

  refresh(roomId: string, sessionId: string, expiresAt: number): void {
    const hash = this.bySession.get(sessionKey(roomId, sessionId));
    if (!hash) return;
    const entry = this.entries.get(hash);
    if (!entry) return;
    entry.expiresAt = expiresAt;
  }

  redeem(
    handle: string,
    playerId: string,
  ):
    | {
        roomId: string;
        sessionId: string;
        reconnectionToken: string;
        expiresAt: number;
      }
    | null {
    if (!handle || !playerId) return null;
    const handleHash = hashHandle(handle);
    const entry = this.entries.get(handleHash);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.deleteEntry(entry);
      return null;
    }
    if (entry.playerId !== playerId) return null;
    // Single use. A fresh handle is issued after the reconnection succeeds.
    this.deleteEntry(entry);
    return {
      roomId: entry.roomId,
      sessionId: entry.sessionId,
      reconnectionToken: entry.reconnectionToken,
      expiresAt: entry.expiresAt,
    };
  }

  dropSession(roomId: string, sessionId: string): void {
    const key = sessionKey(roomId, sessionId);
    const hash = this.bySession.get(key);
    if (!hash) return;
    const entry = this.entries.get(hash);
    if (entry) this.deleteEntry(entry);
    this.bySession.delete(key);
  }

  dropRoom(roomId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.roomId === roomId) this.deleteEntry(entry);
    }
  }

  private deleteEntry(entry: ResumeEntry): void {
    this.entries.delete(entry.handleHash);
    this.bySession.delete(sessionKey(entry.roomId, entry.sessionId));
  }
}

export const resumeRegistry = new ResumeRegistry();
