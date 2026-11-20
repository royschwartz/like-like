import { TEXT } from '../src/text.js';
import { symbolMask, stairsDownMask, stairsUpMask, itemMask } from './symbols.js';
import { terrainMask, grassMasks, SPRIG_PURPLE, GRASS_SIZE } from './terrain.js';

const tiles = {
  floor:     ['--chalk', TEXT.observe.dirt],
  grass:     ['--shoot', TEXT.observe.grass],
  wall:      ['--chalk', TEXT.observe.wall],
  player:    ['--chalk', TEXT.observe.you], // "player icon is black and white though"
  statue:    ['--bust', TEXT.observe.statue], // "a cool blue color" (decision 300)
  door:      ['--chalk', TEXT.observe.door],
  entrance:  ['--rope', TEXT.observe.entrance],
  stairs:    ['--sulphur', TEXT.observe.stairs],
  upstairs:  ['--sulphur', TEXT.observe.upstairs],
  golddoor:  ['--sulphur', TEXT.observe.golddoor],
  opendoor:  ['--stone', TEXT.observe.door],
  corpse:    ['--blood-ink', TEXT.observe.corpse],
  toad:      ['--toad', TEXT.unit.who.toad], // "a deep olive green", asleep or awake
  mother:    ['--mother', TEXT.observe.mother], // Claude's lilac, provisional
};

// Grass by its kind, all of it the same sprigs, green with white tips. The first room's
// glows: a halo round each sprig. The toad's room's is purple-green: each sprig's left leaf
// purple (SPRIG_PURPLE).
const GRASS = {
  glowing: { glow: true },
  purple: { purple: true },
};

// A background for the sprigs at `points`: green, with a purple rectangle over the part of
// each that is purple, sized and placed as fractions of the square.
function purpleFill(points, green, purple) {
  const [px, py, w, h] = SPRIG_PURPLE;
  const n = GRASS_SIZE;
  const pct = (v) => `${+(v * 100).toFixed(3)}%`;
  const patches = points.map(([x, y]) =>
    `linear-gradient(${purple}, ${purple}) ${pct((x + px) / (n - w))} ${pct((y + py) / (n - h))} / ${pct(w / n)} ${pct(h / n)} no-repeat`);
  return [...patches, green].join(', ');
}

// Items on the floor: the sword steel, the golden key gold, the worms pink.
const ITEM_INK = { sword: '--steel', key: '--sulphur', worms: '--worm' };

export function paintEsoteric(cell, x, y, env) {
  const bg = 'var(--unknown)';
  if (!cell || cell.state === 'unknown') return { ch: '', bg, fg: bg };

  if (cell.t === 'void') return { ch: '', bg, fg: bg };
  // An item on the floor, in its own colour (decision 307).
  if (cell.thing?.kind === 'item') {
    const key = cell.thing.key;
    const ink = `var(${ITEM_INK[key] ?? '--chalk'})`;
    const fg = cell.state === 'remembered' ? `color-mix(in srgb, ${ink} 44%, ${bg})` : ink;
    return { ch: '', fg, bg, mask: itemMask(key), label: TEXT.thing[key].replace(/[[\]]/g, '') };
  }
  const kind = cell.thing?.kind ?? cell.t;
  const [ink, name] = tiles[kind];
  const color = `var(${ink})`;
  const fg = cell.state === 'remembered' ? `color-mix(in srgb, ${color} 44%, ${bg})` : color;
  const label = name.replace(/[[\]]/g, '');
  // The toad is the font's lowercase t. Living things hold still (decision 312).
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
    const sort = GRASS[cell.grass] ?? {};
    const { green: mask, white: glints, points } = grassMasks(x, y, env.cells, env.size, env.key, !!sort.glow);
    const dim = (ink) => (cell.state === 'remembered' ? `color-mix(in srgb, var(${ink}) 44%, var(--unknown))` : `var(${ink})`);
    const fill = sort.purple ? purpleFill(points, dim('--shoot'), dim('--grass-purple')) : undefined;
    return { ch: '', fg, bg, mask, label, glints, glintInk: dim('--chalk'), fill };
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
