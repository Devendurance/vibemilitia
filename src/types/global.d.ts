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
          texture: string;
          weaponTexture: string;
          weaponVisible: boolean;
          nameVisible: boolean;
          botLabelVisible: boolean;
          healthBarVisible: boolean;
        }>;
        loot: Array<{
          id: string;
          kind: string;
          weaponId: string | null;
          x: number;
          y: number;
          visible: boolean;
          texture: string;
        }>;
        testHooks: {
          eliminate: (
            victimId: string,
            source?: "bullet" | "grenade" | "toxic",
          ) => void;
          teleport: (x: number, y: number) => void;
          teleportBot: (id: string, x: number, y: number) => void;
          endMatch: () => void;
          guard: () => void;
        };
      };
      sendCommand: (command: GameCommand) => void;
    };
  }
}

export {};
