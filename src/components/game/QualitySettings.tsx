"use client";

import { useSyncExternalStore } from "react";
import {
  getOverlayShown,
  getQualityPreference,
  setOverlayShown,
  setQualityPreference,
  subscribeQuality,
  type QualityPreference,
} from "@/game/online/qualityPreference";

const OPTIONS: { id: QualityPreference; label: string; hint: string }[] = [
  { id: "auto", label: "AUTO", hint: "Adapts to how this device is running." },
  { id: "sharp", label: "SHARP", hint: "Highest resolution, for a strong device." },
  { id: "smooth", label: "SMOOTH", hint: "Lower resolution and fewer effects." },
];

export function QualitySettings() {
  const preference = useSyncExternalStore(subscribeQuality, getQualityPreference, () => "auto");
  const overlay = useSyncExternalStore(subscribeQuality, getOverlayShown, () => false);
  const hint = OPTIONS.find((option) => option.id === preference)?.hint;
  return (
    <div className="quality-settings" data-testid="quality-settings">
      <span className="mono-label">DISPLAY QUALITY</span>
      <div className="quality-settings__options" role="radiogroup" aria-label="Display quality">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={preference === option.id}
            className={`hud-button${preference === option.id ? " is-active" : ""}`}
            onClick={() => setQualityPreference(option.id)}
            data-testid={`quality-${option.id}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p>{hint}</p>
      <button
        type="button"
        className={`hud-button${overlay ? " is-active" : ""}`}
        aria-pressed={overlay}
        onClick={() => setOverlayShown(!overlay)}
        data-testid="perf-overlay-toggle"
      >
        {overlay ? "HIDE PERFORMANCE" : "SHOW PERFORMANCE"}
      </button>
    </div>
  );
}
