/**
 * Decides render scale and effect level from measured frames. Pure, so every
 * path can be tested without a GPU. It never touches simulation or combat.
 *
 * Each window has two numbers: the frame interval, and the work the main thread
 * spent in the game step. Their ratio says what to change. A step that fills most
 * of the frame is a CPU limit, where fewer pixels buy nothing, so effects drop
 * first. Otherwise the limit is the GPU and resolution drops.
 */
export type EffectsLevel = "full" | "reduced";

export interface QualityState {
  scale: number;
  effects: EffectsLevel;
}

export type QualityReason =
  | "adaptive"
  | "restore"
  | "recover"
  | "effects-reduced"
  | "effects-full";

export const QUALITY_TUNING = {
  windowFrames: 120,
  /** A window also closes on time, or a 3 fps device would wait 40 seconds. */
  windowMs: 2_500,
  /** Longer than this is a hidden tab or a stall, not rendering cost. */
  stallFrameMs: 1_500,
  slowFrameMs: 24,
  fastFrameMs: 19,
  /**
   * Above this share of the frame, the main thread is the limit. The step excludes
   * socket messages and React, measured at about 40% of main-thread script.
   */
  cpuShare: 0.4,
  /** Below this gain a resolution drop bought nothing. */
  minGain: 0.08,
  /** Vsync hides small gains, so one step alone proves little. */
  trialSteps: 2,
  scaleStep: 0.25,
  minScale: 1,
  /** No two changes closer than this, so play never sees resolution churn. */
  holdMs: 6_000,
  /** How long good frames must last before quality climbs back. */
  recoverAfterMs: 45_000,
  firstRetryMs: 30_000,
  maxRetryMs: 240_000,
} as const;

interface Trial {
  baselineMs: number;
  scale: number;
  steps: number;
  windows: number;
}

export class AdaptiveQuality {
  state: QualityState;
  private readonly maxScale: number;
  private frameTotal = 0;
  private workTotal = 0;
  private frames = 0;
  private slowWindows = 0;
  private fastSinceMs: number | null = null;
  private nextChangeAtMs = 0;
  private retryAtMs = 0;
  private retryDelayMs: number = QUALITY_TUNING.firstRetryMs;
  private recoverAtMs = 0;
  private recoverDelayMs: number = QUALITY_TUNING.recoverAfterMs;
  private trial: Trial | null = null;
  /** Set right after climbing: the state to fall back to if frames turn slow. */
  private climb: { from: QualityState; windows: number } | null = null;
  lastFrameMs = 0;
  lastWorkMs = 0;

  constructor(scale: number) {
    this.maxScale = scale;
    this.state = { scale, effects: "full" };
  }

  private change(nowMs: number, next: QualityState, reason: QualityReason): QualityReason {
    this.state = next;
    this.nextChangeAtMs = nowMs + QUALITY_TUNING.holdMs;
    this.slowWindows = 0;
    this.fastSinceMs = null;
    return reason;
  }

  /** Feed one frame. Returns a reason when the state changed. */
  observe(frameMs: number, workMs: number, nowMs: number): QualityReason | null {
    if (frameMs > QUALITY_TUNING.stallFrameMs) return null;
    this.frameTotal += frameMs;
    this.workTotal += workMs;
    this.frames += 1;
    if (this.frames < QUALITY_TUNING.windowFrames && this.frameTotal < QUALITY_TUNING.windowMs) {
      return null;
    }
    const averageMs = this.frameTotal / this.frames;
    const workAverageMs = this.workTotal / this.frames;
    this.frameTotal = 0;
    this.workTotal = 0;
    this.frames = 0;
    this.lastFrameMs = averageMs;
    this.lastWorkMs = workAverageMs;
    return this.evaluate(averageMs, workAverageMs, nowMs);
  }

  private evaluate(averageMs: number, workMs: number, nowMs: number): QualityReason | null {
    if (this.trial) return this.evaluateTrial(averageMs, nowMs);

    const slow = averageMs > QUALITY_TUNING.slowFrameMs;
    if (this.climb) {
      this.climb.windows += 1;
      if (slow && nowMs >= this.nextChangeAtMs) {
        const from = this.climb.from;
        this.climb = null;
        this.recoverDelayMs = Math.min(this.recoverDelayMs * 2, QUALITY_TUNING.maxRetryMs);
        this.recoverAtMs = nowMs + this.recoverDelayMs;
        return this.change(nowMs, from, "restore");
      }
      if (!slow && this.climb.windows >= 4) {
        this.climb = null;
        this.recoverDelayMs = QUALITY_TUNING.recoverAfterMs;
      }
    }

    if (slow) {
      this.fastSinceMs = null;
      this.slowWindows += 1;
      if (this.slowWindows < 2 || nowMs < this.nextChangeAtMs) return null;
      const cpuLimited = workMs >= averageMs * QUALITY_TUNING.cpuShare;
      if (cpuLimited && this.state.effects === "full") {
        return this.change(nowMs, { ...this.state, effects: "reduced" }, "effects-reduced");
      }
      if (cpuLimited || this.state.scale <= QUALITY_TUNING.minScale || nowMs < this.retryAtMs) {
        return null;
      }
      this.trial = { baselineMs: averageMs, scale: this.state.scale, steps: 1, windows: 0 };
      return this.change(nowMs, { ...this.state, scale: this.stepDown() }, "adaptive");
    }

    this.slowWindows = 0;
    if (averageMs >= QUALITY_TUNING.fastFrameMs) {
      this.fastSinceMs = null;
      return null;
    }
    this.fastSinceMs ??= nowMs;
    if (
      nowMs - this.fastSinceMs < QUALITY_TUNING.recoverAfterMs ||
      nowMs < this.recoverAtMs ||
      nowMs < this.nextChangeAtMs
    ) {
      return null;
    }
    if (this.state.effects === "reduced") {
      this.climb = { from: { ...this.state }, windows: 0 };
      return this.change(nowMs, { ...this.state, effects: "full" }, "effects-full");
    }
    if (this.state.scale < this.maxScale) {
      this.climb = { from: { ...this.state }, windows: 0 };
      const scale = Math.min(this.maxScale, this.state.scale + QUALITY_TUNING.scaleStep);
      return this.change(nowMs, { ...this.state, scale }, "recover");
    }
    return null;
  }

  private evaluateTrial(averageMs: number, nowMs: number): QualityReason | null {
    const trial = this.trial as Trial;
    // The window holding the resize itself is not representative.
    trial.windows += 1;
    if (trial.windows < 2 || nowMs < this.nextChangeAtMs) return null;
    trial.windows = 0;
    if (averageMs <= trial.baselineMs * (1 - QUALITY_TUNING.minGain)) {
      this.trial = null;
      this.retryDelayMs = QUALITY_TUNING.firstRetryMs;
      return null;
    }
    if (trial.steps < QUALITY_TUNING.trialSteps && this.state.scale > QUALITY_TUNING.minScale) {
      trial.steps += 1;
      return this.change(nowMs, { ...this.state, scale: this.stepDown() }, "adaptive");
    }
    // A device pinned to 30 Hz by battery saver stays at 33 ms at any density,
    // and that can end, so this backs off and tries again later instead of stopping.
    this.trial = null;
    this.retryAtMs = nowMs + this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, QUALITY_TUNING.maxRetryMs);
    return this.change(nowMs, { ...this.state, scale: trial.scale }, "restore");
  }

  private stepDown(): number {
    return Math.max(QUALITY_TUNING.minScale, this.state.scale - QUALITY_TUNING.scaleStep);
  }
}
