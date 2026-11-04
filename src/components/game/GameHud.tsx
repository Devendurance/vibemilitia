"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getCharacterSkin, HUMAN_DEFAULT_SKIN_ID } from "@/game/characters/roster";
import type { GameBridge, HudSnapshot } from "@/game/bridge";
import { isCriticalFuel, isLowHealth } from "@/game/core/combat";
import { formatMatchClock } from "@/game/core/match";
import { MEDKIT_CONFIG } from "@/game/core/pickups";

interface GameHudProps {
  bridge: GameBridge;
  mode?: "local" | "online";
  playerName?: string;
  playerSkinId?: string;
}

function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}

function ContactGrenadeIcon() {
  return (
    <svg
      className="hud-grenade-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="1.5" width="6" height="4" rx="1" fill="#C7692F" />
      <circle cx="12" cy="14" r="9" fill="#0C0D0F" />
      <circle cx="12" cy="14" r="7.5" fill="#E5484D" />
      <circle cx="9.5" cy="11" r="2.4" fill="#FF8A3D" />
      <circle cx="9" cy="10.5" r="1.1" fill="#FFD166" />
      <rect x="10.5" y="22" width="3" height="1.5" fill="#0C0D0F" opacity="0.5" />
    </svg>
  );
}

function FragGrenadeIcon() {
  return (
    <svg
      className="hud-grenade-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="1" width="6" height="4" rx="1" fill="#C7692F" />
      <rect x="5" y="4.5" width="14" height="18" rx="5" fill="#0C0D0F" />
      <rect x="6.5" y="6" width="11" height="15" rx="4" fill="#566B32" />
      <rect x="6.5" y="10.5" width="11" height="2.5" fill="#2F3A1D" />
      <rect x="6.5" y="15" width="11" height="2" fill="#2F3A1D" />
      <circle cx="9" cy="8" r="1.2" fill="#F4E21C" />
    </svg>
  );
}

function StinkingGrenadeIcon() {
  return (
    <svg
      className="hud-grenade-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="1" width="6" height="4" rx="1" fill="#C7692F" />
      <rect x="5" y="4.5" width="14" height="18" rx="6" fill="#0C0D0F" />
      <rect x="6.5" y="6" width="11" height="15" rx="5" fill="#6FBE2E" />
      <rect x="7.5" y="7.5" width="9" height="5" rx="2.5" fill="#D7FF2E" />
      <rect x="6.5" y="14" width="11" height="2" fill="#2F4A16" />
      <rect x="6.5" y="18" width="11" height="1.6" fill="#2F4A16" />
      <circle cx="16" cy="12" r="1.3" fill="#F5F3EC" opacity="0.9" />
      <circle cx="9" cy="16.5" r="1" fill="#F5F3EC" opacity="0.7" />
    </svg>
  );
}

