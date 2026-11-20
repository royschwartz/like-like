import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintEsoteric } from '../esoteric/edition.js';
import { newGame, act, view } from '../src/game.js';
import { levelDistances } from '../src/gen.js';
import { TEXT } from '../src/text.js';

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

test('living things hold still from turn to turn', () => {
  for (const kind of ['player', 'toad']) {
    const drawn = new Set();
    for (let turn = 0; turn < 20; turn++) {
      const paint = paintEsoteric(visible('floor', { kind }), 1, 1, { ...env(), turn });
      assert.equal(paint.pose, undefined);
      drawn.add(`${paint.ch} ${paint.mask}`);
    }
    assert.equal(drawn.size, 1, `${kind} is drawn the same every turn`);
  }
});

test('the spiral is two thirds of the 26 pixels it was traced at, every pixel kept', () => {
  const mask = paintEsoteric(visible('floor', { kind: 'player' }), 1, 1, env()).mask;
  const path = decodeURIComponent(mask).match(/ d="([^"]+)"/)[1];
  const xs = [...path.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/g)];
  const left = Math.min(...xs.map(m => +m[1]));
  const right = Math.max(...xs.map(m => +m[1] + +m[3]));
  assert.ok(Math.abs(right - left - 26 * 2 / 3) < 0.01, `${right - left} across`);
  assert.ok(Math.abs((left + right) / 2 - 18) < 0.01, 'centred');
  assert.ok(xs.every(m => Math.abs(+m[4] - 2 / 3) < 0.01), 'each pixel two thirds of the square\'s');
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

test('a wall is shaped by the room as it is, so it never changes as more is seen', () => {
  const room = env();
  room.cells[4] = visible('wall');
  const wall = () => paintEsoteric(room.cells[4], 1, 1, room).mask;
  const pillar = wall();
  room.cells[5] = { t: 'wall', state: 'unknown' };
  const joined = wall();
  assert.notEqual(joined, pillar);
  const unseen = paintEsoteric(room.cells[5], 2, 1, room);
  assert.equal(unseen.mask, undefined);
  assert.equal(unseen.label, undefined);
  for (const state of ['remembered', 'visible']) {
    room.cells[5].state = state;
    assert.equal(wall(), joined);
  }
});

test('grass keeps its sprigs as more of the patch comes into view', () => {
  const room = env();
  room.cells[4] = visible('grass');
  const sprigs = () => paintEsoteric(room.cells[4], 1, 1, room).mask;
  for (const i of [1, 3, 5]) room.cells[i] = { t: 'grass', state: 'unknown' };
  const before = sprigs();
  for (const state of ['remembered', 'visible']) {
    for (const i of [1, 3, 5]) room.cells[i].state = state;
    assert.equal(sprigs(), before);
  }
});

test('grass is the same drawing whatever its kind; the toad room\'s is only coloured purple, with green tips', () => {
  const cells = Array.from({ length: 49 }, () => visible('grass'));
  const look = { size: 7, key: 5, cells };
  for (const [x, y] of [[1, 1], [3, 2], [5, 5]]) {
    const plain = paintEsoteric(visible('grass'), x, y, look);
    const glowing = paintEsoteric({ ...visible('grass'), grass: 'glowing' }, x, y, look);
    const purple = paintEsoteric({ ...visible('grass'), grass: 'purple' }, x, y, look);
    for (const p of [glowing, purple]) assert.deepEqual([p.mask, p.glints], [plain.mask, plain.glints]);
    assert.deepEqual([plain.fg, plain.glintInk], ['var(--shoot)', 'var(--chalk)']);
    assert.deepEqual([glowing.fg, glowing.glintInk], [plain.fg, plain.glintInk]);
    assert.deepEqual([purple.fg, purple.glintInk], ['var(--grass-purple)', 'var(--shoot)']);
    assert.equal(purple.fill, undefined);
  }
});

