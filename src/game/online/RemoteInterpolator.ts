const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 260;
const MAX_EXTRAPOLATION_MS = 50;
const TELEPORT_DISTANCE = 300;
const MAX_SAMPLES = 16;

interface Sample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
}

function wrapAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/**
 * Maps server time onto local time and picks a playback delay. The delay
 * follows measured arrival jitter, so a steady link stays close to live and a
 * bursty one trades a little delay for smooth motion.
 */
export class SnapshotClock {
  private offset: number | null = null;
  private jitter = 0;
  private delayMs = MIN_DELAY_MS;

  observe(serverMs: number, localMs: number): void {
    const sample = serverMs - localMs;
    if (this.offset === null) {
      this.offset = sample;
      return;
    }
    const difference = sample - this.offset;
    if (Math.abs(difference) > 500) {
      // Clock step or a long stall. Start again rather than slewing for seconds.
      this.offset = sample;
      this.jitter = 0;
      return;
    }
    this.jitter += (Math.abs(difference) - this.jitter) * 0.08;
    // Follow the newest arrivals faster than late ones, which are the outliers.
    this.offset += difference * (difference > 0 ? 0.1 : 0.02);
    const target = Math.max(
      MIN_DELAY_MS,
      Math.min(MAX_DELAY_MS, 60 + this.jitter * 3),
    );
    this.delayMs += (target - this.delayMs) * 0.05;
  }

  /** Server time to draw remote players at, for this local instant. */
  playbackTime(localMs: number): number | null {
    return this.offset === null ? null : localMs + this.offset - this.delayMs;
  }

  get playbackDelayMs(): number {
    return this.delayMs;
  }

  get jitterMs(): number {
    return this.jitter;
  }
}

/** Timestamped playback of one remote combatant. */
export class RemoteInterpolator {
  private samples: Sample[] = [];

  push(t: number, x: number, y: number, vx: number, vy: number, aim: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return;
    if (last && Math.hypot(x - last.x, y - last.y) > TELEPORT_DISTANCE) {
      this.samples = [];
    }
    this.samples.push({ t, x, y, vx, vy, aim });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  clear(): void {
    this.samples = [];
  }

  sample(t: number): { x: number; y: number; aim: number } | null {
    const samples = this.samples;
    if (samples.length === 0) return null;
    const first = samples[0];
    if (t <= first.t) return { x: first.x, y: first.y, aim: first.aim };
    for (let index = samples.length - 1; index > 0; index -= 1) {
      const from = samples[index - 1];
      const to = samples[index];
      if (t >= from.t && t <= to.t) {
        const span = Math.max(1, to.t - from.t);
        const blend = (t - from.t) / span;
        return {
          x: from.x + (to.x - from.x) * blend,
          y: from.y + (to.y - from.y) * blend,
          aim: from.aim + wrapAngle(to.aim - from.aim) * blend,
        };
      }
    }
    const last = samples[samples.length - 1];
    const ahead = Math.min(MAX_EXTRAPOLATION_MS, t - last.t) / 1000;
    return { x: last.x + last.vx * ahead, y: last.y + last.vy * ahead, aim: last.aim };
  }
}
