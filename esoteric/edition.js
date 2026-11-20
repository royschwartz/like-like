import { TEXT } from '../src/text.js';
import { symbolMask, stairsDownMask } from './symbols.js';
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
  golddoor:  ['--sulphur', TEXT.observe.golddoor],
  opendoor:  ['--stone', TEXT.observe.door],
  corpse:    ['--blood-ink', TEXT.observe.corpse],
  toad:      ['--awake', TEXT.unit.who.toad],
};

export function paintEsoteric(cell, x, y, env) {
  const bg = 'var(--unknown)';
  if (!cell || cell.state === 'unknown') return { ch: '', bg, fg: bg };

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
  if (kind === 'stairs') {
    // In the wall, the treads narrow toward the edge: the way down (decision 251).
    const side = y === 0 ? 'n' : y === edge ? 's' : x === 0 ? 'w' : x === edge ? 'e' : null;
    if (side) return { ch: '', fg, bg, label, mask: stairsDownMask(side) };
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
