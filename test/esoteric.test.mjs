import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintEsoteric } from '../esoteric/edition.js';
import { newGame, act, view, playerDamage } from '../src/game.js';
import { levelDistances } from '../src/gen.js';
import { TEXT, isSlot as isSlotText } from '../src/text.js';
import { CONFIG } from '../src/config.js';
import { putToad } from './helpers.mjs';

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
    assert.equal(toadRoom.t[toadRoom.toad.y * 7 + toadRoom.toad.x], 'floor', 'the toad sleeps in the dirt');
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

test('entering the mother’s room brings its cold the first time only, and observing her says cloaked woman, awake, dirt', () => {
  const g = enterMotherRoom();
  const cold = 'the room is cold and you are suddenly afraid';
  assert.equal(view(g).log.at(-1).text, cold);
  act(g, { type: 'wait' });
  // "as a principle you shouldn't get messages like this repeatedly" (decision 375):
  // leave by the gap behind you and come back, twice, with something said in between
  for (let i = 0; i < 2; i++) {
    act(g, { type: 'move', dir: 'e' });
    act(g, { type: 'observe', x: g.x, y: g.y });
    act(g, { type: 'move', dir: 'w' });
  }
  assert.equal(g.log.filter((l) => l.text === cold).length, 1);
  assert.notEqual(view(g).log.at(-1).text, cold);
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
  // "cloaked woman is awake" (decision 391); the gap she stands in is the ground beside it (393)
  assert.equal(mark.label, 'cloaked woman, awake, dirt');
  act(g, { type: 'observe', x: 0, y: 3 });
  assert.equal(view(g).log.at(-1).text, 'cloaked woman, awake, dirt');
  assert.equal(view(g).event, null);
});

test('talking to the woman and looking through items return to her choices, and back leaves her in the gap', () => {
  const g = enterMotherRoom();
  const turn = g.turn + 4; // four steps from the doorway to the square beside her
  act(g, { type: 'travel', x: 0, y: 3 }); // one tap from across the room
  for (let i = 0; i < 7 && g.going; i++) act(g, { type: 'continue' });
  assert.equal(g.going, null);
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
  act(g, { type: 'observe', x: 0, y: 3 });
  assert.equal(view(g).log.at(-1).text, 'mother, awake, dirt');
  assert.equal(view(g).cells[3 * 7].label, 'mother, awake, dirt');
  act(g, { type: 'move', dir: 'w' });
  assert.equal(eventLines(g)[0], 'the mother looks up at you');
  assert.deepEqual(eventLabels(g), motherChoices);
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
    assert.equal(g.observed['mother.room'], undefined, 'a new game: her room’s cold comes once more');
  }
});

const STEPS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const OPEN = ['floor', 'grass', 'entrance'];

// Start one ordinary move from the encounter in the generated room.
function besideEncounter(kind) {
  const g = newGame({ edition: 'esoteric', seed: 7 });
  g.room = g.level.toadRoom;
  const room = g.level.rooms[g.room];
  const target = room[kind];
  for (const [dir, [dx, dy]] of Object.entries(STEPS)) {
    const x = target.x - dx;
    const y = target.y - dy;
    if (!OPEN.includes(room.t[y * 7 + x]) || (x === room.toad.x && y === room.toad.y)) continue;
    [g.x, g.y] = [x, y];
    return { g, bump: () => act(g, { type: 'move', dir }), target };
  }
  assert.fail(`no clear step into ${kind}`);
}

test('holding on the toad or the statue observes it; one tap from across the room walks into its event', () => {
  for (const [kind, seed, firstLine] of [
    ['toad', 3, 'the toad is covered in boils'],
    ['statue', 12, 'you pause next to the statue'],
  ]) {
    const g = newGame({ edition: 'esoteric', seed });
    for (const dir of ['n', 'e', 'e', 'e']) act(g, { type: 'move', dir });
    const { x, y } = g.level.rooms[g.room][kind];
    const { player, turn } = view(g);
    assert.ok(Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) > 2);
    act(g, { type: 'observe', x, y });
    assert.equal(view(g).event, null);
    assert.deepEqual(view(g).player, player);
    assert.equal(g.turn, turn + 1);

    act(g, { type: 'travel', x, y });
    for (let i = 0; i < 7 && view(g).going; i++) act(g, { type: 'continue' });
    assert.equal(eventLines(g)[0], firstLine);
    assert.equal(Math.max(Math.abs(x - g.x), Math.abs(y - g.y)), 1);
    assert.equal(view(g).going, false);
  }
});

