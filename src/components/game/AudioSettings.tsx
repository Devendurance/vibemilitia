"use client";

import { useEffect, useState } from "react";
import { audio, type AudioPreferences } from "@/game/audio/AudioEngine";

export function AudioSettings({ compact = false }: { compact?: boolean }) {
  const [prefs, setPrefs] = useState<AudioPreferences>({
    master: 0.85,
    effects: 0.8,
    muted: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPrefs(audio.getPreferences());
    }, 0);
    const unsubscribe = audio.subscribe(setPrefs);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return (
    <div
      className={`audio-settings${compact ? " audio-settings--compact" : ""}`}
      data-testid="audio-settings"
    >
      <div className="audio-settings__head">
        <span className="mono-label">AUDIO</span>
        <button
          type="button"
          className={`hud-button${prefs.muted ? "" : " is-active"}`}
          onClick={() => {
            const next = audio.setMuted(!prefs.muted);
            setPrefs(next);
            if (!next.muted) {
              void audio.unlock().then(() => audio.play("uiConfirm"));
            }
          }}
          aria-pressed={!prefs.muted}
          data-testid="audio-mute"
        >
          {prefs.muted ? "MUTED" : "SOUND ON"}
        </button>
      </div>
      <label className="audio-slider">
        <span className="mono-label">MASTER</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(prefs.master * 100)}
          onChange={(event) => {
            setPrefs(audio.setMaster(Number(event.target.value) / 100));
          }}
          aria-label="Master volume"
        />
        <span className="audio-slider__value">
          {Math.round(prefs.master * 100)}
        </span>
      </label>
      <label className="audio-slider">
        <span className="mono-label">EFFECTS</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(prefs.effects * 100)}
          onChange={(event) => {
            setPrefs(audio.setEffects(Number(event.target.value) / 100));
          }}
          aria-label="Effects volume"
        />
        <span className="audio-slider__value">
          {Math.round(prefs.effects * 100)}
        </span>
      </label>
      <button
        type="button"
        className="hud-button"
        onClick={() => {
          void audio.unlock().then(() => audio.play("uiConfirm"));
        }}
        data-testid="audio-test"
      >
        TEST SOUND
      </button>
    </div>
  );
}
