"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPracticeDifficulty } from "@/game/config/gameplay";
import { PracticeRoute } from "@/components/game/PracticeRoute";

function PracticeQuery() {
  const params = useSearchParams();
  return (
    <PracticeRoute
      difficulty={getPracticeDifficulty(params.get("difficulty"))}
    />
  );
}

export function PracticePageClient() {
  return (
    <Suspense
      fallback={
        <main className="militia-page practice-page">
          <div className="game-frame">
            <div className="practice-loading">
              <span className="mono-label">SECTOR 07 // LOCAL DRILL</span>
              <strong className="display">LOADING PRACTICE</strong>
            </div>
          </div>
        </main>
      }
    >
      <PracticeQuery />
    </Suspense>
  );
}
