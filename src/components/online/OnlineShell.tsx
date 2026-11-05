"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Room, RoomAvailable } from "@colyseus/sdk";
import {
  CHARACTER_ROSTER,
  HUMAN_DEFAULT_SKIN_ID,
  getCharacterSkin,
} from "@/game/characters/roster";
import { GameBridge } from "@/game/bridge";
import { GameHud } from "@/components/game/GameHud";
import { AudioSettings } from "@/components/game/AudioSettings";
import { TouchControls } from "@/components/game/TouchControls";
import { ProfilePanel } from "@/components/online/ProfilePanel";
import { OnlineGameCanvas } from "@/components/online/OnlineGameCanvas";
import type { OnlineRoomMetadata } from "@/game/multiplayer/protocol";
import { audio } from "@/game/audio/AudioEngine";
import {
  ensureGuestProfile,
  guestToken,
  readCachedProfile,
  updateGuestProfile,
} from "@/lib/guestProfile";
import type { MatchReward, PlayerProfile } from "@/game/progression/profile";
import {
  DEFAULT_EQUIPPED,
  type EquippedCosmetics,
} from "@/game/progression/cosmetics";

type OnlineRoom = Room;
type OnlineClient = Client;
type AvailableRoom = RoomAvailable<OnlineRoomMetadata>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
  process.env.NEXT_PUBLIC_COLYSEUS_URL ??
  "http://localhost:2567";
const SKIN_STORAGE_KEY = "vibe-militia-skin";

interface LobbyRoomLike extends AvailableRoom {
  roomId: string;
  metadata?: OnlineRoomMetadata;
}

function randomGuestName(): string {
  return `VIBER-${String(Math.floor(Math.random() * 900) + 100)}`;
}

function explainRoomError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("locked") || lower.includes("full")) {
    return "ROOM FULL // Eight human players are already connected.";
  }
  if (message.includes("MATCH_ENDED")) {
    return "MATCH ENDED // This room is waiting for a replay. Browse another open room.";
  }
  if (lower.includes("not found") || lower.includes("no rooms")) {
    return "ROOM NOT FOUND // Check the invite link or room code.";
  }
  return message;
}

function mergeRoom(
  rooms: LobbyRoomLike[],
  roomId: string,
  room: LobbyRoomLike,
): LobbyRoomLike[] {
  const next = rooms.filter((entry) => entry.roomId !== roomId);
  next.push({ ...room, roomId });
  return next.sort((a, b) => a.roomId.localeCompare(b.roomId));
}

