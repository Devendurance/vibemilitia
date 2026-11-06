import { PracticeHost, type PracticeOptions } from "@/game/practice/PracticeHost";

/**
 * Runs the practice simulation off the main thread. Eight combatants of AI,
 * pathing and projectiles would otherwise compete with rendering on a phone.
 */
interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const scope = globalThis as unknown as WorkerLike;
let host: PracticeHost | null = null;
let last = 0;

scope.onmessage = (event) => {
  const { kind, type, message, options } = event.data as {
    kind: "init" | "message";
    type?: string;
    message?: unknown;
    options?: PracticeOptions;
  };
  if (kind === "init" && options && !host) {
    host = new PracticeHost(options, (emitType, emitMessage) => {
      scope.postMessage({ type: emitType, message: emitMessage });
    });
    last = performance.now();
    setInterval(() => {
      const now = performance.now();
      host?.advance(now - last);
      last = now;
    }, 8);
    return;
  }
  if (kind === "message" && type) host?.handle(type, message);
};
