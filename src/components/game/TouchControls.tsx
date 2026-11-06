"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Gauge, Home, RotateCw, Settings, ShieldPlus, Swords } from "lucide-react";
import type { GameBridge, HudSnapshot } from "@/game/bridge";
import { audio } from "@/game/audio/AudioEngine";
import {
  queueTouchGrenadeSlot,
  queueTouchGrenadeThrow,
  queueTouchJump,
  queueTouchMedkit,
  queueTouchReload,
  queueTouchSwap,
  latchTouchFire,
  resetTouchInput,
  setTouchAim,
  setTouchAimActive,
  setTouchAimFire,
  setTouchEnabled,
  setTouchFireButton,
  setTouchJumpHeld,
  setTouchMove,
  setTouchThrustHeld,
} from "@/game/input/touchInput";
import { lockMatchViewport } from "@/game/input/matchViewport";
import { getTouchSettings, type TouchSettings } from "@/game/input/touchSettings";

/** Knob travel as a fraction of the pad radius. */
const KNOB_TRAVEL = 0.62;
/** Thumb travel, as a fraction of the radius, before a press counts as a drag. */
const AIM_DRAG_SLOP = 0.08;
/** A press held this long without a drag takes the thumb's direction. */
const AIM_HOLD_COMMIT_MS = 140;

interface AimGesture {
  id: number;
  rect: DOMRect;
  startX: number;
  startY: number;
  dragging: boolean;
  /** Last pointer position, so the hold timer can commit where the thumb is. */
  lastX: number;
  lastY: number;
}

function moveKnobTo(
  knob: HTMLElement | null,
  pad: HTMLElement | null,
  x: number,
  y: number,
): void {
  if (!knob || !pad) return;
  const radius = pad.clientWidth / 2;
  knob.style.transform = `translate3d(${x * radius * KNOB_TRAVEL}px, ${y * radius * KNOB_TRAVEL}px, 0)`;
}

