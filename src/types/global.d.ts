import type { DebugProbe, GameCommand } from "@/game/bridge";
import type { OnlineSnapshot } from "@/game/multiplayer/protocol";

declare global {
  interface Window {
    __VIBE_MILITIA__?: {
      getProbe: () => DebugProbe;
      send: (command: GameCommand) => void;
    };
    __HUD_BRIDGE__?: import("@/game/bridge").GameBridge;
    __VIBE_MILITIA_ONLINE__?: {
      getProbe: () => {
        roomId: string;
        sessionId: string;
        ready: boolean;
        snapshot: OnlineSnapshot | null;
        hud: import("@/game/bridge").HudSnapshot;
        views: Array<{
          id: string;
          name: string;
          kind: string;
          x: number;
          y: number;
          alive: boolean;
        }>;
      };
      sendCommand: (command: GameCommand) => void;
    };
  }
}

export {};
