// Line of sight inside one room. Walls, the bust and the locked golden door block
// it; a wall cell itself is seen when sight reaches it. No range limit.
//
// los(a, b) is true when a straight line either way is clear, so it is
// symmetric: if you see the toad, it sees you.

const blocksSight = (c) => c === 'wall' || c === 'golddoor' || c === 'statue';
// Drawn with the walls: shown when a walkable cell beside it is in sight.
const solid = (c) => c === 'wall' || c === 'door' || c === 'golddoor' || c === 'statue' || c === 'upstairs';

// Is every cell strictly between a and b free of wall? (Bresenham, a to b.)
function clearLine(t, ax, ay, bx, by, size) {
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
    if (blocksSight(t[y * size + x])) return false;
  }
}

// t: one square room's terrain.
export function los(t, ax, ay, bx, by, size = Math.sqrt(t.length)) {
  return clearLine(t, ax, ay, bx, by, size) || clearLine(t, bx, by, ax, ay, size);
}

// For drawing only: sight plus every wall or door cell touching (8 ways) a
// walkable cell in sight, so the room's frame has no gaps. Never used for
// what blocks sight, what the toad sees, or whether it is drawn.
export function frame(t, seen) {
  const size = Math.sqrt(t.length);
  const out = seen.slice();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (out[i] || !solid(t[i])) continue;
      for (let dy = -1; dy <= 1 && !out[i]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const j = ny * size + nx;
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

// Every cell seen from (x, y), as an array of booleans.
export function fov(t, x, y) {
  const size = Math.sqrt(t.length);
  const seen = new Array(t.length);
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) seen[cy * size + cx] = los(t, x, y, cx, cy, size);
  }
  return seen;
}
