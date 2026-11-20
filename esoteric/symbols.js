import { stamp, inkMask } from './ink.js';

// Object stamps on a 36-pixel square. Dots leave the ground showing through.
// The player is his spiral; the portrait and the cut stair treads follow marks in his room drawing.
const stamps = {
  // His spiral, drawn by hand (decision 301), traced as it is on the grid, wobbles and
  // the small marks inside it kept. White on the dark, his black on white inverted.
  player: `
..........##..............
........#########.........
......#############.......
.....################.#...
....#####.......######....
...####...........#####...
..####..............###...
..###....#######.....###..
.###.....##########..###..
.###....##......####..##..
###....##........###..###.
###...###........###..###.
###...###..#.....###..####
###...###..#.##..###..####
###...###..#.#...###..####
.##....###.......##...###.
.###....##......###...###.
..##.....##########...###.
..###.....######.##.####..
..####...........######...
...####........#######....
....####...........##.....
.....####.................
......###########.........
.........########.........
...........#####..........`,

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

  // The mother (November 20): "use Orda art for this - combine with letter m". The Crooked
  // Hand m, a bar with three stems hanging from it, under the Orda mother's small head; the
  // outer stems are her long strands, sweeping out. The draft he chose ("I think this is good
  // for the mother"), as it was drawn.
  mother: `
...........####...........
..........######..........
.....################.....
....##################....
...###..###.######..###...
...##.......##.#.....##...
...##.......##.......##...
...##.......##.......##...
...##.......##.......##...
..##........##.......###..
..##........##.......###..
..##........##........#...
..##........##........##..
..##........##........##..
..##........##........##..
.###........##........###.
.##.........##........###.
.##.........##.........##.
###.........##.........###
##..........##..........##
##......................##`,

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

// Items lying on the floor, thrown there (decision 307): small, rough, each its own.
const items = {
  sword: `
............###
...........###.
..........###..
.........###...
........###....
.......###.....
..##..###......
...#####.......
....###........
...#####.......
..##..##.......
.##............
##.............`,

  key: `
..####...
.##..##..
.#....#..
.##..##..
..####...
...##....
...##....
...####..
...##....
...###...
...##....`,

  worms: `
.##.....##.....
#..#...#..#...#
....###....###.
...............
..##.....##....
.#..#...#..#..#
#....###....##.`,
};

// The spiral is drawn at two thirds of the size it was traced at (decision 310): about 17
// of the square's 36 pixels across instead of 26, every pixel of the tracing kept, each
// two thirds as large.
const SCALES = { player: 2 / 3 };

// A stamp centred in the square, its pixels `k` of the square's each.
function stampUrl(rows, k = 1) {
  const lines = rows.trim().split('\n');
  const width = Math.max(...lines.map((line) => line.length));
  const left = k === 1 ? Math.floor((36 - width) / 2) : 18 - width * k / 2;
  const top = k === 1 ? Math.floor((36 - lines.length) / 2) : 18 - lines.length * k / 2;
  const path = stamp(left, top, rows.trim(), k);
  return inkMask(36, path);
}

const masks = Object.fromEntries(Object.entries(stamps).map(([kind, rows]) => [kind, stampUrl(rows, SCALES[kind])]));
const itemMasks = Object.fromEntries(Object.entries(items).map(([key, rows]) => [key, stampUrl(rows)]));

// An item on the floor, by its key.
export function itemMask(key) {
  return itemMasks[key] ?? itemMasks.sword;
}

// Stairs in the wall (decision 251): treads that get smaller toward the edge go down;
// bigger toward the edge go up (253). The drawn stair narrows toward its top, so it is
// turned to narrow toward the side of the room it is in.
const STAIR_TURNS = {
  n: '',
  s: 'matrix(1 0 0 -1 0 36)',
  e: 'rotate(90 18 18)',
  w: 'rotate(-90 18 18)',
};
// Each of the three treads, from the top of the drawing, is drawn smaller than the
// drawing has it, across and down: gently (decision 281), the bottom one as much as the
// middle one (285), and shorter as well as narrower (288). Across, a tread is squeezed
// about the stair's middle; the gaps between treads shrink with them; and the whole stair
// is centred in its square (290).
const TREAD_SCALES = [0.8, 0.9, 0.9];
const stairsPath = (() => {
  const lines = stamps.stairs.trim().split('\n');
  const width = Math.max(...lines.map((line) => line.length));
  const middle = 18;
  const treads = [];
  let gap = 0;
  lines.forEach((row) => {
    if (!row.includes('#')) { gap++; return; }
    if (!treads.length || gap) treads.push({ gapBefore: gap, rows: [] });
    gap = 0;
    treads.at(-1).rows.push([...row.matchAll(/#+/g)].map((run) => [run.index - width / 2, run[0].length]));
  });
  treads.forEach((tread, i) => { tread.k = TREAD_SCALES[Math.min(i, TREAD_SCALES.length - 1)]; });
  const gapAbove = (tread, i) => (i ? tread.gapBefore * (tread.k + treads[i - 1].k) / 2 : 0);
  const height = treads.reduce((sum, tread, i) => sum + gapAbove(tread, i) + tread.rows.length * tread.k, 0);
  let y = (36 - height) / 2;
  let path = '';
  treads.forEach((tread, i) => {
    y += gapAbove(tread, i);
    const h = tread.k.toFixed(3);
    for (const runs of tread.rows) {
      for (const [x, length] of runs) {
        const w = (length * tread.k).toFixed(3);
        path += `M${(middle + x * tread.k).toFixed(3)} ${y.toFixed(3)}h${w}v${h}h-${w}z`;
      }
      y += tread.k;
    }
  });
  return path;
})();
const downMasks = Object.fromEntries(Object.entries(STAIR_TURNS).map(([side, turn]) => [side, inkMask(36, stairsPath, turn)]));

// The stairs down in the wall on side 'n', 'e', 's' or 'w'.
export function stairsDownMask(side) {
  return downMasks[side];
}

// The stairs up: the same treads widening toward the edge, as the stairs down on the
// opposite side are drawn.
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
export function stairsUpMask(side) {
  return downMasks[OPPOSITE[side]];
}

// Open doors have no ink. An actor or corpse on the same cell supplies its own stamp.
export function symbolMask(kind) {
  return masks[kind];
}
