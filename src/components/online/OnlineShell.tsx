"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { PerformanceOverlay } from "@/components/game/PerformanceOverlay";
import { QualitySettings } from "@/components/game/QualitySettings";
import { TouchControls } from "@/components/game/TouchControls";
import { TouchSettingsPanel } from "@/components/game/TouchSettingsPanel";
import { ProfilePanel } from "@/components/online/ProfilePanel";
import { BetaFeedback } from "@/components/online/BetaFeedback";
import { OnlineGameCanvas } from "@/components/online/OnlineGameCanvas";
import {
  NET_PROTOCOL_VERSION,
  type OnlineRoomMetadata,
} from "@/game/multiplayer/protocol";
import {
  SNAPSHOT_FAST,
  SNAPSHOT_SELF,
  SNAPSHOT_SLOW,
} from "@/game/multiplayer/snapshotCodec";
import { audio } from "@/game/audio/AudioEngine";
import {
  ensureGuestProfile,
  gameServerHttpUrl,
  guestToken,
  readCachedProfile,
  redeemResume,
  updateGuestProfile,
} from "@/lib/guestProfile";
import {
  clearResumeContext,
  readResumeContext,
  writeResumeContext,
} from "@/lib/resumeContext";
import type { MatchReward, PlayerProfile } from "@/game/progression/profile";
import {
  DEFAULT_EQUIPPED,
  type EquippedCosmetics,
} from "@/game/progression/cosmetics";
import { installClientErrorCapture } from "@/lib/betaTelemetry";
import { usePlayerIdentity } from "@/components/hub/usePlayerIdentity";
import { ArrowLeft, Globe2, Settings, Trophy, Users } from "lucide-react";

type OnlineRoom = Room;
type OnlineClient = Client;
type AvailableRoom = RoomAvailable<OnlineRoomMetadata>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
  process.env.NEXT_PUBLIC_COLYSEUS_URL ??
  "http://localhost:2567";
const SKIN_STORAGE_KEY = "vibe-militia-skin";
const LOBBY_ATTEMPTS = 5;
const LOBBY_ATTEMPT_MS = 6000;

interface LobbyRoomLike extends AvailableRoom {
  roomId: string;
  metadata?: OnlineRoomMetadata;
}