function OnlineGameSession({
  room,
  playerName,
  skinId,
  reconnecting,
  reconnectGraceSeconds,
  profile,
  lastReward,
  onRewardSeen,
  onLeave,
}: {
  room: OnlineRoom;
  playerName: string;
  skinId: string;
  reconnecting: boolean;
  reconnectGraceSeconds: number;
  profile: PlayerProfile | null;
  lastReward: MatchReward | null;
  onRewardSeen: () => void;
  onLeave: () => void;
}) {
  const bridge = useMemo(() => new GameBridge(), []);
  const [ping, setPing] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    (window as unknown as { __HUD_BRIDGE__?: GameBridge }).__HUD_BRIDGE__ = bridge;
    return () => {
      delete (window as unknown as { __HUD_BRIDGE__?: GameBridge }).__HUD_BRIDGE__;
    };
  }, [bridge]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const sample = () => {
      room.ping((value) => {
        if (active) setPing(Math.round(value));
      });
      const snapshot = window.__VIBE_MILITIA_ONLINE__?.getProbe().snapshot;
      if (active && snapshot) setTickMs(snapshot.serverTickMs);
    };
    sample();
    const timer = window.setInterval(sample, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [room]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const coarse =
        window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0 ||
        new URLSearchParams(window.location.search).has("touch");
      setTouchMode(coarse);
    }, 0);
    const unlock = () => {
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const closeGuide = () => {
    setShowGuide(false);
    try {
      window.localStorage.setItem("vibe-militia-onboarded", "1");
    } catch {
      // Guidance still closes for this session.
    }
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/online?room=${room.roomId}`
      : "";

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="militia-page">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <section className={`game-frame${touchMode ? " is-touch" : ""}`} aria-label="Vibe Militia online arena">
        <OnlineGameCanvas room={room} bridge={bridge} playerName={playerName} />
        <GameHud
          bridge={bridge}
          mode="online"
          playerName={playerName}
          playerSkinId={skinId}
          profile={profile}
          reward={lastReward}
        />
        {touchMode ? (
          <TouchControls
            bridge={bridge}
            onSettings={() => setSettingsOpen(true)}
            playerName={playerName}
            level={profile?.level ?? 1}
          />
        ) : null}
        {reconnecting ? (
          <div className="reconnect-overlay" data-testid="reconnect-overlay">
            <div className="reconnect-card" role="status" aria-live="assertive">
              <span className="mono-label">CONNECTION LOST</span>
              <strong className="display">RECONNECTING</strong>
              <p>
                Your seat, loadout and score are reserved for{" "}
                {reconnectGraceSeconds} seconds. Keep this tab open.
              </p>
              <span className="reconnect-card__bar" aria-hidden="true" />
            </div>
          </div>
        ) : null}
        {lastReward ? (
          <div className="progression-toast" data-testid="progression-toast">
            <span className="mono-label">
              {lastReward.levelUp ? "LEVEL UP" : "MATCH XP"}
            </span>
            <strong className="display">
              {lastReward.levelUp
                ? `LEVEL ${lastReward.levelAfter}`
                : `+${lastReward.xpEarned} XP`}
            </strong>
            <p>
              {lastReward.levelUp
                ? `+${lastReward.xpEarned} XP banked. New cosmetics may be ready.`
                : "Progress saved to your guest profile."}
            </p>
            <button type="button" className="hud-button" onClick={onRewardSeen}>
              CLOSE
            </button>
          </div>
        ) : null}
        {settingsOpen ? (
          <div
            className="settings-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Match settings"
            data-testid="settings-overlay"
          >
            <div className="settings-card">
              <div className="settings-card__head">
                <span className="mono-label">MATCH SETTINGS</span>
                <button
                  type="button"
                  className="hud-button"
                  onClick={() => setSettingsOpen(false)}
                  data-testid="settings-close"
                >
                  CLOSE
                </button>
              </div>
              <AudioSettings />
              <div className="settings-card__controls">
                <span className="mono-label">CONTROLS</span>
                <p>
                  Desktop: WASD move, Space jump and jetpack, mouse aim and
                  fire, R reload, 1 to 3 weapons, 4 to 6 grenades, G throw, H
                  medkit, E swap.
                </p>
                <p>
                  Touch: left stick moves, right stick aims, FIRE shoots, JUMP
                  holds the jetpack. The online match keeps running while this
                  panel is open.
                </p>
              </div>
              <div className="settings-card__actions">
                <button
                  type="button"
                  className="online-secondary online-secondary--small"
                  onClick={() => {
                    setSettingsOpen(false);
                    onLeave();
                  }}
                >
                  LEAVE MATCH
                </button>
                <button
                  type="button"
                  className="online-primary online-primary--small"
                  onClick={() => {
                    setShowGuide(true);
                    setSettingsOpen(false);
                  }}
                >
                  SHOW GUIDE
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {showGuide ? (
          <div
            className="onboarding-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            data-testid="onboarding-overlay"
          >
            <div className="onboarding-card">
              <span className="mono-label">SECTOR 07 // FIRST DROP</span>
              <h2 id="onboarding-title" className="display">
                SURVIVE THE SECTOR
              </h2>
              <ol className="onboarding-steps">
                <li>
                  <strong>MOVE</strong>
                  <span>WASD or the left stick. Space or JUMP lifts you.</span>
                </li>
                <li>
                  <strong>AIM AND FIRE</strong>
                  <span>Mouse or the right stick. Hold fire to keep shooting.</span>
                </li>
                <li>
                  <strong>LOOT THE SECTOR</strong>
                  <span>
                    Pick up medkits, grenades and seven weapons. A full loadout
                    uses E or SWAP to replace the equipped gun.
                  </span>
                </li>
                <li>
                  <strong>WATCH THE CLOCK</strong>
                  <span>
                    Most eliminations wins. Progress to the next level with
                    server-confirmed match XP.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                className="online-primary"
                onClick={closeGuide}
                data-testid="onboarding-dismiss"
              >
                ENTER THE ARENA
              </button>
            </div>
          </div>
        ) : null}
        <div className="online-session-bar">
          <span className="mono-label">
            ROOM {room.roomId.slice(0, 8)}
            {" // "}
            {playerName}
          </span>
          <span className="online-session-bar__ping">
            {profile ? `LVL ${profile.level} // ` : ""}
            {ping === null ? "PING --" : `PING ${ping}MS`}
            {tickMs === null ? "" : ` // TICK ${tickMs.toFixed(1)}MS`}
          </span>
          <button
            type="button"
            className="hud-button"
            onClick={copyInvite}
            data-testid="copy-invite"
          >
            {copied ? "COPIED" : "INVITE"}
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => setSettingsOpen(true)}
            data-testid="session-settings"
          >
            SETTINGS
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={onLeave}
            data-testid="leave-online"
          >
            LEAVE
          </button>
        </div>
      </section>
    </main>
  );
}

