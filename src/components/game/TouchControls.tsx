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
  setTouchEnabled,
  setTouchFire,
  setTouchJumpHeld,
  setTouchMove,
} from "@/game/input/touchInput";

const STICK_RADIUS = 52;
const DEAD_ZONE = 0.18;

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
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0 });
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0 });
  const movePointer = useRef<number | null>(null);
  const aimPointer = useRef<number | null>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTouchEnabled(true);
    const unsubscribe = bridge.subscribe(setSnapshot);
    const reset = () => {
      resetTouchInput();
      setMoveKnob({ x: 0, y: 0 });
      setAimKnob({ x: 0, y: 0 });
      movePointer.current = null;
      aimPointer.current = null;
    };
    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      unsubscribe();
      resetTouchInput();
      setTouchEnabled(false);
      window.removeEventListener("blur", reset);
      window.removeEventListener("orientationchange", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [bridge]);

  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    movePointer.current = event.pointerId;
    const vector = stickVector(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    setTouchMove(Math.abs(vector.x) > DEAD_ZONE ? vector.x : 0);
    setMoveKnob({ x: vector.x * STICK_RADIUS, y: 0 });
  };

  const updateMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointer.current !== event.pointerId) return;
    const vector = stickVector(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    const moveX = Math.abs(vector.x) > DEAD_ZONE ? vector.x : 0;
    setTouchMove(moveX);
    setMoveKnob({ x: vector.x * STICK_RADIUS, y: 0 });
  };

  const endMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointer.current !== event.pointerId) return;
    movePointer.current = null;
    setTouchMove(0);
    setMoveKnob({ x: 0, y: 0 });
  };

  const beginAim = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    aimPointer.current = event.pointerId;
    const vector = stickVector(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    if (vector.distance >= DEAD_ZONE) {
      setTouchAim(Math.atan2(vector.y, vector.x));
      setAimKnob({ x: vector.x * STICK_RADIUS, y: vector.y * STICK_RADIUS });
    }
  };

  const updateAim = (event: React.PointerEvent<HTMLDivElement>) => {
    if (aimPointer.current !== event.pointerId) return;
    const vector = stickVector(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    if (vector.distance < DEAD_ZONE) return;
    setTouchAim(Math.atan2(vector.y, vector.x));
    setAimKnob({ x: vector.x * STICK_RADIUS, y: vector.y * STICK_RADIUS });
  };

  const endAim = (event: React.PointerEvent<HTMLDivElement>) => {
    if (aimPointer.current !== event.pointerId) return;
    aimPointer.current = null;
    setAimKnob({ x: 0, y: 0 });
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
        className="touch-stick touch-stick--move"
        ref={moveRef}
        data-testid="touch-move"
        role="group"
        aria-label="Move joystick"
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
        <span className="touch-stick__label mono-label">MOVE</span>
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
        className="touch-stick touch-stick--aim"
        ref={aimRef}
        data-testid="touch-aim"
        role="group"
        aria-label="Aim control"
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
        <span className="touch-stick__label mono-label">AIM</span>
      </div>

      <div className="touch-actions">
        <button
          type="button"
          className="touch-button touch-button--settings"
          onPointerDown={(event) => {
            event.preventDefault();
            onSettings();
          }}
          data-testid="touch-settings"
          aria-label="Open settings"
        >
          SETTINGS
        </button>
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
          onPointerUp={() => setTouchJumpHeld(false)}
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
            setTouchFire(true);
          }}
          onPointerUp={() => setTouchFire(false)}
          onPointerCancel={() => setTouchFire(false)}
          onLostPointerCapture={() => setTouchFire(false)}
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
