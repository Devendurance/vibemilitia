"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCharacterSkin, HUMAN_DEFAULT_SKIN_ID } from "@/game/characters/roster";
import type { PlayerProfile } from "@/game/progression/profile";
import {
  ensureGuestProfile,
  fetchProfile,
  gameServerHttpUrl,
  guestToken,
  readCachedProfile,
  updateGuestProfile,
} from "@/lib/guestProfile";

export const NAME_STORAGE_KEY = "vibe-militia-guest";
export const SKIN_STORAGE_KEY = "vibe-militia-skin";
export const SETUP_STORAGE_KEY = "vibe-militia-profile-setup";

export interface IdentityInput {
  name: string;
  xHandle: string | null;
  xPublic: boolean;
  leaderboardVisible: boolean;
}

function randomGuestName(): string {
  return `VIBER-${String(Math.floor(Math.random() * 900) + 100)}`;
}

export function usePlayerIdentity() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [name, setName] = useState("VIBER-GUEST");
  const [skinId, setSkinId] = useState(HUMAN_DEFAULT_SKIN_ID);
  const [ready, setReady] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [graceSeconds, setGraceSeconds] = useState(30);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const configOnline = useRef<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let initialName = "VIBER-GUEST";
    let restoredSkin = HUMAN_DEFAULT_SKIN_ID;
    const initialTimer = window.setTimeout(() => {
      const savedName = window.localStorage.getItem(NAME_STORAGE_KEY);
      initialName = savedName?.trim() || randomGuestName();
      const savedSkin = window.localStorage.getItem(SKIN_STORAGE_KEY);
      restoredSkin = getCharacterSkin(savedSkin).skinId;
      setName(initialName);
      setSkinId(restoredSkin);
      try {
        window.localStorage.setItem(NAME_STORAGE_KEY, initialName);
        window.localStorage.setItem(SKIN_STORAGE_KEY, restoredSkin);
      } catch {
        // Storage can be unavailable in private modes.
      }
      const cached = readCachedProfile();
      if (cached) {
        setProfile(cached);
        if (cached.name) setName(cached.name);
        setSkinId(getCharacterSkin(cached.skinId).skinId);
      }
      const setupDone =
        window.localStorage.getItem(SETUP_STORAGE_KEY) === "1";
      if (!setupDone) setShowOnboarding(true);
    }, 0);
    const cached = readCachedProfile();

    const load = async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const loaded = cached
        ? ((await fetchProfile())?.player ?? cached)
        : await ensureGuestProfile(initialName, restoredSkin);
      if (!active) return;
      if (loaded) {
        setProfile(loaded);
        setName(loaded.name);
        setSkinId(getCharacterSkin(loaded.skinId).skinId);
        setServerOnline(true);
      } else if (configOnline.current !== true) {
        setServerOnline(false);
      }
      setReady(true);
    };
    void load();
    void fetch(`${gameServerHttpUrl()}/api/config`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { reconnectGraceSeconds?: number } | null) => {
        if (!active || !config) return;
        configOnline.current = true;
        setServerOnline(true);
        setGraceSeconds(
          Math.max(1, Math.min(120, Number(config.reconnectGraceSeconds) || 30)),
        );
      })
      .catch(() => {
        configOnline.current = false;
        if (active && !readCachedProfile()) setServerOnline(false);
      });
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
    };
    // The cached profile is read only once on mount.
  }, []);

  const selectedSkin = useMemo(() => getCharacterSkin(skinId), [skinId]);

  const chooseSkin = useCallback((nextSkinId: string) => {
    const valid = getCharacterSkin(nextSkinId).skinId;
    setSkinId(valid);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, valid);
    } catch {
      // Selection still applies for this session.
    }
    if (guestToken()) {
      void updateGuestProfile({ skinId: valid }).then((result) => {
        if (result) setProfile(result.player);
      });
    }
  }, []);

  const saveIdentity = useCallback(
    async (input: IdentityInput): Promise<boolean> => {
      const cleaned = input.name
        .replace(/[^\w .-]/g, "")
        .trim()
        .slice(0, 18);
      const finalName = cleaned.length >= 3 ? cleaned : randomGuestName();
      setName(finalName);
      setSaving(true);
      setSaveError(null);
      try {
        window.localStorage.setItem(NAME_STORAGE_KEY, finalName);
        window.localStorage.setItem(SETUP_STORAGE_KEY, "1");
      } catch {
        // Preferences remain for this session.
      }
      if (!guestToken()) {
        const created = await ensureGuestProfile(finalName, skinId);
        if (created) {
          setProfile(created);
          setServerOnline(true);
        }
      }
      const result = await updateGuestProfile({
        name: finalName,
        skinId,
        xHandle: input.xHandle,
        xPublic: input.xPublic,
        leaderboardVisible: input.leaderboardVisible,
      });
      setSaving(false);
      if (result) {
        setProfile(result.player);
        setShowOnboarding(false);
        setServerOnline(true);
        return true;
      }
      setSaveError(
        "Saved on this device. The game server did not acknowledge the profile update.",
      );
      setShowOnboarding(false);
      return false;
    },
    [skinId],
  );

  const completeOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(SETUP_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
    setShowOnboarding(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const result = await fetchProfile();
    if (result?.player) {
      setProfile(result.player);
      setName(result.player.name);
      setSkinId(getCharacterSkin(result.player.skinId).skinId);
    }
    return result?.player ?? null;
  }, []);

  return {
    profile,
    name,
    skinId,
    selectedSkin,
    ready,
    serverOnline,
    graceSeconds,
    showOnboarding,
    setShowOnboarding,
    saving,
    saveError,
    chooseSkin,
    saveIdentity,
    completeOnboarding,
    refreshProfile,
  };
}
