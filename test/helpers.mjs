// Shared bits for the tests (not a test file itself).

import { makeRng, float, int, pick } from '../src/rng.js';
import { S, DIRS, STEP, idx, arrivalCells } from '../src/gen.js';
import { currentRoom, goblinAt } from '../src/game.js';

// A random action, weighted toward moves and the wide button.
export function randomAction(r) {
  const roll = float(r);
  if (roll < 0.5) return { type: 'move', dir: pick(r, DIRS) };
  if (roll < 0.65) return { type: 'context' };
  if (roll < 0.73) return { type: 'menu', id: pick(r, ['inv', 'act', 'psy', 'sys']) };
  if (roll < 0.81) return { type: 'choose', index: int(r, 0, 3) };
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
    { type: 'choose', index: 9 },
    { type: 'dance' },
    { type: 'observe', x: -1, y: 3 },
    { type: 'observe', x: 2.5, y: 3 },
    { type: 'pick', index: 99 },
  ]);
}

export function randomActions(seed, n) {
  const r = makeRng(seed);
  return Array.from({ length: n }, () => randomAction(r));
}

export function clearGoblins(g) {
  for (const room of g.level.rooms) room.goblins = [];
}

export function makeGoblin(x, y, asleep = false, id = 900) {
  return { id, x, y, hp: 3, asleep, lastSeen: null };
}

// Cells of the current room where a goblin may legally stand.
export function isLegalGoblinCell(g, room, b) {
  const c = room.t[idx(b.x, b.y)];
  if (c === 'wall' || c === 'door') return false;
  if (arrivalCells(room).some(([x, y]) => x === b.x && y === b.y)) return false;
  if (room === currentRoom(g) && b.x === g.x && b.y === g.y) return false;
  return room.goblins.filter((o) => o.x === b.x && o.y === b.y).length === 1;
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
  !goblinAt(room, x, y);

export { STEP, DIRS, S, idx };
