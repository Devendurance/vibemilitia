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
}

export const touchInput: MutableTouchInput = {
  enabled: false,
  moveX: 0,
  aimAngle: null,
  fire: false,
  jumpHeld: false,
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
  touchInput.jumpHeld = false;
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

export function setTouchAim(angle: number | null): void {
  touchInput.aimAngle =
    angle === null || !Number.isFinite(angle) ? null : angle;
}

export function setTouchFire(fire: boolean): void {
  touchInput.fire = fire;
}

export function setTouchJumpHeld(held: boolean): void {
  touchInput.jumpHeld = held;
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
    fire: touchInput.fire,
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
