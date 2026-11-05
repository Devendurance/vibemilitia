"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Crosshair,
  Lock,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { CHARACTER_ROSTER, getCharacterSkin } from "@/game/characters/roster";
import { PLAYER_WEAPONS } from "@/game/config/gameplay";
import { GRENADE_CONFIG, GRENADE_SLOT_TYPES } from "@/game/core/grenades";
import { AudioSettings } from "@/components/game/AudioSettings";
import { TouchSettingsPanel } from "@/components/game/TouchSettingsPanel";
import type { LeaderboardResult, PlayerProfile } from "@/game/progression/profile";
import { fetchLeaderboard } from "@/lib/guestProfile";
import type { IdentityInput } from "@/components/hub/usePlayerIdentity";

function useDialogFocus(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = [
        ...panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return panelRef;
}

export function HubDrawer({
  eyebrow,
  title,
  onClose,
  children,
  side = "right",
  wide = false,
  testId,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "right" | "left" | "center";
  wide?: boolean;
  testId?: string;
}) {
  const panelRef = useDialogFocus(onClose);
  return (
    <div
      className={`hub-overlay hub-overlay--${side}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`hub-drawer${wide ? " hub-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        data-testid={testId}
      >
        <header className="hub-drawer__head">
          <div>
            <span className="mono-label">{eyebrow}</span>
            <h2 className="display">{title}</h2>
          </div>
          <button
            type="button"
            className="hub-icon-button"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="hub-drawer__body">{children}</div>
      </div>
    </div>
  );
}

export function CharacterDrawer({
  skinId,
  onChoose,
  onClose,
}: {
  skinId: string;
  onChoose: (skinId: string) => void;
  onClose: () => void;
}) {
  const selected = getCharacterSkin(skinId);
  return (
    <HubDrawer
      eyebrow="Official roster // 10 verified cutouts"
      title="CHOOSE YOUR VIBER"
      onClose={onClose}
      side="right"
      wide
      testId="hub-character-drawer"
    >
      <p className="hub-drawer__lead">
        Every Viber is unlocked. Selection is cosmetic and saved to your guest
        profile. The original NFT artwork is never altered.
      </p>
      <fieldset className="hub-roster">
        <legend className="sr-only">Official Viber roster</legend>
        <div className="hub-roster__grid">
          {CHARACTER_ROSTER.map((skin) => {
            const active = skin.skinId === selected.skinId;
            return (
              <label
                className={`hub-roster-card${active ? " is-selected" : ""}`}
                key={skin.skinId}
                data-testid={`hub-skin-card-${skin.skinId}`}
                data-skin-id={skin.skinId}
                data-selected={active}
              >
                <input
                  type="radio"
                  name="hub-skin"
                  value={skin.skinId}
                  checked={active}
                  onChange={() => onChoose(skin.skinId)}
                  aria-label={`Select ${skin.displayName}`}
                />
                <span className="hub-roster-card__art">
                  <Image
                    src={skin.avatarPath}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 24vw, 150px"
                  />
                  <span className="hub-roster-card__check" aria-hidden="true">
                    <Check />
                  </span>
                </span>
                <span className="hub-roster-card__name">
                  {skin.displayName}
                </span>
                <span className="hub-roster-card__id">{skin.skinId}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="hub-roster__selected">
        <span className="mono-label">SELECTED</span>
        <strong className="display">{selected.displayName}</strong>
        <span className="mono-label">{`${selected.skinId} // COSMETIC ONLY`}</span>
      </div>
    </HubDrawer>
  );
}

export function ProfileDrawer({
  profile,
  name,
  skinId,
  saving,
  serverError,
  onSave,
  onClose,
}: {
  profile: PlayerProfile | null;
  name: string;
  skinId: string;
  saving: boolean;
  serverError: string | null;
  onSave: (input: IdentityInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [xHandle, setXHandle] = useState(profile?.xHandle ?? "");
  const [xPublic, setXPublic] = useState(profile?.xPublic ?? false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(
    profile?.leaderboardVisible ?? true,
  );
  const [error, setError] = useState<string | null>(null);
  const skin = getCharacterSkin(skinId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedName = draftName.replace(/[^\w .-]/g, "").trim();
    if (cleanedName.length < 3 || cleanedName.length > 18) {
      setError("Callsign must be 3 to 18 characters. Letters, numbers, spaces, dot, dash and underscore.");
      return;
    }
    const normalized = xHandle.trim().replace(/^@+/, "");
    if (normalized && !/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
      setError("X handle must be 1 to 15 letters, numbers or underscores.");
      return;
    }
    setError(null);
    const ok = await onSave({
      name: cleanedName,
      xHandle: normalized || null,
      xPublic: normalized ? xPublic : false,
      leaderboardVisible,
    });
    if (ok) onClose();
  };

  return (
    <HubDrawer
      eyebrow="Guest profile // device bound"
      title="YOUR IDENTITY"
      onClose={onClose}
      side="right"
      testId="hub-profile-drawer"
    >
      <div className="hub-profile-summary">
        <span className="hub-profile-summary__avatar">
          <Image src={skin.avatarPath} alt="" fill sizes="72px" />
        </span>
        <div>
          <strong className="display">{profile?.name ?? name}</strong>
          <span className="mono-label">
            {profile
              ? `LEVEL ${profile.level} // ${profile.xp} XP // ${profile.wins} WINS`
              : "LOCAL IDENTITY // SERVER OFFLINE"}
          </span>
        </div>
      </div>
      <form className="hub-form" onSubmit={submit}>
        <label className="hub-field">
          <span>DISPLAY NAME</span>
          <input
            value={draftName}
            maxLength={18}
            onChange={(event) => setDraftName(event.target.value)}
            autoComplete="nickname"
            data-testid="hub-name-input"
          />
          <small>
            This is an editable display name, not a unique claimed username.
            Other players may use the same name.
          </small>
        </label>
        <label className="hub-field">
          <span>X HANDLE (OPTIONAL)</span>
          <input
            value={xHandle}
            maxLength={16}
            onChange={(event) => setXHandle(event.target.value)}
            placeholder="@yourname"
            autoComplete="off"
            spellCheck={false}
            data-testid="hub-x-handle"
          />
          <small>
            Self-declared only. Vibe Militia does not verify ownership of X
            accounts and never shows a verification badge.
          </small>
        </label>
        <label className="hub-check">
          <input
            type="checkbox"
            checked={xPublic}
            onChange={(event) => setXPublic(event.target.checked)}
            disabled={!xHandle.trim()}
          />
          <span>
            <strong>Show my X handle on the leaderboard</strong>
            <small>Only the handle is shown. No tokens or profile data.</small>
          </span>
        </label>
        <label className="hub-check">
          <input
            type="checkbox"
            checked={leaderboardVisible}
            onChange={(event) => setLeaderboardVisible(event.target.checked)}
          />
          <span>
            <strong>Include me in the global leaderboard</strong>
            <small>
              Only server-confirmed online matches count. Practice results are
              never ranked.
            </small>
          </span>
        </label>
        {error ? (
          <p className="hub-form__error" role="alert">
            {error}
          </p>
        ) : null}
        {serverError ? (
          <p className="hub-form__error" role="status">
            {serverError}
          </p>
        ) : null}
        <div className="hub-form__actions">
          <button type="button" className="hub-button" onClick={onClose}>
            CANCEL
          </button>
          <button
            type="submit"
            className="hub-button hub-button--primary"
            disabled={saving}
            data-testid="hub-profile-save"
          >
            {saving ? "SAVING..." : "SAVE IDENTITY"}
          </button>
        </div>
      </form>
    </HubDrawer>
  );
}

export function OnboardingDialog({
  initialName,
  skinId,
  saving,
  error,
  onSave,
  onSkip,
}: {
  initialName: string;
  skinId: string;
  saving: boolean;
  error: string | null;
  onSave: (input: IdentityInput) => Promise<boolean>;
  onSkip: () => void;
}) {
  const [name, setName] = useState(
    initialName.startsWith("VIBER-") ? "" : initialName,
  );
  const [xHandle, setXHandle] = useState("");
  const [xPublic, setXPublic] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [validation, setValidation] = useState<string | null>(null);
  const panelRef = useDialogFocus(() => undefined);
  const skin = getCharacterSkin(skinId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = name.replace(/[^\w .-]/g, "").trim();
    if (cleaned.length < 3 || cleaned.length > 18) {
      setValidation("Choose a callsign between 3 and 18 characters.");
      return;
    }
    const normalized = xHandle.trim().replace(/^@+/, "");
    if (normalized && !/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
      setValidation("X handle must be 1 to 15 letters, numbers or underscores.");
      return;
    }
    setValidation(null);
    await onSave({
      name: cleaned,
      xHandle: normalized || null,
      xPublic: normalized ? xPublic : false,
      leaderboardVisible,
    });
  };

  return (
    <div className="hub-overlay hub-overlay--center">
      <div
        className="hub-onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-onboarding-title"
        ref={panelRef}
        data-testid="hub-onboarding"
      >
        <div className="hub-onboarding__art" aria-hidden="true">
          <span className="hub-onboarding__ring" />
          <Image src={skin.cutoutPath} alt="" fill sizes="320px" />
        </div>
        <div className="hub-onboarding__copy">
          <span className="mono-label">First drop // Sector 07</span>
          <h2 id="hub-onboarding-title" className="display">
            MAKE A NAME FOR YOURSELF
          </h2>
          <p>
            Set an editable callsign for the arena. Add an X handle if you want
            it on the public leaderboard. No account or wallet is required.
          </p>
          <form className="hub-form hub-form--onboarding" onSubmit={submit}>
            <label className="hub-field">
              <span>CALLSIGN</span>
              <input
                value={name}
                maxLength={18}
                placeholder="VIBER-000"
                autoFocus
                onChange={(event) => setName(event.target.value)}
                data-testid="onboarding-name"
              />
              <small>
                Editable display name. Names are not reserved, unique or
                moderated in real time.
              </small>
            </label>
            <label className="hub-field">
              <span>X HANDLE (OPTIONAL)</span>
              <input
                value={xHandle}
                maxLength={16}
                placeholder="@yourname"
                onChange={(event) => setXHandle(event.target.value)}
                spellCheck={false}
                data-testid="onboarding-x-handle"
              />
              <small>Self-declared and unverified. You can hide it later.</small>
            </label>
            <label className="hub-check">
              <input
                type="checkbox"
                checked={xPublic}
                onChange={(event) => setXPublic(event.target.checked)}
                disabled={!xHandle.trim()}
              />
              <span>
                <strong>Show my X handle publicly</strong>
                <small>Applies to the server-derived leaderboard only.</small>
              </span>
            </label>
            <label className="hub-check">
              <input
                type="checkbox"
                checked={leaderboardVisible}
                onChange={(event) =>
                  setLeaderboardVisible(event.target.checked)
                }
              />
              <span>
                <strong>Include me in the global leaderboard</strong>
                <small>Online matches only. Practice never earns ranked XP.</small>
              </span>
            </label>
            {validation ? (
              <p className="hub-form__error" role="alert">
                {validation}
              </p>
            ) : null}
            {error ? (
              <p className="hub-form__error" role="status">
                {error}
              </p>
            ) : null}
            <div className="hub-form__actions">
              <button
                type="button"
                className="hub-button"
                onClick={onSkip}
                data-testid="onboarding-skip"
              >
                SKIP FOR NOW
              </button>
              <button
                type="submit"
                className="hub-button hub-button--primary"
                disabled={saving}
                data-testid="onboarding-save"
              >
                {saving ? "SAVING..." : "ENTER THE HUB"}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function RankingsDrawer({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<LeaderboardResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    let active = true;
    void fetchLeaderboard(25).then((value) => {
      if (!active) return;
      if (value) {
        setResult(value);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <HubDrawer
      eyebrow="Server-derived standings // all-time"
      title="GLOBAL RANKINGS"
      onClose={onClose}
      side="right"
      wide
      testId="leaderboard-panel"
    >
      <div className="hub-rankings__head">
        <div className="hub-rankings__metric">
          <Trophy aria-hidden="true" />
          <div>
            <strong>XP LADDER</strong>
            <span className="mono-label">
              COMPLETED ONLINE MATCHES ONLY // PRACTICE EXCLUDED
            </span>
          </div>
        </div>
        <span className="hub-pill">ALL-TIME</span>
      </div>
      {status === "loading" ? (
        <div className="hub-empty" role="status">
          <span className="hub-spinner" aria-hidden="true" />
          <strong className="display">LOADING STANDINGS</strong>
          <p>Reading server-confirmed match records.</p>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="hub-empty" role="alert">
          <ShieldAlert aria-hidden="true" />
          <strong className="display">RANKINGS UNAVAILABLE</strong>
          <p>
            The game server did not return leaderboard data. No placeholder
            standings are shown.
          </p>
          <button type="button" className="hub-button" onClick={onClose}>
            CLOSE
          </button>
        </div>
      ) : null}
      {status === "ready" && result && result.entries.length === 0 ? (
        <div className="hub-empty">
          <Trophy aria-hidden="true" />
          <strong className="display">NO RANKED MATCHES YET</strong>
          <p>
            The board fills after completed online matches. Practice creates no
            ranked XP or wins.
          </p>
        </div>
      ) : null}
      {status === "ready" && result && result.entries.length > 0 ? (
        <ol className="hub-rankings" data-testid="leaderboard-rows">
          {result.entries.map((entry) => (
            <li
              className={`hub-ranking${entry.rank <= 3 ? " is-podium" : ""}`}
              key={`${entry.rank}-${entry.name}-${entry.xp}`}
              data-testid="leaderboard-row"
            >
              <span className="hub-ranking__place">
                {String(entry.rank).padStart(2, "0")}
              </span>
              <span className="hub-ranking__identity">
                <strong>{entry.name}</strong>
                <span className="mono-label">
                  LVL {entry.level}
                  {entry.xHandle ? (
                    <>
                      {" // "}@{entry.xHandle}{" "}
                      <em className="hub-ranking__self">SELF-DECLARED</em>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="hub-ranking__stat">
                <strong>{entry.xp.toLocaleString()}</strong>
                <span className="mono-label">XP</span>
              </span>
              <span className="hub-ranking__stat">
                <strong>{entry.wins}</strong>
                <span className="mono-label">WINS</span>
              </span>
              <span className="hub-ranking__stat">
                <strong>{entry.kd.toFixed(2)}</strong>
                <span className="mono-label">K/D</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="hub-trust-note">
        <ShieldAlert aria-hidden="true" />
        Standings come from the game server persistence layer, which is Neon
        PostgreSQL in production. The browser cannot submit XP, wins or
        placements. X handles are self-declared and never shown as verified.
      </p>
    </HubDrawer>
  );
}

export function LoadoutDrawer({
  selectedSkinId,
  onCharacter,
  onClose,
}: {
  selectedSkinId: string;
  onCharacter: () => void;
  onClose: () => void;
}) {
  const skin = getCharacterSkin(selectedSkinId);
  return (
    <HubDrawer
      eyebrow="Match starter // preview only"
      title="LOADOUT"
      onClose={onClose}
      side="left"
      testId="hub-loadout-drawer"
    >
      <p className="hub-drawer__lead">
        Every match starts with the same three-slot kit. Advanced weapons,
        medkits and grenades are found in Sector 07 or dropped by eliminated
        players. The hub does not grant competitive gear.
      </p>
      <div className="hub-loadout-detail">
        <span className="mono-label">STARTER WEAPONS</span>
        {PLAYER_WEAPONS.map((weapon, index) => (
          <div className="hub-loadout-row" key={weapon.id}>
            <span className="hub-loadout-row__slot">{index + 1}</span>
            <div>
              <strong>{weapon.name}</strong>
              <span className="mono-label">
                {`${weapon.role} // ${weapon.magazineSize} ROUNDS`}
              </span>
            </div>
            <span className="hub-pill">EQUIPPED</span>
          </div>
        ))}
        <div className="hub-loadout-row is-empty">
          <span className="hub-loadout-row__slot">
            <Lock aria-hidden="true" />
          </span>
          <div>
            <strong>SLOT 3 EMPTY</strong>
            <span className="mono-label">
              FILLED BY A WORLD PICKUP OR ELIMINATION DROP
            </span>
          </div>
          <span className="hub-pill">IN-ARENA</span>
        </div>
      </div>
      <div className="hub-loadout-detail">
        <span className="mono-label">THROWABLES // ONE OF EACH</span>
        <div className="hub-grenade-row">
          {GRENADE_SLOT_TYPES.map((type) => (
            <div className="hub-grenade" key={type}>
              <Crosshair aria-hidden="true" />
              <strong>{GRENADE_CONFIG[type].name}</strong>
              <span className="mono-label">1 CARRY</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hub-loadout-detail hub-loadout-detail--compact">
        <span className="mono-label">MEDKITS</span>
        <p>
          Start with zero. Carry up to two from authored caches or elimination
          drops. Healing is server-authoritative.
        </p>
      </div>
      <div className="hub-loadout-detail hub-loadout-detail--character">
        <span className="hub-profile-summary__avatar">
          <Image src={skin.cutoutPath} alt="" fill sizes="90px" />
        </span>
        <div>
          <span className="mono-label">COSMETIC OPERATOR</span>
          <strong>{skin.displayName}</strong>
        </div>
        <button type="button" className="hub-button" onClick={onCharacter}>
          CHANGE VIBER
        </button>
      </div>
      <p className="hub-trust-note">
        <Sparkles aria-hidden="true" />
        Loadout shown here is a preview of the server starter kit. Weapon
        ownership in a live match is controlled by Sector 07 pickups, the
        three-slot inventory and the explicit swap action.
      </p>
    </HubDrawer>
  );
}

export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setReduceMotion(
          window.localStorage.getItem("vibe-militia-reduce-motion") === "1",
        );
      } catch {
        // Ignore storage failures.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggleMotion = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    document.documentElement.classList.toggle("reduce-motion", next);
    try {
      window.localStorage.setItem(
        "vibe-militia-reduce-motion",
        next ? "1" : "0",
      );
    } catch {
      // Preference applies for this session.
    }
  };
  return (
    <HubDrawer
      eyebrow="Audio, touch and accessibility"
      title="SETTINGS"
      onClose={onClose}
      side="right"
      testId="hub-settings-drawer"
    >
      <section className="hub-settings-block">
        <span className="mono-label">AUDIO</span>
        <AudioSettings />
      </section>
      <section className="hub-settings-block">
        <span className="mono-label">TOUCH CONTROLS</span>
        <p className="hub-drawer__lead">
          Touch settings apply to supported coarse-pointer devices. Desktop
          keyboard and mouse controls are unchanged.
        </p>
        <TouchSettingsPanel />
      </section>
      <section className="hub-settings-block">
        <span className="mono-label">ACCESSIBILITY</span>
        <label className="hub-check">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={toggleMotion}
          />
          <span>
            <strong>Reduce ambient motion</strong>
            <small>
              Stops lobby parallax, pulsing glows and decorative transitions.
              Combat remains unchanged.
            </small>
          </span>
        </label>
      </section>
      <section className="hub-settings-block">
        <span className="mono-label">CONTROLS</span>
        <p className="hub-drawer__lead">
          Desktop: WASD move, Space jump and jetpack, mouse aim and fire, R
          reload, 1 to 3 weapons, 4 to 6 grenades, G throw, H medkit, E swap.
          Touch: left D-pad moves and pushes up to fly, right pad aims and fires,
          with compact grenade, reload, weapon, medkit and pickup buttons.
        </p>
      </section>
    </HubDrawer>
  );
}

export function HubFooterMark() {
  return (
    <span className="hub-footer__mark">
      <UserRound aria-hidden="true" />
      ORIGINAL VIBE VIBERS ARTWORK
    </span>
  );
}