interface ResumeReadyMessage {
  handle: string;
  roomId: string;
  expiresAt: number;
  graceSeconds: number;
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
  const router = useRouter();
  const [ping, setPing] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState<number | null>(null);
  const [signalWeak, setSignalWeak] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const gameFrameRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (window as unknown as { __HUD_BRIDGE__?: GameBridge }).__HUD_BRIDGE__ = bridge;
    return () => {
      delete (window as unknown as { __HUD_BRIDGE__?: GameBridge }).__HUD_BRIDGE__;
    };
  }, [bridge]);

  useEffect(() => {
    // Measured, not inferred. A stalled snapshot stream is what a player feels,
    // and it is reported separately from a real disconnect.
    const timer = window.setInterval(() => {
      const age = window.__VIBE_MILITIA_ONLINE__?.getProbe().net?.snapshotAgeMs ?? 0;
      setSignalWeak(age > 1200);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leaveArmed) return undefined;
    const timer = window.setTimeout(() => setLeaveArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [leaveArmed]);

  const requestLeave = () => {
    if (bridge.getSnapshot().matchPhase !== "live" || leaveArmed) {
      onLeave();
      return;
    }
    setLeaveArmed(true);
  };

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

  useEffect(() => {
    const updateOrientation = () => {
      setPortrait(window.innerHeight > window.innerWidth);
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onOrientation = () => {
      window.setTimeout(updateOrientation, 180);
    };
    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", onOrientation);
    document.addEventListener("fullscreenchange", updateOrientation);
    return () => {
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("fullscreenchange", updateOrientation);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await gameFrameRef.current?.requestFullscreen?.();
      }
    } catch {
      // Fullscreen can be blocked by the browser or an embedded frame.
    }
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/online?room=${room.roomId}`
      : "";

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // Clipboard can be blocked.
    }
  };

  return (
    <main className="militia-page">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <section
        ref={gameFrameRef}
        className={`game-frame${touchMode ? " is-touch" : ""}${portrait && touchMode ? " is-portrait" : ""}${isFullscreen ? " is-fullscreen" : ""}`}
        aria-label="Vibe Militia online arena"
      >
        <OnlineGameCanvas room={room} bridge={bridge} playerName={playerName} />
        <PerformanceOverlay mode="online" pingMs={ping} />
        <GameHud
          bridge={bridge}
          mode="online"
          playerName={playerName}
          playerSkinId={skinId}
          profile={profile}
          reward={lastReward}
          onLobby={onLeave}
          onHub={() => {
            onLeave();
            router.push("/");
          }}
        />
        {touchMode ? (
          <TouchControls
            bridge={bridge}
            onSettings={() => setSettingsOpen(true)}
            playerName={playerName}
            level={profile?.level ?? 1}
            variant="online"
          />
        ) : null}
        {reconnecting ? (
          <div className="reconnect-overlay" data-testid="reconnect-overlay">
            <div className="reconnect-card" role="status" aria-live="assertive">
              <span className="mono-label">CONNECTION LOST</span>
              <strong className="display">RECONNECTING</strong>
              <p>
                Your seat, loadout and score are reserved for{" "}
                {reconnectGraceSeconds} seconds. A page reload in this window
                returns to the same room and human seat.
              </p>
              <span className="reconnect-card__bar" aria-hidden="true" />
            </div>
          </div>
        ) : null}
        {portrait && touchMode ? (
          <div
            className="orientation-overlay"
            data-testid="orientation-guard"
            role="status"
            aria-live="assertive"
          >
            <div className="orientation-card">
              <span className="orientation-icon" aria-hidden="true">
                <span />
              </span>
              <span className="mono-label">LANDSCAPE REQUIRED</span>
              <strong className="display">ROTATE YOUR DEVICE</strong>
              <p>
                Sector 07 needs a wide view for fair aiming and thumb reach.
                Turn your phone sideways to return to the match.
              </p>
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
              <QualitySettings />
              {touchMode ? <TouchSettingsPanel /> : null}
              <div className="settings-card__controls">
                <span className="mono-label">CONTROLS</span>
                <p>
                  Desktop: WASD move, Space jump and jetpack, mouse aim and
                  fire, R reload, 1 to 3 weapons, 4 to 6 grenades, G throw, H
                  medkit, E swap.
                </p>
                <p>
                  Touch: left D-pad moves, push up to fly, right pad aims and
                  fires. Compact grenade, reload, weapon, medkit and pickup
                  controls sit in the thumb zones.
                </p>
              </div>
              {touchMode ? <BetaFeedback /> : null}
              <div className="settings-card__actions">
                <button
                  type="button"
                  className="online-secondary online-secondary--small"
                  onClick={() => {
                    setSettingsOpen(false);
                    onLeave();
                  }}
                  data-testid="leave-online-settings"
                >
                  LEAVE MATCH
                </button>
                {touchMode ? (
                  <button
                    type="button"
                    className="online-secondary online-secondary--small"
                    onClick={() => void toggleFullscreen()}
                    data-testid="toggle-fullscreen"
                  >
                    {isFullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN"}
                  </button>
                ) : null}
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
                  <span>WASD or the left D-pad. Space or push up lifts you.</span>
                </li>
                <li>
                  <strong>AIM AND FIRE</strong>
                  <span>
                    Mouse or the right pad. Push past the threshold to auto-fire,
                    or use FIRE.
                  </span>
                </li>
                <li>
                  <strong>LOOT THE SECTOR</strong>
                  <span>
                    Pick up medkits, grenades and seven weapons. A full loadout
                    uses E or PICKUP to replace the equipped gun.
                  </span>
                </li>
                <li>
                  <strong>WATCH THE CLOCK</strong>
                  <span>
                    Most eliminations wins. Online XP is server-confirmed.
                    Practice is never ranked.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                className="online-primary"
                onClick={() => {
                  setShowGuide(false);
                  try {
                    window.localStorage.setItem("vibe-militia-onboarded", "1");
                  } catch {
                    // Guidance still closes for this session.
                  }
                }}
                data-testid="onboarding-dismiss"
              >
                ENTER THE ARENA
              </button>
            </div>
          </div>
        ) : null}
        <div className="online-session-bar" title={`Room ${room.roomId} // ${playerName}`}>
          <span
            className={`online-session-bar__ping${(ping ?? 0) >= 300 ? " is-high" : ""}${signalWeak ? " is-weak" : ""}`}
            data-testid="connection-status"
            data-signal={signalWeak ? "weak" : "ok"}
          >
            {signalWeak
              ? "SIGNAL WEAK"
              : `${ping === null ? "PING --" : `PING ${ping}MS`}${tickMs === null ? "" : ` // TICK ${tickMs.toFixed(1)}MS`}`}
          </span>
          <button
            type="button"
            className="hud-button"
            onClick={() => void copyInvite()}
            data-testid="copy-invite"
          >
            INVITE
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => setSettingsOpen(true)}
            data-testid="session-settings"
          >
            SETTINGS
          </button>
          <BetaFeedback compact />
          <button
            type="button"
            className={`hud-button${leaveArmed ? " is-armed" : ""}`}
            onClick={requestLeave}
            data-testid="leave-online"
          >
            {leaveArmed ? "CONFIRM LEAVE" : "LEAVE"}
          </button>
        </div>
      </section>
    </main>
  );
}

export function OnlineShell() {
  const identity = usePlayerIdentity();
  const [name, setName] = useState("VIBER-GUEST");
  const [rooms, setRooms] = useState<LobbyRoomLike[]>([]);
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<OnlineRoom | null>(null);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [copiedRoom, setCopiedRoom] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [equipped, setEquipped] = useState<EquippedCosmetics>(DEFAULT_EQUIPPED);
  const [lastReward, setLastReward] = useState<MatchReward | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectGraceSeconds, setReconnectGraceSeconds] = useState(30);
  const [profileBusy, setProfileBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLobbyGuide, setShowLobbyGuide] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [resuming, setResuming] = useState(false);
  const clientRef = useRef<OnlineClient | null>(null);
  const lobbyRef = useRef<OnlineRoom | null>(null);
  const joinedRef = useRef<OnlineRoom | null>(null);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);
  const nameRef = useRef("VIBER-GUEST");
  const skinRef = useRef(HUMAN_DEFAULT_SKIN_ID);
  const reconnectGraceRef = useRef(30);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  useEffect(() => {
    skinRef.current = identity.skinId;
  }, [identity.skinId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setName(identity.name);
      nameRef.current = identity.name;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity.name]);

  useEffect(() => {
    const nextProfile = identity.profile;
    if (!nextProfile) return;
    const timer = window.setTimeout(() => {
      setProfile(nextProfile);
      setEquipped(nextProfile.equipped);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity.profile]);

  useEffect(() => {
    mountedRef.current = true;
    const uninstallErrorCapture = installClientErrorCapture();
    const timer = window.setTimeout(() => {
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
      const cached = readCachedProfile();
      if (cached) {
        setProfile(cached);
        setEquipped(cached.equipped);
      }
      void fetch(`${SERVER_URL.replace(/\/$/, "")}/api/config`, {
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((config: { reconnectGraceSeconds?: number } | null) => {
          if (!mountedRef.current) return;
          const seconds = Math.max(
            1,
            Math.min(120, Number(config?.reconnectGraceSeconds) || 30),
          );
          reconnectGraceRef.current = seconds;
          setReconnectGraceSeconds(seconds);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      uninstallErrorCapture();
      mountedRef.current = false;
      // Deliberately do not leave the match on page unload. Colyseus keeps the
      // seat reserved for the reconnect grace window.
    };
    // Connection is established once. Resume uses the same client below.
  }, []);

  const selectedSkin = useMemo(
    () => getCharacterSkin(identity.skinId),
    [identity.skinId],
  );

  const chooseSkin = identity.chooseSkin;
  const refreshProfile = identity.refreshProfile;

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

  const attachRoomHandlers = useCallback((room: OnlineRoom) => {
    // The match scene registers its handlers when the arena finishes loading.
    // These keep the stream quiet until then. It asks for a resync on arrival.
    for (const type of ["snapshot", "events", SNAPSHOT_FAST, SNAPSHOT_SLOW, SNAPSHOT_SELF]) {
      room.onMessage(type, () => undefined);
    }
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 40;
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
          if (mountedRef.current) {
            setReconnecting(false);
            setNotice("SEAT RESTORED // Score, loadout and XP kept.");
          }
          armDrop();
        });
      });
    };
    armDrop();
    room.onMessage("resume-ready", (message: ResumeReadyMessage) => {
      if (!message?.handle || !message.roomId) return;
      writeResumeContext({
        handle: message.handle,
        roomId: message.roomId,
        expiresAt: message.expiresAt,
        name: nameRef.current,
        skinId: skinRef.current,
      });
      if (mountedRef.current) {
        setReconnectGraceSeconds(
          Math.max(1, Math.min(120, Number(message.graceSeconds) || 30)),
        );
        reconnectGraceRef.current = Math.max(
          1,
          Math.min(120, Number(message.graceSeconds) || 30),
        );
      }
    });
    room.onLeave.once((code, reason) => {
      if (mountedRef.current) setReconnecting(false);
      if (leavingRef.current) return;
      clearResumeContext();
      joinedRef.current = null;
      if (!mountedRef.current) return;
      setJoinedRoom(null);
      setNotice(
        reason ||
          (code === 1000
            ? "ROOM CLOSED // Returned to matchmaking."
            : "RECONNECT WINDOW EXPIRED // Your seat was released. Guest XP is preserved."),
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
      refreshProfile().catch(() => undefined);
    });
  }, [refreshProfile]);

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
      room.send("request-resume");
    },
    [attachRoomHandlers],
  );

  useEffect(() => {
    let cancelled = false;
    let localClient: OnlineClient | null = null;
    let localLobby: OnlineRoom | null = null;
    let resumeTried = false;

    const connect = async () => {
      try {
        const { Client } = await import("@colyseus/sdk");
        localClient = new Client(SERVER_URL);
        if (cancelled) return;
        clientRef.current = localClient;
        // A lost handshake never rejects, so a slow link could sit on CONNECTING
        // forever. Bound each attempt and try again.
        for (let attempt = 0; attempt < LOBBY_ATTEMPTS && !localLobby; attempt += 1) {
          const joining = localClient.joinOrCreate("lobby", {
            filter: { name: "ffa" },
          });
          const joined = await Promise.race([
            joining,
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), LOBBY_ATTEMPT_MS);
            }),
          ]);
          if (joined) {
            localLobby = joined;
          } else {
            void joining.then((late) => late.leave()).catch(() => undefined);
          }
          if (cancelled) return;
        }
        if (!localLobby) {
          setError("Could not reach the game server. Reload to try again.");
          return;
        }
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

        if (!resumeTried) {
          resumeTried = true;
          const resume = readResumeContext();
          if (resume) {
            setResuming(true);
            const redeemed = await redeemResume(resume.handle, resume.roomId);
            if (cancelled) return;
            if (redeemed) {
              try {
                setName(resume.name);
                nameRef.current = resume.name;
                skinRef.current = resume.skinId;
                const room = await localClient.reconnect(
                  `${redeemed.roomId}:${redeemed.reconnectionToken}`,
                );
                await adoptRoom(room);
                setNotice("MATCH RESTORED // Same room and human seat.");
                setResuming(false);
                return;
              } catch {
                clearResumeContext();
                setNotice(
                  "MATCH ENDED OR SERVER RESTARTED // Guest XP is preserved.",
                );
              }
            } else {
              clearResumeContext();
              setNotice(
                "RECONNECT WINDOW EXPIRED // Your seat was released. Guest XP is preserved.",
              );
            }
            setResuming(false);
          }
        }
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
      if (joinedRef.current && leavingRef.current) {
        void joinedRef.current.leave();
      }
      joinedRef.current = null;
      lobbyRef.current = null;
      clientRef.current = null;
    };
  }, [adoptRoom]);

  const persistIdentity = useCallback(
    async (guest: string) => {
      window.localStorage.setItem("vibe-militia-guest", guest);
      window.localStorage.setItem("vibe-militia-profile-setup", "1");
      setName(guest);
      nameRef.current = guest;
      window.localStorage.setItem(SKIN_STORAGE_KEY, identity.skinId);
      const ensured =
        profile ?? (await ensureGuestProfile(guest, identity.skinId));
      if (ensured) {
        setProfile(ensured);
        setEquipped(ensured.equipped);
      }
      await updateGuestProfile({ name: guest, skinId: identity.skinId });
    },
    [identity.skinId, profile],
  );

  const joinRoom = useCallback(
    async (roomId?: string) => {
      const client = clientRef.current;
      if (!client || joining) return;
      const guest = name.trim() || randomGuestName();
      setError(null);
      setNotice(null);
      setJoining(true);
      await persistIdentity(guest);
      try {
        const room = roomId
          ? await client.joinById(roomId, {
              name: guest,
              skinId: identity.skinId,
              guestToken: guestToken() ?? undefined,
              netProtocol: NET_PROTOCOL_VERSION,
            })
          : await client.create("ffa", {
              name: guest,
              roomName: "SECTOR 07",
              skinId: identity.skinId,
              guestToken: guestToken() ?? undefined,
              netProtocol: NET_PROTOCOL_VERSION,
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
    [adoptRoom, identity.skinId, joining, name, persistIdentity],
  );

  const quickMatch = useCallback(async () => {
    const client = clientRef.current;
    if (!client || joining) return;
    const guest = name.trim() || randomGuestName();
    setError(null);
    setNotice(null);
    setJoining(true);
    await persistIdentity(guest);
    try {
      let room: OnlineRoom | null = null;
      for (let attempt = 0; attempt < 4 && !room; attempt += 1) {
        try {
          room = await client.joinOrCreate("ffa", {
            name: guest,
            roomName: "SECTOR 07",
            skinId: identity.skinId,
            open: true,
            guestToken: guestToken() ?? undefined,
            netProtocol: NET_PROTOCOL_VERSION,
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
          skinId: identity.skinId,
          guestToken: guestToken() ?? undefined,
          netProtocol: NET_PROTOCOL_VERSION,
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
  }, [adoptRoom, identity.skinId, joining, name, persistIdentity]);

  const leaveRoom = useCallback(async () => {
    const room = joinedRef.current;
    leavingRef.current = true;
    clearResumeContext();
    joinedRef.current = null;
    setJoinedRoom(null);
    window.history.replaceState(null, "", "/online");
    if (room) await room.leave();
    leavingRef.current = false;
    setNotice("LEFT MATCH // Your seat was released. Guest XP is preserved.");
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

  const intentHandled = useRef(false);
  useEffect(() => {
    if (
      intentHandled.current ||
      !connected ||
      resuming ||
      joining ||
      joinedRoom
    ) {
      return;
    }
    const intent = new URLSearchParams(window.location.search).get("intent");
    if (intent !== "quick" && intent !== "create") return;
    intentHandled.current = true;
    if (intent === "quick") void quickMatch();
    else void joinRoom();
  }, [connected, joining, joinedRoom, quickMatch, joinRoom, resuming]);

  const submitJoinCode = () => {
    const cleaned = joinCode
      .trim()
      .replace(/^.*[?&]room=/, "")
      .replace(/[^\w-]/g, "");
    if (!cleaned) {
      setError("Enter a room code or paste an invite link.");
      return;
    }
    setJoinCode("");
    void joinRoom(cleaned);
  };

  if (joinedRoom) {
    return (
      <OnlineGameSession
        room={joinedRoom}
        playerName={name}
        skinId={identity.skinId}
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
    <main className="online-page online-page--focused">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <div className="online-lobby">
        <header className="online-lobby__top">
          <Link className="online-lobby__back" href="/">
            <ArrowLeft aria-hidden="true" /> HUB
          </Link>
          <div className="online-lobby__title">
            <h1 className="display">ONLINE FFA</h1>
            <p>
              Server-authoritative. Eight seats, bot backfill, ninety-second
              clock. Practice is not part of this queue.
            </p>
          </div>
          <div className="online-lobby__status">
            <span
              className={`hub-pill${connected ? " is-live" : ""}`}
              data-testid="online-connection"
            >
              <Globe2 aria-hidden="true" style={{ width: 11, height: 11 }} />
              {connected ? "SERVER LINKED" : "CONNECTING"}
            </span>
            <button
              type="button"
              className="hub-icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open online settings"
              data-testid="online-settings"
            >
              <Settings aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="online-lobby__grid">
          <section className="online-main-card">
            {showLobbyGuide ? (
              <div
                className="online-guide-banner"
                role="status"
                data-testid="onboarding-overlay"
              >
                <div>
                  <span className="mono-label">ONLINE FFA // FIRST DROP</span>
                  <strong>QUICK MATCH, CREATE ROOM OR JOIN BY CODE</strong>
                  <p>
                    Empty seats fill with bots at countdown. Humans replace bots.
                    A dropped seat is held for {reconnectGraceSeconds} seconds,
                    and a reload in this tab recovers the same human seat.
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
              </div>
            ) : null}
            {resuming ? (
              <div className="online-invite" role="status">
                <div>
                  <span className="mono-label">RESUME CONTEXT FOUND</span>
                  <strong>RECONNECTING TO YOUR MATCH</strong>
                </div>
                <span className="hub-spinner" aria-hidden="true" />
              </div>
            ) : null}
            {notice ? (
              <div className="online-invite" role="status" data-testid="online-notice">
                <div>
                  <span className="mono-label">MATCH STATUS</span>
                  <strong>{notice}</strong>
                </div>
              </div>
            ) : null}
            {inviteRoomId ? (
              <div className="online-invite" data-testid="invite-banner">
                <div>
                  <span className="mono-label">INVITE RECEIVED</span>
                  <strong>ROOM {inviteRoomId.slice(0, 8)}</strong>
                </div>
                <button
                  type="button"
                  className="online-primary online-primary--small"
                  onClick={() => void joinRoom(inviteRoomId)}
                  disabled={joining || !connected}
                  data-testid="join-invite-room"
                >
                  {joining ? "JOINING..." : "JOIN ROOM"}
                </button>
              </div>
            ) : null}

            <div className="online-entry">
              <label className="online-entry__name">
                <span className="mono-label">CALLSIGN // EDITABLE DISPLAY NAME</span>
                <input
                  id="guest-name"
                  value={name}
                  maxLength={18}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="VIBER-000"
                  autoComplete="nickname"
                  data-testid="guest-name"
                />
              </label>
              <div className="online-entry__buttons">
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
            </div>

            <div className="online-operator" data-testid="skin-selection">
              <div className="online-operator__art" data-testid="skin-preview">
                <Image
                  src={selectedSkin.cutoutPath}
                  alt={`${selectedSkin.displayName} selected Viber`}
                  fill
                  sizes="52px"
                />
              </div>
              <div className="online-operator__copy">
                <span className="mono-label">SELECTED OPERATOR</span>
                <strong data-testid="selected-skin-name">
                  {selectedSkin.displayName}
                </strong>
                <span className="mono-label">
                  {`${selectedSkin.skinId} // TAP TO BROWSE`}
                </span>
              </div>
              <fieldset className="online-roster-field">
                <legend className="sr-only">Official Viber roster</legend>
                <div className="online-roster skin-grid">
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
                            sizes="44px"
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
              </fieldset>
            </div>

            <div className="online-rooms-head">
              <span className="mono-label">JOINABLE ROOMS</span>
              <span className="mono-label">{rooms.length} VISIBLE</span>
            </div>
            <div className="online-rooms" data-testid="room-list">
              {rooms.length === 0 ? (
                <div className="online-empty">
                  <strong className="display">NO OPEN ROOMS</strong>
                  <p>
                    Create one and share the invite link, or start a quick
                    match.
                  </p>
                  <div className="online-empty__steps">
                    <span>
                      <b>01</b> QUICK MATCH FINDS THE FULLEST OPEN ROOM
                    </span>
                    <span>
                      <b>02</b> EMPTY SEATS FILL WITH BOTS AT COUNTDOWN
                    </span>
                    <span>
                      <b>03</b> HUMANS REPLACE BOTS WITHOUT RESETTING THE CLOCK
                    </span>
                  </div>
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
            {error ? (
              <div className="online-error" role="alert">
                {error}
              </div>
            ) : null}
          </section>

          <aside className="online-side">
            <ProfilePanel
              profile={profile}
              equipped={equipped}
              busy={profileBusy}
              onEquip={(slot, id) => void equipCosmetic(slot, id)}
              compact
            />
            <div className="online-side-card">
              <span className="mono-label">JOIN WITH INVITE CODE</span>
              <div className="online-join-code">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitJoinCode();
                  }}
                  placeholder="ROOM ID"
                  aria-label="Room code"
                  data-testid="join-code"
                />
                <button
                  type="button"
                  className="online-secondary online-secondary--small"
                  onClick={submitJoinCode}
                  data-testid="join-code-button"
                >
                  JOIN
                </button>
              </div>
            </div>
            <div className="online-side-card online-side-links">
              <Link href="/?panel=profile">
                <span>EDIT PROFILE & COSMETICS</span>
                <span>HUB</span>
              </Link>
              <Link href="/?panel=rankings">
                <span>
                  <Trophy
                    aria-hidden="true"
                    style={{ width: 11, height: 11, marginRight: 5 }}
                  />
                  GLOBAL RANKINGS
                </span>
                <span>SERVER</span>
              </Link>
              <button type="button" onClick={() => setSettingsOpen(true)}>
                <span>AUDIO & TOUCH SETTINGS</span>
                <span>OPEN</span>
              </button>
            </div>
            <div className="online-side-card">
              <span className="mono-label">FAIR PLAY</span>
              <p className="online-connection" style={{ margin: "5px 0 0", lineHeight: 1.45 }}>
                <Users
                  aria-hidden="true"
                  style={{ width: 10, height: 10, marginRight: 4 }}
                />
                Online matches write XP and rankings. Practice never does. The
                server owns movement, damage, ammo, loot and results.
              </p>
            </div>
          </aside>
        </div>

        <footer className="online-footer mono-label">
          <span>
            {connected
              ? `PROFILE SERVICE ${gameServerHttpUrl()}`
              : "STARTING LOBBY CLIENT"}
          </span>
          <span>
            {reconnectGraceSeconds}S RECONNECT GRACE // SERVER AUTHORITATIVE //
            NO FAKE STANDINGS
          </span>
        </footer>
      </div>

      {settingsOpen ? (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Online lobby settings"
          data-testid="settings-overlay"
        >
          <div className="settings-card">
            <div className="settings-card__head">
              <span className="mono-label">ONLINE SETTINGS</span>
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
            <TouchSettingsPanel />
            <div className="settings-card__controls">
              <span className="mono-label">MATCH RULES</span>
              <p>
                90-second free-for-all. First to 10 eliminations. Eight
                combatant slots. Empty seats fill with bots at countdown.
                Disconnects reserve the human seat for{" "}
                {reconnectGraceSeconds} seconds.
              </p>
            </div>
            <div className="settings-card__actions">
              <Link href="/" className="online-secondary online-secondary--small">
                BACK TO HUB
              </Link>
              <button
                type="button"
                className="online-primary online-primary--small"
                onClick={() => setSettingsOpen(false)}
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {resuming
          ? "Reconnecting to your previous match."
          : notice ?? (connected ? "Online lobby connected." : "Connecting to lobby.")}
      </span>
    </main>
  );
}
