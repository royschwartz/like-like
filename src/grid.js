// All levels of an edition have the same square rooms. Indexing is bound to the
// room's width so two editions can be played, saved or replayed independently.
const grids = new Map();
export function roomGrid(size) {
  if (!grids.has(size)) {
    const mid = (size - 1) >> 1;
    grids.set(size, {
      size,
      mid,
      idx: (x, y) => y * size + x,
      inside: (x, y) => x > 0 && y > 0 && x < size - 1 && y < size - 1,
      doors: { n: [mid, 0], e: [size - 1, mid], s: [mid, size - 1], w: [0, mid] },
      arrivals: { n: [mid, 1], e: [size - 2, mid], s: [mid, size - 2], w: [1, mid] },
    });
  }
  return grids.get(size);
}

export const terrainGrid = (terrain) => roomGrid(Math.sqrt(terrain.length));
