"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeDifficulty } from "@/game/config/gameplay";
import { GameBridge } from "@/game/bridge";
import { GameCanvas } from "@/components/game/GameCanvas";
import { GameHud } from "@/components/game/GameHud";
import { AudioSettings } from "@/components/game/AudioSettings";
import { TouchControls } from "@/components/game/TouchControls";
import { TouchSettingsPanel } from "@/components/game/TouchSettingsPanel";
import { BetaFeedback } from "@/components/online/BetaFeedback";

const DIFFICULTY_LABEL: Record<PracticeDifficulty, string> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
  merciless: "MERCILESS",
};

export function GameShell({
  difficulty = "normal",
  skinId = "viber-010",
}: {
  difficulty?: PracticeDifficulty;
  skinId?: string;
}) {
  const activeBridge = useMemo(() => new GameBridge(), []);
  const [touchMode, setTouchMode] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const frameRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const coarse =
        window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0 ||
        new URLSearchParams(window.location.search).has("touch");
      setTouchMode(coarse);
    }, 0);
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
      window.clearTimeout(timer);
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
        await frameRef.current?.requestFullscreen?.();
      }
    } catch {
      // Fullscreen can be blocked or unsupported.
    }
  };

  return (
    <main className="militia-page practice-page">
      <div className="militia-page__grid" aria-hidden="true" />
      <div className="militia-page__glow" aria-hidden="true" />
      <section
        ref={frameRef}
        className={`game-frame${touchMode ? " is-touch" : ""}${portrait && touchMode ? " is-portrait" : ""}${isFullscreen ? " is-fullscreen" : ""}`}
        aria-label={`Vibe Militia practice arena on ${DIFFICULTY_LABEL[difficulty]} difficulty`}
      >
        <GameCanvas
          bridge={activeBridge}
          difficulty={difficulty}
          skinId={skinId}
        />
        <GameHud bridge={activeBridge} playerSkinId={skinId} />
        {touchMode ? (
          <TouchControls
            bridge={activeBridge}
            onSettings={() => setSettingsOpen(true)}
            playerName="SOLO DRILL"
            level={1}
            variant="practice"
            onExit={() => undefined}
            modeLabel={`PRACTICE // ${DIFFICULTY_LABEL[difficulty]} // NO RANKED XP`}
          />
        ) : null}
        <div className="practice-back">
          <Link href="/" className="practice-back__link">
            HUB
          </Link>
          <button
            type="button"
            className="practice-back__link"
            onClick={() => setSettingsOpen(true)}
          >
            SETTINGS
          </button>
        </div>
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
                Turn your phone sideways to return to the drill.
              </p>
              <Link href="/" className="hub-button">
                RETURN TO HUB
              </Link>
            </div>
          </div>
        ) : null}
        {settingsOpen ? (
          <div
            className="settings-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Practice settings"
            data-testid="settings-overlay"
          >
            <div className="settings-card">
              <div className="settings-card__head">
                <span className="mono-label">
                  PRACTICE SETTINGS // {DIFFICULTY_LABEL[difficulty]}
                </span>
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
              {touchMode ? <TouchSettingsPanel /> : null}
              <div className="settings-card__controls">
                <span className="mono-label">CONTROLS</span>
                <p>
                  Desktop: WASD move, Space jump and jetpack, mouse aim and
                  fire, R reload, 1 to 3 weapons. Touch: left pad moves and
                  pushes up to fly, right pad aims and fires.
                </p>
                <p>
                  Practice bots react faster and shoot tighter bursts on Hard
                  and Merciless. Practice never writes ranked XP, wins or
                  leaderboard entries.
                </p>
              </div>
              {touchMode ? <BetaFeedback /> : null}
              <div className="settings-card__actions">
                <button
                  type="button"
                  className="online-secondary online-secondary--small"
                  onClick={() => {
                    setSettingsOpen(false);
                    void toggleFullscreen();
                  }}
                  data-testid="toggle-fullscreen"
                >
                  {isFullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN"}
                </button>
                <Link
                  href="/"
                  className="online-secondary online-secondary--small"
                >
                  RETURN TO HUB
                </Link>
                <button
                  type="button"
                  className="online-primary online-primary--small"
                  onClick={() => {
                    setSettingsOpen(false);
                    activeBridge.send({ type: "restart-match" });
                  }}
                >
                  RESTART DRILL
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
