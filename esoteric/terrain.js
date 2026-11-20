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

// The grass has its own 48-pixel grid. One unit is two pixels in the
// drawing: green (#), white (+), and open space between the two tips.
const grassSize = 48;
const sprig = `...+++....
...###....
...###....
..##..##++
+###...##+
+##....#++
++#...##..
.+#..##...
.....#+...
....##+...
.....++...`;
const glints = sprig.replaceAll('#', '.').replaceAll('+', '#');

function sprigMasks(points) {
  const layer = (drawing) => inkMask(grassSize,
    points.map(([x, y]) => stamp(x, y, drawing)).join(''));
  return { green: layer(sprig), white: layer(glints) };
}

// The seven sprigs of the drawing are one arrangement across four tiles.
// Cutting the same artwork at the tile edges keeps the seam-crossing leaves
// whole. Positions are measured from the upper left of the four squares.
const drawnGrass = [[43, 19], [76, 25], [27, 35], [45, 39], [60, 41], [53, 54], [30, 57]];
const grassQuarters = [[0, 0], [48, 0], [0, 48], [48, 48]].map(([left, top]) => {
  const points = drawnGrass.map(([x, y]) => [x - left, y - top])
    .filter(([x, y]) => x > -10 && x < grassSize && y > -11 && y < grassSize);
  return sprigMasks(points);
});

// Other patch shapes have room for one to three sprigs in each square.
// The whole grouping leans toward the adjoining grass, with a different
// arrangement as its length or direction changes.
const looseGrass = [
  [[9, 16], [23, 23]],
  [[18, 18]],
  [[10, 25], [23, 9]],
  [[8, 16], [22, 9], [25, 28]],
];
const looseMasks = new Map();

// The sprigs are laid out from the grass as it is in the room, seen or not, so a
// patch keeps its arrangement as more of it comes into view (decision 282).
export function grassMasks(x, y, cells, size, roomKey) {
  function grassAt(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return false;
    return cells[cy * size + cx]?.t === 'grass';
  }
  const west = grassAt(x - 1, y);
  const east = grassAt(x + 1, y);
  const north = grassAt(x, y - 1);
  const south = grassAt(x, y + 1);
  const dx = Number(east) - Number(west);
  const dy = Number(south) - Number(north);
  if (dx && dy && grassAt(x + dx, y + dy)) {
    const left = Math.min(x, x + dx);
    const top = Math.min(y, y + dy);
    const extendsAcross = [top, top + 1].some(cy => grassAt(left - 1, cy) || grassAt(left + 2, cy));
    const extendsDown = [left, left + 1].some(cx => grassAt(cx, top - 1) || grassAt(cx, top + 2));
    if (!extendsAcross && !extendsDown) return grassQuarters[(y - top) * 2 + x - left];
  }
  const variation = (Math.imul(x + 1, 3) ^ (y + 1) ^ roomKey ^ (roomKey >>> 6)) & 3;
  const key = (dy + 1) * 12 + (dx + 1) * 4 + variation;
  if (!looseMasks.has(key)) {
    const points = looseGrass[variation].map(([sx, sy]) => [sx + dx * 6, sy + dy * 6]);
    looseMasks.set(key, sprigMasks(points));
  }
  return looseMasks.get(key);
}

const mask = (path, transform) => inkMask(32, path, transform);

function rotate(degrees) {
  return `rotate(${degrees} 16 16)`;
}

const floorMasks = pips.map((path) => mask(path));
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
    return !!cell &&
      (cell.t === 'wall' || cell.t === 'door' || cell.t === 'golddoor' || cell.t === 'opendoor' ||
        cell.t === 'stairs' || cell.t === 'upstairs');
  }
  return (joins(x, y - 1) ? N : 0) | (joins(x + 1, y) ? E : 0) |
    (joins(x, y + 1) ? S : 0) | (joins(x - 1, y) ? W : 0);
}

// A wall is shaped by the walls really beside it, seen or not, so what you see of it
// never changes as more of the room comes into view (decision 282): a length of wall
// running out of sight is never drawn as a pillar first.
export function terrainMask(tile, x, y, cells, size, roomKey) {
  const seed = Math.imul(x + 1, 179) ^ Math.imul(y + 1, 541) ^ (roomKey | 0);
  const variation = (seed ^ (seed >>> 3) ^ (seed >>> 7)) & 3;
  if (tile === 'floor') return floorMasks[variation];
  if (tile !== 'wall') return null;
  const edges = wallEdges(x, y, cells, size);
  if (edges === (E | W)) {
    // Match the height of one crest beside the central passage on each rim.
    // The rest of the wall keeps its irregular rhythm.
    if (x === Math.floor(size / 2) - 1 && (y === 0 || y === size - 1)) {
      return waves[y === 0 ? 0 : 1][1];
    }
    const beat = rhythm[(x + 3 * y + (roomKey >>> 2)) & 15];
    return waves[beat][variation];
  }
  if (edges === (N | S)) {
    const beat = rhythm[(y + 3 * x + (roomKey >>> 6)) & 15];
    return waves[2 + beat][variation];
  }
  return wallMasks[edges];
}