test('the seven-by-seven opening keeps the drawn grass and entrance, and two ways out, on every seed and restart', () => {
  const signs = { player: '@', grass: '"', door: '+', floor: '.', wall: '#' };
  const drawing = [
    '#######',
    '#""...#',
    '#""...#',
    '+.....+',
    '#..@..#',
    '#.....#',
    '#######',
  ];
  for (const seed of [0, 7, 19]) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let run = 0; run < 2; run++) {
      const v = view(g);
      assert.equal(v.room.size, 7);
      assert.equal(v.cells.length, 49);
      const symbols = v.cells.map(c => signs[c.thing?.kind ?? c.t]).join('');
      assert.equal(symbols, drawing.join(''));
      // you stand on the entrance; the grass glows
      assert.equal(g.level.rooms[0].t[4 * 7 + 3], 'entrance');
      assert.ok(v.cells.filter((c) => c.t === 'grass').every((c) => c.grass === 'glowing'));
      assert.equal(view(newGame({ seed })).room.size, 11);
      if (run === 0) {
        act(g, { type: 'move', dir: 'n' });
        act(g, { type: 'move', dir: 'w' });
        act(g, { type: 'menu', id: 'sys' });
        act(g, { type: 'choose', index: 0 });
      }
    }
  }
});

test('the first floor: the mother\'s room one way, the toad\'s room with the bust the other, the stairs behind its golden door', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    const [first, mother, toadRoom] = g.level.rooms;
    assert.equal(g.level.rooms.length, 3);
    assert.ok(g.level.rooms.every((room) => room.t.length === 49));
    assert.deepEqual(first.nb, { n: null, e: 2, s: null, w: 1 });
    assert.ok(!first.t.includes('stairs') && !first.t.includes('statue') && !first.statue && !first.toad);
    // west, the mother, in the gap across from where you come in, which leads nowhere yet
    assert.deepEqual(mother.nb, { n: null, e: 0, s: null, w: null });
    assert.deepEqual(mother.mother, { x: 0, y: 3 });
    assert.equal(mother.t[3 * 7], 'door');
    assert.ok(!mother.toad && !mother.statue && !mother.t.includes('stairs') && !mother.t.includes('grass'));
    // east, the toad asleep with its key, the bust, and the stairs behind the golden door
    assert.equal(g.level.toadRoom, 2);
    assert.deepEqual(toadRoom.nb, { n: null, e: null, s: null, w: 0 });
    assert.ok(toadRoom.toad.asleep && toadRoom.toad.key);
    assert.ok(toadRoom.statue && !toadRoom.statue.spoke);
    assert.equal(toadRoom.grass, 'purple');
    assert.ok(toadRoom.t.includes('grass'));
    const { x, y, room } = g.level.stairs;
    assert.equal(room, 2);
    assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][y * 7 + x], -1);
    assert.ok(levelDistances(g.level)[room][y * 7 + x] > 0);
    // every open cell of the floor can be reached
    const dist = levelDistances(g.level);
    g.level.rooms.forEach((r, k) => r.t.forEach((c, i) => {
      if (OPEN.includes(c)) assert.ok(dist[k][i] >= 0, `seed ${seed} room ${k} cell ${i}`);
    }));
  }
});

function enterMotherRoom() {
  const g = newGame({ edition: 'esoteric', seed: 19, opening: true });
  act(g, { type: 'choose', index: 0 }); // jump into the hole
  for (const dir of ['n', 'w', 'w', 'w']) act(g, { type: 'move', dir });
  assert.equal(g.room, 1, 'through the west gap into her room');
  assert.deepEqual([g.x, g.y], [5, 3]);
  return g;
}

const motherChoices = ['talk to her', 'try to take her cloak', 'attack her', 'item', 'back'];
const eventLabels = (g) => view(g).event.options.map((o) => o.label);
const eventLines = (g) => view(g).event.lines.map((l) => l.text);

