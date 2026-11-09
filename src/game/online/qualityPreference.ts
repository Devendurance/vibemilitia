/**
 * The player's display choice. Auto adapts to measured frames. Sharp and Smooth
 * pin it. It affects rendering and effects only, never combat.
 */
export type QualityPreference = "auto" | "sharp" | "smooth";

const QUALITY_KEY = "vibe-militia-quality";
const OVERLAY_KEY = "vibe-militia-perf-overlay";

const listeners = new Set<() => void>();
let overlayShown: boolean | null = null;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage. The choice still holds for this page.
  }
};

let current: QualityPreference | null = null;

export function getQualityPreference(): QualityPreference {
  if (current) return current;
  const stored = typeof window === "undefined" ? null : read(QUALITY_KEY);
  current = stored === "sharp" || stored === "smooth" ? stored : "auto";
  return current;
}

export function setQualityPreference(next: QualityPreference): void {
  current = next;
  write(QUALITY_KEY, next);
  for (const listener of listeners) listener();
}

export function getOverlayShown(): boolean {
  if (overlayShown === null) {
    overlayShown = typeof window !== "undefined" && read(OVERLAY_KEY) === "1";
  }
  return overlayShown;
}

export function setOverlayShown(next: boolean): void {
  overlayShown = next;
  write(OVERLAY_KEY, next ? "1" : "0");
  for (const listener of listeners) listener();
}

export function subscribeQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