// Decisions 386 to 391: holding on a thing says one plain line, "entity, activity, kind of
// terrain its on", and the line changes as the thing does and as you learn.
function readoutGame() {
  const g = newGame({ edition: 'esoteric', seed: 7 });
  const room = g.level.rooms[g.room];
  [g.x, g.y] = [1, 3];
  const said = (x, y) => {
    act(g, { type: 'observe', x, y });
    return g.log.at(-1);
  };
  return { g, room, said };
}

test('the toad says one plain line: who, doing what, on what; its key is a last part, up close', () => {
  const { g, room, said } = readoutGame();
  const toad = putToad(g, 5, 3, true);
  room.t[3 * 7 + 5] = 'floor';
  const observe = () => said(toad.x, toad.y).text;
  assert.equal(observe(), 'toad, sleeping, dirt');
  assert.equal(observe(), 'toad, sleeping, dirt');
  assert.deepEqual([view(g).log.at(-1).text, view(g).log.at(-1).count], ['toad, sleeping, dirt', 2], 'the same line again is counted');
  g.x = 3; // within CONFIG.observeClose steps
  const key = `toad, sleeping, dirt, ${TEXT.thing.key}`;
  assert.equal(observe(), key);
  assert.equal(said(toad.x, toad.y).kind, isSlotText(TEXT.thing.key) ? 'slot' : 'observe', 'a line with an empty slot in it is drawn as one');
  g.x = 1; // once made out, it shows from anywhere
  assert.equal(observe(), key);
  toad.key = false;
  assert.equal(observe(), 'toad, sleeping, dirt');
  assert.equal(said(toad.x, toad.y).kind, 'observe');
  assert.equal(view(g).event, null, 'observing never opens its page');
});

test('the toad’s line changes as it does: wounded, hostile once it is up, and the ground under it', () => {
  const { g, room, said } = readoutGame();
  const toad = putToad(g, 5, 3, true);
  toad.key = false;
  const observe = () => said(toad.x, toad.y).text;
  room.t[3 * 7 + 5] = 'grass';
  room.grass = 'glowing';
  assert.equal(observe(), 'toad, sleeping, grass');
  room.grass = 'purple';
  assert.equal(observe(), 'toad, sleeping, purplish grass');
  room.t[3 * 7 + 5] = 'floor';
  toad.hp -= 1;
  assert.equal(observe(), 'wounded toad, sleeping, dirt');
  toad.asleep = false; // awake, it attacks on sight: "toad, hostile, dirt" (decision 395)
  assert.match(observe(), /^wounded toad, hostile(, |$)/); // it has had its turn, and may have moved
  toad.hp = CONFIG.toad.hp;
  assert.match(observe(), /^toad, hostile(, |$)/);
  room.t[toad.y * 7 + toad.x] = 'entrance'; // ground with no word of his: no ground part
  toad.asleep = true;
  assert.equal(observe(), 'toad, sleeping');
});

test('with more sensitivity you make out the toad’s key from further off, and with less from nearer', () => {
  const far = CONFIG.observeClose + 1;
  for (const [sensitivity, sees] of [[CONFIG.player.sensitivity, false], [CONFIG.player.sensitivity + 2, true]]) {
    const { g, room, said } = readoutGame();
    const toad = putToad(g, 1 + far, 3, true);
    room.t[3 * 7 + toad.x] = 'floor';
    g.sensitivity = sensitivity;
    assert.equal(said(toad.x, toad.y).text.endsWith(TEXT.thing.key), sees, `sensitivity ${sensitivity}`);
  }
  const { g, room, said } = readoutGame();
  const toad = putToad(g, 1 + CONFIG.observeClose, 3, true);
  room.t[3 * 7 + toad.x] = 'floor';
  g.sensitivity = CONFIG.player.sensitivity - 2;
  assert.equal(said(toad.x, toad.y).text, 'toad, sleeping, dirt');
  assert.equal(view(g).stats.sensitivity, undefined, 'sensitivity is never shown');
});

