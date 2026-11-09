import type Phaser from "phaser";

import { AdaptiveQuality, type EffectsLevel, type QualityReason } from "@/game/online/adaptiveQuality";
import {
  getQualityPreference,
  subscribeQuality,
  type QualityPreference,
} from "@/game/online/qualityPreference";

/** Pixel budgets. Density costs fill rate, and small GPUs have little to spare. */
const MAX_PIXELS_WEAK = 1_200_000;
const MAX_PIXELS_TOUCH = 1_900_000;
const MAX_PIXELS_CAPABLE = 2_600_000;
const MAX_PIXELS_DESKTOP = 3_700_000;
const MAX_SCALE = 2;
/** Browser toolbars take less height than this, so smaller shrinks are ignored. */
const TOOLBAR_SHRINK_RATIO = 0.75;
const HISTORY_LIMIT = 40;

/**
 * Entry and older mid-range tablet and phone GPUs. Adaptive quality still decides
 * from measured frames, so a wrong guess costs a few seconds, not the session.
 */
const WEAK_GPU = /mali-(t|g3|g5[0-9]\b|g6[0-9]\b)|adreno \(tm\) (3|4|5|6[0-4])|powervr|ge8|img bxm/i;
const CAPABLE_GPU = /apple|adreno \(tm\) (6[5-9]|7|8)|mali-g(7|9)|immortalis|xclipse/i;

/** Start budget for a device. Viewport size never decides this alone. */
export function pixelBudget(touch: boolean, renderer: string): number {
  if (!touch) return MAX_PIXELS_DESKTOP;
  if (WEAK_GPU.test(renderer)) return MAX_PIXELS_WEAK;
  if (CAPABLE_GPU.test(renderer)) return MAX_PIXELS_CAPABLE;
  return MAX_PIXELS_TOUCH;
}

/** Floors to a quarter step, so the result can never exceed the budget. */
export function chooseRenderScale(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  budget: number,
): number {
  const fit = Math.sqrt(budget / Math.max(1, cssWidth * cssHeight));
  const scale = Math.min(devicePixelRatio, MAX_SCALE, fit);
  return Math.max(1, Math.floor(scale * 4) / 4);
}

function readRenderer(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "") : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

