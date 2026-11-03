import { segmentIntersectsRect, type Rect } from "@/game/arena/collision";

export interface NavGrid {
  width: number;
  height: number;
  cellSize: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  obstacles: Rect[];
}

export interface NavPoint {
  x: number;
  y: number;
}

interface OpenNode {
  index: number;
  score: number;
}

function pushOpen(heap: OpenNode[], node: OpenNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].score <= heap[index].score) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popOpen(heap: OpenNode[]): OpenNode | undefined {
  if (heap.length === 0) return undefined;
  const root = heap[0];
  const last = heap.pop();
  if (last && heap.length > 0) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].score < heap[smallest].score) {
        smallest = left;
      }
      if (right < heap.length && heap[right].score < heap[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return root;
}

export function isCellOpen(grid: NavGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.blocked[row * grid.cols + col] === 0;
}

function cellCenter(grid: NavGrid, col: number, row: number): NavPoint {
  return {
    x: Math.min(grid.width, col * grid.cellSize + grid.cellSize / 2),
    y: Math.min(grid.height, row * grid.cellSize + grid.cellSize / 2),
  };
}

function cellAt(grid: NavGrid, point: NavPoint): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(grid.cols - 1, Math.floor(point.x / grid.cellSize))),
    row: Math.max(0, Math.min(grid.rows - 1, Math.floor(point.y / grid.cellSize))),
  };
}

export function nearestOpenCell(
  grid: NavGrid,
  point: NavPoint,
): { col: number; row: number } | null {
  const start = cellAt(grid, point);
  if (isCellOpen(grid, start.col, start.row)) return start;

  for (let radius = 1; radius <= 6; radius += 1) {
    for (let row = start.row - radius; row <= start.row + radius; row += 1) {
      for (let col = start.col - radius; col <= start.col + radius; col += 1) {
        if (Math.abs(col - start.col) !== radius && Math.abs(row - start.row) !== radius) {
          continue;
        }
        if (isCellOpen(grid, col, row)) return { col, row };
      }
    }
  }
  return null;
}

export function lineClear(
  a: NavPoint,
  b: NavPoint,
  obstacles: readonly Rect[],
): boolean {
  return !obstacles.some((rect) => segmentIntersectsRect(a.x, a.y, b.x, b.y, rect));
}

function smoothPath(grid: NavGrid, points: NavPoint[]): NavPoint[] {
  if (points.length <= 2) return points;
  const output: NavPoint[] = [];
  let anchor = 0;
  output.push(points[0]);

  while (anchor < points.length - 1) {
    let farthest = anchor + 1;
    for (let candidate = points.length - 1; candidate > anchor; candidate -= 1) {
      if (lineClear(points[anchor], points[candidate], grid.obstacles)) {
        farthest = candidate;
        break;
      }
    }
    output.push(points[farthest]);
    anchor = farthest;
  }

  return output;
}

export function findPath(
  grid: NavGrid,
  startPoint: NavPoint,
  goalPoint: NavPoint,
): NavPoint[] | null {
  const start = nearestOpenCell(grid, startPoint);
  const goal = nearestOpenCell(grid, goalPoint);
  if (!start || !goal) return null;

  const startIndex = start.row * grid.cols + start.col;
  const goalIndex = goal.row * grid.cols + goal.col;
  const count = grid.cols * grid.rows;
  const gScore = new Float32Array(count);
  gScore.fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(count);
  cameFrom.fill(-1);
  const closed = new Uint8Array(count);
  const inOpen = new Uint8Array(count);
  const open: OpenNode[] = [];
  const diagonal = Math.SQRT2;

  const heuristic = (col: number, row: number): number => {
    const dx = Math.abs(col - goal.col);
    const dy = Math.abs(row - goal.row);
    return Math.max(dx, dy) + (diagonal - 1) * Math.min(dx, dy);
  };

  gScore[startIndex] = 0;
  pushOpen(open, { index: startIndex, score: heuristic(start.col, start.row) });
  inOpen[startIndex] = 1;

  const directions = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, diagonal],
    [1, -1, diagonal],
    [-1, 1, diagonal],
    [-1, -1, diagonal],
  ] as const;

  while (open.length > 0) {
    const current = popOpen(open);
    if (!current) break;
    if (closed[current.index]) continue;
    closed[current.index] = 1;
    inOpen[current.index] = 0;

    if (current.index === goalIndex) {
      const cells: number[] = [];
      let cursor = goalIndex;
      while (cursor !== -1) {
        cells.push(cursor);
        if (cursor === startIndex) break;
        cursor = cameFrom[cursor];
      }
      cells.reverse();
      const points = cells.map((index) => {
        const row = Math.floor(index / grid.cols);
        const col = index % grid.cols;
        return cellCenter(grid, col, row);
      });
      // If the exact goal is in open space, append it for a precise finish. The
      // final cell center stays as the safe fallback.
      if (
        points.length > 0 &&
        lineClear(points[points.length - 1], goalPoint, grid.obstacles)
      ) {
        const last = points[points.length - 1];
        if (last.x !== goalPoint.x || last.y !== goalPoint.y) {
          points.push({ x: goalPoint.x, y: goalPoint.y });
        }
      }
      return smoothPath(grid, points);
    }

    const currentRow = Math.floor(current.index / grid.cols);
    const currentCol = current.index % grid.cols;
    for (const [dx, dy, cost] of directions) {
      const col = currentCol + dx;
      const row = currentRow + dy;
      if (!isCellOpen(grid, col, row)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!isCellOpen(grid, currentCol + dx, currentRow)) continue;
        if (!isCellOpen(grid, currentCol, currentRow + dy)) continue;
      }
      const neighbor = row * grid.cols + col;
      if (closed[neighbor]) continue;
      const tentative = gScore[current.index] + cost;
      if (tentative >= gScore[neighbor]) continue;
      cameFrom[neighbor] = current.index;
      gScore[neighbor] = tentative;
      if (!inOpen[neighbor]) {
        pushOpen(open, {
          index: neighbor,
          score: tentative + heuristic(col, row),
        });
        inOpen[neighbor] = 1;
      } else {
        // Reinsertion keeps the heap correct for the improved path.
        pushOpen(open, {
          index: neighbor,
          score: tentative + heuristic(col, row),
        });
      }
    }
  }

  return null;
}

export function buildNavigationGrid(
  width: number,
  height: number,
  platforms: readonly Rect[],
  clearance = 40,
  cellSize = 64,
): NavGrid {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const blocked = new Uint8Array(cols * rows);
  const obstacles = platforms.map((platform) => ({
    x: platform.x - clearance,
    y: platform.y - clearance,
    width: platform.width + clearance * 2,
    height: platform.height + clearance * 2,
  }));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellSize + cellSize / 2;
      const y = row * cellSize + cellSize / 2;
      const nearEdge =
        x < clearance ||
        y < clearance ||
        x > width - clearance ||
        y > height - clearance;
      const inside = obstacles.some(
        (rect) =>
          x >= rect.x &&
          x <= rect.x + rect.width &&
          y >= rect.y &&
          y <= rect.y + rect.height,
      );
      if (nearEdge || inside) {
        blocked[row * cols + col] = 1;
      }
    }
  }

  return { width, height, cellSize, cols, rows, blocked, obstacles };
}
