"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge, HudSnapshot } from "@/game/bridge";
import { audio } from "@/game/audio/AudioEngine";
import {
  queueTouchGrenadeSlot,
  queueTouchGrenadeThrow,
  queueTouchJump,
  queueTouchMedkit,
  queueTouchReload,
  queueTouchSwap,
  resetTouchInput,
  setTouchAim,
  setTouchAimFire,
  setTouchEnabled,
  setTouchFireButton,
  setTouchJumpHeld,
  setTouchMove,
  setTouchThrustHeld,
} from "@/game/input/touchInput";
import { getTouchSettings, type TouchSettings } from "@/game/input/touchSettings";

const STICK_RADIUS = 52;

function stickVector(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number; distance: number } {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = Math.max(24, Math.min(rect.width, rect.height) / 2);
  const rawX = (clientX - centerX) / radius;
  const rawY = (clientY - centerY) / radius;
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > 1 ? 1 / distance : 1;
  return { x: rawX * scale, y: rawY * scale, distance };
}

export function TouchControls({
  bridge,
  onSettings,
  playerName,
  level,
}: {
  bridge: GameBridge;
  onSettings: () => void;
  playerName: string;
  level: number;
}) {
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() =>
    bridge.getSnapshot(),
  );
  const [settings, setSettings] = useState<TouchSettings>(() =>
    getTouchSettings(),
  );
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0 });
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0 });
  const [autoFire, setAutoFire] = useState(false);
  const [thrusting, setThrusting] = useState(false);
  const movePointer = useRef<number | null>(null);
  const aimPointer = useRef<number | null>(null);
  const thrustRef = useRef(false);
  const moveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTouchEnabled(true);
    const unsubscribe = bridge.subscribe(setSnapshot);
    const reset = () => {
      resetTouchInput();
      setMoveKnob({ x: 0, y: 0 });
      setAimKnob({ x: 0, y: 0 });
      setAutoFire(false);
      setThrusting(false);
      thrustRef.current = false;
      movePointer.current = null;
      aimPointer.current = null;
    };
    const preventGesture = (event: Event) => event.preventDefault();
    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    document.addEventListener("visibilitychange", reset);
    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    return () => {
      unsubscribe();
      resetTouchInput();
      setTouchEnabled(false);
      window.removeEventListener("blur", reset);
      window.removeEventListener("orientationchange", reset);
      document.removeEventListener("visibilitychange", reset);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
    };
  }, [bridge]);

  useEffect(() => {
    const updateSettings = (event: Event) => {
      setSettings((event as CustomEvent<TouchSettings>).detail);
    };
    window.addEventListener("vibe-touch-settings", updateSettings);
    return () => {
      window.removeEventListener("vibe-touch-settings", updateSettings);
    };
  }, []);

  const applyMoveVector = (
    vector: { x: number; y: number },
  ) => {
    const moveX =
      Math.abs(vector.x) > settings.leftDeadZone ? vector.x : 0;
    setTouchMove(moveX);
    setMoveKnob({
      x: vector.x * STICK_RADIUS,
      y: vector.y * STICK_RADIUS,
    });
    const thrust = vector.y <= -settings.thrustThreshold;
    if (thrust && !thrustRef.current) {
      queueTouchJump();
    }
    thrustRef.current = thrust;
    setThrusting(thrust);
    setTouchThrustHeld(thrust);
  };

  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    movePointer.current = event.pointerId;
    applyMoveVector(
      stickVector(event.currentTarget, event.clientX, event.clientY),
    );
  };

  const updateMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointer.current !== event.pointerId) return;
    applyMoveVector(
      stickVector(event.currentTarget, event.clientX, event.clientY),
    );
  };

  const endMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointer.current !== event.pointerId) return;
    movePointer.current = null;
    setTouchMove(0);
    setTouchThrustHeld(false);
    setMoveKnob({ x: 0, y: 0 });
    setThrusting(false);
    thrustRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
  };

  const applyAimVector = (
    vector: { x: number; y: number; distance: number },
  ) => {
    if (vector.distance < settings.rightDeadZone) {
      setTouchAimFire(false);
      setAutoFire(false);
      return;
    }
    setTouchAim(Math.atan2(vector.y, vector.x));
    setAimKnob({
      x: vector.x * STICK_RADIUS,
      y: vector.y * STICK_RADIUS,
    });
    const poweredDistance = Math.min(1.5, vector.distance) * settings.aimSensitivity;
    const firing =
      settings.aimFireEnabled &&
      poweredDistance >= settings.aimFireThreshold;
    setTouchAimFire(firing);
    setAutoFire(firing);
  };

  const beginAim = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    aimPointer.current = event.pointerId;
    applyAimVector(
      stickVector(event.currentTarget, event.clientX, event.clientY),
    );
  };

  const updateAim = (event: React.PointerEvent<HTMLDivElement>) => {
    if (aimPointer.current !== event.pointerId) return;
    applyAimVector(
      stickVector(event.currentTarget, event.clientX, event.clientY),
    );
  };

  const endAim = (event: React.PointerEvent<HTMLDivElement>) => {
    if (aimPointer.current !== event.pointerId) return;
    aimPointer.current = null;
    setTouchAimFire(false);
    setAutoFire(false);
    setAimKnob({ x: 0, y: 0 });
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

  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="touch-hud" data-testid="touch-hud">
        <div className="touch-hud__identity">
          <strong>{playerName.toUpperCase()}</strong>
          <span className="mono-label">LVL {level}</span>
        </div>
        <div className="touch-hud__stats">
          <span className={`touch-hud__stat${snapshot.health <= 30 ? " is-danger" : ""}`}>
            HP {snapshot.health}
          </span>
          <span className="touch-hud__stat">FUEL {snapshot.fuel}</span>
          <span className="touch-hud__stat">
            {snapshot.weaponShortName} {snapshot.ammo}/{snapshot.magazineSize}
          </span>
          <span className="touch-hud__stat">
            {Math.max(0, Math.ceil(snapshot.matchTimeRemainingMs / 1000))}S
          </span>
        </div>
      </div>
      <div
        className={`touch-stick touch-stick--move${thrusting ? " is-thrusting" : ""}`}
        ref={moveRef}
        data-testid="touch-move"
        data-thrusting={thrusting}
        role="group"
        aria-label="Move and fly joystick"
        onPointerDown={beginMove}
        onPointerMove={updateMove}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onLostPointerCapture={endMove}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="touch-stick__ring" aria-hidden="true" />
        <span
          className="touch-stick__knob"
          style={{ transform: `translate(${moveKnob.x}px, ${moveKnob.y}px)` }}
          aria-hidden="true"
        />
        <span className="touch-stick__label mono-label">
          {thrusting ? "THRUST" : "MOVE"}
        </span>
      </div>

      <div className="touch-tools">
        <button
          type="button"
          className="touch-button touch-button--small"
          onPointerDown={(event) => {
            event.preventDefault();
            queueTouchReload();
            audio.play("uiSelect");
          }}
          data-testid="touch-reload"
          aria-label="Reload weapon"
        >
          R
          <span>RELOAD</span>
        </button>
        <button
          type="button"
          className="touch-button touch-button--small"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "swap-weapon" });
            queueTouchSwap();
            audio.play("uiSelect");
          }}
          data-testid="touch-swap"
          aria-label="Swap weapon with nearby loot"
        >
          E
          <span>SWAP</span>
        </button>
        <button
          type="button"
          className="touch-button touch-button--small"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "use-medkit" });
            queueTouchMedkit();
            audio.play("uiSelect");
          }}
          data-testid="touch-medkit"
          aria-label="Use medkit"
        >
          H
          <span>MEDKIT {snapshot.medkits}</span>
        </button>
      </div>

      <div className="touch-weapons" aria-label="Weapon slots">
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
            className={`touch-weapon${slot.active ? " is-active" : ""}`}
            data-testid={`touch-weapon-${slot.slot}`}
            aria-label={`Equip ${slot.shortName}`}
            onPointerDown={(event) => {
              event.preventDefault();
              bridge.send({ type: "equip-weapon", slot: slot.slot - 1 });
              audio.play("uiSelect");
            }}
          >
            <strong>{slot.slot}</strong>
            <span>
              {slot.owned
                ? `${slot.ammo}/${slot.magazineSize}`
                : "EMPTY"}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`touch-stick touch-stick--aim${autoFire ? " is-firing" : ""}`}
        ref={aimRef}
        data-testid="touch-aim"
        data-auto-fire={autoFire}
        data-aim-fire-enabled={settings.aimFireEnabled}
        role="group"
        aria-label="Aim and optional auto-fire control"
        onPointerDown={beginAim}
        onPointerMove={updateAim}
        onPointerUp={endAim}
        onPointerCancel={endAim}
        onLostPointerCapture={endAim}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="touch-stick__ring" aria-hidden="true" />
        <span
          className="touch-stick__knob"
          style={{ transform: `translate(${aimKnob.x}px, ${aimKnob.y}px)` }}
          aria-hidden="true"
        />
        <span className="touch-stick__label mono-label">
          {autoFire ? "FIRING" : "AIM"}
        </span>
      </div>

      <button
        type="button"
        className="touch-button touch-button--settings touch-settings-button"
        onPointerDown={(event) => {
          event.preventDefault();
          onSettings();
        }}
        data-testid="touch-settings"
        aria-label="Open settings"
      >
        SETTINGS
      </button>

      <div className="touch-actions">
        <button
          type="button"
          className="touch-button touch-button--grenade"
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
          {selectedGrenadeLabel}
          <span>{selectedGrenadeCount}</span>
        </button>
        <button
          type="button"
          className="touch-button touch-button--throw"
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.send({ type: "throw-grenade" });
            queueTouchGrenadeThrow();
          }}
          data-testid="touch-throw-grenade"
          aria-label="Throw grenade"
        >
          G
        </button>
        <button
          type="button"
          className="touch-button touch-button--jump"
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
          JUMP
        </button>
        <button
          type="button"
          className="touch-button touch-button--fire"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setTouchFireButton(true);
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
          FIRE
          <span>{activeSlot?.shortName ?? "READY"}</span>
        </button>
      </div>
    </div>
  );
}