function placementLabel(placement: number): string {
  if (placement === 1) return "1ST";
  if (placement === 2) return "2ND";
  if (placement === 3) return "3RD";
  return `${placement}TH`;
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

export function GameHud({
  bridge,
  mode = "local",
  playerName,
  playerSkinId,
}: GameHudProps) {
  const playerSkin = getCharacterSkin(
    mode === "online" ? playerSkinId : HUMAN_DEFAULT_SKIN_ID,
  );
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() =>
    bridge.getSnapshot(),
  );
  const [damageFlash, setDamageFlash] = useState(0);
  const [booted, setBooted] = useState(false);
  const [medkitToast, setMedkitToast] = useState(0);
  const [supplyToast, setSupplyToast] = useState("");
  const previousHealth = useRef(snapshot.health);
  const lastMedkitSeq = useRef(snapshot.medkitFeedbackSeq);
  const lastSupplySeq = useRef(snapshot.supplyFeedbackSeq);
  const low = isLowHealth(snapshot.health, snapshot.maxHealth);
  const matchEnded = snapshot.matchPhase === "ended";
  const matchStarting = snapshot.matchPhase === "countdown";
  const dead = snapshot.isDead && !matchEnded && !matchStarting;
  const bootVisible = !snapshot.ready || !booted;
  const timeCritical = !matchStarting && snapshot.matchTimeRemainingMs <= 15_000;
  const timeWarning = !matchStarting && snapshot.matchTimeRemainingMs <= 30_000;
  const visibleFeed = snapshot.feed
    .filter((entry) => snapshot.uptimeMs - entry.atMs < 5000)
    .slice(-3);
  useEffect(() => bridge.subscribe(setSnapshot), [bridge]);

  const recentKill =
    snapshot.lastPlayerKill &&
    snapshot.uptimeMs - snapshot.lastPlayerKill.atMs < 2400 &&
    !matchEnded
      ? snapshot.lastPlayerKill
      : null;
  const accuracy = Math.round(snapshot.playerAccuracy * 100);
  const victory = snapshot.playerPlacement === 1;
  const selectedGrenadeCount =
    snapshot.grenadeSelected === "contact"
      ? snapshot.grenadeContact
      : snapshot.grenadeSelected === "frag"
        ? snapshot.grenadeFrag
        : snapshot.grenadeStinking;
  const grenadeCooldownSeconds = snapshot.grenadeCooldownRemainingMs / 1000;
  const grenadeReady =
    !dead &&
    !matchEnded &&
    !matchStarting &&
    selectedGrenadeCount > 0 &&
    snapshot.grenadeCooldownRemainingMs <= 0;
  const grenadeStatus =
    grenadeCooldownSeconds > 0
      ? `COOLDOWN ${grenadeCooldownSeconds.toFixed(1)}S`
      : selectedGrenadeCount > 0
        ? "READY"
        : "EMPTY";

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
    if (snapshot.medkitFeedbackSeq <= lastMedkitSeq.current) {
      lastMedkitSeq.current = snapshot.medkitFeedbackSeq;
      return undefined;
    }
    lastMedkitSeq.current = snapshot.medkitFeedbackSeq;
    setMedkitToast(snapshot.medkitFeedbackAmount);
    const timer = window.setTimeout(() => setMedkitToast(0), 1600);
    return () => window.clearTimeout(timer);
  }, [snapshot.medkitFeedbackSeq, snapshot.medkitFeedbackAmount]);

  useEffect(() => {
    if (snapshot.supplyFeedbackSeq <= lastSupplySeq.current) {
      lastSupplySeq.current = snapshot.supplyFeedbackSeq;
      return undefined;
    }
    lastSupplySeq.current = snapshot.supplyFeedbackSeq;
    setSupplyToast(snapshot.supplyFeedbackText);
    const timer = window.setTimeout(() => setSupplyToast(""), 1600);
    return () => window.clearTimeout(timer);
  }, [snapshot.supplyFeedbackSeq, snapshot.supplyFeedbackText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Enter" && matchEnded) {
        bridge.send({ type: "restart-match" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bridge, matchEnded]);

  const ammoTicks = Array.from(
    { length: snapshot.magazineSize },
    (_, index) => index < snapshot.ammo,
  );

  return (
    <>
      <div
        className="hud-root"
        aria-hidden={!snapshot.ready}
        data-hud-uptime={Math.round(snapshot.uptimeMs)}
        data-hud-health={snapshot.health}
        data-hud-standings={snapshot.standings.length}
        data-hud-phase={snapshot.matchPhase}
        data-hud-countdown={Math.round(snapshot.matchCountdownMs)}
      >
        <div
          className="hud-damage"
          style={{ opacity: damageFlash * 0.9 }}
          aria-hidden="true"
        />

        <section className="hud-panel hud-identity">
          <div className="hud-avatar">
            <Image
              src={playerSkin.avatarPath}
              alt={`${playerSkin.displayName} character portrait`}
              width={60}
              height={79}
              priority
            />
            <span className="hud-avatar__level">01</span>
          </div>
          <div className="hud-identity__copy">
            <span className="hud-brand">VIBE MILITIA</span>
            <h1 className="display hud-identity__name">
              {playerSkin.displayName}
            </h1>
            <div className="hud-identity__meta">
              <span className="hud-pill hud-pill--live">
                <i className="live-dot" />
                {matchEnded ? "FINAL" : matchStarting ? "STARTING" : "LIVE"}
              </span>
              <span className="mono-label">
                {mode === "online"
                  ? `${(playerName ?? "GUEST").toUpperCase()} // ONLINE`
                  : "FFA OPERATOR"}
              </span>
            </div>
          </div>
        </section>

        <div
          className={`hud-matchbar${!matchEnded && timeCritical ? " is-critical" : !matchEnded && timeWarning ? " is-warning" : ""}`}
          data-testid="match-clock"
          role="status"
        >
          <div className="hud-matchbar__mode">
            <span className="hud-mode__dot" />
            <span className="hud-matchbar__strong">FREE FOR ALL</span>
            <span className="hud-matchbar__muted">SECTOR 07</span>
          </div>
          <div className="hud-matchbar__clock" data-testid="match-clock-value">
            <span className="mono-label">
              {matchStarting ? "START IN" : "TIME"}
            </span>
            <strong className="display">
              {formatMatchClock(
                matchStarting
                  ? snapshot.matchCountdownMs
                  : snapshot.matchTimeRemainingMs,
              )}
            </strong>
          </div>
          <div className="hud-matchbar__limit">
            <span className="mono-label">FIRST TO {snapshot.matchScoreLimit}</span>
            <span className={`hud-pill${timeCritical ? " hud-pill--danger" : ""}`}>
              {matchEnded
                ? "MATCH OVER"
                : matchStarting
                  ? "MATCH STARTING"
                  : timeCritical
                    ? `FINAL ${Math.ceil(snapshot.matchTimeRemainingMs / 1000)}`
                    : `${placementLabel(snapshot.playerPlacement)} OF ${snapshot.standings.length || 4}`}
            </span>
          </div>
        </div>

        <div className="hud-feed" aria-live="polite">
          {visibleFeed.map((entry) => (
            <div className="hud-feed__row" key={entry.id}>
              <span className="hud-feed__mark" />
              <span>{entry.text}</span>
            </div>
          ))}
        </div>

        <section
          className="hud-panel hud-leaderboard"
          data-testid="leaderboard"
          aria-label="Match leaderboard"
        >
          <div className="hud-board__head">
            <span className="mono-label">LEADERBOARD</span>
            <span className="mono-label">ELIMS</span>
          </div>
          {snapshot.standings.map((entry) => (
            <div
              key={entry.id}
              className={`hud-board__row${entry.isPlayer ? " is-player" : ""}${entry.alive ? "" : " is-out"}`}
              data-testid={`standing-${entry.id}`}
            >
              <span className="hud-board__rank">
                {String(entry.placement).padStart(2, "0")}
              </span>
              <span className="hud-board__name">
                {entry.name}
                {entry.isPlayer ? <em>YOU</em> : null}
              </span>
              <span className="hud-board__state">
                {entry.alive
                  ? "LIVE"
                  : entry.respawnIn > 0
                    ? `${entry.respawnIn.toFixed(1)}S`
                    : "OUT"}
              </span>
              <strong className="hud-board__score">
                {String(entry.score).padStart(2, "0")}
              </strong>
            </div>
          ))}
          <div className="hud-board__foot">
            <span className="mono-label">
              {matchEnded
                ? "MATCH COMPLETE"
                : `FIRST TO ${snapshot.matchScoreLimit} OR TIME`}
            </span>
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
              {matchEnded ? "ROUND OVER" : dead ? "OFFLINE" : low ? "CRITICAL" : "STABLE"}
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
              <span className="mono-label">
                {Math.round((snapshot.health / snapshot.maxHealth) * 100)}%
              </span>
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
              <span className="mono-label">
                {Math.round((snapshot.fuel / snapshot.maxFuel) * 100)}% FUEL
              </span>
              <span className="mono-label">SPACE TO THRUST</span>
            </div>
          </div>

          {mode === "online" ? (
            <div
              className="hud-vital-row hud-medkit"
              data-testid="hud-medkits"
              data-medkits={snapshot.medkits}
            >
              <div className="hud-vital-label">
                <span className="hud-vital-name">MEDKITS</span>
                <span className="hud-vital-value">
                  {snapshot.medkits}
                  <small>/{snapshot.maxMedkits}</small>
                </span>
              </div>
              <div className="hud-medkit-row">
                <div className="hud-medkit-pips" aria-hidden="true">
                  {Array.from(
                    { length: snapshot.maxMedkits },
                    (_, index) => (
                      <span
                        key={index}
                        className={`hud-medkit-pip${index < snapshot.medkits ? " is-filled" : ""}`}
                      />
                    ),
                  )}
                </div>
                <button
                  type="button"
                  className="hud-medkit-use"
                  onClick={() => bridge.send({ type: "use-medkit" })}
                  disabled={
                    dead || matchEnded || snapshot.medkits <= 0 || snapshot.health >= snapshot.maxHealth
                  }
                  data-testid="medkit-use"
                  aria-label="Use medkit"
                >
                  <Keycap>H</Keycap>
                  <span className="mono-label">USE</span>
                </button>
              </div>
              <div className="hud-vital-foot">
                <span className="mono-label">+{MEDKIT_CONFIG.healAmount} HP</span>
                <span className="mono-label">CARRY {snapshot.maxMedkits}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="hud-panel hud-weapon">
          <div className="hud-section-head">
            <span className="mono-label">EQUIPPED</span>
            <span className="hud-pill hud-pill--soft">SLOT {snapshot.weaponSlot}</span>
          </div>
          <div className="hud-weapon__main">
            <div>
              <h2 className="display hud-weapon__name" data-testid="weapon-name">
                {snapshot.weaponName}
              </h2>
              <span className="mono-label hud-weapon__class">{snapshot.weaponRole}</span>
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
          <div className="hud-weapon-slots" role="group" aria-label="Weapon selection">
            {snapshot.weaponSlots.map((slot) => {
              const empty = !slot.owned;
              return (
                <button
                  key={slot.slot}
                  type="button"
                  className={`hud-weapon-slot${slot.active ? " is-active" : ""}${empty ? " is-empty" : ""}`}
                  onClick={() =>
                    bridge.send({ type: "equip-weapon", slot: slot.slot - 1 })
                  }
                  aria-pressed={slot.active}
                  aria-label={
                    empty
                      ? `Weapon slot ${slot.slot}, empty`
                      : `Weapon slot ${slot.slot}, ${slot.name}, ${slot.ammo} of ${slot.magazineSize} rounds`
                  }
                  disabled={dead || matchEnded || empty}
                  data-testid={`weapon-slot-${slot.slot}`}
                  data-owned={slot.owned}
                >
                  <Keycap>{slot.slot}</Keycap>
                  <span className="hud-weapon-slot__name">
                    {empty ? "EMPTY" : slot.shortName}
                  </span>
                  <span className="hud-weapon-slot__ammo">
                    {empty
                      ? "--"
                      : slot.reloading
                        ? "RELOAD"
                        : `${slot.ammo}/${slot.magazineSize}`}
                  </span>
                </button>
              );
            })}
          </div>

          {snapshot.nearbyLootText ? (
            <div
              className={`hud-loot-prompt${snapshot.nearbyLootCanSwap ? " is-ready" : ""}`}
              data-testid="loot-prompt"
              data-can-swap={snapshot.nearbyLootCanSwap}
            >
              <Keycap>E</Keycap>
              <span className="mono-label">{snapshot.nearbyLootText}</span>
              {snapshot.nearbyLootCanSwap ? (
                <button
                  type="button"
                  className="hud-loot-prompt__button"
                  onClick={() => bridge.send({ type: "swap-weapon" })}
                  disabled={dead || matchEnded}
                  data-testid="loot-swap"
                >
                  SWAP
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === "online" ? (
            <div
              className="hud-throwables"
              data-testid="hud-grenades"
              data-selected={snapshot.grenadeSelected}
              data-contact={snapshot.grenadeContact}
              data-frag={snapshot.grenadeFrag}
              data-stinking={snapshot.grenadeStinking}
            >
              <div className="hud-throwables__head">
                <span className="mono-label">THROWABLES</span>
                <span
                  className={`hud-grenade-status${grenadeReady ? " is-ready" : ""}`}
                  data-testid="grenade-status"
                >
                  {grenadeStatus}
                </span>
              </div>

              <div className="hud-grenade-slots" role="group" aria-label="Grenade selection">
                <button
                  type="button"
                  className={`hud-grenade-slot${snapshot.grenadeSelected === "contact" ? " is-active" : ""}`}
                  onClick={() =>
                    bridge.send({ type: "select-grenade", slot: 0 })
                  }
                  aria-pressed={snapshot.grenadeSelected === "contact"}
                  disabled={dead || matchEnded}
                  data-testid="grenade-select-contact"
                >
                  <Keycap>4</Keycap>
                  <ContactGrenadeIcon />
                  <span className="hud-grenade-slot__copy">
                    <span className="hud-grenade-slot__name">CONTACT</span>
                    <span className="mono-label">IMPACT</span>
                  </span>
                  <strong data-testid="grenade-count-contact">
                    {snapshot.grenadeContact}
                  </strong>
                </button>

                <button
                  type="button"
                  className={`hud-grenade-slot${snapshot.grenadeSelected === "frag" ? " is-active" : ""}`}
                  onClick={() =>
                    bridge.send({ type: "select-grenade", slot: 1 })
                  }
                  aria-pressed={snapshot.grenadeSelected === "frag"}
                  disabled={dead || matchEnded}
                  data-testid="grenade-select-frag"
                >
                  <Keycap>5</Keycap>
                  <FragGrenadeIcon />
                  <span className="hud-grenade-slot__copy">
                    <span className="hud-grenade-slot__name">FRAG</span>
                    <span className="mono-label">5.0S FUSE</span>
                  </span>
                  <strong data-testid="grenade-count-frag">
                    {snapshot.grenadeFrag}
                  </strong>
                </button>

                <button
                  type="button"
                  className={`hud-grenade-slot${snapshot.grenadeSelected === "stinking" ? " is-active" : ""}`}
                  onClick={() =>
                    bridge.send({ type: "select-grenade", slot: 2 })
                  }
                  aria-pressed={snapshot.grenadeSelected === "stinking"}
                  disabled={dead || matchEnded}
                  data-testid="grenade-select-stinking"
                >
                  <Keycap>6</Keycap>
                  <StinkingGrenadeIcon />
                  <span className="hud-grenade-slot__copy">
                    <span className="hud-grenade-slot__name">STINK</span>
                    <span className="mono-label">TOXIC</span>
                  </span>
                  <strong data-testid="grenade-count-stinking">
                    {snapshot.grenadeStinking}
                  </strong>
                </button>
              </div>

              <button
                type="button"
                className={`hud-grenade-throw${grenadeReady ? " is-ready" : ""}`}
                onClick={() => bridge.send({ type: "throw-grenade" })}
                disabled={!grenadeReady}
                data-testid="grenade-throw"
                data-can-throw={grenadeReady}
              >
                <Keycap>G</Keycap>
                <span className="hud-grenade-throw__label">
                  THROW{" "}
                  {snapshot.grenadeSelected === "contact"
                    ? "CONTACT"
                    : snapshot.grenadeSelected === "frag"
                      ? "FRAG"
                      : "STINK"}
                </span>
                <span className="hud-grenade-throw__count">
                  {selectedGrenadeCount}/{snapshot.grenadeMax}
                </span>
              </button>
            </div>
          ) : null}
        </section>

        <section className="hud-controls" aria-label="Controls">
          <span className="hud-control"><Keycap>A</Keycap><Keycap>D</Keycap><span className="mono-label">MOVE</span></span>
          <span className="hud-control"><Keycap>SPACE</Keycap><span className="mono-label">JUMP / JET</span></span>
          <span className="hud-control"><Keycap>MOUSE</Keycap><span className="mono-label">AIM</span></span>
          <span className="hud-control"><Keycap>LMB</Keycap><span className="mono-label">FIRE</span></span>
          <span className="hud-control"><Keycap>1</Keycap><Keycap>2</Keycap><Keycap>3</Keycap><span className="mono-label">SWAP</span></span>
          <span className="hud-control"><Keycap>E</Keycap><span className="mono-label">LOOT SWAP</span></span>
          <span className="hud-control"><Keycap>H</Keycap><span className="mono-label">MEDKIT</span></span>
          <span className="hud-control"><Keycap>R</Keycap><span className="mono-label">RELOAD</span></span>
          <span className="hud-control"><Keycap>F1</Keycap><span className="mono-label">PHYSICS</span></span>
        </section>

        {recentKill ? (
          <div className="elim-toast" aria-live="polite">
            <span className="mono-label">ELIMINATION</span>
            <strong className="display">{recentKill.victimName}</strong>
            <span className="mono-label">{recentKill.weaponName}</span>
          </div>
        ) : null}

        {medkitToast > 0 ? (
          <div className="medkit-toast" aria-live="polite" data-testid="medkit-toast">
            <span className="mono-label">MEDKIT</span>
            <strong className="display">+{Math.round(medkitToast)} HP</strong>
            <span className="mono-label">FIELD REPAIR</span>
          </div>
        ) : null}

        {supplyToast ? (
          <div className="supply-toast" aria-live="polite" data-testid="supply-toast">
            <span className="mono-label">FIELD PICKUP</span>
            <strong className="display">{supplyToast}</strong>
            <span className="mono-label">
              {snapshot.supplyFeedbackDetail}
            </span>
          </div>
        ) : null}
      </div>

      <div className={`death-overlay${dead && snapshot.ready ? " is-visible" : ""}`}>
        <div className="death-card" role="alertdialog" aria-modal="true" aria-labelledby="death-title">
          <span className="death-eyebrow">MATCH LIVE // ELIMINATED</span>
          <h2 id="death-title" className="display">SIGNAL LOST</h2>
          <p className="death-copy">
            {snapshot.lastKillerName
              ? `${snapshot.lastKillerName} took VIBER-010 out. The match clock is still running.`
              : "VIBER-010 went offline. The match clock is still running."}
          </p>
          <div className="death-count">
            <span className="mono-label">AUTO-REDEPLOY IN</span>
            <strong className="display">{snapshot.respawnIn.toFixed(1)}</strong>
            <span className="mono-label">SEC</span>
          </div>
          <div className="death-foot">
            <span className="mono-label">SAFE PAD SELECTION</span>
            <span className="mono-label">MATCH CONTINUES</span>
          </div>
        </div>
      </div>

      <div
        className={`results-overlay${matchEnded && snapshot.ready ? " is-visible" : ""}`}
        data-testid="results-overlay"
      >
        <div
          className={`results-card${victory ? " is-victory" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="results-title"
        >
          <div className="results-head">
            <span className="results-eyebrow">
              {snapshot.matchEndReason === "time"
                ? "TIME EXPIRED"
                : "SCORE LIMIT REACHED"}
            </span>
            <span className="mono-label">SECTOR 07 // FREE FOR ALL</span>
          </div>
          <h2 id="results-title" className="display results-title">
            {victory ? "VICTORY" : "MATCH COMPLETE"}
          </h2>
          <p className="results-winner">
            {victory
              ? "You topped the board."
              : `Winner: ${snapshot.winnerName ?? "unknown"}.`}
          </p>
          <div className="results-placement">
            <span className="mono-label">YOUR PLACEMENT</span>
            <strong className="display">
              {placementLabel(snapshot.playerPlacement)}
            </strong>
            <span className="mono-label">OF {snapshot.standings.length || 4}</span>
          </div>
          <div className="results-table">
            <div className="results-table__head">
              <span>RANK</span>
              <span>OPERATOR</span>
              <span>ELIMS</span>
              <span>DEATHS</span>
            </div>
            {snapshot.standings.map((entry) => (
              <div
                key={entry.id}
                className={`results-row${entry.isPlayer ? " is-player" : ""}`}
              >
                <span>{String(entry.placement).padStart(2, "0")}</span>
                <span>
                  {entry.name}
                  {entry.isPlayer ? <em>YOU</em> : null}
                </span>
                <strong>{String(entry.score).padStart(2, "0")}</strong>
                <span>{String(entry.deaths).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
          <div className="results-stats">
            <div>
              <span className="mono-label">ELIMINATIONS</span>
              <strong className="display">{snapshot.playerEliminations}</strong>
            </div>
            <div>
              <span className="mono-label">DEATHS</span>
              <strong className="display">{snapshot.playerDeaths}</strong>
            </div>
            <div>
              <span className="mono-label">ACCURACY</span>
              <strong className="display">{accuracy}%</strong>
            </div>
          </div>
          <button
            type="button"
            className="results-cta"
            onClick={() => bridge.send({ type: "restart-match" })}
            data-testid="results-replay"
          >
            PLAY AGAIN
            <Keycap>ENTER</Keycap>
          </button>
          <div className="results-foot">
            <span className="mono-label">
              {formatMatchClock(snapshot.matchDurationMs)} MATCH
            </span>
            <span className="mono-label">
              {mode === "online" ? "ONLINE ROOM" : "LOCAL BOT LOBBY"}
            </span>
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
            FREE FOR
            <br />
            ALL
          </h2>
          <p className="boot-copy">
            {mode === "online"
              ? "Server-authoritative free-for-all. Eight combatant slots, live match clock and bot backfill."
              : "Four operators. One arena. First to 10 eliminations, or the highest score when the 90 second clock runs out."}
          </p>
          <div className="boot-load" aria-hidden="true">
            <span />
          </div>
          <div className="boot-controls">
            <span className="hud-control"><Keycap>A</Keycap><Keycap>D</Keycap><span className="mono-label">MOVE</span></span>
            <span className="hud-control"><Keycap>SPACE</Keycap><span className="mono-label">JUMP / JETPACK</span></span>
            <span className="hud-control"><Keycap>LMB</Keycap><span className="mono-label">FIRE</span></span>
            <span className="hud-control"><Keycap>1</Keycap><Keycap>2</Keycap><Keycap>3</Keycap><span className="mono-label">SWAP WEAPON</span></span>
            <span className="hud-control"><Keycap>R</Keycap><span className="mono-label">RELOAD</span></span>
          </div>
          <span className="boot-status mono-label">
            {snapshot.ready ? "MATCH READY // DEPLOYING" : "BOOTING SIMULATION"}
          </span>
        </div>
        <span className="boot-legal mono-label">
          {mode === "online"
            ? "P2.5 ONLINE BUILD . ORIGINAL VIBE VIBERS ARTWORK . SERVER AUTHORITATIVE"
            : "P1 BUILD . ORIGINAL VIBE VIBERS ARTWORK . LOCAL FREE FOR ALL"}
        </span>
      </div>
    </>
  );
}