function chooseLabel(g, label) {
  const index = eventLabels(g).indexOf(label);
  assert.notEqual(index, -1, `option available: ${label}`);
  return act(g, { type: 'choose', index });
}

test('entering the mother’s room brings its cold, and observing her reveals a cloaked woman', () => {
  const g = enterMotherRoom();
  const cold = 'the room is cold and you are suddenly afraid';
  assert.equal(view(g).log.at(-1).text, cold);
  act(g, { type: 'wait' });
  act(g, { type: 'move', dir: 'e' }); // leave by the gap behind you
  assert.equal(view(g).log.filter((l) => l.text === cold).length, 1);
  act(g, { type: 'move', dir: 'w' });
  assert.equal(view(g).log.filter((l) => l.text === cold).length, 2);
  assert.equal(view(g).log.at(-1).text, cold);
  for (let i = 0; i < 4; i++) act(g, { type: 'move', dir: 'w' });
  const v = view(g);
  assert.deepEqual(v.cells[3 * 7].thing, { kind: 'mother' });
  const mark = paintEsoteric(v.cells[3 * 7], 0, 3, { size: 7, key: 1, cells: v.cells });
  assert.ok(mark.mask.startsWith('url('));
  // the draft he chose, as drawn: 26 pixels across and 21 down, centred, every pixel one of the square's
  const runs = [...decodeURIComponent(mark.mask).matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/g)].map((m) => m.slice(1).map(Number));
  const [left, right] = [Math.min(...runs.map((r) => r[0])), Math.max(...runs.map((r) => r[0] + r[2]))];
  const [top, bottom] = [Math.min(...runs.map((r) => r[1])), Math.max(...runs.map((r) => r[1] + r[3]))];
  assert.deepEqual([right - left, bottom - top, left, top], [26, 21, 5, 7]);
  assert.ok(runs.every((r) => r[3] === 1));
  assert.match(mark.fg, /--mother/);
  assert.equal(mark.label, 'a cloaked woman');
  act(g, { type: 'observe', x: 0, y: 3 });
  assert.equal(view(g).log.at(-1).text, 'a cloaked woman');
  assert.equal(view(g).event, null);
});

test('talking to the woman and looking through items return to her choices, and back leaves her in the gap', () => {
  const g = enterMotherRoom();
  for (let i = 0; i < 4; i++) act(g, { type: 'move', dir: 'w' });
  const turn = g.turn;
  act(g, { type: 'travel', x: 0, y: 3 }); // tap on her from beside the gap
  assert.deepEqual(eventLines(g), [
    'the woman looks up at you', 'her face is ghoulish', 'she is mumbling about her missing baby',
  ]);
  assert.deepEqual(eventLabels(g), motherChoices);
  chooseLabel(g, 'talk to her');
  assert.equal(eventLines(g).at(-1), 'she keeps mumbling about her baby');
  assert.deepEqual(eventLabels(g), motherChoices);
  chooseLabel(g, 'item');
  assert.deepEqual(eventLabels(g), [TEXT.thing.sword, TEXT.menu.back]);
  chooseLabel(g, TEXT.thing.sword);
  chooseLabel(g, TEXT.context.inspect);
  assert.ok(eventLines(g).includes(TEXT.slot.sword));
  act(g, { type: 'back' });
  assert.deepEqual(eventLabels(g), [TEXT.thing.sword, TEXT.menu.back]);
  chooseLabel(g, 'back');
  assert.deepEqual(eventLabels(g), motherChoices);
  chooseLabel(g, 'back');
  assert.equal(view(g).event, null);
  assert.deepEqual([g.room, g.x, g.y, g.turn], [1, 1, 3, turn]);
});

