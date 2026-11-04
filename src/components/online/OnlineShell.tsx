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
import { OnlineGameCanvas } from "@/components/online/OnlineGameCanvas";
import type { OnlineRoomMetadata } from "@/game/multiplayer/protocol";

type OnlineRoom = Room;
type OnlineClient = Client;
type AvailableRoom = RoomAvailable<OnlineRoomMetadata>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_COLYSEUS_URL ?? "http://localhost:2567";
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
  onLeave,
}: {
  room: OnlineRoom;
  playerName: string;
  skinId: string;
  onLeave: () => void;
}) {
  const bridge = useMemo(() => new GameBridge(), []);
  const [ping, setPing] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState<number | null>(null);

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
      <section className="game-frame" aria-label="Vibe Militia online arena">
        <OnlineGameCanvas room={room} bridge={bridge} playerName={playerName} />
        <GameHud
          bridge={bridge}
          mode="online"
          playerName={playerName}
          playerSkinId={skinId}
        />
        <div className="online-session-bar">
          <span className="mono-label">
            ROOM {room.roomId.slice(0, 8)}
            {" // "}
            {playerName}
          </span>
          <span className="online-session-bar__ping">
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
  const clientRef = useRef<OnlineClient | null>(null);
  const lobbyRef = useRef<OnlineRoom | null>(null);
  const joinedRef = useRef<OnlineRoom | null>(null);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("vibe-militia-guest");
      setName(saved || randomGuestName());
      const savedSkin = window.localStorage.getItem(SKIN_STORAGE_KEY);
      const restoredSkin = getCharacterSkin(savedSkin).skinId;
      setSkinId(restoredSkin);
      if (!savedSkin || savedSkin !== restoredSkin) {
        window.localStorage.setItem(SKIN_STORAGE_KEY, restoredSkin);
      }
      const roomParam = new URLSearchParams(window.location.search).get("room");
      if (roomParam) setInviteRoomId(roomParam);
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
  }, []);

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
    room.onLeave.once((code, reason) => {
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
      try {
        const room = roomId
          ? await client.joinById(roomId, {
              name: guest,
              skinId,
            })
          : await client.create("ffa", {
              name: guest,
              roomName: "SECTOR 07",
              skinId,
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
    [adoptRoom, joining, name, skinId],
  );

  const quickMatch = useCallback(async () => {
    const client = clientRef.current;
    if (!client || joining) return;
    const guest = name.trim() || randomGuestName();
    window.localStorage.setItem("vibe-militia-guest", guest);
    setName(guest);
    setError(null);
    setJoining(true);
    try {
      let room: OnlineRoom | null = null;
      for (let attempt = 0; attempt < 4 && !room; attempt += 1) {
        try {
          room = await client.joinOrCreate("ffa", {
            name: guest,
            roomName: "SECTOR 07",
            skinId,
            open: true,
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
  }, [adoptRoom, joining, name, skinId]);

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
            <div className="online-side-card">
              <span className="mono-label">MATCH RULES</span>
              <ul>
                <li>90 second free-for-all</li>
                <li>First to 10 eliminations</li>
                <li>8 combatant slots per room</li>
                <li>Countdown fills empty seats with bots</li>
                <li>Humans replace bots on join</li>
                <li>Bots backfill disconnected seats</li>
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
          P2.5 ONLINE BUILD . ORIGINAL VIBE VIBERS ARTWORK . NO WALLET REQUIRED
        </footer>
      </div>
    </main>
  );
}
