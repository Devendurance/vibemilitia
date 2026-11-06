"use client";

import { useEffect, useRef, useState } from "react";
import type { HudSnapshot } from "@/game/bridge";

/** Seconds that get the large animated digit. Earlier ones are a quiet timer. */
const FINAL_SECONDS = 3;
const GO_VISIBLE_MS = 700;

/**
 * Pre-match overlay. It paints only what the scene reports, so the digit moves
 * with the sound and GO appears on the authoritative phase change. It never
 * takes pointer events, so thumbs on the pads stay on the pads.
 */
export function MatchCountdown({
  phase,
  countdownMs,
  hidden,
}: {
  phase: HudSnapshot["matchPhase"];
  countdownMs: number;
  hidden: boolean;
}) {
  const [showGo, setShowGo] = useState(false);
  const previousPhase = useRef(phase);

  useEffect(() => {
    const started = previousPhase.current === "countdown" && phase === "live";
    previousPhase.current = phase;
    if (!started) return;
    const show = window.setTimeout(() => setShowGo(true), 0);
    const hide = window.setTimeout(() => setShowGo(false), GO_VISIBLE_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [phase]);

  if (hidden) return null;

  if (phase === "countdown") {
    // Local time can reach zero just before the live snapshot lands. It holds at
    // 1 until then, because only the server says GO.
    const seconds = Math.max(1, Math.ceil(countdownMs / 1000));
    const final = seconds <= FINAL_SECONDS;
    return (
      <div
        className={`match-countdown${final ? " is-final" : ""}`}
        data-testid="match-countdown"
        data-stage={final ? "count" : "waiting"}
        data-digit={seconds}
        aria-live="polite"
      >
        <div className="match-countdown__scrim" aria-hidden="true" />
        {final ? (
          <strong key={seconds} className="match-countdown__digit">
            {seconds}
          </strong>
        ) : (
          <div className="match-countdown__waiting">
            <span className="mono-label">MATCH STARTS IN</span>
            <strong>{seconds}</strong>
          </div>
        )}
      </div>
    );
  }

  if (showGo && phase === "live") {
    return (
      <div
        className="match-countdown is-go"
        data-testid="match-countdown"
        data-stage="go"
        aria-live="polite"
      >
        <strong className="match-countdown__go">GO!</strong>
      </div>
    );
  }

  return null;
}
