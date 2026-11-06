import {
  createHumanKinematics,
  stepHumanKinematics,
  type HumanKinematics,
  type MovementInput,
  type MovementWorld,
} from "@/game/multiplayer/humanMovement";

export const FIXED_TICK_MS = 1000 / 60;
/** A correction this large is a teleport, respawn or knockback. Do not glide it. */
const SNAP_DISTANCE = 220;
/** Visual error half-life. Long enough to hide a correction, short enough to feel honest. */
const CORRECTION_HALF_LIFE_MS = 70;
/** Unacknowledged movement kept for replay: 1.5 seconds. */
const MAX_PENDING_TICKS = 90;

export interface AuthoritativeMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  thrusting: boolean;
  fuel: number;
  coyoteMs?: number;
  thrustIdleMs?: number;
  ackSeq: number;
  ackTicks?: number;
}

interface PendingTick {
  seq: number;
  index: number;
  input: MovementInput;
}

function cloneKinematics(state: HumanKinematics): HumanKinematics {
  return { ...state, jetpack: { ...state.jetpack } };
}

/**
 * Client-side prediction for the local player.
 *
 * The client runs the same fixed-tick movement code as the server and tags each
 * tick with the input packet it belongs to. When a snapshot arrives it restarts
 * from that authoritative past state and replays the ticks the server has not
 * reached yet. The result is where the player should be now. Any difference
 * from what was on screen becomes a decaying visual offset, so a correction is
 * never drawn as a jump and a correct prediction produces no motion at all.
 *
 * Comparing the predicted position directly with a snapshot is the bug this
 * replaced. A snapshot is RTT old, so that compares now against the past and
 * drags a moving player backwards on every snapshot.
 */
export class LocalPredictor {
  private state: HumanKinematics;
  private previous: { x: number; y: number };
  private pending: PendingTick[] = [];
  private accumulator = 0;
  private offsetX = 0;
  private offsetY = 0;
  private readonly world: MovementWorld;
  lastCorrection = 0;
  snaps = 0;

  constructor(motion: AuthoritativeMotion, world: MovementWorld) {
    this.world = world;
    this.state = createHumanKinematics(motion.x, motion.y);
    this.previous = { x: motion.x, y: motion.y };
    this.applyAuthority(motion);
  }

  get kinematics(): Readonly<HumanKinematics> {
    return this.state;
  }

  get pendingTicks(): number {
    return this.pending.length;
  }

  private applyAuthority(motion: AuthoritativeMotion): void {
    const state = this.state;
    state.x = motion.x;
    state.y = motion.y;
    state.vx = motion.vx;
    state.vy = motion.vy;
    state.grounded = motion.grounded;
    state.wasGrounded = motion.grounded;
    state.thrusting = motion.thrusting;
    state.jetpack.fuel = motion.fuel;
    if (motion.coyoteMs !== undefined) state.coyoteMs = motion.coyoteMs;
    if (motion.thrustIdleMs !== undefined) {
      state.jetpack.msSinceThrust = motion.thrustIdleMs;
    }
  }

  /** Banks frame time and reports how many fixed ticks are due. */
  bank(dtMs: number): number {
    this.accumulator = Math.min(this.accumulator + dtMs, 250);
    const due = Math.floor(this.accumulator / FIXED_TICK_MS);
    this.accumulator -= due * FIXED_TICK_MS;
    return due;
  }

  /** Runs one fixed tick of movement and remembers it for replay. */
  step(seq: number, index: number, input: MovementInput): void {
    this.previous = { x: this.state.x, y: this.state.y };
    stepHumanKinematics(this.state, input, FIXED_TICK_MS, this.world);
    this.pending.push({ seq, index, input });
    if (this.pending.length > MAX_PENDING_TICKS) this.pending.shift();
  }

  /** Rewinds to a snapshot and replays everything the server has not simulated. */
  reconcile(motion: AuthoritativeMotion): void {
    const before = { x: this.state.x, y: this.state.y };
    const ackTicks = motion.ackTicks;
    this.pending = this.pending.filter((tick) => {
      if (tick.seq > motion.ackSeq) return true;
      if (tick.seq < motion.ackSeq) return false;
      return ackTicks === undefined ? false : tick.index >= ackTicks;
    });
    this.applyAuthority(motion);
    for (const tick of this.pending) {
      stepHumanKinematics(this.state, tick.input, FIXED_TICK_MS, this.world);
    }
    const errorX = before.x - this.state.x;
    const errorY = before.y - this.state.y;
    const error = Math.hypot(errorX, errorY);
    this.lastCorrection = error;
    this.previous.x -= errorX;
    this.previous.y -= errorY;
    if (error > SNAP_DISTANCE) {
      this.offsetX = 0;
      this.offsetY = 0;
      this.previous = { x: this.state.x, y: this.state.y };
      this.snaps += 1;
    } else {
      this.offsetX += errorX;
      this.offsetY += errorY;
    }
  }

  /** Smooth on-screen position for this frame. */
  render(dtMs: number): { x: number; y: number } {
    const decay = Math.pow(0.5, dtMs / CORRECTION_HALF_LIFE_MS);
    this.offsetX *= decay;
    this.offsetY *= decay;
    if (Math.abs(this.offsetX) < 0.01) this.offsetX = 0;
    if (Math.abs(this.offsetY) < 0.01) this.offsetY = 0;
    // Project forward from the newest tick rather than blending back from the
    // last two, which would add one tick of input latency to every frame.
    const alpha = this.accumulator / FIXED_TICK_MS;
    const stepX = this.state.x - this.previous.x;
    const stepY = this.state.grounded ? 0 : this.state.y - this.previous.y;
    return {
      x: this.state.x + stepX * alpha + this.offsetX,
      y: this.state.y + stepY * alpha + this.offsetY,
    };
  }

  /** Copy of the simulated state, for tests and diagnostics. */
  snapshot(): HumanKinematics {
    return cloneKinematics(this.state);
  }
}
