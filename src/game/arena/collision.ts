export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/**
 * Liang-Barsky segment versus axis-aligned rectangle test. Used for drone
 * line-of-sight so projectiles cannot fire through solid terrain.
 */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
  inflate = 0,
): boolean {
  const left = rect.x - inflate;
  const right = rect.x + rect.width + inflate;
  const top = rect.y - inflate;
  const bottom = rect.y + rect.height + inflate;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-8) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return false;
      if (r > tMin) tMin = r;
    } else {
      if (r < tMin) return false;
      if (r < tMax) tMax = r;
    }
    return true;
  };

  return (
    clip(-dx, x1 - left) &&
    clip(dx, right - x1) &&
    clip(-dy, y1 - top) &&
    clip(dy, bottom - y1)
  );
}
