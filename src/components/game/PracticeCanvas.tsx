"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";
import { INITIAL_HUD, type GameBridge } from "@/game/bridge";
import type { PracticeDifficulty } from "@/game/config/gameplay";

interface PracticeCanvasProps {
  bridge: GameBridge;
  difficulty: PracticeDifficulty;
  skinId: string;
  playerName: string;
}

/** Boots the shared match scene against a local practice room. */
export function PracticeCanvas({
  bridge,
  difficulty,
  skinId,
  playerName,
}: PracticeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    let room: { dispose: () => void } | null = null;
    bridge.publish({ ...INITIAL_HUD, ready: false });

    const boot = async () => {
      try {
        const [{ createOnlineGame }, { PracticeRoom }] = await Promise.all([
          import("@/game/online/OnlineApp"),
          import("@/game/practice/PracticeRoom"),
        ]);
        if (cancelled || !containerRef.current) return;
        const practice = new PracticeRoom({
          difficulty,
          skinId,
          playerName,
          debug: window.location.hostname === "localhost",
        });
        room = practice;
        game = createOnlineGame(containerRef.current, practice, bridge, playerName);
      } catch (bootError) {
        console.error("Practice failed to start", bootError);
        if (!cancelled) {
          setError(
            bootError instanceof Error
              ? bootError.message
              : "The practice match could not start.",
          );
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      game?.destroy(true);
      room?.dispose();
    };
  }, [bridge, difficulty, playerName, skinId]);

  return (
    <div className="game-canvas" ref={containerRef} data-testid="game-canvas">
      {error ? (
        <div className="game-canvas__error">
          <span className="mono-label">PRACTICE FAILURE</span>
          <p>The arena did not start.</p>
          <code>{error}</code>
        </div>
      ) : null}
    </div>
  );
}
