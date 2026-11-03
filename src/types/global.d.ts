import type { DebugProbe, GameCommand } from "@/game/bridge";

declare global {
  interface Window {
    __VIBE_MILITIA__?: {
      getProbe: () => DebugProbe;
      send: (command: GameCommand) => void;
    };
  }
}

export {};
