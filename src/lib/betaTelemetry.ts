"use client";

import { gameServerHttpUrl, guestToken } from "@/lib/guestProfile";

const CLIENT_KEY = "vibe-militia-client-id";
export const APP_VERSION = "p5-beta";
let lastErrorAt = 0;
let installed = false;

function clientId(): string {
  try {
    const existing = window.sessionStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(CLIENT_KEY, value);
    return value;
  } catch {
    return "anonymous";
  }
}

function headers(): HeadersInit {
  const result: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = guestToken();
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

export function reportClientError(message: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastErrorAt < 8000) return;
  lastErrorAt = now;
  void fetch(`${gameServerHttpUrl()}/api/client-error`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      message: message.slice(0, 600),
      route: window.location.pathname,
      appVersion: APP_VERSION,
      clientId: clientId(),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function installClientErrorCapture(): () => void {
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;
  const onError = (event: ErrorEvent) => {
    reportClientError(event.message || "Unknown window error");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError(
      reason instanceof Error ? reason.message : String(reason ?? "Unknown rejection"),
    );
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}

export async function sendFeedback(input: {
  rating: number;
  message: string;
}): Promise<boolean> {
  try {
    const response = await fetch(`${gameServerHttpUrl()}/api/feedback`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        rating: input.rating,
        message: input.message.slice(0, 600),
        route: window.location.pathname,
        appVersion: APP_VERSION,
        clientId: clientId(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
