import type Phaser from "phaser";

/** Pixel budget. Phones have high density but limited fill rate. */
const MAX_PIXELS_TOUCH = 1_900_000;
const MAX_PIXELS_DESKTOP = 3_700_000;
const MAX_SCALE = 2;
const SLOW_FRAME_MS = 24;
const WINDOW_FRAMES = 100;
/** A drop must buy at least this much, or the device is not fill-rate limited. */
const MIN_DROP_GAIN = 0.08;
/** Browser toolbars take less height than this, so smaller shrinks are ignored. */
const TOOLBAR_SHRINK_RATIO = 0.75;
const HISTORY_LIMIT = 40;

export function chooseRenderScale(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  touch: boolean,
): number {
  const budget = touch ? MAX_PIXELS_TOUCH : MAX_PIXELS_DESKTOP;
  const fit = Math.sqrt(budget / Math.max(1, cssWidth * cssHeight));
  const scale = Math.min(devicePixelRatio, MAX_SCALE, fit);
  return Math.max(1, Math.round(scale * 4) / 4);
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
  reason: string;
  css: Size;
  backing: Size;
  renderScale: number;
  worldZoom: number;
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
  private frameTotal = 0;
  private frameCount = 0;
  private slowWindows = 0;
  /** Set after a drop: the frame time it has to beat, and where to go back to. */
  private trial: { averageMs: number; scale: number } | null = null;
  private settled = false;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.phone = isPhoneLike();
    this.touch = this.phone || navigator.maxTouchPoints > 0;
    this.css = this.measure();
    this.scale = chooseRenderScale(
      this.css.width,
      this.css.height,
      window.devicePixelRatio || 1,
      this.touch,
    );
    this.zoom = this.chooseWorldZoom();
    this.applyCssSize();
    this.record("boot");
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
    game.events.once("destroy", () => this.detach());
  }

  /** The scene applies camera zoom here, in the same task as the resize. */
  setChangeListener(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  private detach(): void {
    this.observer?.disconnect();
    this.observer = null;
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

  private apply(reason: string): void {
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

  private record(reason: string): void {
    this.history.push({
      atMs: Math.round(performance.now()),
      reason,
      css: { ...this.css },
      backing: this.gameSize(),
      renderScale: this.scale,
      worldZoom: this.zoom,
    });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  /** Development probe: forces the path adaptive quality takes on a slow GPU. */
  debugSetScale(scale: number): void {
    this.scale = Math.max(1, Math.min(MAX_SCALE, scale));
    this.apply("debug");
  }

  observeFrame(frameMs: number): void {
    if (this.settled || this.scale <= 1 || frameMs > 250) return;
    this.frameTotal += frameMs;
    this.frameCount += 1;
    if (this.frameCount < WINDOW_FRAMES) return;
    const average = this.frameTotal / this.frameCount;
    this.frameTotal = 0;
    this.frameCount = 0;

    if (this.trial) {
      const { averageMs, scale } = this.trial;
      this.trial = null;
      // A phone pinned to 30 Hz by battery saver stays at 33 ms at any density.
      if (average > averageMs * (1 - MIN_DROP_GAIN)) {
        this.settled = true;
        this.scale = scale;
        this.apply("restore");
        return;
      }
    }

    this.slowWindows = average > SLOW_FRAME_MS ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2) {
      this.slowWindows = 0;
      this.trial = { averageMs: average, scale: this.scale };
      this.scale = Math.max(1, this.scale - 0.25);
      this.apply("adaptive");
    }
  }
}
