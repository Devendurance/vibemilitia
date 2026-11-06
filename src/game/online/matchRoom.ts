/**
 * The part of a Colyseus room the match scene uses. Online matches pass a real
 * room. Practice passes a local room running the same simulation.
 */
export interface MatchRoom {
  readonly roomId: string;
  readonly sessionId: string;
  // Message payloads are typed by each handler, matching the Colyseus API.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage(type: string, callback: (message: any) => void): () => void;
  send(type: string, message?: unknown): void;
  /** Local rooms hold their countdown until the scene can show it. */
  markSceneReady?(): void;
}
