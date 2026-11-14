// Steps in a room, eight ways. A diagonal step may not cut the corner of what stands
// in the way (as Brogue's diagonalBlocked): neither of the two cells it passes between
// may be a wall, the bust or the locked golden door. Creatures never block a corner.
// No chance in here: the same room always gives the same way.

import { CONFIG } from './config.js';

const S = CONFIG.roomSize;
const idx = (x, y) => y * S + x;

// The eight neighbours: the four straight ones first, then the diagonals.
export const NEIGHBOURS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];

const CORNERS = new Set(['wall', 'statue', 'golddoor']);
export const blocksCorner = (c) => CORNERS.has(c);

export const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const inBounds = (x, y) => x >= 0 && y >= 0 && x < S && y < S;

// Does a step by (dx, dy) from (x, y) cut a corner? Never for a straight step.
export function cutsCorner(t, x, y, dx, dy) {
  if (!dx || !dy) return false;
  return blocksCorner(t[idx(x + dx, y)]) || blocksCorner(t[idx(x, y + dy)]);
}

// Is (bx, by) one legal step from (ax, ay)? (What is on either cell is not asked.)
export function isStep(t, ax, ay, bx, by) {
  if (!inBounds(bx, by) || chebyshev(ax, ay, bx, by) !== 1) return false;
  return !cutsCorner(t, ax, ay, bx - ax, by - ay);
}

// Steps from any of `from` (cell indices) to every cell, eight ways; -1 where none.
// pass(i): may the way go on through cell i. The cells of `from` are where it starts,
// passable or not. The corner rule reads the same either way, so this is also the
// number of steps from each cell to the nearest of `from`.
export function stepsFrom(t, from, pass) {
  const dist = new Array(S * S).fill(-1);
  const queue = [];
  for (const i of from) {
    if (dist[i] < 0) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % S;
    const y = (i - x) / S;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (dist[n] >= 0 || !pass(n) || cutsCorner(t, x, y, dx, dy)) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return dist;
}

// The way from (x, y) down a field made by stepsFrom: [{ x, y }], from the first step
// to a cell where the field is 0. [] if (x, y) is already there; null if it can't get
// there. Of the steps that keep to a shortest way, each is the one pointing most nearly
// at (tx, ty), so the way looks like a straight line; ties go to the earlier neighbour.
export function walkDown(t, dist, x, y, tx, ty) {
  if (dist[idx(x, y)] < 0) return null;
  const out = [];
  let cx = x;
  let cy = y;
  while (dist[idx(cx, cy)] > 0) {
    const here = dist[idx(cx, cy)];
    const vx = tx - cx;
    const vy = ty - cy;
    let best = null;
    let bestCos = -Infinity;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny) || dist[idx(nx, ny)] !== here - 1 || cutsCorner(t, cx, cy, dx, dy)) continue;
      const cos = (dx * vx + dy * vy) / Math.hypot(dx, dy);
      if (cos > bestCos + 1e-9) {
        best = [nx, ny];
        bestCos = cos;
      }
    }
    if (!best) return null; // cannot happen with a field from stepsFrom
    [cx, cy] = best;
    out.push({ x: cx, y: cy });
  }
  return out;
}
