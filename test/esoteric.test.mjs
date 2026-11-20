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

test('only known room exits extend their touch target through the frame', () => {
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

test('the nine-by-nine opening keeps the drawn landmarks on every seed and restart', () => {
  const signs = { player: '@', grass: '"', statue: '&', stairs: '>', floor: '.', wall: '#' };
  const drawing = [
    '#########',
    '#"".....#',
    '#"".....#',
    '#.......#',
    '#......&#',
    '#.......#',
    '#...@...#',
    '#...>...#',
    '#########',
  ];
  for (const seed of [0, 7, 19]) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let run = 0; run < 2; run++) {
      const v = view(g);
      assert.equal(v.room.size, 9);
      assert.equal(v.cells.length, 81);
      const symbols = v.cells.map(c => signs[c.thing?.kind ?? c.t]).join('');
      assert.equal(symbols, drawing.join(''));
      assert.equal(view(newGame({ seed })).room.size, 11);
      if (run === 0) {
        act(g, { type: 'move', dir: 's' });
        act(g, { type: 'context' });
        act(g, { type: 'menu', id: 'sys' });
        act(g, { type: 'choose', index: 0 });
      }
    }
  }
});

test('the stairs below the drawing are guarded and DEE remembers speaking upstairs', () => {
  const g = newGame({ edition: 'esoteric', seed: 19 });
  for (const dir of ['e', 'e', 'e', 'n', 'n']) act(g, { type: 'move', dir });
  assert.equal(view(g).event.id, 'dee');
  act(g, { type: 'choose', index: 0 });
  act(g, { type: 'back' });
  for (const dir of ['w', 'w', 'w', 's', 's']) act(g, { type: 'move', dir });
  act(g, { type: 'context' });
  assert.equal(g.depth, 2);
  assert.ok(g.level.rooms.every(room => room.t.length === 81));
  const sentryRoom = g.level.rooms[g.level.toadRoom];
  assert.ok(sentryRoom.toad.asleep);
  assert.ok(sentryRoom.statue.spoke);
  const { x, y, room } = g.level.stairs;
  const index = y * view(g).room.size + x;
  assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][index], -1);
  assert.ok(levelDistances(g.level)[room][index] > 0);
});
