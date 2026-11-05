import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import type { GameBridge } from "@/game/bridge";
import { OnlineScene } from "@/game/online/OnlineScene";

export function createOnlineGame(
  parent: HTMLElement,
  room: Room,
  bridge: GameBridge,
  playerName: string,
): Phaser.Game {
  const width = Math.max(320, parent.clientWidth || 1440);
  const height = Math.max(240, parent.clientHeight || 810);
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#0c0d0f",
    scene: [new OnlineScene(room, bridge, playerName)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width,
      height,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
        fixedStep: true,
        fps: 60,
      },
    },
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: "high-performance",
    },
    disableContextMenu: true,
  };
  return new Phaser.Game(config);
}