test('the ground, a corpse and an item on the floor each say one plain line; a gap is the ground beside it; walls keep their slot', () => {
  const { g, room, said } = readoutGame();
  room.toad = null;
  room.t[3 * 7 + 3] = 'floor';
  room.t[3 * 7 + 4] = 'floor';
  room.t[3 * 7 + 5] = 'grass';
  assert.deepEqual([said(3, 3).text, said(3, 3).kind], ['dirt', 'observe']);
  assert.equal(said(5, 3).text, 'grass');
  room.corpses.push({ x: 3, y: 3, items: [] });
  assert.equal(said(3, 3).text, 'corpse, dirt');
  room.loose.push({ key: 'sword', x: 4, y: 3 });
  assert.equal(said(4, 3).text, 'sword, dirt');
  room.loose.push({ key: 'sword', x: 5, y: 3 });
  assert.equal(said(5, 3).text, 'sword, grass');
  assert.equal(said(g.x, g.y).text, TEXT.observe.you);
  const wall = room.t.findIndex((c, i) => c === 'wall' && view(g).cells[i].state === 'visible');
  assert.deepEqual([said(wall % 7, Math.floor(wall / 7)).text, g.log.at(-1).kind], [TEXT.observe.wall, 'slot']);
  // "gap in the wall will always be the same terrain it is adjacent to" (decision 393)
  [g.x, g.y] = [3, 3];
  room.loose.length = 0;
  room.corpses.length = 0;
  for (const [x, ground, word] of [[0, 'floor', 'dirt'], [6, 'grass', 'grass']]) {
    assert.equal(room.t[3 * 7 + x], 'door', 'the first room has a gap on each side');
    room.t[3 * 7 + (x ? x - 1 : 1)] = ground;
    assert.equal(said(x, 3).text, word);
  }
});

test('the golden door says its name', () => {
  const g = newGame({ edition: 'esoteric', seed: 7 });
  const { room: id, x, y } = g.level.golddoor;
  const room = g.level.rooms[id];
  g.room = id;
  room.toad = null;
  // stand on open ground beside it
  const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [x + dx, y + dy]).find(([nx, ny]) => ['floor', 'grass'].includes(room.t[ny * 7 + nx]));
  [g.x, g.y] = side;
  act(g, { type: 'observe', x, y });
  assert.deepEqual([g.log.at(-1).text, g.log.at(-1).kind], ['golden door', 'observe']);
});

test('choosing to attack the sleeping toad strikes it and spends a turn', () => {
  const { g, target: toad, bump } = besideEncounter('toad');
  const hp = toad.hp, turn = g.turn;
  bump();
  const events = chooseLabel(g, 'attack the toad');
  assert.ok(events.some((e) => e.type === 'attack' && e.by === 'player' && e.hit));
  assert.equal(toad.hp, hp - playerDamage(g));
  assert.equal(toad.asleep, false);
  assert.equal(g.turn, turn + 1);
  assert.equal(view(g).event, null);
});

test('walking into the sleeping toad opens its encounter and grabbing the key can succeed or wake it', () => {
  const chance = CONFIG.keyChance.calm;
  try {
    for (const succeeds of [true, false]) {
      CONFIG.keyChance.calm = succeeds ? 1 : 0;
      const { g, target: toad, bump } = besideEncounter('toad');
      const turn = g.turn;
      bump();
      assert.deepEqual(eventLines(g), ['the toad is covered in boils', 'its muscles seem to bulge out of its body']);
      assert.deepEqual(eventLabels(g), ['talk to the toad', 'try to grab the key', 'attack the toad', 'back']);
      const beforeTalk = view(g);
      chooseLabel(g, 'talk to the toad');
      assert.deepEqual(view(g), beforeTalk, 'talking leaves the sleeping toad and its choices as they were');
      chooseLabel(g, 'back');
      assert.equal(view(g).event, null);
      bump();
      chooseLabel(g, 'try to grab the key');
      assert.equal(toad.asleep, succeeds);
      assert.equal(toad.key, !succeeds);
      assert.equal(g.items.filter((item) => item.key === 'key').length, Number(succeeds));
      assert.equal(g.turn, turn);
      if (succeeds) {
        chooseLabel(g, 'back');
        bump();
        assert.deepEqual(eventLabels(g), ['talk to the toad', 'attack the toad', 'back']);
        chooseLabel(g, 'back');
        // Leave the stolen key on the floor, then kill the toad with the sword.
        toad.hp = playerDamage(g);
        for (const item of [TEXT.thing.key, TEXT.thing.sword]) {
          act(g, { type: 'menu', id: 'inv' });
          chooseLabel(g, item);
          chooseLabel(g, TEXT.item.throw);
        }
        const room = g.level.rooms[g.room];
        assert.equal(room.toad, null);
        assert.deepEqual(room.corpses.at(-1).items, []);
        assert.equal(room.loose.filter((it) => it.key === 'key').length, 1);
      }
    }
  } finally {
    CONFIG.keyChance.calm = chance;
  }
});