test('taking the cloak or attacking leads to her accusation and only die restarts the game', () => {
  for (const choice of ['try to take her cloak', 'attack her']) {
    const g = enterMotherRoom();
    for (let i = 0; i < 5; i++) act(g, { type: 'move', dir: 'w' });
    const turn = g.turn;
    chooseLabel(g, choice);
    assert.deepEqual(eventLines(g), [
      'she seizes you with surprising strength',
      'her fingers enter you as a knife through butter',
      'YOU DIDN’T CARE ABOUT MY BABY DID YOU',
    ]);
    assert.deepEqual(eventLabels(g), ['die']);
    act(g, { type: 'back' });
    assert.deepEqual(eventLabels(g), ['die']);
    assert.deepEqual([g.room, g.x, g.y, g.turn], [1, 1, 3, turn]);
    assert.ok(chooseLabel(g, 'die').some((e) => e.type === 'restart'));
    assert.deepEqual(eventLabels(g), [TEXT.openingEsoteric.jump]);
    assert.deepEqual([g.room, g.turn, g.hp], [0, 0, g.maxHp]);
  }
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
      if (floor === 1) assert.equal(levelDistances(g.level, g.level.entrance, { locked: true })[room][y * size + x], -1);
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

// The ways into a cell from the four squares beside it: those that are open ground.
const waysIn = (t, size, x, y) =>
  Object.values(STEPS).filter(([sx, sy]) => {
    const [nx, ny] = [x + sx, y + sy];
    return nx >= 0 && ny >= 0 && nx < size && ny < size && OPEN.includes(t[ny * size + nx]);
  }).length;

test('going down, you arrive just inside stairs up on the other side of the screen, going the same way; up takes you back', () => {
  let mirrored = 0;
  let floors = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame({ edition: 'esoteric', seed });
    for (let floor = 1; floor <= 4; floor++) {
      const above = g.level;
      const { room, x, y, side } = above.stairs;
      const [dx, dy] = STEPS[side];
      const [ix, iy] = [x - dx, y - dy];
      assert.equal(waysIn(above.rooms[room].t, Math.sqrt(above.rooms[room].t.length), x, y), 1, `seed ${seed} floor ${floor}: stairs down have one way in`);
      goDown(g);
      assert.equal(g.depth, floor + 1);
      const size = Math.sqrt(g.level.rooms[g.room].t.length);
      const here = g.level.rooms[g.room].t;
      const up = here.indexOf('upstairs');
      assert.ok(up >= 0);
      const [upx, upy] = [up % size, Math.floor(up / size)];
      assert.ok(upx === 0 || upy === 0 || upx === size - 1 || upy === size - 1, 'stairs up at the edge of the map');
      assert.ok(!(upx === 0 || upx === size - 1) || !(upy === 0 || upy === size - 1), 'never in a corner');
      assert.equal(waysIn(here, size, upx, upy), 1, `seed ${seed} floor ${floor + 1}: stairs up have one way in`);
      // you arrive on that one way in
      assert.equal(Math.abs(g.x - upx) + Math.abs(g.y - upy), 1, 'you arrive just inside the stairs up');
      assert.ok(OPEN.includes(here[g.y * size + g.x]));
      // across the screen from the stairs down above, in the same row or column, and you
      // come out going the way you went in (decision 340)
      const across = side === 'e' || side === 'w';
      floors++;
      if (upx === (across ? size - 1 - x : x) && upy === (across ? y : size - 1 - y)) {
        mirrored++;
        assert.deepEqual([g.x, g.y], [upx + dx, upy + dy], `seed ${seed} floor ${floor + 1}: going the same way`);
      }
      // every open cell of the floor can be reached
      const dist = levelDistances(g.level);
      g.level.rooms.forEach((r, k) => r.t.forEach((c, i) => {
        if (OPEN.includes(c)) assert.ok(dist[k][i] >= 0, `seed ${seed} floor ${floor + 1} room ${k} cell ${i}`);
      }));
      // back up, to just inside the stairs down above, the floor as it was; and down again
      const below = g.level;
      const s2 = Object.entries(STEPS).find(([, [sx, sy]]) => g.x + sx === upx && g.y + sy === upy)[0];
      assert.ok(act(g, { type: 'move', dir: s2 }).some((e) => e.type === 'ascend'));
      assert.equal(g.depth, floor);
      assert.equal(g.level, above);
      assert.deepEqual([g.room, g.x, g.y], [room, ix, iy]);
      goDown(g);
      assert.equal(g.level, below, 'the floor below is kept');
      assert.deepEqual([g.x, g.y], [g.level.entrance.x, g.level.entrance.y], 'down again, just inside the same stairs up');
    }
  }
  assert.ok(mirrored >= floors * 0.95, `the stairs up across from the stairs down on ${mirrored} of ${floors} floors`);
  const look = { size: 7, key: 3, cells: Array.from({ length: 49 }, () => visible('wall')) };
  const down = paintEsoteric(visible('stairs'), 3, 6, look).mask;
  const up = paintEsoteric(visible('upstairs'), 3, 6, look).mask;
  assert.notEqual(up, down);
  assert.equal(up, paintEsoteric(visible('stairs'), 3, 0, look).mask, 'up widens toward its edge');
});

// The ink of a stair mark, in the square as drawn on the screen: each rectangle as its
// depth in from the map's edge on that side and its span across.
function stairInk(mask, side) {
  const svg = decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));
  const transform = svg.match(/transform="([^"]*)"/)[1];
  const turn = ([x, y]) => transform.startsWith('matrix') ? [x, 36 - y]
    : transform.startsWith('rotate(90') ? [36 - y, x]
      : transform.startsWith('rotate(-90') ? [y, 36 - x] : [x, y];
  const depth = { n: ([, y]) => y, s: ([, y]) => 36 - y, w: ([x]) => x, e: ([x]) => 36 - x }[side];
  const across = { n: ([x]) => x, s: ([x]) => x, w: ([, y]) => y, e: ([, y]) => y }[side];
  return [...svg.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/g)].map((m) => {
    const [x, y, w, h] = m.slice(1).map(Number);
    const corners = [[x, y], [x + w, y + h]].map(turn);
    const ds = corners.map(depth), as = corners.map(across);
    return { near: Math.min(...ds), far: Math.max(...ds), from: Math.min(...as), to: Math.max(...as) };
  });
}

