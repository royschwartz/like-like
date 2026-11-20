import { TEXT } from '../src/text.js';
import { symbolMask, stairsDownMask, stairsUpMask } from './symbols.js';
import { terrainMask, grassMasks } from './terrain.js';

const tiles = {
  floor:     ['--chalk', TEXT.observe.dirt],
  grass:     ['--shoot', TEXT.observe.grass],
  wall:      ['--chalk', TEXT.observe.wall],
  player:    ['--chalk', TEXT.observe.you],
  statue:    ['--chalk', TEXT.observe.statue],
  door:      ['--chalk', TEXT.observe.door],
  entrance:  ['--stone', TEXT.observe.entrance],
  stairs:    ['--sulphur', TEXT.observe.stairs],
  upstairs:  ['--sulphur', TEXT.observe.upstairs],
  golddoor:  ['--sulphur', TEXT.observe.golddoor],
  opendoor:  ['--stone', TEXT.observe.door],
  corpse:    ['--blood-ink', TEXT.observe.corpse],
  toad:      ['--awake', TEXT.unit.who.toad],
};

export function paintEsoteric(cell, x, y, env) {
  const bg = 'var(--unknown)';
  if (!cell || cell.state === 'unknown') return { ch: '', bg, fg: bg };

  if (cell.t === 'void') return { ch: '', bg, fg: bg };
  const kind = cell.thing?.kind ?? cell.t;
  const [ink, name] = tiles[kind];
  const color = `var(${kind === 'toad' && cell.thing.asleep ? '--asleep' : ink})`;
  const fg = cell.state === 'remembered' ? `color-mix(in srgb, ${color} 44%, ${bg})` : color;
  const label = name.replace(/[[\]]/g, '');
  if (kind === 'toad') return { ch: 't', fg, bg, label };
  const edge = env.size - 1;
  if (kind === 'door') {
    // An ordinary room exit lies on an edge. An unlocked gold gate is inside.
    let passage;
    if (x === 0) passage = 'west';
    else if (x === edge) passage = 'east';
    else if (y === 0) passage = 'north';
    else if (y === edge) passage = 'south';
    return { ch: '', fg, bg, label, passage };
  }
  if (kind === 'stairs' || kind === 'upstairs') {
    // In the wall, facing out from the open ground beside them. Going down, the treads
    // narrow toward the edge (decision 251); going up, they widen (253).
    const side = wallSide(x, y, env);
    if (side) return { ch: '', fg, bg, label, mask: kind === 'stairs' ? stairsDownMask(side) : stairsUpMask(side) };
  }

  if (kind === 'grass') {
    const { green: mask, white: glints } = grassMasks(x, y, env.cells, env.size, env.key);
    const glintInk = cell.state === 'remembered' ? 'color-mix(in srgb, var(--chalk) 44%, var(--unknown))' : 'var(--chalk)';
    return { ch: '', fg, bg, mask, label, glints, glintInk };
  }
  const terrain = kind === 'wall' || kind === 'floor';
  const mask = terrain ? terrainMask(kind, x, y, env.cells, env.size, env.key) : symbolMask(kind);
  return { ch: '', fg, bg, mask, label };
}

// Which way stairs in the wall at (x, y) face: from the open ground beside them toward
// what is beyond. 'n', 'e', 's' or 'w'; on the outside wall, that side.
const STEPS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
function wallSide(x, y, env) {
  const { size, cells } = env;
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= size || cy >= size ? null : cells[cy * size + cx]);
  const openGround = (c) => !!c && ['floor', 'grass', 'entrance'].includes(c.t);
  for (const [side, [dx, dy]] of Object.entries(STEPS)) {
    const beyond = at(x + dx, y + dy);
    if (openGround(at(x - dx, y - dy)) && (!beyond || beyond.t === 'void')) return side;
  }
  for (const [side, [dx, dy]] of Object.entries(STEPS)) if (openGround(at(x - dx, y - dy))) return side;
  const edge = size - 1;
  return y === 0 ? 'n' : y === edge ? 's' : x === 0 ? 'w' : x === edge ? 'e' : null;
}
