"use client";

export interface TouchFrame {
  moveX: number;
  aimAngle: number | null;
  fire: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  reloadPressed: boolean;
  weaponSlotPressed: number | null;
  medkitPressed: boolean;
  grenadeSlotPressed: number | null;
  grenadeThrowPressed: boolean;
  swapPressed: boolean;
}

export interface MutableTouchInput extends TouchFrame {
  enabled: boolean;
  buttonFire: boolean;
  aimFire: boolean;
  buttonJumpHeld: boolean;
  thrustHeld: boolean;
  /** True while a thumb is on the aim pad, used for camera look-ahead. */
  aimActive: boolean;
  /** Set on press, cleared by the next input packet, so a tap cannot miss one. */
  fireLatch: boolean;
  /** Event time of the latest aim change, for input latency telemetry. */
  aimStamp: number;
  /** Event time of the latest press that asked for fire. */
  fireStamp: number;
}

export const touchInput: MutableTouchInput = {
  enabled: false,
  moveX: 0,
  aimAngle: null,
  fire: false,
  buttonFire: false,
  aimFire: false,
  jumpHeld: false,
  buttonJumpHeld: false,
  thrustHeld: false,
  aimActive: false,
  fireLatch: false,
  aimStamp: 0,
  fireStamp: 0,
  jumpPressed: false,
  reloadPressed: false,
  weaponSlotPressed: null,
  medkitPressed: false,
  grenadeSlotPressed: null,
  grenadeThrowPressed: false,
  swapPressed: false,
};

export function setTouchEnabled(enabled: boolean): void {
  touchInput.enabled = enabled;
  if (!enabled) resetTouchInput();
}

export function resetTouchInput(): void {
  touchInput.moveX = 0;
  touchInput.fire = false;
  touchInput.buttonFire = false;
  touchInput.aimFire = false;
  touchInput.jumpHeld = false;
  touchInput.buttonJumpHeld = false;
  touchInput.thrustHeld = false;
  touchInput.aimActive = false;
  touchInput.fireLatch = false;
  touchInput.jumpPressed = false;
  touchInput.reloadPressed = false;
  touchInput.weaponSlotPressed = null;
  touchInput.medkitPressed = false;
  touchInput.grenadeSlotPressed = null;
  touchInput.grenadeThrowPressed = false;
  touchInput.swapPressed = false;
}

export function setTouchMove(moveX: number): void {
  touchInput.moveX = Math.max(-1, Math.min(1, moveX));
}

export function setTouchAim(
  angle: number | null,
  stamp = performance.now(),
): void {
  touchInput.aimAngle =
    angle === null || !Number.isFinite(angle) ? null : angle;
  touchInput.aimStamp = stamp;
}

export function setTouchAimActive(active: boolean): void {
  touchInput.aimActive = active;
}

/**
 * Guarantees the next input packet carries fire. Packets go out every 33 ms, so
 * a tap between two of them would otherwise reach the server as nothing.
 */
export function latchTouchFire(stamp = performance.now()): void {
  touchInput.fireLatch = true;
  touchInput.fireStamp = stamp;
}

export function clearTouchFireLatch(): void {
  touchInput.fireLatch = false;
}

export function setTouchFireButton(fire: boolean): void {
  touchInput.buttonFire = fire;
  touchInput.fire = touchInput.buttonFire || touchInput.aimFire;
}

export function setTouchAimFire(fire: boolean): void {
  touchInput.aimFire = fire;
  touchInput.fire = touchInput.buttonFire || touchInput.aimFire;
}

export function setTouchJumpHeld(held: boolean): void {
  touchInput.buttonJumpHeld = held;
  touchInput.jumpHeld = touchInput.buttonJumpHeld || touchInput.thrustHeld;
}

export function setTouchThrustHeld(held: boolean): void {
  touchInput.thrustHeld = held;
  touchInput.jumpHeld = touchInput.buttonJumpHeld || touchInput.thrustHeld;
}

export function queueTouchJump(): void {
  touchInput.jumpPressed = true;
}

export function queueTouchReload(): void {
  touchInput.reloadPressed = true;
}

export function queueTouchMedkit(): void {
  touchInput.medkitPressed = true;
}

export function queueTouchSwap(): void {
  touchInput.swapPressed = true;
}

export function queueTouchGrenadeSlot(slot: number): void {
  touchInput.grenadeSlotPressed = slot;
}

export function queueTouchGrenadeThrow(): void {
  touchInput.grenadeThrowPressed = true;
}

export function consumeTouchFrame(): TouchFrame | null {
  if (!touchInput.enabled) return null;
  const frame: TouchFrame = {
    moveX: touchInput.moveX,
    aimAngle: touchInput.aimAngle,
    fire: touchInput.fire || touchInput.fireLatch,
    jumpHeld: touchInput.jumpHeld,
    jumpPressed: touchInput.jumpPressed,
    reloadPressed: touchInput.reloadPressed,
    weaponSlotPressed: touchInput.weaponSlotPressed,
    medkitPressed: touchInput.medkitPressed,
    grenadeSlotPressed: touchInput.grenadeSlotPressed,
    grenadeThrowPressed: touchInput.grenadeThrowPressed,
    swapPressed: touchInput.swapPressed,
  };
  touchInput.jumpPressed = false;
  touchInput.reloadPressed = false;
  touchInput.weaponSlotPressed = null;
  touchInput.medkitPressed = false;
  touchInput.grenadeSlotPressed = null;
  touchInput.grenadeThrowPressed = false;
  touchInput.swapPressed = false;
  return frame;
}
