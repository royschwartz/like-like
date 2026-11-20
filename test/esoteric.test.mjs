import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintEsoteric } from '../esoteric/edition.js';
import { newGame, act, view } from '../src/game.js';
import { levelDistances } from '../src/gen.js';

const visible = (t, thing = null) => ({ t, thing, state: 'visible' });
const env = () => ({ size: 3, key: 17, cells: Array.from({ length: 9 }, () => visible('floor')) });

test('each drawn object has its own mark and the living toad is the font letter', () => {
  const room = env();
  const tiles = ['stairs', 'entrance', 'statue', 'golddoor'].map(t => visible(t));
  tiles.push(visible('floor', { kind: 'player' }), visible('grass', { kind: 'corpse' }));
  const masks = tiles.map(cell => paintEsoteric(cell, 1, 1, room).mask);
  assert.ok(masks.every(mask => mask.startsWith('url(')));
  assert.equal(new Set(masks).size, masks.length);
  for (const asleep of [false, true]) {
    const toad = paintEsoteric(visible('grass', { kind: 'toad', asleep }), 1, 1, room);
    assert.equal(toad.ch, 't');
    assert.equal(toad.mask, undefined);
  }
});

test('open doors are bare gaps and the locked gate keeps its gold mark', () => {
  const room = env();
  for (const state of ['visible', 'remembered']) {
    for (const t of ['door', 'opendoor']) {
      const gap = paintEsoteric({ t, state }, 1, 1, room);
      assert.equal(gap.ch, '');
      assert.equal(gap.mask, undefined);
      assert.equal(gap.label, 'door');
    }
    const gate = paintEsoteric({ t: 'golddoor', state }, 1, 1, room);
    assert.match(gate.fg, /--sulphur/);
    assert.ok(gate.mask.startsWith('url('));
  }
  const player = paintEsoteric(visible('opendoor', { kind: 'player' }), 1, 1, room);
  assert.equal(player.mask, paintEsoteric(visible('floor', { kind: 'player' }), 1, 1, room).mask);
});

test('only known room exits have a compass direction', () => {
  const room = env();
  for (const [x, y, side] of [[1, 0, 'north'], [2, 1, 'east'], [1, 2, 'south'], [0, 1, 'west']]) {
    for (const state of ['visible', 'remembered']) {
      assert.equal(paintEsoteric({ t: 'door', state }, x, y, room).passage, side);
    }
    assert.equal(paintEsoteric({ t: 'door', state: 'unknown' }, x, y, room).passage, undefined);
    assert.equal(paintEsoteric(visible('wall'), x, y, room).passage, undefined);
  }
  assert.equal(paintEsoteric(visible('opendoor'), 1, 1, room).passage, undefined);
});

test('wall joins follow only known terrain', () => {
  const room = env();
  room.cells[4] = visible('wall');
  const wall = () => paintEsoteric(room.cells[4], 1, 1, room).mask;
  const pillar = wall();
  room.cells[5] = { t: 'wall', state: 'unknown' };
  assert.equal(wall(), pillar);
  const unseen = paintEsoteric(room.cells[5], 2, 1, room);
  assert.equal(unseen.mask, undefined);
  assert.equal(unseen.label, undefined);
  room.cells[5].state = 'remembered';
  assert.notEqual(wall(), pillar);
});

test('the seven-by-seven opening keeps the drawn landmarks on every seed and restart', () => {
  const signs = { player: '@', grass: '"', statue: '&', stairs: '>', floor: '.', wall: '#' };
  const drawing = [
    '#######',
    '#""...#',
    '#""...#',
    '#....&#',
    '#..@..#',
    '#.....#',
    '###>###',
  ];
  for (const seed of [0, 7, 19]) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let run = 0; run < 2; run++) {
      const v = view(g);
      assert.equal(v.room.size, 7);
      assert.equal(v.cells.length, 49);
      const symbols = v.cells.map(c => signs[c.thing?.kind ?? c.t]).join('');
      assert.equal(symbols, drawing.join(''));
      assert.equal(view(newGame({ seed })).room.size, 11);
      if (run === 0) {
        act(g, { type: 'move', dir: 's' });
        act(g, { type: 'move', dir: 's' });
        act(g, { type: 'menu', id: 'sys' });
        act(g, { type: 'choose', index: 0 });
      }
    }
  }
});

test('the stairs below the drawing are guarded and DEE remembers speaking upstairs', () => {
  const g = newGame({ edition: 'esoteric', seed: 19 });
  for (const dir of ['e', 'e', 'n']) act(g, { type: 'move', dir });
  assert.equal(view(g).event.id, 'dee');
  act(g, { type: 'choose', index: 0 });
  act(g, { type: 'back' });
  for (const dir of ['w', 'w', 's', 's']) act(g, { type: 'move', dir });
  assert.equal(g.depth, 2);
  assert.ok(g.level.rooms.every(room => room.t.length === 49));
  const sentryRoom = g.level.rooms[g.level.toadRoom];
  assert.ok(sentryRoom.toad.asleep);
  assert.ok(sentryRoom.statue.spoke);
  const { x, y, room } = g.level.stairs;
  const index = y * view(g).room.size + x;
  assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][index], -1);
  assert.ok(levelDistances(g.level)[room][index] > 0);
});

test('the esoteric stairs are always in the wall, narrowing toward it, and walked into', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let floor = 1; floor <= 4; floor++) {
      const { room, x, y } = g.level.stairs;
      const t = g.level.rooms[room].t;
      const size = Math.sqrt(t.length);
      const edge = size - 1;
      assert.ok(x === 0 || y === 0 || x === edge || y === edge, `seed ${seed} floor ${floor}: in the wall`);
      assert.ok(!((x === 0 || x === edge) && (y === 0 || y === edge)), 'never a corner');
      assert.equal(t[y * size + x], 'stairs');
      // the cell inside it is open ground, and a straight step from it goes down
      const [ix, iy] = y === 0 ? [x, 1] : y === edge ? [x, edge - 1] : x === 0 ? [1, y] : [edge - 1, y];
      assert.ok(['floor', 'grass'].includes(t[iy * size + ix]));
      if (floor === 2) assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][y * size + x], -1);
      assert.ok(levelDistances(g.level)[room][y * size + x] > 0);
      g.room = room;
      g.level.rooms[room].toad = null;
      [g.x, g.y] = [ix, iy];
      const depth = g.depth;
      const events = act(g, { type: 'move', dir: y === 0 ? 'n' : y === edge ? 's' : x === 0 ? 'w' : 'e' });
      assert.ok(events.some((e) => e.type === 'descend'));
      assert.equal(g.depth, depth + 1);
    }
  }
  const look = { size: 7, key: 3, cells: Array.from({ length: 49 }, () => visible('wall')) };
  const marks = [[3, 6], [3, 0], [0, 3], [6, 3]].map(([x, y]) => paintEsoteric(visible('stairs'), x, y, look).mask);
  assert.equal(new Set(marks).size, 4, 'each side turns the treads to narrow toward its own edge');
});
