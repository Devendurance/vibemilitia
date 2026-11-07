"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Backpack,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Gamepad2,
  Globe2,
  Medal,
  Radio,
  Settings,
  Target,
  Trophy,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { CHARACTER_ROSTER, getCharacterSkin } from "@/game/characters/roster";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { GRENADE_CONFIG, GRENADE_SLOT_TYPES } from "@/game/core/grenades";
import { xpForNextLevel, totalXpForLevel } from "@/game/progression/progression";
import { cosmeticById } from "@/game/progression/cosmetics";
import type { PlayerProfile } from "@/game/progression/profile";
import {
  CharacterDrawer,
  HubFooterMark,
  LoadoutDrawer,
  OnboardingDialog,
  ProfileDrawer,
  RankingsDrawer,
  SettingsDrawer,
} from "@/components/hub/HubOverlays";
import { LoadoutIcon } from "@/components/game/LoadoutIcon";
import { usePlayerIdentity } from "@/components/hub/usePlayerIdentity";
import { audio, type AudioPreferences } from "@/game/audio/AudioEngine";

type Overlay = "character" | "profile" | "rankings" | "settings" | "loadout" | null;
type Mode = "online" | "practice";
type Difficulty = "easy" | "normal" | "hard" | "merciless";
type OnlineIntent = "quick" | "create";

const DIFFICULTIES: Array<{
  id: Difficulty;
  label: string;
  detail: string;
}> = [
  { id: "easy", label: "EASY", detail: "Slow reactions, wide spread" },
  { id: "normal", label: "NORMAL", detail: "Standard bot cadence" },
  { id: "hard", label: "HARD", detail: "Fast bursts, tight aim" },
  { id: "merciless", label: "MERCILESS", detail: "Relentless pressure" },
];

function avatarFor(profile: PlayerProfile | null, name: string, skinId: string) {
  const skin = getCharacterSkin(profile?.skinId ?? skinId);
  return { skin, label: profile?.name ?? name };
}

function DisplayName({
  profile,
  name,
}: {
  profile: PlayerProfile | null;
  name: string;
}) {
  return <>{profile?.name ?? name}</>;
}

function HubMusicControl() {
  const [prefs, setPrefs] = useState<AudioPreferences>(() => audio.getPreferences());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audio.enterHub();
    const unsubscribe = audio.subscribe(setPrefs);
    const start = () => {
      void audio.unlock().then(() => audio.startMusic()).then(setPlaying);
    };
    void audio.startMusic().then(setPlaying);
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    const onVisibility = () => {
      if (document.hidden) audio.pauseMusic();
      else {
        audio.resumeMusic();
        if (!audio.getPreferences().musicMuted) void audio.startMusic().then(setPlaying);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.leaveHub();
    };
  }, []);

  const toggle = () => {
    const next = audio.setMusicMuted(!prefs.musicMuted);
    if (!next.musicMuted) {
      void audio.unlock().then(() => audio.startMusic()).then(setPlaying);
    } else {
      audio.pauseMusic();
      setPlaying(false);
    }
  };

  const enabled = !prefs.musicMuted && playing;
  return (
    <button
      type="button"
      className={`hub-icon-button hub-music-button${enabled ? " is-active" : ""}`}
      onClick={toggle}
      aria-label={enabled ? "Mute hub music" : "Enable hub music"}
      aria-pressed={enabled}
      title={enabled ? "Mute hub music" : "Enable music"}
      data-testid="hub-music-toggle"
    >
      {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
    </button>
  );
}