export function OnlineShell() {
  const [name, setName] = useState("VIBER-GUEST");
  const [skinId, setSkinId] = useState(HUMAN_DEFAULT_SKIN_ID);
  const [rooms, setRooms] = useState<LobbyRoomLike[]>([]);
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<OnlineRoom | null>(null);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [copiedRoom, setCopiedRoom] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [equipped, setEquipped] = useState<EquippedCosmetics>(DEFAULT_EQUIPPED);
  const [lastReward, setLastReward] = useState<MatchReward | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectGraceSeconds, setReconnectGraceSeconds] = useState(20);
  const reconnectGraceRef = useRef(20);
  const [profileBusy, setProfileBusy] = useState(false);
  const [showLobbyGuide, setShowLobbyGuide] = useState(false);
  const clientRef = useRef<OnlineClient | null>(null);
  const lobbyRef = useRef<OnlineRoom | null>(null);
  const joinedRef = useRef<OnlineRoom | null>(null);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("vibe-militia-guest");
      const initialName = saved || randomGuestName();
      setName(initialName);
      const savedSkin = window.localStorage.getItem(SKIN_STORAGE_KEY);
      const restoredSkin = getCharacterSkin(savedSkin).skinId;
      setSkinId(restoredSkin);
      if (!savedSkin || savedSkin !== restoredSkin) {
        window.localStorage.setItem(SKIN_STORAGE_KEY, restoredSkin);
      }
      const roomParam = new URLSearchParams(window.location.search).get("room");
      if (roomParam) setInviteRoomId(roomParam);
      let onboarded = false;
      try {
        onboarded =
          window.localStorage.getItem("vibe-militia-onboarded") === "1";
      } catch {
        onboarded = false;
      }
      if (!onboarded) setShowLobbyGuide(true);
      void fetch(`${SERVER_URL.replace(/\/$/, "")}/api/config`, {
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((config: { reconnectGraceSeconds?: number } | null) => {
          if (!mountedRef.current) return;
          const seconds = Math.max(
            1,
            Math.min(120, Number(config?.reconnectGraceSeconds) || 20),
          );
          reconnectGraceRef.current = seconds;
          setReconnectGraceSeconds(seconds);
        })
        .catch(() => undefined);
      const cached = readCachedProfile();
      if (cached) {
        setProfile(cached);
        setEquipped(cached.equipped);
      }
      void ensureGuestProfile(initialName, restoredSkin).then((loaded) => {
        if (!mountedRef.current || !loaded) return;
        setProfile(loaded);
        setEquipped(loaded.equipped);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
    };
  }, []);

  const selectedSkin = useMemo(
    () => getCharacterSkin(skinId),
    [skinId],
  );

  const chooseSkin = useCallback((nextSkinId: string) => {
    const validSkinId = getCharacterSkin(nextSkinId).skinId;
    setSkinId(validSkinId);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, validSkinId);
    } catch {
      // Selection still applies for this session when storage is unavailable.
    }
    if (profile) {
      void updateGuestProfile({ skinId: validSkinId }).then((result) => {
        if (result) setProfile(result.player);
      });
    }
  }, [profile]);

  const equipCosmetic = useCallback(
    async (slot: keyof EquippedCosmetics, id: string) => {
      if (!profile) return;
      const next = { ...equipped, [slot]: id };
      const previous = equipped;
      setEquipped(next);
      setProfileBusy(true);
      const result = await updateGuestProfile({ equipped: next });
      setProfileBusy(false);
      if (result) {
        setProfile(result.player);
        setEquipped(result.player.equipped);
      } else {
        setEquipped(previous);
      }
    },
    [equipped, profile],
  );

  useEffect(() => {
    let cancelled = false;
    let localClient: OnlineClient | null = null;
    let localLobby: OnlineRoom | null = null;

    const connect = async () => {
      try {
        const { Client } = await import("@colyseus/sdk");
        localClient = new Client(SERVER_URL);
        if (cancelled) return;
        clientRef.current = localClient;
        localLobby = await localClient.joinOrCreate("lobby", {
          filter: { name: "ffa" },
        });
        if (cancelled) {
          await localLobby.leave();
          return;
        }
        lobbyRef.current = localLobby;
        setConnected(true);

        const applyRooms = (incoming: LobbyRoomLike[]) => {
          if (mountedRef.current) {
            setRooms(
              [...incoming].sort((a, b) => a.roomId.localeCompare(b.roomId)),
            );
          }
        };
        localLobby.onMessage("rooms", (incoming: LobbyRoomLike[]) =>
          applyRooms(incoming ?? []),
        );
        localLobby.onMessage("+", ([roomId, room]: [string, LobbyRoomLike]) => {
          if (!mountedRef.current) return;
          setRooms((current) => mergeRoom(current, roomId, room));
        });
        localLobby.onMessage("-", (roomId: string) => {
          if (!mountedRef.current) return;
          setRooms((current) => current.filter((room) => room.roomId !== roomId));
        });
        localLobby.send("filter", { name: "ffa" });
        localLobby.onError.once((_code, message) => {
          if (mountedRef.current) {
            setConnected(false);
            setError(message ?? "Lobby connection failed");
          }
        });
      } catch (connectError) {
        if (!cancelled) {
          setError(
            connectError instanceof Error
              ? connectError.message
              : "Could not connect to the game server",
          );
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (localLobby) void localLobby.leave();
      if (joinedRef.current && !leavingRef.current) {
        void joinedRef.current.leave();
      }
      joinedRef.current = null;
      lobbyRef.current = null;
      clientRef.current = null;
    };
  }, []);

  const attachRoomHandlers = useCallback((room: OnlineRoom) => {
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 30;
    room.reconnection.delay = 250;
    room.reconnection.maxDelay = 3000;
    const armDrop = () => {
      let expiryTimer: number | null = null;
      room.onDrop.once(() => {
        if (leavingRef.current) return;
        if (mountedRef.current) setReconnecting(true);
        expiryTimer = window.setTimeout(() => {
          if (!room.reconnection.isReconnecting) return;
          void room.leave().catch(() => undefined);
        }, reconnectGraceRef.current * 1000 + 2500);
        room.onReconnect.once(() => {
          if (expiryTimer !== null) window.clearTimeout(expiryTimer);
          expiryTimer = null;
          if (mountedRef.current) setReconnecting(false);
          armDrop();
        });
      });
    };
    armDrop();
    room.onLeave.once((code, reason) => {
      if (mountedRef.current) setReconnecting(false);
      if (leavingRef.current) return;
      joinedRef.current = null;
      if (!mountedRef.current) return;
      setJoinedRoom(null);
      setError(
        reason ||
          (code === 1000
            ? "Room closed"
            : `Disconnected from the match (${code})`),
      );
    });
    room.onError.once((_code, message) => {
      if (!mountedRef.current) return;
      setError(message ?? "Room connection error");
    });
    room.onMessage("profile-update", (reward: MatchReward) => {
      if (!mountedRef.current) return;
      setProfile(reward.profile);
      setEquipped(reward.profile.equipped);
      if (reward.xpEarned > 0 || reward.levelUp) setLastReward(reward);
    });
  }, []);

  const adoptRoom = useCallback(
    async (room: OnlineRoom) => {
      if (!mountedRef.current) {
        await room.leave();
        return;
      }
      leavingRef.current = false;
      joinedRef.current = room;
      attachRoomHandlers(room);
      setJoinedRoom(room);
      window.history.replaceState(null, "", `/online?room=${room.roomId}`);
      setInviteRoomId(room.roomId);
    },
    [attachRoomHandlers],
  );

  const joinRoom = useCallback(
    async (roomId?: string) => {
      const client = clientRef.current;
      if (!client || joining) return;
      const guest = name.trim() || randomGuestName();
      window.localStorage.setItem("vibe-militia-guest", guest);
      setName(guest);
      setError(null);
      setJoining(true);
      const ensured = profile ?? (await ensureGuestProfile(guest, skinId));
      if (ensured) {
        setProfile(ensured);
        setEquipped(ensured.equipped);
        await updateGuestProfile({ name: guest, skinId });
      }
      try {
        const room = roomId
          ? await client.joinById(roomId, {
              name: guest,
              skinId,
              guestToken: guestToken() ?? undefined,
            })
          : await client.create("ffa", {
              name: guest,
              roomName: "SECTOR 07",
              skinId,
              guestToken: guestToken() ?? undefined,
            });
        await adoptRoom(room);
      } catch (joinError) {
        if (mountedRef.current) {
          setError(
            explainRoomError(
              joinError instanceof Error
                ? joinError.message
                : "Could not join that room",
            ),
          );
        }
      } finally {
        if (mountedRef.current) setJoining(false);
      }
    },
    [adoptRoom, joining, name, profile, skinId],
  );

  const quickMatch = useCallback(async () => {
    const client = clientRef.current;
    if (!client || joining) return;
    const guest = name.trim() || randomGuestName();
    window.localStorage.setItem("vibe-militia-guest", guest);
    setName(guest);
    setError(null);
    setJoining(true);
    const ensured = profile ?? (await ensureGuestProfile(guest, skinId));
    if (ensured) {
      setProfile(ensured);
      setEquipped(ensured.equipped);
      await updateGuestProfile({ name: guest, skinId });
    }
    try {
      let room: OnlineRoom | null = null;
      for (let attempt = 0; attempt < 4 && !room; attempt += 1) {
        try {
          room = await client.joinOrCreate("ffa", {
            name: guest,
            roomName: "SECTOR 07",
            skinId,
            open: true,
            guestToken: guestToken() ?? undefined,
          });
        } catch (attemptError) {
          const message =
            attemptError instanceof Error ? attemptError.message : "";
          if (
            attempt >= 3 ||
            !/full|locked|ended|seat|matchmake/i.test(message)
          ) {
            throw attemptError;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
      }
      if (!room) {
        room = await client.create("ffa", {
          name: guest,
          roomName: "SECTOR 07",
          skinId,
          guestToken: guestToken() ?? undefined,
        });
      }
      await adoptRoom(room);
    } catch (joinError) {
      if (mountedRef.current) {
        setError(
          explainRoomError(
            joinError instanceof Error
              ? joinError.message
              : "Could not find a room",
          ),
        );
      }
    } finally {
      if (mountedRef.current) setJoining(false);
    }
  }, [adoptRoom, joining, name, profile, skinId]);

  const leaveRoom = useCallback(async () => {
    const room = joinedRef.current;
    leavingRef.current = true;
    joinedRef.current = null;
    setJoinedRoom(null);
    window.history.replaceState(null, "", "/online");
    if (room) await room.leave();
    leavingRef.current = false;
  }, []);

  const copyRoomInvite = async (roomId: string) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/online?room=${roomId}`,
      );
      setCopiedRoom(roomId);
      window.setTimeout(() => setCopiedRoom(null), 1500);
    } catch {
      setError("Clipboard access was blocked. Open the invite link manually.");
    }
  };

  if (joinedRoom) {
    return (
      <OnlineGameSession
        room={joinedRoom}
        playerName={name}
        skinId={skinId}
        reconnecting={reconnecting}
        reconnectGraceSeconds={reconnectGraceSeconds}
        profile={profile}
        lastReward={lastReward}
        onRewardSeen={() => setLastReward(null)}
        onLeave={() => void leaveRoom()}
      />
    );
  }

  return (
    <main className="online-page">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <div className="online-shell">
        <header className="online-header">
          <div>
            <span className="hud-brand">VIBE MILITIA // ONLINE</span>
            <h1 className="display online-title">FREE FOR ALL</h1>
            <p className="online-lead">
              Server-authoritative matches. Eight combatant slots, a short
              pre-match countdown, bot backfill, and a ninety second clock.
            </p>
          </div>
          <Link className="online-back" href="/">
            BACK TO LOCAL
          </Link>
        </header>

        {showLobbyGuide ? (
          <section
            className="onboarding-banner"
            aria-labelledby="onboarding-banner-title"
            data-testid="onboarding-banner"
          >
            <div className="onboarding-banner__copy">
              <span className="mono-label">FIRST DROP // CONTROLS</span>
              <h2 id="onboarding-banner-title" className="display">
                KNOW THE SECTOR
              </h2>
              <p>
                WASD or left stick moves. Space or JUMP lifts. Mouse or right
                stick aims. Fire, reload with R, swap weapons with 1 to 3,
                grenades with 4 to 6 and G, medkits with H, loot swaps with E.
              </p>
            </div>
            <button
              type="button"
              className="online-secondary online-secondary--small"
              onClick={() => {
                setShowLobbyGuide(false);
                try {
                  window.localStorage.setItem("vibe-militia-onboarded", "1");
                } catch {
                  // Guidance still closes for this session.
                }
              }}
              data-testid="onboarding-dismiss"
            >
              GOT IT
            </button>
          </section>
        ) : null}

        {inviteRoomId ? (
          <div className="online-invite">
            <div>
              <span className="mono-label">INVITE RECEIVED</span>
              <strong>ROOM {inviteRoomId.slice(0, 8)}</strong>
            </div>
            <button
              type="button"
              className="online-primary"
              onClick={() => void joinRoom(inviteRoomId)}
              disabled={joining || !connected}
              data-testid="join-invite-room"
            >
              {joining ? "JOINING..." : "JOIN ROOM"}
            </button>
          </div>
        ) : null}

        <section
          className="skin-select"
          aria-labelledby="skin-select-title"
          data-testid="skin-selection"
        >
          <div className="skin-select__spotlight">
            <div className="skin-select__heading">
              <span className="mono-label">OPERATOR BAY // 10 AVAILABLE</span>
              <h2 id="skin-select-title" className="display">
                CHOOSE YOUR VIBER
              </h2>
              <p>
                Every official Viber is unlocked. Pick a character before you
                join. Your selection is saved on this device and never changes
                during a live match.
              </p>
            </div>
            <div className="skin-preview" data-testid="skin-preview">
              <div className="skin-preview__stage">
                <Image
                  src={selectedSkin.cutoutPath}
                  alt={`${selectedSkin.displayName} character preview`}
                  fill
                  sizes="(max-width: 900px) 50vw, 260px"
                  className="skin-preview__image"
                />
                <span className="skin-preview__scan" aria-hidden="true" />
              </div>
              <div className="skin-preview__meta">
                <span className="mono-label">SELECTED OPERATOR</span>
                <strong
                  className="display"
                  data-testid="selected-skin-name"
                  aria-live="polite"
                >
                  {selectedSkin.displayName}
                </strong>
                <span className="mono-label">
                  {`${selectedSkin.skinId} // COSMETIC ONLY`}
                </span>
              </div>
            </div>
          </div>

          <fieldset className="skin-select__roster">
            <legend className="mono-label skin-select__legend">
              OFFICIAL VIBER ROSTER
            </legend>
            <div className="skin-grid">
              {CHARACTER_ROSTER.map((skin) => {
                const selected = skin.skinId === selectedSkin.skinId;
                return (
                  <label
                    className={`skin-card${selected ? " is-selected" : ""}`}
                    key={skin.skinId}
                    data-testid={`skin-card-${skin.skinId}`}
                    data-skin-id={skin.skinId}
                    data-selected={selected}
                  >
                    <input
                      className="skin-card__input"
                      type="radio"
                      name="online-skin"
                      value={skin.skinId}
                      checked={selected}
                      onChange={() => chooseSkin(skin.skinId)}
                      aria-label={`Select ${skin.displayName}`}
                    />
                    <span className="skin-card__art">
                      <Image
                        src={skin.avatarPath}
                        alt=""
                        fill
                        sizes="140px"
                        className="skin-card__image"
                      />
                      <span className="skin-card__check" aria-hidden="true">
                        SELECTED
                      </span>
                    </span>
                    <span className="skin-card__name">
                      {skin.displayName}
                    </span>
                    <span className="skin-card__id">{skin.skinId}</span>
                  </label>
                );
              })}
            </div>
            <span className="mono-label skin-select__hint">
              ARROW KEYS TO BROWSE // SELECTION SAVED LOCALLY
            </span>
          </fieldset>
        </section>

        <div className="online-layout">
          <section className="online-main">
            <div className="online-actions-panel">
              <div className="online-field">
                <label className="mono-label" htmlFor="guest-name">
                  GUEST CALLSIGN
                </label>
                <input
                  id="guest-name"
                  className="online-input"
                  value={name}
                  maxLength={18}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="VIBER-000"
                />
              </div>
              <div className="online-actions">
                <button
                  type="button"
                  className="online-primary"
                  onClick={() => void quickMatch()}
                  disabled={joining || !connected}
                  data-testid="quick-match"
                >
                  {joining ? "CONNECTING..." : "QUICK MATCH"}
                </button>
                <button
                  type="button"
                  className="online-secondary"
                  onClick={() => void joinRoom()}
                  disabled={joining || !connected}
                  data-testid="create-room"
                >
                  CREATE ROOM
                </button>
              </div>
              <span className="mono-label online-connection">
                {connected
                  ? `SERVER LINKED // ${SERVER_URL}`
                  : "CONNECTING TO GAME SERVER..."}
              </span>
              {error ? (
                <div className="online-error" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="online-room-head">
              <span className="mono-label">JOINABLE ROOMS</span>
              <span className="mono-label">{rooms.length} VISIBLE</span>
            </div>
            <div className="online-rooms" data-testid="room-list">
              {rooms.length === 0 ? (
                <div className="online-empty">
                  <strong className="display">NO OPEN ROOMS</strong>
                  <p>Create one and share the invite link, or start a quick match.</p>
                </div>
              ) : (
                rooms.map((room) => {
                  const metadata = room.metadata;
                  const joinable =
                    Boolean(metadata?.joinable) &&
                    metadata?.phase !== "ended" &&
                    room.clients < room.maxClients;
                  const countdown = metadata?.phase === "countdown";
                  const countdownSeconds = Math.max(
                    0,
                    Math.ceil((metadata?.countdownMs ?? 0) / 1000),
                  );
                  const roomClock = countdown
                    ? `STARTING ${countdownSeconds}S`
                    : metadata?.phase === "waiting"
                      ? "WAITING"
                      : `${(metadata?.remainingMs ?? 90_000) / 1000 | 0}s LEFT`;
                  return (
                    <article
                      className="online-room-card"
                      key={room.roomId}
                      data-room-id={room.roomId}
                      data-room-phase={metadata?.phase ?? "waiting"}
                      data-room-countdown={Math.round(metadata?.countdownMs ?? 0)}
                    >
                      <div className="online-room-card__copy">
                        <div className="online-room-card__head">
                          <strong className="display">
                            {metadata?.name || "SECTOR 07"}
                          </strong>
                          <span
                            className={`hud-pill${joinable ? " hud-pill--live" : ""}`}
                          >
                            {countdown ? "STARTING" : joinable ? "OPEN" : "CLOSED"}
                          </span>
                        </div>
                        <span className="mono-label">
                          {metadata?.humans ?? room.clients} HUMAN //{" "}
                          {metadata?.bots ?? 0} BOT // {roomClock}
                        </span>
                        <span className="mono-label online-room-card__id">
                          ROOM {room.roomId}
                        </span>
                      </div>
                      <div className="online-room-card__actions">
                        <button
                          type="button"
                          className="online-primary online-primary--small"
                          disabled={!joinable || joining}
                          onClick={() => void joinRoom(room.roomId)}
                          data-testid={`join-room-${room.roomId}`}
                        >
                          JOIN
                        </button>
                        <button
                          type="button"
                          className="online-secondary online-secondary--small"
                          onClick={() => void copyRoomInvite(room.roomId)}
                        >
                          {copiedRoom === room.roomId ? "COPIED" : "INVITE"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <aside className="online-side">
            <ProfilePanel
              profile={profile}
              equipped={equipped}
              busy={profileBusy}
              onEquip={(slot, id) => void equipCosmetic(slot, id)}
            />
            <div className="online-side-card">
              <AudioSettings compact />
            </div>
            <div className="online-side-card">
              <span className="mono-label">MATCH RULES</span>
              <ul>
                <li>90 second free-for-all</li>
                <li>First to 10 eliminations</li>
                <li>8 combatant slots per room</li>
                <li>Countdown fills empty seats with bots</li>
                <li>Humans replace bots on join</li>
                <li>Disconnects reserve the seat for 20 seconds</li>
              </ul>
            </div>
            <div className="online-side-card">
              <span className="mono-label">SERVER AUTHORITY</span>
              <p>
                Movement, weapons, damage, respawns, eliminations and the match
                clock are processed by the Node server. The browser renders the
                result.
              </p>
            </div>
            <div className="online-side-card online-side-card--accent">
              <span className="mono-label">SHARE THE ARENA</span>
              <p>
                Copy an invite link from a room card. Opening it preloads the
                room join action on this page.
              </p>
            </div>
          </aside>
        </div>
        <footer className="online-footer mono-label">
          P4 ONLINE BUILD . ORIGINAL VIBE VIBERS ARTWORK . NO WALLET REQUIRED
        </footer>
      </div>
    </main>
  );
}
