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
        audio: {
          contextState: string;
          muted: boolean;
          master: number;
          effects: number;
          voices: number;
        };
        touch: {
          enabled: boolean;
          fire: boolean;
          buttonFire: boolean;
          aimFire: boolean;
          jumpHeld: boolean;
          thrustHeld: boolean;
          moveX: number;
        };
        frames: number[];
        renderLoad: () => {
          objects: number;
          culled: number;
          sprites: number;
          particles: number;
          projectiles: number;
        };
        render: {
          scale: number;
          frameMs: number;
          effects: string;
          preference: string;
          renderer: string;
          adaptive: { frameMs: number; workMs: number } | null;
        };
        viewport: {
          canvasCss: { width: number; height: number };
          canvasBacking: { width: number; height: number };
          renderScale: number;
          worldZoom: number;
          history: Array<{ reason: string }>;
        };
        net?: {
          pendingTicks: number;
          lastCorrectionPx: number;
          snaps: number;
          playbackDelayMs: number;
          jitterMs: number;
          snapshotAgeMs: number;
          snapshotGapMs: number;
        };
        control: {
          fire: boolean;
          moveX: number;
          jumpHeld: boolean;
        } | null;
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
          secondaryWeaponVisible: boolean;
          nameVisible: boolean;
          botLabelVisible: boolean;
          healthBarVisible: boolean;
        }>;
        loot: Array<{
          id: string;
          kind: string;
          weaponId: string | null;
          eliminationId: number;
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
          giveWeapon: (id: string, weaponId: string) => void;
          freeze: (id: string, frozen: boolean) => void;
          disableBotCuriosity: () => void;
          setZoom: (zoom: number) => void;
          setAim: (x: number, y: number) => void;
          fireOnce: () => void;
          reloadOnce: () => void;
          guardTarget: (id: string) => void;
          pauseBotLoot: (paused: boolean) => void;
          pauseLoot: (paused: boolean) => void;
          extendMatch: (durationMs: number) => void;
          resetPickups: () => void;
        };
        combatLog: Array<{
          type: string;
          weaponId: string | null;
          barrel: number | null;
          ownerId: string;
          victimId: string | null;
          damage: number | null;
          atMs: number;
        }>;
      };
      sendCommand: (command: GameCommand) => void;
    };
  }
}

export {};
