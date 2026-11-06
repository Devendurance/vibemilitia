import type Phaser from "phaser";

/** Pixel budget. Phones have high density but limited fill rate. */
const MAX_PIXELS_TOUCH = 1_900_000;
const MAX_PIXELS_DESKTOP = 3_700_000;
const MAX_SCALE = 2;
const SLOW_FRAME_MS = 24;
const WINDOW_FRAMES = 100;

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

/**
 * Renders at device resolution within a pixel budget, follows container size,
 * and drops density if a device cannot hold frame rate. Phaser RESIZE mode only
 * renders at CSS pixels, which is why fighters looked soft on phones.
 */
export class RenderScaler {
  scale: number;
  private readonly parent: HTMLElement;
  private readonly touch: boolean;
  private game: Phaser.Game | null = null;
  private observer: ResizeObserver | null = null;
  private frameTotal = 0;
  private frameCount = 0;
  private slowWindows = 0;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.touch =
      typeof window !== "undefined" &&
      (window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0);
    const { width, height } = this.cssSize();
    this.scale = chooseRenderScale(
      width,
      height,
      window.devicePixelRatio || 1,
      this.touch,
    );
  }

  private cssSize(): { width: number; height: number } {
    return {
      width: Math.max(320, this.parent.clientWidth || 1440),
      height: Math.max(240, this.parent.clientHeight || 810),
    };
  }

  gameSize(): { width: number; height: number } {
    const { width, height } = this.cssSize();
    return {
      width: Math.round(width * this.scale),
      height: Math.round(height * this.scale),
    };
  }

  attach(game: Phaser.Game): void {
    this.game = game;
    this.observer = new ResizeObserver(() => this.apply());
    this.observer.observe(this.parent);
    game.events.once("destroy", () => this.detach());
  }

  private detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.game = null;
  }

  private apply(): void {
    const game = this.game;
    if (!game) return;
    const { width, height } = this.gameSize();
    if (game.scale.zoom !== 1 / this.scale) game.scale.setZoom(1 / this.scale);
    if (game.scale.width !== width || game.scale.height !== height) {
      game.scale.resize(width, height);
    }
  }

  observeFrame(frameMs: number): void {
    if (this.scale <= 1 || frameMs > 250) return;
    this.frameTotal += frameMs;
    this.frameCount += 1;
    if (this.frameCount < WINDOW_FRAMES) return;
    const average = this.frameTotal / this.frameCount;
    this.frameTotal = 0;
    this.frameCount = 0;
    this.slowWindows = average > SLOW_FRAME_MS ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2) {
      this.slowWindows = 0;
      this.scale = Math.max(1, this.scale - 0.25);
      this.apply();
    }
  }
}
