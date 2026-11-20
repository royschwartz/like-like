import { stamp, inkMask } from './ink.js';

// Each brush block is a small piece of ink on a 32-pixel tile. The long
// strokes follow individual crests in the drawing, including its chipped edges.
const swells = [
  stamp(0, 6, `........########...####
......####.###....#####
......######.....######
.......#####.......####..###
...###..#............###.####
...###................##.####
..##......................###.
..##......................####
.##..........................##
##............................##
##.............................#`),
  stamp(0, 5, `.........########...###
.......#########..#######
.......#######....########
.......####.........#######
.....#..##...........#######
...##..................######
..##.....................#####
.###........................###
###..........................###
##............................##
##.............................#
#..............................#`),
  stamp(0, 7, `.................##.#.
..........####....#####
........########...#####
......######.......#####..##
.....#####............###.##
.....####..................#
....###....................####.
..#.#.......................####
###..........................###
##............................##`),
  stamp(0, 8, `.........###...########
......####.##...#########
....####...###...#########
....##..............#######
.......................#####
..##.#..................####.#
.###......................####
####........................####
##............................##`),
];

// The bend runs from the east edge to the south. Turn the same brush to
// follow the room's frame and the walls round the toad's golden door.
const bend = stamp(9, 10, `.........#####.
.......####..#####.
.....####.....#####
.....###........####
...##............####.
...##..............####
..##.................##
.###
.###
.##
##
##
###.
####.
.###.
..###.
...##.
....#.
....##.
.....###
......##
......##`);

// A blunt, broken nib ends an exposed length of wall.
const end = stamp(0, 11, `......###.
....######.
...##...#####.
..##.....#####
.##........####.
##..........###
#............##.
..............##....##.
...............###..##
................#####.
.................##`);

// Three joined strokes. A fourth branch completes the few four-way joins.
const fork = stamp(0, 0, `...............##
...............###
...............###
..............###
.............###
.............##
............##
...........#
...........##
...........##
..........###
.........####
.....###.#####
...####....###
..###........##.
###...........##..............##
##.............###..........####
................##.........###
.................###.....####
..................#########
....................#####`);
const fourthArm = stamp(12, 19, `.....###
......###
.......###
........##
.........##
.........##
........###
........##
.......##
......##
.....##
...###
...##`);

const pillar = stamp(5, 3, `.........####.
.......####..###
......###.....###
......##.......####
....##...........##.
....##............##.
...##.............###
..##...............##.
.###...............##.
.##................###
##..................##
##..................##
#..................##
###................#.
.###.............##
..###............##
..##...........###
....#..........##
....###......####
.....###....####
......##..#####
.......##.###
........###.
.........#`);

const pips = [
  stamp(14, 14, `.##
####
.##`),
  stamp(15, 14, `.#.
###
###`),
  stamp(14, 15, `..#.
.###
###.
.##`),
  stamp(15, 15, `.##
###
.##`),
];

// A grass mark folds over at the top and leaves a little hollow. Loose
// groups make a patch, as in the drawing; adjoining squares stay distinct.
const blades = [
  `..##.
.#..##
##..#
.###
..#
..#`,
  `..##.
.##.#
##..#
.###
.##`,
  `.##.
##.##
.#.#
..##
..#`,
];
function grass(clump) {
  return clump.map(([x, y, blade]) => stamp(x, y, blades[blade])).join('');
}
const clumps = [
  grass([[11, 4, 0], [22, 7, 1], [4, 13, 1], [14, 16, 2], [9, 23, 2]]),
  grass([[7, 6, 1], [18, 9, 0], [11, 16, 2], [22, 21, 1]]),
  grass([[15, 4, 2], [5, 11, 1], [14, 15, 0], [22, 13, 2], [12, 24, 1]]),
  grass([[8, 7, 2], [20, 6, 0], [13, 13, 1], [6, 21, 1], [21, 22, 2]]),
];

const mask = (path, transform) => inkMask(32, path, transform);

function rotate(degrees) {
  return `rotate(${degrees} 16 16)`;
}

const floorMasks = pips.map((path) => mask(path));
const grassMasks = clumps.map((path) => mask(path));
const caps = [0, 90, 180, 270].map((angle) => mask(end, rotate(angle)));
const corners = [0, 90, 180, 270].map((angle) => mask(bend, rotate(angle)));
const forks = [0, 90, 180, 270].map((angle) => mask(fork, rotate(angle)));
const crossing = mask(fork + fourthArm);
const stone = mask(pillar);
const waves = [0, 1, 2, 3].map((orientation) => {
  const turn = orientation >= 2 ? rotate(90) : '';
  const flip = orientation % 2 ? 'translate(0 32) scale(1 -1)' : '';
  return swells.map((stroke) => mask(stroke, `${turn} ${flip}`));
});
// Most swells flow into a hollow. Occasionally two swells meet at a point,
// as they do along the top of the drawn room.
const rhythm = [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1];

const N = 1, E = 2, S = 4, W = 8;
const wallMasks = {
  0: stone,
  [W]: caps[0], [N]: caps[1], [E]: caps[2], [S]: caps[3],
  [E | S]: corners[0], [S | W]: corners[1], [W | N]: corners[2], [N | E]: corners[3],
  [W | N | E]: forks[0], [N | E | S]: forks[1],
  [E | S | W]: forks[2], [S | W | N]: forks[3],
  [N | E | S | W]: crossing,
};

function wallEdges(x, y, cells, size) {
  function joins(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return false;
    const cell = cells[cy * size + cx];
    return cell && cell.state !== 'unknown' &&
      (cell.t === 'wall' || cell.t === 'door' || cell.t === 'golddoor' || cell.t === 'opendoor');
  }
  return (joins(x, y - 1) ? N : 0) | (joins(x + 1, y) ? E : 0) |
    (joins(x, y + 1) ? S : 0) | (joins(x - 1, y) ? W : 0);
}

// Only the view is available here. The wall stops at the edge of what was
// seen, even when there's another length of wall beyond it in the real room.
export function terrainMask(tile, x, y, cells, size, roomKey) {
  const seed = Math.imul(x + 1, 179) ^ Math.imul(y + 1, 541) ^ (roomKey | 0);
  const variation = (seed ^ (seed >>> 3) ^ (seed >>> 7)) & 3;
  if (tile === 'floor') return floorMasks[variation];
  if (tile === 'grass') return grassMasks[variation];
  if (tile !== 'wall') return null;
  const edges = wallEdges(x, y, cells, size);
  if (edges === (E | W)) {
    const beat = rhythm[(x + 3 * y + (roomKey >>> 2)) & 15];
    return waves[beat][variation];
  }
  if (edges === (N | S)) {
    const beat = rhythm[(y + 3 * x + (roomKey >>> 6)) & 15];
    return waves[2 + beat][variation];
  }
  return wallMasks[edges];
}
