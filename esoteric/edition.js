import { TEXT } from '../src/text.js';
import { symbolMask } from './symbols.js';
import { terrainMask } from './terrain.js';

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

  const terrain = kind === 'wall' || kind === 'grass' || kind === 'floor';
  const mask = terrain ? terrainMask(kind, x, y, env.cells, env.size, env.key) : symbolMask(kind, x, y, env.size);
  return { ch: '', fg, bg, mask, label };
}
