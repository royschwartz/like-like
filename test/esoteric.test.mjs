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

const STEPS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const OPEN = ['floor', 'grass', 'entrance'];

// Walk into the floor's stairs down from just inside them.
function goDown(g) {
  const { room, x, y, side } = g.level.stairs;
  const [dx, dy] = STEPS[side];
  g.room = room;
  g.level.rooms[room].toad = null;
  [g.x, g.y] = [x - dx, y - dy];
  return act(g, { type: 'move', dir: side });
}

test('the esoteric stairs are always at the edge of the map, facing out of it, and walked into', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let floor = 1; floor <= 4; floor++) {
      const { room, x, y, side } = g.level.stairs;
      const t = g.level.rooms[room].t;
      const size = Math.sqrt(t.length);
      const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= size || cy >= size ? null : t[cy * size + cx]);
      const [dx, dy] = STEPS[side];
      assert.equal(at(x, y), 'stairs');
      assert.ok(OPEN.includes(at(x - dx, y - dy)), `seed ${seed} floor ${floor}: open ground inside`);
      assert.equal(at(x + dx, y + dy), null, 'at the edge of the map, facing out of it');
      for (const [px, py] of dx ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) assert.equal(at(x + px, y + py), 'wall', 'walls either side');
      if (floor === 2) assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][y * size + x], -1);
      assert.ok(levelDistances(g.level)[room][y * size + x] > 0);
      const depth = g.depth;
      assert.ok(goDown(g).some((e) => e.type === 'descend'));
      assert.equal(g.depth, depth + 1);
    }
  }
  const look = { size: 7, key: 3, cells: Array.from({ length: 49 }, () => visible('wall')) };
  const marks = [[3, 6], [3, 0], [0, 3], [6, 3]].map(([x, y]) => paintEsoteric(visible('stairs'), x, y, look).mask);
  assert.equal(new Set(marks).size, 4, 'each side turns the treads to narrow toward its own edge');
});

test('going down, you arrive just inside stairs up where the stairs down were; up takes you back', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let floor = 1; floor <= 4; floor++) {
      const above = g.level;
      const { room, x, y, side } = above.stairs;
      const [dx, dy] = STEPS[side];
      const [ix, iy] = [x - dx, y - dy];
      goDown(g);
      assert.equal(g.depth, floor + 1);
      const size = Math.sqrt(g.level.rooms[g.room].t.length);
      const here = g.level.rooms[g.room].t;
      // the same square on the screen, beside stairs up in the same place in the wall
      if (here[y * size + x] === 'upstairs') {
        assert.deepEqual([g.x, g.y], [ix, iy], `seed ${seed} floor ${floor}`);
      }
      const up = here.indexOf('upstairs');
      assert.ok(up >= 0);
      const [upx, upy] = [up % size, Math.floor(up / size)];
      assert.ok(upx === 0 || upy === 0 || upx === size - 1 || upy === size - 1, 'stairs up at the edge of the map');
      // every open cell of the floor can be reached
      const dist = levelDistances(g.level);
      g.level.rooms.forEach((r, k) => r.t.forEach((c, i) => {
        if (OPEN.includes(c)) assert.ok(dist[k][i] >= 0, `seed ${seed} floor ${floor + 1} room ${k} cell ${i}`);
      }));
      // back up, to just inside the stairs down above, the floor as it was; and down again
      const below = g.level;
      const [ux, uy] = [up % size, Math.floor(up / size)];
      const upSide = Object.entries(STEPS).find(([, [sx, sy]]) => [g.x + sx, g.y + sy].join() === [ux, uy].join())?.[0];
      [g.x, g.y] = g.level.entrance.room === g.room ? [g.level.entrance.x, g.level.entrance.y] : [g.x, g.y];
      const s2 = Object.entries(STEPS).find(([, [sx, sy]]) => here[(g.y + sy) * size + g.x + sx] === 'upstairs')[0];
      assert.ok(upSide === undefined || upSide === s2);
      assert.ok(act(g, { type: 'move', dir: s2 }).some((e) => e.type === 'ascend'));
      assert.equal(g.depth, floor);
      assert.equal(g.level, above);
      assert.deepEqual([g.room, g.x, g.y], [room, ix, iy]);
      goDown(g);
      assert.equal(g.level, below, 'the floor below is kept');
    }
  }
  const look = { size: 7, key: 3, cells: Array.from({ length: 49 }, () => visible('wall')) };
  const down = paintEsoteric(visible('stairs'), 3, 6, look).mask;
  const up = paintEsoteric(visible('upstairs'), 3, 6, look).mask;
  assert.notEqual(up, down);
  assert.equal(up, paintEsoteric(visible('stairs'), 3, 0, look).mask, 'up widens toward its edge');
});

test('esoteric rooms come in many shapes, all whole, with walls round what is open', () => {
  const sizes = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let floor = 1; floor <= 3; floor++) {
      goDown(g);
      for (const r of g.level.rooms) {
        const t = r.t;
        const size = Math.sqrt(t.length);
        const open = t.filter((c) => OPEN.includes(c)).length;
        sizes.add(open);
        t.forEach((c, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          // nothing open touches the void, and every void cell is away from open ground
          if (c !== 'void') return;
          for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const n = t[(y + dy) * size + x + dx];
            if (x + dx >= 0 && y + dy >= 0 && x + dx < size && y + dy < size) assert.ok(!OPEN.includes(n) && n !== 'door');
          }
        });
      }
    }
  }
  assert.ok([...sizes].some((n) => n <= 7), 'narrow rooms');
  assert.ok([...sizes].some((n) => n >= 20), 'wide rooms');
});
