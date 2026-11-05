"use client";

import {
  COSMETIC_UNLOCKS,
  type CosmeticKind,
  type EquippedCosmetics,
} from "@/game/progression/cosmetics";
import { xpForNextLevel, totalXpForLevel } from "@/game/progression/progression";
import type { PlayerProfile } from "@/game/progression/profile";

const SLOT_BY_KIND: Record<CosmeticKind, keyof EquippedCosmetics> = {
  title: "titleId",
  badge: "badgeId",
  elimination: "eliminationId",
  trail: "trailId",
};

const KIND_LABEL: Record<CosmeticKind, string> = {
  title: "TITLE",
  badge: "BADGE",
  elimination: "ELIMINATION",
  trail: "JETPACK TRAIL",
};

export function ProfilePanel({
  profile,
  equipped,
  busy,
  onEquip,
}: {
  profile: PlayerProfile | null;
  equipped: EquippedCosmetics;
  busy: boolean;
  onEquip: (slot: keyof EquippedCosmetics, id: string) => void;
}) {
  if (!profile) {
    return (
      <div className="online-side-card profile-panel" data-testid="profile-panel">
        <span className="mono-label">GUEST PROFILE</span>
        <p>
          Connecting to the profile service. You can still play without a saved
          profile if the game server is offline.
        </p>
      </div>
    );
  }
  const levelBase = totalXpForLevel(profile.level);
  const levelSpan = xpForNextLevel(profile.level);
  const levelXp = Math.max(0, profile.xp - levelBase);
  const progress = Math.max(0, Math.min(1, levelXp / levelSpan));
  const kd =
    profile.deaths > 0
      ? (profile.eliminations / profile.deaths).toFixed(2)
      : profile.eliminations.toFixed(2);

  return (
    <div className="online-side-card profile-panel" data-testid="profile-panel">
      <div className="profile-panel__head">
        <div>
          <span className="mono-label">GUEST PROFILE // DEVICE BOUND</span>
          <strong className="display" data-testid="profile-level">
            LEVEL {profile.level}
          </strong>
        </div>
        <span className="profile-panel__badge" title={profile.equipped.badgeId}>
          {profile.equipped.badgeId.replace("badge-", "").replaceAll("-", " ")}
        </span>
      </div>
      <div
        className="profile-xp"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={levelSpan}
        aria-valuenow={levelXp}
        aria-label={`Level ${profile.level} progress`}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="mono-label profile-panel__xp">
        {levelXp} / {levelSpan} XP TO LEVEL {profile.level + 1}
        {" // "}TOTAL {profile.xp}
      </span>
      <div className="profile-stats">
        <div>
          <strong>{profile.matchesPlayed}</strong>
          <span className="mono-label">MATCHES</span>
        </div>
        <div>
          <strong>{profile.wins}</strong>
          <span className="mono-label">WINS</span>
        </div>
        <div>
          <strong>{profile.eliminations}</strong>
          <span className="mono-label">ELIMS</span>
        </div>
        <div>
          <strong>{kd}</strong>
          <span className="mono-label">K/D</span>
        </div>
      </div>
      {profile.weaponStats[0] ? (
        <span className="mono-label profile-panel__weapon">
          TOP WEAPON{" // "}
          {profile.weaponStats[0].weaponId.toUpperCase()}
          {" // "}
          {profile.weaponStats[0].shots} SHOTS
        </span>
      ) : null}
      <div className="profile-cosmetics">
        {(Object.keys(KIND_LABEL) as CosmeticKind[]).map((kind) => {
          const slot = SLOT_BY_KIND[kind];
          const unlocked = COSMETIC_UNLOCKS.filter(
            (entry) =>
              entry.kind === kind && profile.unlocked.includes(entry.id),
          );
          const nextLocked = COSMETIC_UNLOCKS.find(
            (entry) =>
              entry.kind === kind && !profile.unlocked.includes(entry.id),
          );
          return (
            <div className="profile-cosmetic" key={kind}>
              <span className="mono-label">{KIND_LABEL[kind]}</span>
              <div className="profile-cosmetic__options">
                {unlocked.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`profile-chip${
                      equipped[slot] === entry.id ? " is-active" : ""
                    }`}
                    onClick={() => onEquip(slot, entry.id)}
                    disabled={busy}
                    aria-pressed={equipped[slot] === entry.id}
                  >
                    {entry.name}
                  </button>
                ))}
                {nextLocked ? (
                  <span className="profile-chip profile-chip--locked">
                    {nextLocked.name}
                    {" // LVL "}
                    {nextLocked.level}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {profile.recentMatches.length > 0 ? (
        <div className="profile-recent">
          <span className="mono-label">RECENT MATCHES</span>
          {profile.recentMatches.slice(0, 3).map((match) => (
            <div className="profile-recent__row" key={match.matchId}>
              <span>
                {match.outcome === "win" ? "WIN" : `#${match.placement}`}
              </span>
              <span>
                {match.eliminations} E // {match.deaths} D
              </span>
              <strong>+{match.xpEarned} XP</strong>
            </div>
          ))}
        </div>
      ) : null}
      <p className="profile-note">
        Guest profiles live on this device. Clearing browser storage loses
        access. Account linking is not implemented.
      </p>
    </div>
  );
}
