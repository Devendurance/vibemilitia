"use client";

import { useState } from "react";
import { getCharacterSkin, HUMAN_DEFAULT_SKIN_ID } from "@/game/characters/roster";
import type { PracticeDifficulty } from "@/game/config/gameplay";
import { GameShell } from "@/components/game/GameShell";

export function PracticeRoute({ difficulty }: { difficulty: PracticeDifficulty }) {
  const [skinId] = useState(() => {
    if (typeof window === "undefined") return HUMAN_DEFAULT_SKIN_ID;
    try {
      return getCharacterSkin(
        window.localStorage.getItem("vibe-militia-skin"),
      ).skinId;
    } catch {
      return HUMAN_DEFAULT_SKIN_ID;
    }
  });
  return <GameShell difficulty={difficulty} skinId={skinId} />;
}
