"use client";

// Tab-scoped on purpose. Opening a second tab must never redeem the first tab's
// live seat. sessionStorage survives reload and same-tab navigation but does not
// leak into a new tab.
const RESUME_KEY = "vibe-militia-resume-v1";

export interface ResumeContext {
  handle: string;
  roomId: string;
  expiresAt: number;
  name: string;
  skinId: string;
}

export function readResumeContext(): ResumeContext | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResumeContext>;
    if (
      typeof parsed.handle !== "string" ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(RESUME_KEY);
      return null;
    }
    return {
      handle: parsed.handle,
      roomId: parsed.roomId,
      expiresAt: parsed.expiresAt,
      name: typeof parsed.name === "string" ? parsed.name : "VIBER-GUEST",
      skinId: typeof parsed.skinId === "string" ? parsed.skinId : "viber-010",
    };
  } catch {
    return null;
  }
}

export function writeResumeContext(context: ResumeContext): void {
  try {
    window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(context));
  } catch {
    // Resume is a convenience. Storage failures do not block play.
  }
}

export function clearResumeContext(): void {
  try {
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Ignore storage failures.
  }
}
