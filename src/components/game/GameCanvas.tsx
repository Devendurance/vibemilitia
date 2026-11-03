"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";
import { INITIAL_HUD, type GameBridge } from "@/game/bridge";

interface GameCanvasProps {
  bridge: GameBridge;
}

export function GameCanvas({ bridge }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    bridge.publish({ ...INITIAL_HUD, ready: false });

    const boot = async () => {
      try {
        const { createVibeMilitiaGame } = await import("@/game/GameApp");
        if (cancelled || !containerRef.current) return;
        game = createVibeMilitiaGame(containerRef.current, bridge);
      } catch (bootError) {
        console.error("Vibe Militia failed to start", bootError);
        if (!cancelled) {
          setError(
            bootError instanceof Error
              ? bootError.message
              : "The combat simulation could not start.",
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
  }, [bridge]);

  return (
    <div className="game-canvas" ref={containerRef} data-testid="game-canvas">
      {error ? (
        <div className="game-canvas__error">
          <span className="mono-label">BOOT FAILURE</span>
          <p>The arena renderer did not start.</p>
          <code>{error}</code>
          <p className="game-canvas__hint">
            Reload the page. If it persists, check the browser console for WebGL
            or asset errors.
          </p>
        </div>
      ) : null}
    </div>
  );
}
