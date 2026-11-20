// The square that means "more" (decisions 314, 316): a small hollow square, black inside,
// drawn by hand in several versions. Each new one on the screen takes a different version
// from the one before ("different sprites for the square that differ every time new ones
// are generated"). Seven pixels a side on a nine-pixel field, so a flaw can stand out.

import { stamp, inkMask } from './ink.js';

const SPRITES = [
  // the plain ring
  `
.........
.#######.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........`,
  // the top left corner left off
  `
.........
..######.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........`,
  // a bump on the top
  `
....#....
.#######.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........`,
  // the right side steps out halfway down
  `
.........
.#######.
.#.....#.
.#.....#.
.#.....##
.#......#
.#......#
.########
.........`,
  // the bottom heavier on the left
  `
.........
.#######.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.###...#.
.#######.
.........`,
  // the top runs past the right corner
  `
.........
.########
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........`,
  // the bottom right corner left off, a nub on the left
  `
.........
.#######.
.#.....#.
##.....#.
.#.....#.
.#.....#.
.#.....#.
.######..
.........`,
  // the top dips in one pixel
  `
.........
.###.###.
.#..#..#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........`,
];

const MASKS = SPRITES.map((rows) => inkMask(9, stamp(0, 0, rows.trim())));

let last = -1;

// A version of the square, as a CSS mask image: never the one given just before.
export function moreMark() {
  const n = MASKS.length;
  let k = Math.floor(Math.random() * (last < 0 ? n : n - 1));
  if (last >= 0 && k >= last) k++;
  last = k;
  return MASKS[k];
}
