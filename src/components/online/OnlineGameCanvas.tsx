"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";
import type { Room } from "@colyseus/sdk";
import { INITIAL_HUD, type GameBridge } from "@/game/bridge";

interface OnlineGameCanvasProps {
  room: Room;
  bridge: GameBridge;
  playerName: string;
}

export function OnlineGameCanvas({
  room,
  bridge,
  playerName,
}: OnlineGameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    bridge.publish({ ...INITIAL_HUD, ready: false });

    const boot = async () => {
      try {
        const { createOnlineGame } = await import("@/game/online/OnlineApp");
        if (cancelled || !containerRef.current) return;
        game = createOnlineGame(containerRef.current, room, bridge, playerName);
      } catch (bootError) {
        console.error("Online arena failed to start", bootError);
        if (!cancelled) {
          setError(
            bootError instanceof Error ? bootError.message : "Online arena failed to start",
          );
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      game?.destroy(true);
      game = null;
    };
  }, [bridge, playerName, room]);

  return (
    <div className="game-canvas online-game-canvas" ref={containerRef} data-testid="online-canvas">
      {error ? (
        <div className="game-canvas__error">
          <span className="mono-label">ONLINE ARENA FAILURE</span>
          <p>The arena renderer did not start.</p>
          <code>{error}</code>
        </div>
      ) : null}
    </div>
  );
}
