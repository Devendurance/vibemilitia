"use client";

import type {
  EquippedCosmetics,
} from "@/game/progression/cosmetics";
import type {
  GuestSession,
  LeaderboardResult,
  MatchReward,
  PlayerProfile,
} from "@/game/progression/profile";

const TOKEN_KEY = "vibe-militia-guest-token";
const PROFILE_KEY = "vibe-militia-guest-profile";
const API_BASE =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
  process.env.NEXT_PUBLIC_COLYSEUS_URL ??
  "http://localhost:2567";

export function gameServerHttpUrl(): string {
  return API_BASE.replace(/\/$/, "");
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private storage can fail. The guest still plays without persistence.
  }
}

function cacheProfile(profile: PlayerProfile | null): void {
  try {
    if (profile) {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(PROFILE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function readCachedProfile(): PlayerProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const response = await fetch(`${gameServerHttpUrl()}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    const error = new Error(body?.error ?? `HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export async function createGuest(
  name: string,
  skinId: string,
): Promise<GuestSession> {
  const session = await request<GuestSession>("/api/guest", {
    method: "POST",
    body: JSON.stringify({ name, skinId }),
  });
  writeToken(session.token);
  cacheProfile(session.player);
  return session;
}

export async function fetchProfile(
  token?: string | null,
): Promise<{ player: PlayerProfile; pendingAwards: MatchReward[] } | null> {
  const activeToken = token ?? readToken();
  if (!activeToken) return null;
  try {
    const result = await request<{
      player: PlayerProfile;
      pendingAwards: MatchReward[];
    }>("/api/profile", { token: activeToken });
    cacheProfile(result.player);
    return result;
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      writeToken(null);
      cacheProfile(null);
    }
    return null;
  }
}

export async function ensureGuestProfile(
  name: string,
  skinId: string,
): Promise<PlayerProfile | null> {
  const existing = await fetchProfile();
  if (existing?.player) return existing.player;
  try {
    const created = await createGuest(name, skinId);
    return created.player;
  } catch {
    return null;
  }
}

export async function updateGuestProfile(input: {
  name?: string;
  skinId?: string;
  equipped?: Partial<EquippedCosmetics>;
  claimAwards?: boolean;
  xHandle?: string | null;
  xPublic?: boolean;
  leaderboardVisible?: boolean;
}): Promise<{ player: PlayerProfile; pendingAwards: MatchReward[] } | null> {
  const token = readToken();
  if (!token) return null;
  try {
    const result = await request<{
      player: PlayerProfile;
      pendingAwards: MatchReward[];
    }>("/api/profile", {
      method: "PATCH",
      token,
      body: JSON.stringify(input),
    });
    cacheProfile(result.player);
    return result;
  } catch {
    return null;
  }
}

export interface RedeemedResume {
  roomId: string;
  reconnectionToken: string;
  expiresAt: number;
}

export async function redeemResume(
  handle: string,
  roomId: string,
): Promise<RedeemedResume | null> {
  const token = readToken();
  if (!token) return null;
  try {
    return await request<RedeemedResume>("/api/resume", {
      method: "POST",
      token,
      body: JSON.stringify({ handle, roomId }),
    });
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(
  limit = 25,
): Promise<LeaderboardResult | null> {
  try {
    return await request<LeaderboardResult>(
      `/api/leaderboard?limit=${Math.max(1, Math.min(100, limit))}`,
    );
  } catch {
    return null;
  }
}

export function guestToken(): string | null {
  return readToken();
}

export function guestApiBase(): string {
  return gameServerHttpUrl();
}