test('an offering wakes DEE, who answers exactly one question before teaching imbue', () => {
  const questions = [
    ['where am I?', ["THE WORLD WAS DESTROYED, THAT'S TRUE"]],
    ['who are you?', ['I AM DEE, YOUR OLD FRIEND', 'REMEMBER? I SHOWED YOU THE HOLE']],
  ];
  for (const [question, answer] of questions) {
    const { g, target, bump } = besideEncounter('statue');
    act(g, { type: 'observe', x: target.x, y: target.y });
    // "statue will be simplified": "statue of a man", then "statue of DEE" (decision 389)
    assert.equal(view(g).log.at(-1).text, 'statue of a man');
    const statueLabel = () => view(g).cells[target.y * 7 + target.x].label;
    assert.equal(statueLabel(), 'statue of a man');
    act(g, { type: 'menu', id: 'act' });
    assert.ok(!eventLabels(g).includes('imbue'));
    chooseLabel(g, 'back');

    const damage = playerDamage(g);
    const turn = g.turn;
    for (const choice of ['touch the statue', 'talk to it']) {
      bump();
      assert.deepEqual(eventLines(g), ['you pause next to the statue', 'a wild man with outstretched arms']);
      assert.deepEqual(eventLabels(g), ['touch the statue', 'talk to it', 'place an item in its arms']);
      chooseLabel(g, choice);
      assert.equal(view(g).event, null);
      assert.equal(g.turn, turn);
      assert.equal(statueLabel(), 'statue of a man');
    }
    bump();
    chooseLabel(g, 'place an item in its arms');
    assert.deepEqual(eventLabels(g), ['sword', 'back']);
    chooseLabel(g, 'back');
    chooseLabel(g, 'place an item in its arms');
    chooseLabel(g, 'sword');
    assert.deepEqual(eventLines(g), [
      'the sword glows and the statue emits a low hum',
      'I LIVE. THANK YOU',
      'I AM DEE. WE USED TO KNOW EACH OTHER',
      'I’VE BEEN ON YOUR SIDE SINCE DAY ONE',
    ]);
    assert.deepEqual(eventLabels(g), questions.map(([label]) => label));
    chooseLabel(g, question);
    assert.deepEqual(eventLines(g), answer);
    assert.deepEqual(eventLabels(g), ['continue']);
    act(g, { type: 'back' });
    assert.deepEqual(eventLabels(g), ['continue']);
    chooseLabel(g, 'continue');
    assert.deepEqual(eventLines(g), ['DEE shudders', 'I AM GETTING SLEEPY. BRING ME SOMETHING ELSE', 'AND PUT SOME LOVE INTO IT']);
    assert.deepEqual(eventLabels(g), ['end']);
    chooseLabel(g, 'end');
    assert.equal(view(g).event, null);
    const reward = 'gained new ability: imbue';
    assert.equal(view(g).log.at(-1).text, reward);
    act(g, { type: 'observe', x: target.x, y: target.y });
    assert.equal(view(g).log.at(-1).text, 'statue of DEE');
    assert.equal(statueLabel(), 'statue of DEE');

    // A later offering can glow, but does not replay either question or grant the ability twice.
    const worms = Array.from({ length: 30 }, (_, i) => ({ key: 'worms', enchanted: i === 0 }));
    g.items.push({ key: 'key' }, ...worms);
    bump();
    chooseLabel(g, 'place an item in its arms');
    assert.deepEqual(eventLabels(g), [TEXT.thing.sword, TEXT.thing.key, TEXT.thing.worms, 'back']);
    chooseLabel(g, TEXT.thing.key);
    assert.deepEqual(eventLabels(g), ['end']);
    assert.deepEqual(eventLines(g), [`the ${TEXT.thing.key} glows and the statue emits a low hum`]);
    chooseLabel(g, 'end');
    assert.equal(g.log.filter((line) => line.text === reward).length, 1);

    act(g, { type: 'menu', id: 'act' });
    chooseLabel(g, 'imbue');
    chooseLabel(g, 'sword');
    assert.equal(playerDamage(g), damage + CONFIG.enchant.swordDamage);
    chooseLabel(g, 'back');
    act(g, { type: 'menu', id: 'act' });
    chooseLabel(g, 'imbue');
    assert.deepEqual(eventLabels(g), [TEXT.thing.key, TEXT.thing.worms, 'back'], 'one row per eligible item kind');
    chooseLabel(g, TEXT.thing.worms);
    assert.equal(worms.filter((it) => it.enchanted).length, 2, 'imbue selects one of the untreated worms');
  }
});

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
