// Shared bits for the tests (not a test file itself).

import { CONFIG } from '../src/config.js';
import { makeRng, float, int, pick } from '../src/rng.js';
import { S, DIRS, STEP, idx, arrivalCells } from '../src/gen.js';
import { currentRoom, toadAt } from '../src/game.js';

// A random action, weighted toward moves and the wide button.
export function randomAction(r) {
  const roll = float(r);
  if (roll < 0.42) return { type: 'move', dir: pick(r, DIRS) };
  // tapping cells: look, travel, and going on with it
  if (roll < 0.44) return { type: 'look', x: int(r, 0, S - 1), y: int(r, 0, S - 1) };
  if (roll < 0.47) return { type: 'travel', x: int(r, 0, S - 1), y: int(r, 0, S - 1) };
  if (roll < 0.495) return { type: 'continue' };
  if (roll < 0.5) return { type: 'stop' };
  if (roll < 0.65) return { type: 'context' };
  if (roll < 0.73) return { type: 'menu', id: pick(r, ['inv', 'act', 'psy', 'sys']) };
  if (roll < 0.81) return { type: 'choose', index: int(r, 0, 4) };
  if (roll < 0.86) return { type: 'back' };
  if (roll < 0.93) return { type: 'wait' };
  if (roll < 0.96) return { type: 'observe', x: int(r, 0, S - 1), y: int(r, 0, S - 1) };
  if (roll < 0.975) return { type: 'use' };
  if (roll < 0.985) return { type: 'pick', index: int(r, 0, 3) };
  return pick(r, [
    null,
    {},
    { type: 'move', dir: 'x' },
    { type: 'menu', id: 'nope' },
    { type: 'choose', index: 99 },
    { type: 'choose', index: -1 },
    { type: 'dance' },
    { type: 'observe', x: -1, y: 3 },
    { type: 'observe', x: 2.5, y: 3 },
    { type: 'pick', index: 99 },
    { type: 'look', x: -1, y: 3 },
    { type: 'travel', x: 3, y: 11 },
    { type: 'travel', x: 2.5, y: 3 },
  ]);
}

export function randomActions(seed, n) {
  const r = makeRng(seed);
  return Array.from({ length: n }, () => randomAction(r));
}

// Put a toad in the current room, wherever a test wants to meet it.
export function putToad(g, x, y, asleep = false) {
  const room = currentRoom(g);
  room.toad = { x, y, home: { x, y }, hp: CONFIG.toad.hp, asleep, stirred: false, key: true, lastSeen: null };
  return room.toad;
}

// Is the room's toad on a cell it may legally stand on?
export function isLegalToadCell(g, room) {
  const t = room.toad;
  if (!['floor', 'grass', 'entrance', 'stairs'].includes(room.t[idx(t.x, t.y)])) return false;
  if (arrivalCells(room).some(([x, y]) => x === t.x && y === t.y)) return false;
  return !(room === currentRoom(g) && t.x === g.x && t.y === g.y);
}

// A spot in the current room for which pred(x, y, room) holds.
export function findSpot(g, pred) {
  const room = currentRoom(g);
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) if (pred(x, y, room)) return [x, y];
  }
  return null;
}

export const plainFloor = (room, x, y) =>
  x > 0 &&
  y > 0 &&
  x < S - 1 &&
  y < S - 1 &&
  (room.t[idx(x, y)] === 'floor' || room.t[idx(x, y)] === 'grass') &&
  !arrivalCells(room).some(([ax, ay]) => ax === x && ay === y) &&
  !toadAt(room, x, y);

// An open room: floor inside, the ring as it was (doors kept), nothing else in it.
export function openRoom(g) {
  const room = currentRoom(g);
  room.t = room.t.map((c, i) => {
    const x = i % S;
    const y = Math.floor(i / S);
    return x === 0 || y === 0 || x === S - 1 || y === S - 1 ? c : 'floor';
  });
  room.corpses = [];
  room.toad = null;
  room.statue = null;
  return room;
}

// How many lines of the log a status takes: words wrap at spaces, as the page wraps them,
// and a word longer than a line is broken.
export function logLines(text, width = CONFIG.logWidth) {
  let lines = 1;
  let used = 0;
  for (const word of String(text).split(' ')) {
    let w = word.length;
    if (used > 0 && used + 1 + w <= width) {
      used += 1 + w;
      continue;
    }
    if (used > 0) lines++;
    while (w > width) {
      lines++;
      w -= width;
    }
    used = w;
  }
  return lines;
}

// The texts of the lines said since log id `from`.
export const saidSince = (g, from) => g.log.filter((l) => l.id >= from).map((l) => l.text);

export { STEP, DIRS, S, idx };
