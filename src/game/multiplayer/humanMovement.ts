import { PLAYER_CONFIG, JETPACK_CONFIG, JETPACK_MAX_RISE_SPEED, JETPACK_THRUST_ACCELERATION } from "@/game/config/gameplay";
import { stepJetpack } from "@/game/core/jetpack";
import type { JetpackState } from "@/game/core/jetpack";
import { segmentIntersectsRect, type Rect } from "@/game/arena/collision";

export const HUMAN_HALF_WIDTH = 26;
export const HUMAN_HEIGHT = 118;

export interface HumanKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  thrusting: boolean;
  coyoteMs: number;
  jetpack: JetpackState;
  wasGrounded: boolean;
}

export interface MovementInput {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export interface MovementWorld {
  width: number;
  height: number;
  platforms: readonly Rect[];
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

function overlapsBody(
  x: number,
  y: number,
  rect: Rect,
  halfWidth = HUMAN_HALF_WIDTH,
  height = HUMAN_HEIGHT,
): boolean {
  return (
    x + halfWidth > rect.x &&
    x - halfWidth < rect.x + rect.width &&
    y > rect.y &&
    y - height < rect.y + rect.height
  );
}

export function createHumanKinematics(x: number, y: number): HumanKinematics {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: false,
    thrusting: false,
    coyoteMs: PLAYER_CONFIG.coyoteMs,
    jetpack: {
      fuel: JETPACK_CONFIG.maxFuel,
      msSinceThrust: JETPACK_CONFIG.regenDelayMs,
    },
    wasGrounded: false,
  };
}

/**
 * Shared server/client movement model. This is a deterministic AABB version of
 * the P1 Arcade Physics controller, used by the authoritative server and by
 * client-side prediction.
 */
export function stepHumanKinematics(
  state: HumanKinematics,
  input: MovementInput,
  dtMs: number,
  world: MovementWorld,
): { jumped: boolean; landed: boolean } {
  const dt = Math.min(dtMs, 50) / 1000;
  const bodyHeight = HUMAN_HEIGHT;
  let jumped = false;
  let landed = false;

  state.wasGrounded = state.grounded;
  if (state.grounded) {
    state.coyoteMs = PLAYER_CONFIG.coyoteMs;
    state.jetpack.msSinceThrust = Math.max(
      state.jetpack.msSinceThrust,
      JETPACK_CONFIG.regenDelayMs,
    );
  } else {
    state.coyoteMs = Math.max(0, state.coyoteMs - dtMs);
  }

  if (input.jumpPressed && state.coyoteMs > 0) {
    state.vy = -PLAYER_CONFIG.jumpSpeed;
    state.coyoteMs = 0;
    state.grounded = false;
    jumped = true;
  }

  const targetSpeed = Math.max(-1, Math.min(1, input.moveX)) * PLAYER_CONFIG.moveSpeed;
  if (Math.abs(input.moveX) > 0.01) {
    const acceleration = state.grounded
      ? PLAYER_CONFIG.groundAcceleration
      : PLAYER_CONFIG.airAcceleration;
    state.vx = approach(state.vx, targetSpeed, acceleration * dt);
  } else {
    const friction = state.grounded
      ? PLAYER_CONFIG.groundFriction
      : PLAYER_CONFIG.airFriction;
    state.vx = approach(state.vx, 0, friction * dt);
  }

  const thrusting =
    input.jumpHeld && !state.grounded && !jumped && state.jetpack.fuel > 0.25;
  const jetpackStep = stepJetpack(
    state.jetpack,
    { thrustRequested: thrusting, dtMs },
    JETPACK_CONFIG,
  );
  state.jetpack = jetpackStep.state;
  state.thrusting = jetpackStep.thrusting;
  if (jetpackStep.thrusting) {
    state.vy = Math.max(
      -JETPACK_MAX_RISE_SPEED,
      state.vy - JETPACK_THRUST_ACCELERATION * dt,
    );
  }

  state.vy += 1800 * dt;
  state.vy = Math.min(state.vy, PLAYER_CONFIG.maxFallSpeed);

  // Horizontal pass.
  state.x += state.vx * dt;
  for (const platform of world.platforms) {
    if (
      state.x + HUMAN_HALF_WIDTH > platform.x &&
      state.x - HUMAN_HALF_WIDTH < platform.x + platform.width &&
      state.y > platform.y + 2 &&
      state.y - bodyHeight < platform.y + platform.height - 2
    ) {
      if (state.vx > 0) {
        state.x = platform.x - HUMAN_HALF_WIDTH;
        state.vx = 0;
      } else if (state.vx < 0) {
        state.x = platform.x + platform.width + HUMAN_HALF_WIDTH;
        state.vx = 0;
      }
    }
  }

  // Vertical pass.
  state.grounded = false;
  state.y += state.vy * dt;
  for (const platform of world.platforms) {
    if (overlapsBody(state.x, state.y, platform)) {
      if (state.vy > 0) {
        state.y = platform.y;
        state.vy = 0;
        state.grounded = true;
      } else if (state.vy < 0) {
        state.y = platform.y + platform.height + bodyHeight;
        state.vy = 0;
      }
    }
  }

  // Standing probe catches the still frame after landing.
  if (state.vy >= 0) {
    for (const platform of world.platforms) {
      if (
        state.x + HUMAN_HALF_WIDTH > platform.x &&
        state.x - HUMAN_HALF_WIDTH < platform.x + platform.width &&
        Math.abs(state.y - platform.y) <= 1.25
      ) {
        state.grounded = true;
        state.y = platform.y;
        state.vy = 0;
        break;
      }
    }
  }

  if (state.grounded && !state.wasGrounded) {
    landed = true;
  }

  state.x = Math.max(
    HUMAN_HALF_WIDTH,
    Math.min(world.width - HUMAN_HALF_WIDTH, state.x),
  );
  if (state.y > world.height) {
    state.y = world.height;
    state.vy = 0;
  }

  return { jumped, landed };
}

export function humanBodyRect(
  x: number,
  y: number,
): Rect {
  return {
    x: x - HUMAN_HALF_WIDTH,
    y: y - HUMAN_HEIGHT,
    width: HUMAN_HALF_WIDTH * 2,
    height: HUMAN_HEIGHT,
  };
}

export function humanHasLineOfSight(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  platforms: readonly Rect[],
): boolean {
  return !platforms.some((platform) =>
    segmentIntersectsRect(x, y - 58, targetX, targetY, platform),
  );
}