export function GameHub() {
  const router = useRouter();
  const identity = usePlayerIdentity();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [mode, setMode] = useState<Mode>("online");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [onlineIntent, setOnlineIntent] = useState<OnlineIntent>("quick");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem("vibe-militia-reduce-motion") === "1") {
          document.documentElement.classList.add("reduce-motion");
        }
      } catch {
        // Preference is optional.
      }
      const panel = new URLSearchParams(window.location.search).get("panel");
      if (
        panel === "character" ||
        panel === "profile" ||
        panel === "rankings" ||
        panel === "settings" ||
        panel === "loadout"
      ) {
        setOverlay(panel);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeSkin = identity.selectedSkin;
  const identityView = avatarFor(identity.profile, identity.name, identity.skinId);
  const level = identity.profile?.level ?? 1;
  const xp = identity.profile?.xp ?? 0;
  const levelBase = totalXpForLevel(level);
  const levelSpan = xpForNextLevel(level);
  const levelProgress = Math.max(
    0,
    Math.min(1, (xp - levelBase) / Math.max(1, levelSpan)),
  );
  const title = cosmeticById(identity.profile?.equipped.titleId ?? "title-rookie");
  const badge = cosmeticById(identity.profile?.equipped.badgeId ?? "badge-lime-recruit");

  const cycleSkin = (direction: -1 | 1) => {
    const current = CHARACTER_ROSTER.findIndex(
      (skin) => skin.skinId === identity.skinId,
    );
    const next =
      (Math.max(0, current) + direction + CHARACTER_ROSTER.length) %
      CHARACTER_ROSTER.length;
    identity.chooseSkin(CHARACTER_ROSTER[next].skinId);
  };

  const play = () => {
    if (mode === "practice") {
      router.push(`/practice?difficulty=${difficulty}`);
      return;
    }
    router.push(`/online?intent=${onlineIntent}`);
  };

  const closeOverlay = () => setOverlay(null);

  return (
    <main className="hub" data-testid="game-hub">
      <div className="hub__scene" aria-hidden="true">
        <Image
          src="/brand/sector07-hub.svg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hub__scene-image"
        />
        <div className="hub__scene-sun" />
        <div className="hub__scene-glow" />
        <div className="hub__scene-grid" />
      </div>

      <header className="hub-top">
        <button
          type="button"
          className="hub-brand"
          onClick={() => setOverlay(null)}
          aria-label="Vibe Militia hub"
        >
          <span className="hub-brand__mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="hub-brand__type">
            <strong>VIBE MILITIA</strong>
            <small>SECTOR 07 // GAME HUB</small>
          </span>
        </button>

        <nav className="hub-nav" aria-label="Hub sections">
          <button
            type="button"
            className={`hub-nav__item${overlay === null ? " is-active" : ""}`}
            onClick={() => setOverlay(null)}
            data-testid="hub-tab-play"
          >
            <Gamepad2 aria-hidden="true" />
            <span>PLAY</span>
          </button>
          <button
            type="button"
            className={`hub-nav__item${overlay === "character" ? " is-active" : ""}`}
            onClick={() => setOverlay("character")}
            data-testid="hub-tab-vibers"
          >
            <Users aria-hidden="true" />
            <span>VIBERS</span>
          </button>
          <button
            type="button"
            className={`hub-nav__item${overlay === "loadout" ? " is-active" : ""}`}
            onClick={() => setOverlay("loadout")}
            data-testid="hub-tab-loadout"
          >
            <Backpack aria-hidden="true" />
            <span>LOADOUT</span>
          </button>
          <button
            type="button"
            className={`hub-nav__item${overlay === "rankings" ? " is-active" : ""}`}
            onClick={() => setOverlay("rankings")}
            data-testid="hub-tab-rankings"
          >
            <Trophy aria-hidden="true" />
            <span>RANKINGS</span>
          </button>
          <button
            type="button"
            className={`hub-nav__item${overlay === "profile" ? " is-active" : ""}`}
            onClick={() => setOverlay("profile")}
            data-testid="hub-tab-profile"
          >
            <UserRound aria-hidden="true" />
            <span>PROFILE</span>
          </button>
        </nav>

        <div className="hub-top__util">
          <span
            className={`hub-server${identity.serverOnline ? " is-online" : " is-offline"}`}
            title={
              identity.serverOnline
                ? "Online matchmaking available"
                : "Game server unreachable. Local practice remains available."
            }
          >
            {identity.serverOnline ? (
              <Wifi aria-hidden="true" />
            ) : (
              <WifiOff aria-hidden="true" />
            )}
            <span>
              {identity.serverOnline ? "SERVER LINKED" : "LOCAL PRACTICE"}
            </span>
          </span>
          <HubMusicControl />
          <button
            type="button"
            className="hub-icon-button"
            onClick={() => setOverlay("settings")}
            aria-label="Open settings"
            data-testid="hub-settings"
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="hub-profile" aria-label="Player profile">
        <div className="hub-profile__avatar" aria-hidden="true">
          <Image src={identityView.skin.avatarPath} alt="" fill sizes="64px" />
        </div>
        <div className="hub-profile__identity">
          <span className="mono-label">GUEST OPERATOR</span>
          <strong className="hub-profile__name" data-testid="hub-player-name">
            <DisplayName profile={identity.profile} name={identity.name} />
          </strong>
          <span className="hub-profile__title">
            {title?.name ?? "ROOKIE"}
            {identity.profile?.xHandle ? (
              <>
                {" // @"}
                {identity.profile.xHandle}
                <em> SELF-DECLARED</em>
              </>
            ) : null}
          </span>
        </div>
        <div className="hub-profile__level">
          <span className="hub-level">LVL {level}</span>
          <div
            className="hub-xp"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={levelSpan}
            aria-valuenow={Math.max(0, xp - levelBase)}
            aria-label={`Level ${level} progress`}
          >
            <span style={{ width: `${levelProgress * 100}%` }} />
          </div>
          <span className="mono-label">
            {Math.max(0, xp - levelBase)} / {levelSpan} XP
          </span>
        </div>
        <button
          type="button"
          className="hub-edit"
          onClick={() => setOverlay("profile")}
          aria-label="Edit profile"
          data-testid="hub-edit-profile"
        >
          <UserRound aria-hidden="true" />
          EDIT
        </button>
        {badge ? (
          <span className="hub-profile__badge" title={badge.description}>
            {badge.name}
          </span>
        ) : null}
      </section>

      <section className="hub-hero" aria-label="Selected Viber">
        <button
          type="button"
          className="hub-hero__arrow hub-hero__arrow--left"
          onClick={() => cycleSkin(-1)}
          aria-label="Previous Viber"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="hub-hero__stage">
          <span className="hub-hero__halo" aria-hidden="true" />
          <span className="hub-hero__ring" aria-hidden="true" />
          <span className="hub-hero__scan" aria-hidden="true" />
          <Image
            src={activeSkin.cutoutPath}
            alt={`${activeSkin.displayName} official Viber character`}
            fill
            priority
            sizes="(max-width: 900px) 44vw, 420px"
            className="hub-hero__image"
            data-testid="hub-hero-image"
          />
        </div>
        <div className="hub-hero__caption">
          <span className="mono-label">SELECTED VIBER // {activeSkin.skinId}</span>
          <strong className="display" data-testid="hub-hero-name">
            {activeSkin.displayName}
          </strong>
          <span className="hub-hero__sub">
            OFFICIAL VIBER // COSMETIC ONLY
          </span>
        </div>
        <button
          type="button"
          className="hub-hero__arrow hub-hero__arrow--right"
          onClick={() => cycleSkin(1)}
          aria-label="Next Viber"
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className="hub-hero__change"
          onClick={() => setOverlay("character")}
          data-testid="hub-change-viber"
        >
          <Users aria-hidden="true" />
          CHANGE VIBER
        </button>
      </section>

      <aside className="hub-mode" aria-label="Match setup">
        <div className="hub-mode__head">
          <div>
            <span className="mono-label">MATCH CONTROL</span>
            <h1 className="display">
              {mode === "online" ? "ONLINE FFA" : "PRACTICE"}
            </h1>
          </div>
          <span className={`hub-pill${mode === "online" ? " is-live" : ""}`}>
            {mode === "online" ? "LIVE" : "UNRANKED"}
          </span>
        </div>
        <div className="hub-mode__tabs" role="tablist" aria-label="Match mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "online"}
            className={mode === "online" ? "is-active" : ""}
            onClick={() => setMode("online")}
            data-testid="hub-mode-online"
          >
            <Globe2 aria-hidden="true" />
            ONLINE
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "practice"}
            className={mode === "practice" ? "is-active" : ""}
            onClick={() => setMode("practice")}
            data-testid="hub-mode-practice"
          >
            <Crosshair aria-hidden="true" />
            PRACTICE
          </button>
        </div>

        {mode === "online" ? (
          <div className="hub-mode__body">
            <div className="hub-option-row" role="radiogroup" aria-label="Online entry">
              <button
                type="button"
                role="radio"
                aria-checked={onlineIntent === "quick"}
                className={`hub-option${onlineIntent === "quick" ? " is-selected" : ""}`}
                onClick={() => setOnlineIntent("quick")}
                data-testid="hub-online-quick"
              >
                <Target aria-hidden="true" />
                <span>
                  <strong>QUICK MATCH</strong>
                  <small>Find the fullest open room</small>
                </span>
                {onlineIntent === "quick" ? <Check aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={onlineIntent === "create"}
                className={`hub-option${onlineIntent === "create" ? " is-selected" : ""}`}
                onClick={() => setOnlineIntent("create")}
                data-testid="hub-online-create"
              >
                <Radio aria-hidden="true" />
                <span>
                  <strong>CREATE ROOM</strong>
                  <small>Invite up to eight players</small>
                </span>
                {onlineIntent === "create" ? <Check aria-hidden="true" /> : null}
              </button>
            </div>
            <div className="hub-brief">
              <span className="mono-label">SECTOR 07 // FIELD BRIEF</span>
              <p>
                Vertical lanes, three supply tiers and the center bridge. Caches
                spawn on platform tops. Eliminations drop the equipped weapon of
                the victim, one medkit and one grenade.
              </p>
              <div className="hub-brief__tags">
                <span>90 SEC</span>
                <span>FIRST TO 10</span>
                <span>7 WEAPONS</span>
              </div>
            </div>
            <div className="hub-mode__facts">
              <span>
                <Users aria-hidden="true" /> 8 SEATS
              </span>
              <span>
                <Crosshair aria-hidden="true" /> FIRST TO 10
              </span>
              <span>
                <Medal aria-hidden="true" /> RANKED XP
              </span>
            </div>
          </div>
        ) : (
          <div className="hub-mode__body">
            <span className="mono-label">BOT DIFFICULTY // AI BEHAVIOR</span>
            <div className="hub-difficulty" role="radiogroup" aria-label="Bot difficulty">
              {DIFFICULTIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === entry.id}
                  className={difficulty === entry.id ? "is-active" : ""}
                  onClick={() => setDifficulty(entry.id)}
                  title={entry.detail}
                  data-testid={`hub-difficulty-${entry.id}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="hub-mode__note">
              Local Sector 07 arena. Bots react, aim, burst and move differently
              per level.{" "}
              <strong>Practice never earns ranked XP or wins.</strong> Online
              guest progression is unchanged.
            </p>
          </div>
        )}

        <button
          type="button"
          className="hub-play"
          onClick={play}
          data-testid="hub-play"
        >
          <span>
            {mode === "online"
              ? onlineIntent === "quick"
                ? "PLAY ONLINE"
                : "CREATE ROOM"
              : "START PRACTICE"}
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
        <div className="hub-mode__foot">
          <span className="mono-label">
            {mode === "online"
              ? `${identity.graceSeconds}S RELOAD RECOVERY // SERVER AUTHORITATIVE`
              : `DIFFICULTY ${difficulty.toUpperCase()} // NO LEADERBOARD IMPACT`}
          </span>
        </div>
      </aside>

      <section className="hub-loadout" aria-label="Starter loadout preview">
        <button
          type="button"
          className="hub-loadout__head"
          onClick={() => setOverlay("loadout")}
          data-testid="hub-loadout-open"
        >
          <span className="mono-label">STARTER LOADOUT</span>
          <span className="hub-pill">PREVIEW</span>
        </button>
        <div className="hub-loadout__shelf">
          {PLAYER_WEAPONS.map((weapon, index) => (
            <div className="hub-loadout-card" key={weapon.id}>
              <span className="hub-key">{index + 1}</span>
              <LoadoutIcon name={weapon.id} className="hub-loadout-icon" />
              <div>
                <strong>{weapon.shortName ?? weapon.name}</strong>
                <span className="mono-label">{weapon.magazineSize} RDS</span>
              </div>
            </div>
          ))}
          <div className="hub-loadout-card is-empty">
            <span className="hub-key">3</span>
            <div>
              <strong>OPEN SLOT</strong>
              <span className="mono-label">IN-ARENA LOOT</span>
            </div>
          </div>
          <div className="hub-loadout-divider" aria-hidden="true" />
          {GRENADE_SLOT_TYPES.map((type) => (
            <div className="hub-loadout-card hub-loadout-card--grenade" key={type}>
              <LoadoutIcon name={type} className="hub-loadout-icon hub-loadout-icon--square" />
              <div>
                <strong>{GRENADE_CONFIG[type].name.replace(" GRENADE", "")}</strong>
                <span className="mono-label">1</span>
              </div>
            </div>
          ))}
          <div className="hub-loadout-card hub-loadout-card--medkit">
            <LoadoutIcon name="medkit" className="hub-loadout-icon hub-loadout-icon--square" />
            <div>
              <strong>MEDKIT</strong>
              <span className="mono-label">LOOT ONLY</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="hub-loadout__more"
          onClick={() => setOverlay("loadout")}
        >
          DETAILS
          <ArrowRight aria-hidden="true" />
        </button>
      </section>

      <footer className="hub-footer">
        <div className="hub-footer__status">
          <span className="hub-signal" aria-hidden="true" />
          <span className="mono-label">
            {identity.serverOnline
              ? `NEON PROFILE LINKED // ${identity.graceSeconds}S RECONNECT GRACE`
              : "OFFLINE // PRACTICE REMAINS AVAILABLE"}
          </span>
        </div>
        <HubFooterMark />
        <div className="hub-footer__links">
          <button type="button" onClick={() => setOverlay("rankings")}>
            <Trophy aria-hidden="true" /> RANKINGS
          </button>
          <button type="button" onClick={() => setOverlay("settings")}>
            <Settings aria-hidden="true" /> SETTINGS
          </button>
          <span className="mono-label">PUBLIC BETA // BUILD 0.2</span>
        </div>
      </footer>

      {overlay === "character" ? (
        <CharacterDrawer
          skinId={identity.skinId}
          onChoose={identity.chooseSkin}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "profile" ? (
        <ProfileDrawer
          profile={identity.profile}
          name={identity.name}
          skinId={identity.skinId}
          saving={identity.saving}
          serverError={identity.saveError}
          onSave={identity.saveIdentity}
          onClose={closeOverlay}
        />
      ) : null}
      {overlay === "rankings" ? <RankingsDrawer onClose={closeOverlay} /> : null}
      {overlay === "settings" ? <SettingsDrawer onClose={closeOverlay} /> : null}
      {overlay === "loadout" ? (
        <LoadoutDrawer
          selectedSkinId={identity.skinId}
          onCharacter={() => setOverlay("character")}
          onClose={closeOverlay}
        />
      ) : null}

      {identity.showOnboarding ? (
        <OnboardingDialog
          initialName={identity.name}
          skinId={identity.skinId}
          saving={identity.saving}
          error={identity.saveError}
          onSave={identity.saveIdentity}
          onSkip={identity.completeOnboarding}
        />
      ) : null}

      <span className="sr-only" aria-live="polite">
        {identity.serverOnline
          ? "Online profile service linked."
          : "Offline mode. Practice is available."}
        {" "}Selected Viber {activeSkin.displayName}. Level {level}.{" "}
        {identity.profile?.matchesPlayed ?? 0} online matches.
      </span>
    </main>
  );
}
