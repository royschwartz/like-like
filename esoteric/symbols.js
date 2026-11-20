import { stamp, inkMask } from './ink.js';

// Object stamps on a 36-pixel square. Dots leave the ground showing through.
// The eye, the portrait and the cut stair treads follow the three marks in the drawing.
const stamps = {
  player: `
...##..............##...
...##..............##...
....##............##....
.....##..........##.....
......#####..#####......
.....#####....#####.....
....###.........###.....
....##...........##.....
....##...........##.....
....##...........##.....
...###...#####...###....
####.#####....#####.####
####.#####....#####.####
...###...#####...###....
....##...........##.....
....##...........##.....
....##...........##.....
....###.........###.....
.....#####....#####.....
......#####..#####......
.....##..........##.....
....##............##....
...##..............##...
...##..............##...`,

  statue: `
....###########......
.####.........##..#..
##.............#..##.
#..............#..##.
#......##...#..#..##.
#..#...###.....#..##.
#..##...##.....#..##.
#..##..........#..##.
...##......##..#.###.
...###.....##..#.###.
#..###....###..#####.
#..###.........#####.
#..####........#####.
#..####........#####.
#..##################
##.............######
.##...........#######
..####.......######..
.....###########.....`,

  stairs: `
...#####..##..####...
...#####.####.####...
...####...###.####...
...####...###..###...
...####...####.###...
...####....###.###...
.....................
.....................
.....................
..#####..######.###..
..#####..####..####..
..####..####..#####..
..###..####..######..
..###.####..#######..
..#######...#######..
.....................
.....................
.....................
#####..##############
######....###.#######
#######...###..######
#######....###.######
##.####....###.######
###.####...###..#####
########....##..#####`,

  // The entrance has one worn sill and a rope hanging through an open ring.
  entrance: `
........#######......
.....####....###.....
...###.........##....
..##......##....##...
.##......###.....###.
.##.....###.....###..
..###...##....###....
....#####..####......
.......##............
......###............
......##.............
.......##............
........##...........
........##...........
...##..###......##...
.#######.....#####...
###........#####.....
..############.......`,

  // The locked gate hangs in the opening. A single cut catches one facet.
  golddoor: `
.......#.......
......###......
.....#####.....
....#####.#....
...#####..##...
..#####..####..
.#####..######.
#####..########
.####..#######.
..###.#######..
...#########...
....#######....
.....#####.....
......###......
.......#.......`,

  // A collapsed pair of ribs on a snapped spine.
  corpse: `
.......##...........##.
....######.........###.
...##...###......####..
..##.....##....###.....
.###....##...###.......
..###..###..##..####...
....####...##.###..###.
.........###.##.....##.
.......###...###...###.
....####.....########..
..###.........###.##...
.##...........##....##.
##.....................`,
};

function stampUrl(rows) {
  const lines = rows.trim().split('\n');
  const left = Math.floor((36 - Math.max(...lines.map((line) => line.length))) / 2);
  const top = Math.floor((36 - lines.length) / 2);
  const path = stamp(left, top, rows.trim());
  return inkMask(36, path);
}

const masks = Object.fromEntries(Object.entries(stamps).map(([kind, rows]) => [kind, stampUrl(rows)]));

// Stairs in the wall (decision 251): treads that get smaller toward the edge go down;
// bigger toward the edge go up (253). The drawn stair narrows toward its top, so it is
// turned to narrow toward the side of the room it is in.
const STAIR_TURNS = {
  n: '',
  s: 'matrix(1 0 0 -1 0 36)',
  e: 'rotate(90 18 18)',
  w: 'rotate(-90 18 18)',
};
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
// Each of the three treads, from the top of the drawing, is drawn smaller than the
// drawing has it, across and down: gently (decision 281), the bottom one as much as the
// middle one (285), and shorter as well as narrower (288). Across, a tread is squeezed
// about the stair's middle. Down, the treads are packed toward the map's edge (288),
// starting EDGE pixels in from it, with the room's side taking up what's left over.
const TREAD_SCALES = [0.8, 0.9, 0.9];
const EDGE = 1;
const treads = (() => {
  const lines = stamps.stairs.trim().split('\n');
  const width = Math.max(...lines.map((line) => line.length));
  const left = Math.floor((36 - width) / 2);
  const middle = left + width / 2;
  const list = [];
  let gap = 0;
  lines.forEach((row) => {
    if (!row.includes('#')) { gap++; return; }
    if (!list.length || gap) list.push({ gapBefore: gap, rows: [] });
    gap = 0;
    list.at(-1).rows.push([...row.matchAll(/#+/g)].map((run) => [left + run.index - middle, run[0].length]));
  });
  return list.map((tread, i) => ({ ...tread, k: TREAD_SCALES[Math.min(i, TREAD_SCALES.length - 1)], middle }));
})();

// The treads laid out on the drawing's upright square, packed against its top edge
// (atTop) or its bottom edge. A gap between two treads shrinks as much as the two do.
function stairsPath(atTop) {
  const order = atTop ? treads : [...treads].reverse();
  let y = atTop ? EDGE : 36 - EDGE;
  let path = '';
  order.forEach((tread, n) => {
    if (n) {
      const gap = (atTop ? tread.gapBefore : order[n - 1].gapBefore) * (tread.k + order[n - 1].k) / 2;
      y += atTop ? gap : -gap;
    }
    const h = tread.k;
    const rows = atTop ? tread.rows : [...tread.rows].reverse();
    for (const runs of rows) {
      const top = atTop ? y : y - h;
      for (const [x, length] of runs) {
        const w = (length * tread.k).toFixed(3);
        path += `M${(tread.middle + x * tread.k).toFixed(3)} ${top.toFixed(3)}h${w}v${h.toFixed(3)}h-${w}z`;
      }
      y += atTop ? h : -h;
    }
  });
  return path;
}
// Down: the narrow top tread at the edge. Up: the wide bottom tread at the edge, so the
// treads are packed against the bottom and the square is turned as for the opposite side.
const downPath = stairsPath(true);
const upPath = stairsPath(false);
const downMasks = Object.fromEntries(Object.entries(STAIR_TURNS).map(([side, turn]) => [side, inkMask(36, downPath, turn)]));
const upMasks = Object.fromEntries(Object.keys(STAIR_TURNS).map((side) => [side, inkMask(36, upPath, STAIR_TURNS[OPPOSITE[side]])]));

// The stairs down in the wall on side 'n', 'e', 's' or 'w'.
export function stairsDownMask(side) {
  return downMasks[side];
}

// The stairs up: the same treads widening toward the edge.
export function stairsUpMask(side) {
  return upMasks[side];
}

// Open doors have no ink. An actor or corpse on the same cell supplies its own stamp.
export function symbolMask(kind) {
  return masks[kind];
}