function stickVector(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { x: number; y: number; distance: number } {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = Math.max(24, Math.min(rect.width, rect.height) / 2);
  const rawX = (clientX - centerX) / radius;
  const rawY = (clientY - centerY) / radius;
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > 1 ? 1 / distance : 1;
  return { x: rawX * scale, y: rawY * scale, distance };
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function TouchControls({
  bridge,
  onSettings,
  playerName,
  level,
  variant = "online",
  onExit,
  modeLabel,
}: {
  bridge: GameBridge;
  onSettings: () => void;
  playerName: string;
  level: number;
  variant?: "online" | "practice";
  onExit?: () => void;
  modeLabel?: string;
}) {
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() =>
    bridge.getSnapshot(),
  );
  const [settings, setSettings] = useState<TouchSettings>(() =>
    getTouchSettings(),
  );
  const settingsRef = useRef(settings);
  const movePointer = useRef<{ id: number; rect: DOMRect } | null>(null);
  const aimGesture = useRef<AimGesture | null>(null);
  const aimHoldTimer = useRef<number | null>(null);
  const thrustRef = useRef(false);
  const movePadRef = useRef<HTMLDivElement>(null);
  const aimPadRef = useRef<HTMLDivElement>(null);
  const moveKnobRef = useRef<HTMLSpanElement>(null);
  const aimKnobRef = useRef<HTMLSpanElement>(null);
  const moveLabelRef = useRef<HTMLSpanElement>(null);
  const aimLabelRef = useRef<HTMLSpanElement>(null);

  // These change at touch rate, so they write to the DOM directly. Going through
  // React state would tie firing feedback to a render.
  const showThrust = useCallback((active: boolean) => {
    const pad = movePadRef.current;
    if (!pad) return;
    pad.classList.toggle("is-thrusting", active);
    pad.setAttribute("data-thrusting", String(active));
    if (moveLabelRef.current) {
      moveLabelRef.current.textContent = active ? "THRUST" : "MOVE";
    }
  }, []);
  const showFiring = useCallback((active: boolean) => {
    const pad = aimPadRef.current;
    if (!pad) return;
    pad.classList.toggle("is-firing", active);
    pad.setAttribute("data-auto-fire", String(active));
    if (aimLabelRef.current) {
      aimLabelRef.current.textContent = active
        ? "FIRING"
        : settingsRef.current.aimFireEnabled
          ? "AIM + FIRE"
          : "AIM";
    }
  }, []);
  const clearAimHold = useCallback(() => {
    if (aimHoldTimer.current !== null) {
      window.clearTimeout(aimHoldTimer.current);
      aimHoldTimer.current = null;
    }
  }, []);

  useEffect(() => {
    setTouchEnabled(true);
    const unlockViewport = lockMatchViewport();
    const unsubscribe = bridge.subscribe(setSnapshot);
    const reset = () => {
      resetTouchInput();
      clearAimHold();
      moveKnobTo(moveKnobRef.current, movePadRef.current, 0, 0);
      moveKnobTo(aimKnobRef.current, aimPadRef.current, 0, 0);
      showFiring(false);
      showThrust(false);
      thrustRef.current = false;
      movePointer.current = null;
      aimGesture.current = null;
    };
    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      unsubscribe();
      unlockViewport();
      clearAimHold();
      resetTouchInput();
      setTouchEnabled(false);
      window.removeEventListener("blur", reset);
      window.removeEventListener("orientationchange", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [bridge, clearAimHold, showFiring, showThrust]);

  useEffect(() => {
    const updateSettings = (event: Event) => {
      const next = (event as CustomEvent<TouchSettings>).detail;
      settingsRef.current = next;
      setSettings(next);
    };
    window.addEventListener("vibe-touch-settings", updateSettings);
    return () => {
      window.removeEventListener("vibe-touch-settings", updateSettings);
    };
  }, []);

  const applyMoveVector = (vector: { x: number; y: number }) => {
    const current = settingsRef.current;
    const moveX = Math.abs(vector.x) > current.leftDeadZone ? vector.x : 0;
    setTouchMove(moveX);
    moveKnobTo(moveKnobRef.current, movePadRef.current, vector.x, vector.y);
    const thrust = vector.y <= -current.thrustThreshold;
    if (thrust && !thrustRef.current) {
      queueTouchJump();
    }
    if (thrust !== thrustRef.current) showThrust(thrust);
    thrustRef.current = thrust;
    setTouchThrustHeld(thrust);
  };

  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    movePointer.current = { id: event.pointerId, rect };
    applyMoveVector(stickVector(rect, event.clientX, event.clientY));
  };

  const updateMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = movePointer.current;
    if (pointer?.id !== event.pointerId) return;
    applyMoveVector(stickVector(pointer.rect, event.clientX, event.clientY));
  };

  const endMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointer.current?.id !== event.pointerId) return;
    movePointer.current = null;
    setTouchMove(0);
    setTouchThrustHeld(false);
    moveKnobTo(moveKnobRef.current, movePadRef.current, 0, 0);
    showThrust(false);
    thrustRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
  };

  /**
   * Two separate states. Fire is "a thumb is on the pad" and nothing else, so
   * no position can interrupt it. Aim is "the thumb has a usable direction",
   * so the dead zone only freezes the angle, where it would otherwise spin.
   */
  const applyAim = (gesture: AimGesture, stamp: number) => {
    const vector = stickVector(gesture.rect, gesture.lastX, gesture.lastY);
    moveKnobTo(aimKnobRef.current, aimPadRef.current, vector.x, vector.y);
    if (!gesture.dragging) return;
    if (vector.distance >= settingsRef.current.rightDeadZone) {
      setTouchAim(Math.atan2(vector.y, vector.x), stamp);
    }
  };

  const beginAim = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const combined = settingsRef.current.aimFireEnabled;
    const gesture: AimGesture = {
      id: event.pointerId,
      rect: event.currentTarget.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      // Combined mode keeps the retained aim for a tap. The FIRE button mode has
      // no tap, so the pad aims from the first contact.
      dragging: !combined,
    };
    aimGesture.current = gesture;
    setTouchAimActive(true);
    if (combined) {
      setTouchAimFire(true);
      latchTouchFire(event.timeStamp);
      showFiring(true);
      clearAimHold();
      aimHoldTimer.current = window.setTimeout(() => {
        aimHoldTimer.current = null;
        if (aimGesture.current !== gesture) return;
        gesture.dragging = true;
        applyAim(gesture, performance.now());
      }, AIM_HOLD_COMMIT_MS);
    }
    applyAim(gesture, event.timeStamp);
  };

  const updateAim = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = aimGesture.current;
    if (gesture?.id !== event.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    if (!gesture.dragging) {
      const radius = Math.max(24, gesture.rect.width / 2);
      const travel = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      if (travel / radius >= AIM_DRAG_SLOP) gesture.dragging = true;
    }
    applyAim(gesture, event.timeStamp);
  };

  const endAim = (event: React.PointerEvent<HTMLDivElement>) => {
    if (aimGesture.current?.id !== event.pointerId) return;
    aimGesture.current = null;
    clearAimHold();
    setTouchAimActive(false);
    setTouchAimFire(false);
    showFiring(false);
    moveKnobTo(aimKnobRef.current, aimPadRef.current, 0, 0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
  };

  const selectedGrenadeIndex =
    snapshot.grenadeSelected === "contact"
      ? 0
      : snapshot.grenadeSelected === "frag"
        ? 1
        : 2;
  const selectedGrenadeCount =
    snapshot.grenadeSelected === "contact"
      ? snapshot.grenadeContact
      : snapshot.grenadeSelected === "frag"
        ? snapshot.grenadeFrag
        : snapshot.grenadeStinking;
  const selectedGrenadeLabel = snapshot.grenadeSelected.toUpperCase();
  const activeSlot = snapshot.weaponSlots.find((slot) => slot.active);
  const healthRatio = Math.max(
    0,
    Math.min(1, snapshot.health / Math.max(1, snapshot.maxHealth)),
  );
  const fuelRatio = Math.max(
    0,
    Math.min(1, snapshot.fuel / Math.max(1, snapshot.maxFuel)),
  );
  const online = variant === "online";

  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="tc-hud" data-testid="touch-hud">
        <div className="tc-vitals" aria-label={`Health ${snapshot.health}, fuel ${snapshot.fuel}`}>
          <div className={`tc-bar tc-bar--hp${healthRatio <= 0.3 ? " is-danger" : ""}`}>
            <span style={{ width: `${healthRatio * 100}%` }} />
            <em>{Math.round(snapshot.health)}</em>
          </div>
          <div className="tc-bar tc-bar--fuel">
            <span style={{ width: `${fuelRatio * 100}%` }} />
            <em>{Math.round(snapshot.fuel)}</em>
          </div>
        </div>
        <span className="tc-clock" aria-label="Match time">
          {formatClock(snapshot.matchTimeRemainingMs)}
        </span>
        <div className="tc-ammo">
          <strong>{snapshot.weaponShortName}</strong>
          <span>
            {snapshot.ammo}/{snapshot.magazineSize}
          </span>
        </div>
        {onExit ? (
          <Link className="tc-top-button" href="/" aria-label="Return to hub">
            <Home aria-hidden="true" />
          </Link>
        ) : null}
        <button
          type="button"
          className="tc-top-button"
          onPointerDown={(event) => {
            event.preventDefault();
            onSettings();
          }}
          data-testid="touch-settings"
          aria-label="Open settings"
        >
          <Settings aria-hidden="true" />
        </button>
      </div>
      {modeLabel ? <span className="tc-mode-label">{modeLabel}</span> : null}

      <div
        ref={movePadRef}
        className="tc-pad tc-pad--move"
        data-testid="touch-move"
        role="group"
        aria-label="Move and fly directional pad"
        onPointerDown={beginMove}
        onPointerMove={updateMove}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onLostPointerCapture={endMove}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="tc-pad__directions" aria-hidden="true">
          <span className="tc-dir tc-dir--up">▲</span>
          <span className="tc-dir tc-dir--right">▶</span>
          <span className="tc-dir tc-dir--down">▼</span>
          <span className="tc-dir tc-dir--left">◀</span>
        </span>
        <span className="tc-pad__ring" aria-hidden="true" />
        <span ref={moveKnobRef} className="tc-pad__knob" aria-hidden="true" />
        <span ref={moveLabelRef} className="tc-pad__label">MOVE</span>
      </div>

      <div
        ref={aimPadRef}
        className="tc-pad tc-pad--aim"
        data-testid="touch-aim"
        data-aim-fire-enabled={settings.aimFireEnabled}
        role="group"
        aria-label="Aim and fire pad"
        onPointerDown={beginAim}
        onPointerMove={updateAim}
        onPointerUp={endAim}
        onPointerCancel={endAim}
        onLostPointerCapture={endAim}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="tc-pad__crosshair" aria-hidden="true">
          <span />
          <span />
        </span>
        <span className="tc-pad__ring" aria-hidden="true" />
        <span ref={aimKnobRef} className="tc-pad__knob" aria-hidden="true" />
        <span ref={aimLabelRef} className="tc-pad__label">
          {settings.aimFireEnabled ? "AIM + FIRE" : "AIM"}
        </span>
      </div>

      <button
        type="button"
        className={`tc-action tc-action--fire${settings.aimFireEnabled ? " is-secondary" : ""}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setTouchFireButton(true);
          latchTouchFire(event.timeStamp);
        }}
        onPointerUp={(event) => {
          setTouchFireButton(false);
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Capture may already be released.
          }
        }}
        onPointerCancel={() => setTouchFireButton(false)}
        onLostPointerCapture={() => setTouchFireButton(false)}
        data-testid="touch-fire"
        aria-label="Fire weapon"
      >
        <Swords aria-hidden="true" />
        <span>FIRE</span>
      </button>

      <button
        type="button"
        className="tc-action tc-action--jump"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          queueTouchJump();
          setTouchJumpHeld(true);
        }}
        onPointerUp={(event) => {
          setTouchJumpHeld(false);
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Capture may already be released.
          }
        }}
        onPointerCancel={() => setTouchJumpHeld(false)}
        onLostPointerCapture={() => setTouchJumpHeld(false)}
        data-testid="touch-jump"
        aria-label="Jump and jetpack"
      >
        <Gauge aria-hidden="true" />
        <span>JUMP</span>
      </button>

      <button
        type="button"
        className="tc-action tc-action--reload"
        onPointerDown={(event) => {
          event.preventDefault();
          queueTouchReload();
          audio.play("uiSelect");
        }}
        data-testid="touch-reload"
        aria-label="Reload weapon"
      >
        <RotateCw aria-hidden="true" />
        <span>RELOAD</span>
      </button>

      {online ? (
        <button
          type="button"
          className="tc-action tc-action--grenade"
          onPointerDown={(event) => {
            event.preventDefault();
            const next = (selectedGrenadeIndex + 1) % 3;
            bridge.send({ type: "select-grenade", slot: next });
            queueTouchGrenadeSlot(next);
            audio.play("uiSelect");
          }}
          data-testid="touch-grenade"
          aria-label={`Select grenade. Current ${selectedGrenadeLabel}`}
        >
          <span className={`tc-grenade-dot is-${snapshot.grenadeSelected}`} aria-hidden="true" />
          <span>{selectedGrenadeCount}</span>
        </button>
      ) : null}

      {online ? (
        <button
          type="button"
          className="tc-action tc-action--throw"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "throw-grenade" });
            queueTouchGrenadeThrow();
          }}
          data-testid="touch-throw-grenade"
          aria-label="Throw grenade"
        >
          <span className="tc-throw-mark" aria-hidden="true">G</span>
          <span>THROW</span>
        </button>
      ) : null}

      {online ? (
        <button
          type="button"
          className="tc-action tc-action--medkit"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "use-medkit" });
            queueTouchMedkit();
            audio.play("uiSelect");
          }}
          data-testid="touch-medkit"
          aria-label="Use medkit"
        >
          <ShieldPlus aria-hidden="true" />
          <span>{snapshot.medkits}</span>
        </button>
      ) : null}

      {online ? (
        <button
          type="button"
          className="tc-action tc-action--swap"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "swap-weapon" });
            queueTouchSwap();
            audio.play("uiSelect");
          }}
          data-testid="touch-swap"
          aria-label="Pick up or swap nearby loot"
        >
          <span className="tc-swap-mark" aria-hidden="true">E</span>
          <span>PICKUP</span>
        </button>
      ) : null}

      <div className="tc-weapons" aria-label="Weapon slots">
        {(snapshot.weaponSlots.length > 0
          ? snapshot.weaponSlots
          : [1, 2, 3].map((slot) => ({
              slot,
              owned: false,
              shortName: "EMPTY",
              ammo: 0,
              magazineSize: 0,
              active: slot === 1,
            }))
        ).map((slot) => (
          <button
            type="button"
            key={slot.slot}
            className={`tc-weapon${slot.active ? " is-active" : ""}`}
            data-testid={`touch-weapon-${slot.slot}`}
            aria-label={`Equip ${slot.shortName}`}
            onPointerDown={(event) => {
              event.preventDefault();
              bridge.send({ type: "equip-weapon", slot: slot.slot - 1 });
              audio.play("uiSelect");
            }}
          >
            <strong>{slot.slot}</strong>
            <span>{slot.owned ? `${slot.ammo}` : "—"}</span>
          </button>
        ))}
      </div>

      <span className="tc-hidden-identity" aria-hidden="true">
        {playerName} LVL {level}
      </span>
      <span className="sr-only">
        Touch controls active. Left pad moves and pushes up to fly. Right pad
        rotates your aim and fires while your thumb is down. Tap to fire once,
        release to stop. Active weapon{" "}
        {activeSlot?.shortName ?? snapshot.weaponShortName}.
      </span>
    </div>
  );
}
