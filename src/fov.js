// Line of sight inside one room. Walls, the bust and the locked golden door block
// it; a wall cell itself is seen when sight reaches it. No range limit.
//
// los(a, b) is true when a straight line either way is clear, so it is
// symmetric: if you see a goblin, it sees you.

import { CONFIG } from './config.js';

const S = CONFIG.roomSize;

const blocksSight = (c) => c === 'wall' || c === 'golddoor' || c === 'statue';
// Drawn with the walls: shown when a walkable cell beside it is in sight.
const solid = (c) => c === 'wall' || c === 'door' || c === 'golddoor' || c === 'statue';

// Is every cell strictly between a and b free of wall? (Bresenham, a to b.)
function clearLine(t, ax, ay, bx, by) {
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  let x = ax;
  let y = ay;
  for (;;) {
    if (x === bx && y === by) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === bx && y === by) return true;
    if (blocksSight(t[y * S + x])) return false;
  }
}

// t: the room's 121 terrain names.
export function los(t, ax, ay, bx, by) {
  return clearLine(t, ax, ay, bx, by) || clearLine(t, bx, by, ax, ay);
}

// For drawing only: sight plus every wall or door cell touching (8 ways) a
// walkable cell in sight, so the room's frame has no gaps. Never used for
// what blocks sight, what goblins see, or whether a goblin is drawn.
export function frame(t, seen) {
  const out = seen.slice();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (out[i] || !solid(t[i])) continue;
      for (let dy = -1; dy <= 1 && !out[i]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const j = ny * S + nx;
          if (seen[j] && !solid(t[j])) {
            out[i] = true;
            break;
          }
        }
      }
    }
  }
  return out;
}

// Every cell seen from (x, y), as an array of 121 booleans.
export function fov(t, x, y) {
  const seen = new Array(S * S);
  for (let cy = 0; cy < S; cy++) {
    for (let cx = 0; cx < S; cx++) seen[cy * S + cx] = los(t, x, y, cx, cy);
  }
  return seen;
}