/** World units to CSS pixels. Short screens see more of the arena. */
export function worldZoomFor(width: number, height: number): number {
  const compact = height < 600 || width / Math.max(1, height) > 1.95;
  return compact ? Math.max(0.56, Math.min(0.9, height / 620)) : 1;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Decides the canvas size for a measured container. Growing is always accepted
 * so no gap can show, and a width change is a real layout change. A small loss
 * of height is a browser toolbar: the canvas stays put and the frame clips it.
 */
export function nextCanvasSize(current: Size, measured: Size): Size {
  if (Math.abs(measured.width - current.width) > 2) return measured;
  if (measured.height > current.height) return measured;
  if (measured.height < current.height * TOOLBAR_SHRINK_RATIO) return measured;
  return current;
}

export interface RenderEvent {
  atMs: number;
  reason: QualityReason | "boot" | "resize" | "debug" | "preference";
  css: Size;
  backing: Size;
  renderScale: number;
  worldZoom: number;
  effects: EffectsLevel;
}

function isPhoneLike(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Owns the three sizes behind the picture, which are separate concerns:
 *
 * - CSS size: the canvas box on the page.
 * - Render scale: backing pixels per CSS pixel. Quality only.
 * - World zoom: CSS pixels per world unit. This is what a player sees.
 *
 * The camera renders at `worldZoom * renderScale`, so density can change at any
 * moment with no change in apparent size. On a phone world zoom comes from the
 * physical screen, which browser toolbars cannot change.
 *
 * Phaser's own zoom stays at 1. Its `resize` skips the canvas style when zoom is
 * 1, so stepping from a fractional zoom to 1 left the old, larger CSS size in
 * place and enlarged the whole world by 25%.
 */
export class RenderScaler {
  scale: number;
  readonly history: RenderEvent[] = [];
  private readonly parent: HTMLElement;
  private readonly touch: boolean;
  private readonly phone: boolean;
  private css: Size;
  private zoom: number;
  private game: Phaser.Game | null = null;
  private observer: ResizeObserver | null = null;
  private onChange: (() => void) | null = null;
  /** Null when the player pinned a quality, so nothing adapts. */
  private adaptive: AdaptiveQuality | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly renderer: string;
  effects: EffectsLevel = "full";
  preference: QualityPreference;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.phone = isPhoneLike();
    this.touch = this.phone || navigator.maxTouchPoints > 0;
    this.css = this.measure();
    this.renderer = readRenderer();
    this.preference = getQualityPreference();
    this.scale = 1;
    this.applyPreference();
    this.zoom = this.chooseWorldZoom();
    this.applyCssSize();
    this.record("boot");
  }

  /** Target scale for the current size and preference, before any adapting. */
  private targetScale(): number {
    const budget =
      this.preference === "sharp" ? MAX_PIXELS_DESKTOP : pixelBudget(this.touch, this.renderer);
    return chooseRenderScale(this.css.width, this.css.height, window.devicePixelRatio || 1, budget);
  }

  private applyPreference(): void {
    this.adaptive = null;
    if (this.preference === "smooth") {
      this.scale = 1;
      this.effects = "reduced";
      return;
    }
    this.scale = this.targetScale();
    this.effects = "full";
    if (this.preference === "auto") this.adaptive = new AdaptiveQuality(this.scale);
  }

  /** What the benchmark and the diagnostics view read. */
  get adaptiveState(): { frameMs: number; workMs: number } | null {
    return this.adaptive
      ? { frameMs: this.adaptive.lastFrameMs, workMs: this.adaptive.lastWorkMs }
      : null;
  }

  /** CSS pixels per world unit. Independent of render scale by construction. */
  get worldZoom(): number {
    return this.zoom;
  }

  get cssSize(): Size {
    return this.css;
  }

  private measure(): Size {
    return {
      width: Math.max(320, this.parent.clientWidth || 1440),
      height: Math.max(240, this.parent.clientHeight || 810),
    };
  }

  private chooseWorldZoom(): number {
    if (this.phone && window.screen?.width && window.screen?.height) {
      return worldZoomFor(
        Math.max(window.screen.width, window.screen.height),
        Math.min(window.screen.width, window.screen.height),
      );
    }
    return worldZoomFor(this.css.width, this.css.height);
  }

  private applyCssSize(): void {
    this.parent.style.setProperty("--canvas-w", `${this.css.width}px`);
    this.parent.style.setProperty("--canvas-h", `${this.css.height}px`);
  }

  gameSize(): Size {
    return {
      width: Math.round(this.css.width * this.scale),
      height: Math.round(this.css.height * this.scale),
    };
  }

  attach(game: Phaser.Game): void {
    this.game = game;
    this.observer = new ResizeObserver(() => this.onContainerResize());
    this.observer.observe(this.parent);
    this.unsubscribe = subscribeQuality(() => {
      const preference = getQualityPreference();
      if (preference === this.preference) return;
      this.preference = preference;
      this.applyPreference();
      this.apply("preference");
    });
    game.events.once("destroy", () => this.detach());
  }

  /** The scene applies camera zoom here, in the same task as the resize. */
  setChangeListener(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  private detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.game = null;
    this.onChange = null;
  }

  private onContainerResize(): void {
    const measured = this.measure();
    const next = nextCanvasSize(this.css, measured);
    if (next.width === this.css.width && next.height === this.css.height) return;
    this.css = next;
    this.zoom = this.chooseWorldZoom();
    this.apply("resize");
  }

  private apply(reason: RenderEvent["reason"]): void {
    const game = this.game;
    if (!game) return;
    this.applyCssSize();
    const { width, height } = this.gameSize();
    if (game.scale.width !== width || game.scale.height !== height) {
      game.scale.resize(width, height);
    } else {
      game.scale.refresh();
    }
    this.onChange?.();
    this.record(reason);
  }

  private record(reason: RenderEvent["reason"]): void {
    this.history.push({
      atMs: Math.round(performance.now()),
      reason,
      css: { ...this.css },
      backing: this.gameSize(),
      renderScale: this.scale,
      worldZoom: this.zoom,
      effects: this.effects,
    });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  /** Development probe: forces the path adaptive quality takes on a slow GPU. */
  debugSetScale(scale: number): void {
    this.adaptive = null;
    this.scale = Math.max(1, Math.min(MAX_SCALE, scale));
    this.apply("debug");
  }

  /** `workMs` is main-thread time in the game step, the rest of the frame is waiting. */
  observeFrame(frameMs: number, workMs: number): void {
    if (!this.adaptive) return;
    const reason = this.adaptive.observe(frameMs, workMs, performance.now());
    if (!reason) return;
    this.scale = this.adaptive.state.scale;
    this.effects = this.adaptive.state.effects;
    this.apply(reason);
  }
}
