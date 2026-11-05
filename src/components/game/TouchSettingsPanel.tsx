"use client";

import { useState } from "react";
import {
  DEFAULT_TOUCH_SETTINGS,
  getTouchSettings,
  saveTouchSettings,
  type TouchSettings,
} from "@/game/input/touchSettings";

function TouchRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="audio-slider">
      <span className="mono-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="audio-slider__value">{Math.round(value * 100)}</span>
    </label>
  );
}

export function TouchSettingsPanel() {
  const [settings, setSettings] = useState<TouchSettings>(() =>
    getTouchSettings(),
  );

  const update = (patch: Partial<TouchSettings>) => {
    const next = saveTouchSettings({ ...settings, ...patch });
    setSettings(next);
  };

  return (
    <div className="touch-settings" data-testid="touch-settings-panel">
      <div className="audio-settings__head">
        <span className="mono-label">TOUCH CONTROLS</span>
        <button
          type="button"
          className={`hud-button${settings.aimFireEnabled ? " is-active" : ""}`}
          onClick={() => update({ aimFireEnabled: !settings.aimFireEnabled })}
          aria-pressed={settings.aimFireEnabled}
          data-testid="touch-aim-fire-toggle"
        >
          {settings.aimFireEnabled ? "AIM+FIRE" : "FIRE BUTTON"}
        </button>
      </div>
      <p className="touch-settings__copy">
        Push the left stick up to fly. In AIM+FIRE mode, push the right stick
        past the threshold to shoot. The FIRE button remains available in
        either mode.
      </p>
      <TouchRow
        label="MOVE DEAD ZONE"
        value={settings.leftDeadZone}
        min={0.05}
        max={0.4}
        step={0.01}
        onChange={(value) => update({ leftDeadZone: value })}
      />
      <TouchRow
        label="AIM DEAD ZONE"
        value={settings.rightDeadZone}
        min={0.05}
        max={0.4}
        step={0.01}
        onChange={(value) => update({ rightDeadZone: value })}
      />
      <TouchRow
        label="AIM SENSITIVITY"
        value={settings.aimSensitivity}
        min={0.5}
        max={1.6}
        step={0.05}
        onChange={(value) => update({ aimSensitivity: value })}
      />
      <TouchRow
        label="AUTO FIRE"
        value={settings.aimFireThreshold}
        min={0.3}
        max={0.98}
        step={0.02}
        onChange={(value) => update({ aimFireThreshold: value })}
      />
      <TouchRow
        label="FLY THRESHOLD"
        value={settings.thrustThreshold}
        min={0.25}
        max={0.8}
        step={0.01}
        onChange={(value) => update({ thrustThreshold: value })}
      />
      <button
        type="button"
        className="hud-button"
        onClick={() => setSettings(saveTouchSettings({ ...DEFAULT_TOUCH_SETTINGS }))}
        data-testid="touch-settings-reset"
      >
        RESET TOUCH DEFAULTS
      </button>
    </div>
  );
}
