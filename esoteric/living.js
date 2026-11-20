import { stamp, inkMask } from './ink.js';
import { CONFIG } from '../src/config.js';

// Living things move in parts, never as a whole (decision 309): “they should not just
// rotate, they should actually stay completely aligned, but eg with the toad the angle of
// the lettering may change, arms extend, tail seem to wiggle”. Each sits square in its
// cell every turn. What moves is drawn again: the toad's letter leans, its arms reach and
// its tail curls; the spiral's tail, middle and top flick do the same. Every turn, moving
// or waiting, the tail takes another curl, so a living thing is never the same two turns
// running (301); the other parts hold for a few turns each (CONFIG.shift).

// --- the toad: Crooked Hand's lowercase t, as the map's type drew it ---
// The map's type is .78 of a square, and a pixel of the font is 75 of its 1000 units, so a
// pixel of the letter is 2.106 of the square's 36.
const T = 0.78 * 36 * 75 / 1000;
// The letter's first column and top row where the type set it: its 600-unit cell centred,
// ink from 25 units in; the baseline .3 of the type's size below the middle, the letter
// ten pixels tall above it.
const T_LEFT = 18 - (300 - 25) / 75 * T;
const T_TOP = 18 - 450 / 75 * T;

// The letter by its parts, as columns and rows of its seven by ten:
//   ...##..   ascender
//   ..###..
//   ...##.#   the right arm's tip
//   #######   the arms across the stem
//   .#.##..   the left arm's tip
//   ...#...   stem
//   ..##...
//   ..##...
//   ..##.#.   the tail
//   ...###.
const ASCENDER = [[3, 0], [4, 0], [2, 1], [3, 1], [4, 1]];
const STEM = [[3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [3, 4], [4, 4], [3, 5], [2, 6], [3, 6], [2, 7], [3, 7], [2, 8], [3, 8], [3, 9]];
// The tail's curls. The first is the letter as the font has it.
const TAILS = [
  [[5, 8], [4, 9], [5, 9]],          // the font's hook
  [[6, 8], [4, 9], [5, 9], [6, 9]],  // reaching further
  [[4, 9], [5, 9], [6, 9]],          // laid flat
  [[5, 7], [5, 8], [4, 9], [5, 9]],  // curled high
  [[4, 8], [4, 9]],                  // tucked in
];

function toadRows({ lean, left, right, tail }) {
  const R = CONFIG.shift.reach;
  const grid = Array.from({ length: 10 }, () => Array(7 + 2 * R).fill('.'));
  const put = (x, y) => { grid[y][x + R] = '#'; };
  // The letter's angle: its top two rows tip over; the stem and arms stay where they are.
  for (const [x, y] of ASCENDER) put(x + lean, y);
  for (const [x, y] of STEM) put(x, y);
  // The arms reach out along the bar, each tip going with its arm.
  for (let x = -left; x <= 1; x++) put(x, 3);
  put(1 - left, 4);
  for (let x = 5; x <= 6 + right; x++) put(x, 3);
  put(6 + right, 2);
  for (const [x, y] of TAILS[tail]) put(x, y);
  return grid.map((row) => row.join('')).join('\n');
}

// --- the player: his spiral (decision 301), two thirds of the size it was (310) ---
// Every pixel of the tracing is kept, wobbles and the small marks inside it, each drawn at
// two thirds of a pixel of the square.
const S = 2 / 3;
const SPIRAL = `
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
...........#####..........`.trim().split('\n');

// Its loose ends: the tail along the bottom (the last three rows, from their first ink to
// a last column that moves), the marks in its middle, and the flick at its top.
const SPIRAL_TAILS = [
  [16, 16, 15],          // as he drew it
  [18, 18, 17],          // reaching further
  [14, 14, 13],          // drawn in
  [17, 17, 15, 'lift'],  // its end lifting
  [15, 16, 17],          // its end dropping
];
const MIDDLE = [[11, 12], [11, 13], [13, 13], [14, 13], [11, 14], [13, 14]];
const MIDDLE_MOVES = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
const FLICK = [[10, 0], [11, 0]];

function spiralRows({ lean, middle, tail }) {
  const grid = SPIRAL.map((row) => [...row]);
  const W = grid[0].length;
  for (const [x, y] of [...MIDDLE, ...FLICK]) grid[y][x] = '.';
  for (const [x, y] of FLICK) grid[y][x + lean] = '#';
  const [mx, my] = MIDDLE_MOVES[middle];
  for (const [x, y] of MIDDLE) grid[y + my][x + mx] = '#';
  const ends = SPIRAL_TAILS[tail];
  grid.slice(-3).forEach((row, i) => {
    const from = row.indexOf('#');
    for (let x = from; x < W; x++) row[x] = x <= ends[i] ? '#' : '.';
  });
  if (ends[3] === 'lift') grid[grid.length - 4].splice(ends[0] - 1, 2, '#', '#');
  return grid.map((row) => row.join('')).join('\n');
}

// --- poses ---

function mix(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
// One part's state this turn, of `count`. It holds for `every` turns. With `alternate`,
// even turns take an even state and odd turns an odd one, so it changes every time.
function partAt(turn, salt, every, count, alternate = false) {
  const step = Math.floor((turn + salt) / every);
  const pick = mix(step * 977 + salt);
  if (!alternate) return pick % count;
  const parity = step & 1;
  return parity + 2 * (pick % Math.floor((count - parity + 1) / 2));
}

const SALT = { player: 17, toad: 4099 };

// The pose of a living thing on a turn: which way each part is.
export function poseAt(kind, turn) {
  const { reach, lean, every } = CONFIG.shift;
  const salt = SALT[kind] ?? 0;
  const leanAt = partAt(turn, salt + 1, every.lean, 2 * lean + 1) - lean;
  const tail = partAt(turn, salt, 1, kind === 'toad' ? TAILS.length : SPIRAL_TAILS.length, true);
  if (kind === 'toad') {
    return {
      lean: leanAt,
      left: partAt(turn, salt + 2, every.arms, reach + 1),
      right: partAt(turn, salt + 3, every.arms, reach + 1),
      tail,
    };
  }
  return { lean: leanAt, middle: partAt(turn, salt + 2, every.arms, MIDDLE_MOVES.length), tail };
}

const cache = new Map();

// The mask of a living thing, 'player' or 'toad', on a turn.
export function livingMask(kind, turn) {
  const pose = poseAt(kind, turn);
  const key = `${kind} ${Object.values(pose).join(' ')}`;
  if (!cache.has(key)) {
    const path = kind === 'toad'
      ? stamp(T_LEFT - CONFIG.shift.reach * T, T_TOP, toadRows(pose), T)
      : stamp(18 - SPIRAL[0].length / 2 * S, 18 - SPIRAL.length / 2 * S, spiralRows(pose), S);
    cache.set(key, inkMask(36, path));
  }
  return cache.get(key);
}

// For the tests: the drawing of a pose, as rows of ink.
export const drawingOf = (kind, pose) => (kind === 'toad' ? toadRows(pose) : spiralRows(pose));
