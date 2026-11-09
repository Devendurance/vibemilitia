import Phaser from "phaser";
import type { GameBridge } from "@/game/bridge";
import { OnlineScene } from "@/game/online/OnlineScene";
import type { MatchRoom } from "@/game/online/matchRoom";
import { RenderScaler } from "@/game/online/renderScale";

export function createOnlineGame(
  parent: HTMLElement,
  room: MatchRoom,
  bridge: GameBridge,
  playerName: string,
): Phaser.Game {
  const renderScaler = new RenderScaler(parent);
  const { width, height } = renderScaler.gameSize();
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#0c0d0f",
    scene: [new OnlineScene(room, bridge, playerName, renderScaler)],
    scale: {
      mode: Phaser.Scale.NONE,
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
      // Sprites have transparent margins, so MSAA smooths nothing and still costs fill.
      antialiasGL: false,
      roundPixels: false,
      powerPreference: "high-performance",
    },
    disableContextMenu: true,
  };
  const game = new Phaser.Game(config);
  renderScaler.attach(game);
  return game;
}
