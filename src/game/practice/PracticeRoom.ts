import type { MatchRoom } from "@/game/online/matchRoom";
import {
  PRACTICE_SESSION_ID,
  PracticeHost,
  type PracticeOptions,
} from "@/game/practice/PracticeHost";

type Handler = (message: unknown) => void;

/**
 * A local stand-in for a Colyseus room. The match scene talks to it exactly as
 * it talks to the server. The simulation runs in a worker, and falls back to
 * the main thread if the browser refuses one. Needs no network once loaded.
 */
export class PracticeRoom implements MatchRoom {
  readonly roomId = "practice";
  readonly sessionId = PRACTICE_SESSION_ID;
  private handlers = new Map<string, Set<Handler>>();
  private worker: Worker | null = null;
  private host: PracticeHost | null = null;
  private timer: number | null = null;
  private sceneReady = false;
  private onVisibility = () => {
    this.send("pause", document.hidden);
  };

  constructor(options: PracticeOptions) {
    try {
      this.worker = new Worker(
        new URL("./practice.worker.ts", import.meta.url),
      );
      this.worker.onmessage = (event) => {
        const { type, message } = event.data as { type: string; message: unknown };
        this.dispatch(type, message);
      };
      this.worker.onerror = () => this.fallBack(options);
      this.worker.postMessage({ kind: "init", options });
    } catch {
      this.fallBack(options);
    }
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private fallBack(options: PracticeOptions): void {
    if (this.host) return;
    this.worker?.terminate();
    this.worker = null;
    this.host = new PracticeHost(options, (type, message) =>
      this.dispatch(type, message),
    );
    if (this.sceneReady) this.host.handle("scene-ready", undefined);
    let last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.host?.advance(now - last);
      last = now;
    }, 8);
  }

  private dispatch(type: string, message: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(message);
  }

  onMessage(type: string, callback: Handler): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    this.handlers.set(type, set);
    set.add(callback);
    return () => set.delete(callback);
  }

  send(type: string, message?: unknown): void {
    if (this.worker) {
      this.worker.postMessage({ kind: "message", type, message });
    } else {
      this.host?.handle(type, message);
    }
  }

  markSceneReady(): void {
    this.sceneReady = true;
    this.send("scene-ready");
  }

  dispose(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.worker?.terminate();
    this.worker = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.host = null;
    this.handlers.clear();
  }
}
