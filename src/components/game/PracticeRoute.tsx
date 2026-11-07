"use client";

import { useState } from "react";
import { getCharacterSkin, HUMAN_DEFAULT_SKIN_ID } from "@/game/characters/roster";
import type { PracticeDifficulty } from "@/game/config/gameplay";
import { GameShell } from "@/components/game/GameShell";
import { sanitizeGuestName } from "@/game/multiplayer/protocol";

const NAME_STORAGE_KEY = "vibe-militia-guest";

export function PracticeRoute({
  difficulty,
  legacyDrill = false,
}: {
  difficulty: PracticeDifficulty;
  legacyDrill?: boolean;
}) {
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
  const [playerName] = useState(() => {
    if (typeof window === "undefined") return "VIBER-GUEST";
    try {
      return sanitizeGuestName(window.localStorage.getItem(NAME_STORAGE_KEY));
    } catch {
      return "VIBER-GUEST";
    }
  });
  return (
    <GameShell
      difficulty={difficulty}
      skinId={skinId}
      playerName={playerName}
      legacyDrill={legacyDrill}
    />
  );
}
