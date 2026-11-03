"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  INITIAL_HUD,
  type GameBridge,
  type HudSnapshot,
} from "@/game/bridge";
import { isCriticalFuel, isLowHealth } from "@/game/core/combat";

interface GameHudProps {
  bridge: GameBridge;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}

function HealthBar({ snapshot }: { snapshot: HudSnapshot }) {
  const low = isLowHealth(snapshot.health, snapshot.maxHealth);
  const width = Math.max(0, Math.min(1, snapshot.health / snapshot.maxHealth)) * 100;
  return (
    <div className="bar-track" data-testid="hud-health">
      <div
        className={`bar-fill bar-fill--health${low ? " bar-fill--danger" : ""}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function FuelBar({ snapshot }: { snapshot: HudSnapshot }) {
  const low = isCriticalFuel(snapshot.fuel, snapshot.maxFuel);
  const width = Math.max(0, Math.min(1, snapshot.fuel / snapshot.maxFuel)) * 100;
  return (
    <div className="bar-track" data-testid="hud-fuel">
      <div
        className={`bar-fill bar-fill--fuel${low ? " bar-fill--fuel-low" : ""}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function GameHud({ bridge }: GameHudProps) {
  const snapshot = useSyncExternalStore(
    (listener) => bridge.subscribe(listener),
    () => bridge.getSnapshot(),
    () => INITIAL_HUD,
  );
  const [damageFlash, setDamageFlash] = useState(0);
  const [booted, setBooted] = useState(false);
  const previousHealth = useRef(snapshot.health);
  const low = isLowHealth(snapshot.health, snapshot.maxHealth);
  const dead = snapshot.isDead;
  const bootVisible = !snapshot.ready || !booted;

  useEffect(() => {
    if (snapshot.health < previousHealth.current) {
      setDamageFlash(1);
      const timer = window.setTimeout(() => setDamageFlash(0), 280);
      previousHealth.current = snapshot.health;
      return () => window.clearTimeout(timer);
    }
    previousHealth.current = snapshot.health;
    return undefined;
  }, [snapshot.health]);

  useEffect(() => {
    if (!snapshot.ready) return undefined;
    const timer = window.setTimeout(() => setBooted(true), 700);
    return () => window.clearTimeout(timer);
  }, [snapshot.ready]);

  useEffect(() => {
    if (!dead) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Enter") {
        bridge.send({ type: "respawn" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bridge, dead]);

  const healthPercent = Math.round((snapshot.health / snapshot.maxHealth) * 100);
  const fuelPercent = Math.round((snapshot.fuel / snapshot.maxFuel) * 100);
  const ammoTicks = Array.from({ length: snapshot.magazineSize }, (_, index) => index < snapshot.ammo);

  return (
    <>
      <div className="hud-root" aria-hidden={!snapshot.ready}>
        <div
          className="hud-damage"
          style={{ opacity: damageFlash * 0.9 }}
          aria-hidden="true"
        />

        <section className="hud-panel hud-identity">
          <div className="hud-avatar">
            <Image
              src="/sprites/viber-010/viber-010-avatar.png"
              alt="VIBER-010 character portrait"
              width={60}
              height={79}
              priority
            />
            <span className="hud-avatar__level">01</span>
          </div>
          <div className="hud-identity__copy">
            <span className="hud-brand">VIBE MILITIA</span>
            <h1 className="display hud-identity__name">VIBER-010</h1>
            <div className="hud-identity__meta">
              <span className="hud-pill hud-pill--live">
                <i className="live-dot" />
                LIVE
              </span>
              <span className="mono-label">LOCAL OPERATOR</span>
            </div>
          </div>
        </section>

        <div className="hud-mode" role="status">
          <span className="hud-mode__dot" />
          <span className="hud-mode__strong">SKIRMISH</span>
          <span className="hud-mode__rule" />
          <span className="hud-mode__muted">TRAINING GROUND</span>
          <span className="hud-pill">SECTOR 07</span>
        </div>

        <section className="hud-panel hud-score">
          <div className="hud-score__block">
            <span className="mono-label">DRONES DOWN</span>
            <div className="hud-score__value">
              <strong className="display">{String(snapshot.dronesDown).padStart(2, "0")}</strong>
              <span className="mono-label hud-score__hostiles">
                HOSTILES {String(snapshot.dronesAlive).padStart(2, "0")}
              </span>
            </div>
          </div>
          <div className="hud-score__side">
            <span className="mono-label">UPTIME</span>
            <span className="hud-score__time">{formatTime(snapshot.uptimeMs)}</span>
            <button
              type="button"
              className={`hud-button${snapshot.debug ? " is-active" : ""}`}
              onClick={() => bridge.send({ type: "toggle-debug" })}
              aria-pressed={snapshot.debug}
              data-testid="debug-toggle"
            >
              <Keycap>F1</Keycap>
              <span>{snapshot.debug ? "DEBUG ON" : "DEBUG"}</span>
            </button>
          </div>
        </section>

        <section className={`hud-panel hud-vitals${low ? " is-danger" : ""}`}>
          <div className="hud-section-head">
            <span className="mono-label">OPERATOR VITALS</span>
            <span className={`hud-signal${low ? " is-danger" : ""}`}>
              {dead ? "OFFLINE" : low ? "CRITICAL" : "STABLE"}
            </span>
          </div>

          <div className="hud-vital-row">
            <div className="hud-vital-label">
              <span className="hud-vital-name">HEALTH</span>
              <span className="hud-vital-value">
                {Math.round(snapshot.health)}
                <small>/{snapshot.maxHealth}</small>
              </span>
            </div>
            <HealthBar snapshot={snapshot} />
            <div className="hud-vital-foot">
              <span className="mono-label">{healthPercent}%</span>
              <span className="mono-label">AUTO-REGEN 4.0S</span>
            </div>
          </div>

          <div className="hud-vital-row">
            <div className="hud-vital-label">
              <span className="hud-vital-name">JETPACK</span>
              <span className="hud-vital-value">
                {Math.round(snapshot.fuel)}
                <small>%</small>
              </span>
            </div>
            <FuelBar snapshot={snapshot} />
            <div className="hud-vital-foot">
              <span className="mono-label">{fuelPercent}% FUEL</span>
              <span className="mono-label">SPACE TO THRUST</span>
            </div>
          </div>
        </section>

        <section className="hud-panel hud-weapon">
          <div className="hud-section-head">
            <span className="mono-label">EQUIPPED</span>
            <span className="hud-pill hud-pill--soft">AUTO</span>
          </div>
          <div className="hud-weapon__main">
            <div>
              <h2 className="display hud-weapon__name">VIBE RIFLE</h2>
              <span className="mono-label hud-weapon__class">KINETIC / MID RANGE</span>
            </div>
            <div className="hud-ammo" data-testid="hud-ammo">
              <strong className="display">{String(snapshot.ammo).padStart(2, "0")}</strong>
              <span className="mono-label">/ {snapshot.magazineSize}</span>
            </div>
          </div>
          <div className="hud-mag" aria-hidden="true">
            {ammoTicks.map((active, index) => (
              <span key={index} className={active ? "is-loaded" : ""} />
            ))}
          </div>
          <div className="hud-reload">
            <div className="hud-reload__line">
              <span className="mono-label">
                {snapshot.reloading
                  ? `RELOADING ${Math.round(snapshot.reloadProgress * 100)}%`
                  : "READY TO FIRE"}
              </span>
              <span className="hud-reload__keys">
                <Keycap>LMB</Keycap>
                <span className="mono-label">FIRE</span>
                <Keycap>R</Keycap>
                <span className="mono-label">RELOAD</span>
              </span>
            </div>
            <div className="reload-track">
              <span
                style={{
                  width: snapshot.reloading ? `${snapshot.reloadProgress * 100}%` : "100%",
                }}
              />
            </div>
          </div>
        </section>

        <section className="hud-controls" aria-label="Controls">
          <span className="hud-control"><Keycap>A</Keycap><Keycap>D</Keycap><span className="mono-label">MOVE</span></span>
          <span className="hud-control"><Keycap>SPACE</Keycap><span className="mono-label">JUMP / JET</span></span>
          <span className="hud-control"><Keycap>MOUSE</Keycap><span className="mono-label">AIM</span></span>
          <span className="hud-control"><Keycap>LMB</Keycap><span className="mono-label">FIRE</span></span>
          <span className="hud-control"><Keycap>R</Keycap><span className="mono-label">RELOAD</span></span>
          <span className="hud-control"><Keycap>F1</Keycap><span className="mono-label">PHYSICS</span></span>
        </section>
      </div>

      <div className={`death-overlay${dead && snapshot.ready ? " is-visible" : ""}`}>
        <div className="death-card" role="alertdialog" aria-modal="true" aria-labelledby="death-title">
          <span className="death-eyebrow">TRAINING PROTOCOL // INTERRUPTED</span>
          <h2 id="death-title" className="display">SIGNAL LOST</h2>
          <p className="death-copy">
            VIBER-010 went offline. Automated redeploy is already queued, or you
            can restart now.
          </p>
          <div className="death-count">
            <span className="mono-label">REDEPLOY IN</span>
            <strong className="display">{snapshot.respawnIn.toFixed(1)}</strong>
            <span className="mono-label">SEC</span>
          </div>
          <button
            type="button"
            className="death-cta"
            onClick={() => bridge.send({ type: "respawn" })}
            data-testid="respawn-button"
          >
            REDEPLOY NOW
            <Keycap>ENTER</Keycap>
          </button>
          <div className="death-foot">
            <span className="mono-label">LOADOUT PERSISTS</span>
            <span className="mono-label">DRONE SCORE PERSISTS</span>
          </div>
        </div>
      </div>

      <div
        className={`boot-overlay${bootVisible ? "" : " is-hidden"}`}
        aria-hidden={!bootVisible}
      >
        <div className="boot-grid" aria-hidden="true" />
        <div className="boot-inner">
          <div className="boot-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="hud-brand">VIBE MILITIA</span>
          <h2 className="display boot-title">
            TRAINING
            <br />
            GROUND
          </h2>
          <p className="boot-copy">
            Local combat simulation. No accounts, no network, no excuses.
          </p>
          <div className="boot-load" aria-hidden="true">
            <span />
          </div>
          <div className="boot-controls">
            <span className="hud-control"><Keycap>A</Keycap><Keycap>D</Keycap><span className="mono-label">MOVE</span></span>
            <span className="hud-control"><Keycap>SPACE</Keycap><span className="mono-label">JUMP / JETPACK</span></span>
            <span className="hud-control"><Keycap>LMB</Keycap><span className="mono-label">FIRE</span></span>
            <span className="hud-control"><Keycap>R</Keycap><span className="mono-label">RELOAD</span></span>
          </div>
          <span className="boot-status mono-label">
            {snapshot.ready ? "SIMULATION READY // DEPLOYING" : "BOOTING SIMULATION"}
          </span>
        </div>
        <span className="boot-legal mono-label">
          P0 BUILD . ORIGINAL VIBE VIBERS ARTWORK . SIDE-VIEW PROTOTYPE
        </span>
      </div>
    </>
  );
}
