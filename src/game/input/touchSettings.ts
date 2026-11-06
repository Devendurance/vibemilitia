"use client";

export interface TouchSettings {
  leftDeadZone: number;
  rightDeadZone: number;
  aimSensitivity: number;
  aimFireEnabled: boolean;
  aimFireThreshold: number;
  thrustThreshold: number;
}

export const DEFAULT_TOUCH_SETTINGS: TouchSettings = {
  leftDeadZone: 0.16,
  rightDeadZone: 0.14,
  aimSensitivity: 1,
  aimFireEnabled: true,
  aimFireThreshold: 0.3,
  thrustThreshold: 0.45,
};

const STORAGE_KEY = "vibe-militia-touch-v2";
let cached: TouchSettings | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function getTouchSettings(): TouchSettings {
  if (cached) return cached;
  cached = loadTouchSettings();
  return cached;
}

export function loadTouchSettings(): TouchSettings {
  if (typeof window === "undefined") return { ...DEFAULT_TOUCH_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TOUCH_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<TouchSettings>;
    return {
      leftDeadZone: clamp(
        parsed.leftDeadZone ?? DEFAULT_TOUCH_SETTINGS.leftDeadZone,
        0.05,
        0.4,
      ),
      rightDeadZone: clamp(
        parsed.rightDeadZone ?? DEFAULT_TOUCH_SETTINGS.rightDeadZone,
        0.05,
        0.4,
      ),
      aimSensitivity: clamp(
        parsed.aimSensitivity ?? DEFAULT_TOUCH_SETTINGS.aimSensitivity,
        0.5,
        1.6,
      ),
      aimFireEnabled:
        parsed.aimFireEnabled ?? DEFAULT_TOUCH_SETTINGS.aimFireEnabled,
      aimFireThreshold: clamp(
        parsed.aimFireThreshold ?? DEFAULT_TOUCH_SETTINGS.aimFireThreshold,
        0.15,
        0.98,
      ),
      thrustThreshold: clamp(
        parsed.thrustThreshold ?? DEFAULT_TOUCH_SETTINGS.thrustThreshold,
        0.25,
        0.8,
      ),
    };
  } catch {
    return { ...DEFAULT_TOUCH_SETTINGS };
  }
}

export function saveTouchSettings(settings: TouchSettings): TouchSettings {
  const next = {
    ...settings,
    leftDeadZone: clamp(settings.leftDeadZone, 0.05, 0.4),
    rightDeadZone: clamp(settings.rightDeadZone, 0.05, 0.4),
    aimSensitivity: clamp(settings.aimSensitivity, 0.5, 1.6),
    aimFireThreshold: clamp(settings.aimFireThreshold, 0.15, 0.98),
    thrustThreshold: clamp(settings.thrustThreshold, 0.25, 0.8),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep settings for this session.
    }
  }
  cached = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<TouchSettings>("vibe-touch-settings", { detail: next }),
    );
  }
  return next;
}