test('stairs shrink across and down, centred in the square: narrower at the edge going down, wider going up', () => {
  const look = { size: 7, key: 3, cells: Array.from({ length: 49 }, () => visible('wall')) };
  const span = (ink) => Math.max(...ink.map((r) => r.to)) - Math.min(...ink.map((r) => r.from));
  for (const [x, y, side] of [[3, 6, 's'], [3, 0, 'n'], [0, 3, 'w'], [6, 3, 'e']]) {
    for (const kind of ['stairs', 'upstairs']) {
      const ink = stairInk(paintEsoteric(visible(kind), x, y, look).mask, side);
      const nearest = Math.min(...ink.map((r) => r.near));
      const farthest = Math.max(...ink.map((r) => r.far));
      assert.ok(Math.abs(nearest - (36 - farthest)) < 0.01, `${kind} on ${side}: centred, as far from the edge as from the room`);
      assert.ok(farthest - nearest < 23, `${kind} on ${side}: shorter than the 25 rows drawn`);
      const from = Math.min(...ink.map((r) => r.from)), to = Math.max(...ink.map((r) => r.to));
      assert.ok(Math.abs(from - (36 - to)) < 0.01, `${kind} on ${side}: centred across`);
      const edgeTread = span(ink.filter((r) => r.far < nearest + 6));
      const roomTread = span(ink.filter((r) => r.near > farthest - 6));
      if (kind === 'stairs') assert.ok(edgeTread < roomTread, `stairs down on ${side} narrow toward the edge`);
      else assert.ok(edgeTread > roomTread, `stairs up on ${side} widen toward the edge`);
    }
  }
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
