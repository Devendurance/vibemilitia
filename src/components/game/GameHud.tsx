"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getCharacterSkin, HUMAN_DEFAULT_SKIN_ID } from "@/game/characters/roster";
import { LoadoutIcon } from "@/components/game/LoadoutIcon";
import { MatchCountdown } from "@/components/game/MatchCountdown";
import type { GameBridge, HudSnapshot } from "@/game/bridge";
import { isCriticalFuel, isLowHealth } from "@/game/core/combat";
import { formatMatchClock } from "@/game/core/match";
import { MEDKIT_CONFIG } from "@/game/core/pickups";
import type { MatchReward, PlayerProfile } from "@/game/progression/profile";
import {
  totalXpForLevel,
  xpForNextLevel,
} from "@/game/progression/progression";

interface GameHudProps {
  bridge: GameBridge;
  mode?: "local" | "practice" | "online";
  playerName?: string;
  playerSkinId?: string;
  profile?: PlayerProfile | null;
  reward?: MatchReward | null;
  difficultyLabel?: string;
  /** Leaves the match for the lobby. On practice this is the hub. */
  onLobby?: () => void;
  /** Online only: leaves the match and returns to the hub. */
  onHub?: () => void;
}

function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
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
  playerSkinId,
  profile = null,
  reward = null,
  difficultyLabel,
  onLobby,
  onHub,
}: GameHudProps) {
  const playerSkin = getCharacterSkin(playerSkinId ?? HUMAN_DEFAULT_SKIN_ID);
  const fullLoadout = mode !== "local";
  const levelLabel = String(profile?.level ?? 1).padStart(2, "0");
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() =>
    bridge.getSnapshot(),
  );
  const [damageFlash, setDamageFlash] = useState(0);
  const [booted, setBooted] = useState(false);
  const [medkitToast, setMedkitToast] = useState(0);
  const [supplyToast, setSupplyToast] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
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
  const rewardLevelXp = reward
    ? Math.max(
        0,
        reward.profile.xp - totalXpForLevel(reward.profile.level),
      )
    : 0;
  const rewardLevelSpan = reward ? xpForNextLevel(reward.profile.level) : 1;
  const rewardProgress = reward
    ? Math.max(0, Math.min(1, rewardLevelXp / Math.max(1, rewardLevelSpan)))
    : 0;
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
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLElement &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event)) return;
      if (event.code === "Tab" && !matchEnded) {
        event.preventDefault();
        setBoardOpen(true);
      }
      if (event.code === "Enter" && matchEnded) {
        bridge.send({ type: "restart-match" });
      }
      if (event.code === "KeyL" && matchEnded) onLobby?.();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Tab") setBoardOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [bridge, matchEnded, onLobby]);

  const liveStarted = snapshot.ready && snapshot.matchPhase === "live";
  useEffect(() => {
    if (!liveStarted) return undefined;
    const show = window.setTimeout(() => setIntroVisible(true), 0);
    const hide = window.setTimeout(() => setIntroVisible(false), 2200);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [liveStarted]);

  const leader = snapshot.standings[0] ?? null;

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

        <section
          className={`hud-strip hud-identity hud-vitals${low ? " is-danger" : ""}`}
          aria-label="Operator status"
        >
          <div className="hud-avatar">
            <Image
              src={playerSkin.avatarPath}
              alt={`${playerSkin.displayName} character portrait`}
              width={60}
              height={79}
              priority
            />
            <span className="hud-avatar__level">{levelLabel}</span>
          </div>
          <div className="hud-strip__body">
            <div className="hud-strip__head">
              <h1 className="hud-identity__name">{playerSkin.displayName}</h1>
              <span className="hud-identity__meta">
                <span className="hud-pill hud-pill--live">
                  <i className="live-dot" />
                  {matchEnded ? "FINAL" : matchStarting ? "STARTING" : "LIVE"}
                </span>
              </span>
            </div>
            <div className="hud-meter" aria-label={`Health ${Math.round(snapshot.health)} of ${snapshot.maxHealth}`}>
              <span className="hud-meter__label">HP</span>
              <HealthBar snapshot={snapshot} />
              <span className="hud-meter__value">{Math.round(snapshot.health)}</span>
            </div>
            <div className="hud-meter" aria-label={`Jetpack fuel ${Math.round(snapshot.fuel)} percent`}>
              <span className="hud-meter__label">JET</span>
              <FuelBar snapshot={snapshot} />
              <span className="hud-meter__value">{Math.round(snapshot.fuel)}</span>
            </div>
          </div>
        </section>

        <div
          className={`hud-clock hud-matchbar${!matchEnded && timeCritical ? " is-critical" : !matchEnded && timeWarning ? " is-warning" : ""}`}
          data-testid="match-clock"
          role="status"
        >
          <div className="hud-matchbar__clock" data-testid="match-clock-value">
            <span className="mono-label">
              {matchStarting ? "START IN" : "TIME"}
            </span>
            <strong>
              {formatMatchClock(
                matchStarting
                  ? snapshot.matchCountdownMs
                  : snapshot.matchTimeRemainingMs,
              )}
            </strong>
          </div>
          <span className={`hud-clock__score${timeCritical ? " is-danger" : ""}`}>
            {matchEnded
              ? "MATCH OVER"
              : matchStarting
                ? `FIRST TO ${snapshot.matchScoreLimit}`
                : timeCritical
                  ? `FINAL ${Math.ceil(snapshot.matchTimeRemainingMs / 1000)}`
                  : `${placementLabel(snapshot.playerPlacement)} / ${snapshot.playerEliminations} OF ${snapshot.matchScoreLimit}`}
          </span>
        </div>

        {introVisible || matchStarting ? (
          <div className="hud-intro" data-testid="match-intro">
            <span>SECTOR 07</span>
            <em>{mode === "practice" ? `PRACTICE // ${difficultyLabel ?? "NORMAL"}` : "FREE FOR ALL"}</em>
          </div>
        ) : null}

        <MatchCountdown
          phase={snapshot.matchPhase}
          countdownMs={snapshot.matchCountdownMs}
          hidden={bootVisible}
        />

        <div className="hud-feed" aria-live="polite">
          {visibleFeed.map((entry) => (
            <div className="hud-feed__row" key={entry.id}>
              <span className="hud-feed__mark" />
              <span>{entry.text}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={`hud-board-toggle${boardOpen ? " is-open" : ""}`}
          onClick={() => setBoardOpen((open) => !open)}
          aria-expanded={boardOpen}
          aria-controls="hud-leaderboard"
          data-testid="board-toggle"
        >
          <Keycap>TAB</Keycap>
          <span className="hud-board-toggle__leader">
            {leader ? `${leader.name} ${leader.score}` : "SCOREBOARD"}
          </span>
        </button>

        <section
          id="hud-leaderboard"
          className={`hud-board hud-leaderboard${boardOpen ? " is-open" : ""}`}
          data-testid="leaderboard"
          aria-label="Match leaderboard"
          aria-hidden={!boardOpen}
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
              tabIndex={boardOpen ? 0 : -1}
              data-testid="debug-toggle"
            >
              <Keycap>F1</Keycap>
              <span>{snapshot.debug ? "DEBUG ON" : "DEBUG"}</span>
            </button>
          </div>
        </section>

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

        <section className="hud-loadout" aria-label="Loadout">
          <div className="hud-weapon hud-loadout__weapon">
            <div className="hud-loadout__weapon-line">
              <h2 className="hud-weapon__name" data-testid="weapon-name">
                {snapshot.weaponName}
              </h2>
              <div className="hud-ammo" data-testid="hud-ammo">
                <strong>{String(snapshot.ammo).padStart(2, "0")}</strong>
                <span>/{snapshot.magazineSize}</span>
              </div>
            </div>
            <div className="reload-track" aria-hidden="true">
              <span
                style={{
                  width: snapshot.reloading
                    ? `${snapshot.reloadProgress * 100}%`
                    : `${(snapshot.ammo / Math.max(1, snapshot.magazineSize)) * 100}%`,
                }}
                className={snapshot.reloading ? "is-reloading" : ""}
              />
            </div>
            <span className="sr-only">
              {snapshot.reloading
                ? `Reloading ${Math.round(snapshot.reloadProgress * 100)} percent`
                : "Ready to fire"}
            </span>
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
                  {empty ? (
                    <span className="hud-weapon-slot__icon" aria-hidden="true" />
                  ) : (
                    <LoadoutIcon name={slot.id} className="hud-weapon-slot__icon" />
                  )}
                  <span className="sr-only">{empty ? "EMPTY" : slot.shortName}</span>
                  <span className="hud-weapon-slot__ammo">
                    {empty
                      ? "--"
                      : slot.reloading
                        ? "..."
                        : slot.ammo}
                  </span>
                </button>
              );
            })}
          </div>

          {fullLoadout ? (
            <div
              className="hud-throwables"
              data-testid="hud-grenades"
              data-selected={snapshot.grenadeSelected}
              data-contact={snapshot.grenadeContact}
              data-frag={snapshot.grenadeFrag}
              data-stinking={snapshot.grenadeStinking}
            >
              <div className="hud-grenade-slots" role="group" aria-label="Grenade selection">
                {(
                  [
                    ["contact", "4", "CONTACT", snapshot.grenadeContact, 0],
                    ["frag", "5", "FRAG", snapshot.grenadeFrag, 1],
                    ["stinking", "6", "STINK", snapshot.grenadeStinking, 2],
                  ] as const
                ).map(([type, key, label, count, slot]) => (
                  <button
                    key={type}
                    type="button"
                    className={`hud-grenade-slot${snapshot.grenadeSelected === type ? " is-active" : ""}`}
                    onClick={() => bridge.send({ type: "select-grenade", slot })}
                    aria-pressed={snapshot.grenadeSelected === type}
                    aria-label={`${label} grenade, ${count} carried`}
                    disabled={dead || matchEnded}
                    data-testid={`grenade-select-${type}`}
                  >
                    <Keycap>{key}</Keycap>
                    <LoadoutIcon name={type} className="hud-grenade-icon" />
                    <strong data-testid={`grenade-count-${type}`}>{count}</strong>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`hud-grenade-throw${grenadeReady ? " is-ready" : ""}`}
                onClick={() => bridge.send({ type: "throw-grenade" })}
                disabled={!grenadeReady}
                aria-label={`Throw grenade. ${grenadeStatus}`}
                data-testid="grenade-throw"
                data-can-throw={grenadeReady}
              >
                <Keycap>G</Keycap>
                <span
                  className={`hud-grenade-status${grenadeReady ? " is-ready" : ""}`}
                  data-testid="grenade-status"
                >
                  {grenadeStatus}
                </span>
              </button>
            </div>
          ) : null}

          {fullLoadout ? (
            <div
              className="hud-medkit"
              data-testid="hud-medkits"
              data-medkits={snapshot.medkits}
            >
              <button
                type="button"
                className="hud-medkit-use"
                onClick={() => bridge.send({ type: "use-medkit" })}
                disabled={
                  dead ||
                  matchEnded ||
                  snapshot.medkits <= 0 ||
                  snapshot.health >= snapshot.maxHealth
                }
                data-testid="medkit-use"
                aria-label={`Use medkit, heals ${MEDKIT_CONFIG.healAmount}. ${snapshot.medkits} of ${snapshot.maxMedkits} carried`}
              >
                <Keycap>H</Keycap>
                <LoadoutIcon name="medkit" className="hud-medkit-icon" />
                <strong>{snapshot.medkits}</strong>
              </button>
            </div>
          ) : null}
        </section>

        {matchStarting ? (
          <section className="hud-controls" aria-label="Controls">
            <span className="hud-control"><Keycap>A</Keycap><Keycap>D</Keycap><span className="mono-label">MOVE</span></span>
            <span className="hud-control"><Keycap>SPACE</Keycap><span className="mono-label">JUMP / JET</span></span>
            <span className="hud-control"><Keycap>LMB</Keycap><span className="mono-label">FIRE</span></span>
            <span className="hud-control"><Keycap>R</Keycap><span className="mono-label">RELOAD</span></span>
            <span className="hud-control"><Keycap>E</Keycap><span className="mono-label">LOOT</span></span>
            <span className="hud-control"><Keycap>TAB</Keycap><span className="mono-label">SCORES</span></span>
          </section>
        ) : null}

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
        <div className="death-card" role="status" aria-live="assertive" aria-labelledby="death-title">
          <span className="death-eyebrow">MATCH CONTINUES</span>
          <h2 id="death-title" className="display">ELIMINATED</h2>
          <p className="death-copy">
            {snapshot.lastKillerName
              ? `${snapshot.lastKillerName} took you out.`
              : "You went down."}
          </p>
          <div className="death-count">
            <span className="mono-label">REDEPLOY IN</span>
            <strong className="display">{snapshot.respawnIn.toFixed(1)}</strong>
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
          {mode === "online" && reward ? (
            <div className="results-progression" data-testid="results-progression">
              <div className="results-progression__head">
                <span className="mono-label">
                  {reward.levelUp ? "LEVEL UP" : "MATCH XP"}
                </span>
                <strong className="display" data-testid="results-xp">
                  +{reward.xpEarned} XP
                </strong>
              </div>
              <div className="results-progression__breakdown">
                {reward.breakdown.map((line) => (
                  <span key={line.id}>
                    {line.label} <strong>+{line.xp}</strong>
                  </span>
                ))}
              </div>
              <div className="profile-xp" aria-hidden="true">
                <span style={{ width: `${rewardProgress * 100}%` }} />
              </div>
              <span className="mono-label">
                LEVEL {reward.levelBefore}
                {reward.levelUp ? ` -> ${reward.levelAfter}` : ""}
                {" // "}TOTAL {reward.profile.xp} XP
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="results-cta"
            onClick={() => bridge.send({ type: "restart-match" })}
            data-testid="results-replay"
          >
            PLAY AGAIN
            <Keycap>ENTER</Keycap>
          </button>
          <div className="results-actions">
            <button
              type="button"
              className="results-secondary"
              onClick={() => onLobby?.()}
              data-testid="results-lobby"
            >
              {mode === "online" ? "LOBBY" : "BACK TO HUB"}
              <Keycap>L</Keycap>
            </button>
            {mode === "online" && onHub ? (
              <button
                type="button"
                className="results-secondary"
                onClick={onHub}
                data-testid="results-hub"
              >
                BACK TO HUB
              </button>
            ) : null}
          </div>
          <div className="results-foot">
            <span className="mono-label">
              {formatMatchClock(snapshot.matchDurationMs)} MATCH
            </span>
            <span className="mono-label">
              {mode === "online"
                ? "ONLINE ROOM"
                : `PRACTICE // ${difficultyLabel ?? "NORMAL"} // NO RANKED XP`}
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
              : "Eight operators. One arena. First to 10 eliminations, or the highest score when the 90 second clock runs out."}
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
            ? "ORIGINAL VIBE VIBERS ARTWORK . SERVER AUTHORITATIVE"
            : "ORIGINAL VIBE VIBERS ARTWORK . PRACTICE . NO RANKED XP"}
        </span>
      </div>
    </>
  );
}
