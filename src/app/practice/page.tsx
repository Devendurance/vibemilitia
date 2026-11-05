import type { Metadata } from "next";
import { PracticePageClient } from "@/components/game/PracticePageClient";

export const metadata: Metadata = {
  title: "Vibe Militia | Practice vs Bots",
  description:
    "Run a local Sector 07 drill against Easy, Normal, Hard or Merciless bots. Practice never earns ranked XP.",
};

export default function PracticePage() {
  return <PracticePageClient />;
}
