"use client";

import { useMemo } from "react";
import { GameBridge } from "@/game/bridge";
import { GameCanvas } from "@/components/game/GameCanvas";
import { GameHud } from "@/components/game/GameHud";

export function GameShell() {
  const bridge = useMemo(() => new GameBridge(), []);

  return (
    <main className="militia-page">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <section className="game-frame" aria-label="Vibe Militia playable arena">
        <GameCanvas bridge={bridge} />
        <GameHud bridge={bridge} />
      </section>
    </main>
  );
}
