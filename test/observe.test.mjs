import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { newGame, act, view, noticeChance } from '../src/game.js';
import { putToad, openRoom, saidSince, S, idx } from './helpers.mjs';

// A game in an open room: floor inside, wall round it, nothing else; you at (5, 5).
function openGame(seed = 31) {
  const g = newGame({ seed });
  const room = openRoom(g);
  room.t = room.t.map((c, i) => {
    const x = i % S;
    const y = Math.floor(i / S);
    return x === 0 || y === 0 || x === S - 1 || y === S - 1 ? 'wall' : 'floor';
  });
  [g.x, g.y] = [5, 5];
  return { g, room };
}

// Observe (x, y): the events and the texts of the lines said.
function look(g, x, y) {
  const from = g.nextLogId;
  const ev = act(g, { type: 'observe', x, y });
  return { ev, texts: saidSince(g, from), lines: g.log.filter((l) => l.id >= from) };
}

const NEAR = CONFIG.observeClose;
const [A, B] = TEXT.observe.toadAsleep;
const CHAIN = TEXT.observeClose.toadAsleep;
const SINGS = TEXT.toad.singing;

test('observe names each kind of cell in sight, one line a click', () => {
  const { g, room } = openGame();
  room.t[idx(2, 2)] = 'grass';
  room.t[idx(8, 8)] = 'stairs';
  room.t[idx(2, 8)] = 'entrance';
  room.t[idx(5, 0)] = 'door';
  const want = [
    [[5, 5], 'you'],
    [[2, 2], 'grass'],
    [[3, 3], 'dirt'],
    [[0, 3], 'wall'],
    [[5, 0], 'door'],
    [[8, 8], 'stairs'],
    [[2, 8], 'entrance'],
  ];
  for (const [[x, y], name] of want) {
    for (let again = 0; again < 2; again++) {
      const r = look(g, x, y);
      assert.deepEqual(r.texts, [TEXT.observe[name]], name);
      assert.deepEqual(r.ev, [{ type: 'observe', x, y }]);
      assert.ok(r.lines.every((l) => l.kind === 'slot' || l.kind === 'observe'));
    }
  }
  room.corpses.push({ x: 7, y: 5, items: [] });
  assert.deepEqual(look(g, 7, 5).texts, [TEXT.observe.corpse]);
});

test('the sleeping toad from afar: one observation a click, then the last one again', () => {
  const { g } = openGame();
  const [x, y] = [5 + NEAR + 1, 5];
  putToad(g, x, y, true);
  assert.deepEqual(look(g, x, y).texts, [A]);
  assert.deepEqual(look(g, x, y).texts, [B]);
  assert.deepEqual(look(g, x, y).texts, [B], 'nothing new: the last again');
  assert.equal(view(g).event, null);
});

test('coming closer gives more: the chain, then its song, which is its event', () => {
  const { g, room } = openGame();
  const [x, y] = [5 + NEAR, 5];
  putToad(g, x, y, true);
  assert.deepEqual(look(g, x, y).texts, [A]);
  assert.deepEqual(look(g, x, y).texts, [B]);
  assert.deepEqual(look(g, x, y).texts, [CHAIN]);
  assert.equal(view(g).event, null);
  const turn = g.turn;
  const r = look(g, x, y);
  assert.deepEqual(r.texts, [SINGS]);
  assert.deepEqual(r.ev.map((e) => e.type), ['observe', 'event']);
  assert.equal(view(g).event.id, 'toad');
  assert.equal(g.turn, turn);
  // Back, and click again: the song again, straight away.
  act(g, { type: 'back' });
  assert.equal(view(g).event, null);
  assert.deepEqual(look(g, x, y).texts, [SINGS]);
  assert.equal(view(g).event.id, 'toad');
  act(g, { type: 'back' });
  // With the key gone from its chain, the chain is not there to see.
  room.toad.key = false;
  g.observed = {};
  assert.deepEqual([0, 1, 2].map(() => look(g, x, y).texts[0]), [A, B, SINGS]);
});

test('what you saw from afar is not said again up close', () => {
  const { g, room } = openGame();
  putToad(g, 5 + NEAR + 1, 5, true);
  look(g, 5 + NEAR + 1, 5);
  look(g, 5 + NEAR + 1, 5);
  room.toad.x = 5 + NEAR;
  assert.deepEqual(look(g, 5 + NEAR, 5).texts, [CHAIN]);
});

test('the toad awake; on a corpse, the toad is what you see', () => {
  const { g, room } = openGame();
  room.corpses.push({ x: 8, y: 5, items: [] });
  putToad(g, 8, 5, false).lastSeen = null;
  // (observing takes no time, so the toad does not move)
  assert.deepEqual(look(g, 8, 5).texts, [TEXT.observe.toad]);
  assert.deepEqual(look(g, 8, 5).texts, [TEXT.observe.toad]);
});

test('once sensed, units blink while they have something you have not observed', () => {
  const { g, room } = openGame();
  const far = [5 + NEAR + 1, 5];
  putToad(g, ...far, true);
  room.t[idx(5, 2)] = 'statue';
  room.statue = { x: 5, y: 2, spoke: false };
  const more = () => view(g).cells.map((c, i) => (c.more ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(more(), [], 'nothing blinks just for being there to look at');
  act(g, { type: 'context' }); // sense
  room.toad.asleep = true; // (whatever the turn did to it)
  [room.toad.x, room.toad.y] = far;
  assert.deepEqual(more(), [idx(5, 2), idx(...far)], 'the bust and the toad; never the ground');
  look(g, ...far);
  assert.ok(more().includes(idx(...far)), 'one more from afar');
  look(g, ...far);
  assert.deepEqual(more(), [idx(5, 2)]);
  // Closer, it has more again.
  room.toad.x = 5 + NEAR;
  const near = [5 + NEAR, 5];
  assert.ok(more().includes(idx(...near)));
  look(g, ...near); // the chain
  assert.ok(more().includes(idx(...near)), 'its song is still to come');
  look(g, ...near); // the song: its event
  act(g, { type: 'back' });
  assert.deepEqual(more(), [idx(5, 2)]);
  // The bust: one short line; once it has spoken, a new one.
  assert.deepEqual(look(g, 5, 2).texts, [TEXT.observe.statue]);
  assert.deepEqual(more(), []);
  room.statue.spoke = true;
  assert.deepEqual(more(), [idx(5, 2)]);
  assert.deepEqual(look(g, 5, 2).texts, [TEXT.observe.statueLifeless]);
  assert.deepEqual(more(), []);
  // Awake, the toad is new to look at; out of sight, nothing blinks.
  room.toad.asleep = false;
  assert.deepEqual(more(), [idx(...near)]);
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 4)] = 'wall';
  room.toad.y = 2;
  room.toad.x = 8;
  assert.deepEqual(more(), []);
});

test('remembered cells: the corpse you remember, never the toad out of sight unless sensed', () => {
  const { g, room } = openGame();
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 4)] = 'wall'; // a wall across, you below it
  room.seen.fill(false);
  room.memCorpse.fill(false);
  room.seen[idx(3, 2)] = true;
  room.memCorpse[idx(3, 2)] = true;
  room.seen[idx(6, 2)] = true;
  putToad(g, 6, 2, true);
  assert.deepEqual(look(g, 3, 2).texts, [TEXT.observe.corpse]);
  assert.deepEqual(look(g, 6, 2).texts, [TEXT.observe.dirt]);
  g.sensedTurn = g.turn;
  g.sensedRoom = g.room;
  assert.deepEqual(look(g, 6, 2).texts, [A]);
});

test('a cell never seen says nothing', () => {
  const { g, room } = openGame();
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 4)] = 'wall';
  room.seen.fill(false);
  const before = view(g);
  assert.deepEqual(act(g, { type: 'observe', x: 2, y: 2 }), []);
  assert.deepEqual(view(g), before);
});

test('observing takes no time, moves fresh, and is ignored with a menu or the inventory open', () => {
  const { g } = openGame();
  const turn = g.turn;
  const from = g.nextLogId;
  look(g, 3, 3);
  assert.equal(g.turn, turn);
  assert.equal(view(g).fresh, from);
  for (const id of ['act', 'inv']) {
    act(g, { type: 'menu', id });
    const before = view(g);
    assert.deepEqual(act(g, { type: 'observe', x: 3, y: 3 }), []);
    assert.deepEqual(view(g), before, id);
    act(g, { type: 'menu', id });
  }
  for (const bad of [{ x: -1, y: 2 }, { x: S, y: 2 }, { x: 2, y: 1.5 }, { x: '2', y: 2 }, {}]) {
    const before = view(g);
    assert.deepEqual(act(g, { type: 'observe', ...bad }), []);
    assert.deepEqual(view(g), before);
  }
});

// ---- sensing goes out: where it can go, taken in by walls (decisions 112 to 114) ----

const waveOf = (g) => act(g, { type: 'context' }).find((e) => e.type === 'sense').wave;
const at = (wave, x, y) => wave.find((c) => c.x === x && c.y === y);

test('sensing spreads a step at a time to every cell it can go, and walls take it in', () => {
  const { g, room } = openGame();
  // a wall across the room at y = 3, with a gap at x = 9
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 3)] = 'wall';
  room.t[idx(9, 3)] = 'floor';
  const wave = waveOf(g);
  assert.deepEqual(at(wave, 5, 5), { x: 5, y: 5, d: 0, absorb: false }, 'it starts from you');
  assert.equal(at(wave, 7, 6).d, 2, 'eight ways, a step at a time');
  // to (9, 4) in 4, then straight up through the gap (a diagonal would cut the wall's
  // corner) to (9, 2), then back along
  assert.equal(at(wave, 5, 2).d, 4 + 2 + 4, 'round through the gap, never cutting a corner');
  assert.equal(at(wave, 8, 2).d, 7, 'not diagonally out of the gap');
  assert.equal(at(wave, 9, 3).absorb, false, 'the gap passes it on');
  const wall = at(wave, 5, 3);
  assert.equal(wall.absorb, true, 'the wall takes it in');
  assert.equal(wall.d, 2, 'one step after the nearest cell it reached');
  assert.equal(at(wave, 0, 0).absorb, true, 'the corners too');
  for (const c of wave) {
    assert.equal(c.absorb, ['wall', 'golddoor', 'statue'].includes(room.t[idx(c.x, c.y)]), `${c.x},${c.y}`);
  }
  // every open cell once, in order of arrival
  const open = room.t.filter((t) => t === 'floor').length;
  assert.equal(wave.filter((c) => !c.absorb).length, open);
  assert.equal(new Set(wave.map((c) => idx(c.x, c.y))).size, wave.length);
  assert.ok(wave.every((c, k) => k === 0 || wave[k - 1].d <= c.d));
});

test('what sensing cannot reach is not marked, and does not blink', () => {
  const { g, room } = openGame();
  // the top of the room walled off whole, the toad and the bust beyond it
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 3)] = 'wall';
  putToad(g, 7, 1, true);
  room.t[idx(3, 1)] = 'statue';
  room.statue = { x: 3, y: 1, spoke: false };
  const wave = waveOf(g);
  assert.equal(at(wave, 7, 1), undefined);
  assert.equal(at(wave, 3, 1), undefined);
  assert.deepEqual(room.noticed, {});
  // open the wall and they are in sight, but still not sensed: nothing blinks
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 3)] = 'floor';
  room.toad.asleep = true;
  [room.toad.x, room.toad.y] = [7, 1];
  assert.ok(view(g).cells.every((c) => !c.more));
  // sense again and they do
  waveOf(g);
  room.toad.asleep = true;
  [room.toad.x, room.toad.y] = [7, 1];
  const more = view(g).cells.map((c, i) => (c.more ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(more, [idx(3, 1), idx(7, 1)]);
});

// ---- noticing without trying, as Brogue searches (decisions 116 to 119) ----

// Run fn with CONFIG.notice set to these numbers.
function withNotice(n, fn) {
  const was = { ...CONFIG.notice };
  Object.assign(CONFIG.notice, n);
  try {
    fn();
  } finally {
    Object.assign(CONFIG.notice, was);
  }
}

test('without trying, the nearer a unit, the likelier you notice it; none past its reach', () => {
  const { near, reach } = CONFIG.notice;
  assert.equal(noticeChance(1), near);
  for (let d = 1; d <= reach + 2; d++) assert.ok(noticeChance(d + 1) <= noticeChance(d), `${d}`);
  assert.equal(noticeChance(reach + 1), 0);
});

test('a unit in sight is noticed without sensing; one out of sight is not', () => {
  withNotice({ near: 1, reach: 20, secret: 0 }, () => {
    const { g, room } = openGame();
    putToad(g, 7, 5, true);
    const blinking = () => view(g).cells.map((c, i) => (c.more ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(blinking(), []);
    act(g, { type: 'wait' });
    assert.deepEqual(room.noticed, { toad: true });
    assert.deepEqual(blinking(), [idx(7, 5)]);
  });
  withNotice({ near: 1, reach: 20, secret: 0 }, () => {
    const { g, room } = openGame();
    for (let x = 1; x < S - 1; x++) room.t[idx(x, 3)] = 'wall';
    putToad(g, 7, 1, true);
    for (let k = 0; k < 5; k++) act(g, { type: 'wait' });
    assert.deepEqual(room.noticed, {}, 'behind a wall');
  });
  withNotice({ near: 0, reach: 20, secret: 0 }, () => {
    const { g, room } = openGame();
    putToad(g, 6, 5, true);
    for (let k = 0; k < 5; k++) act(g, { type: 'wait' });
    assert.deepEqual(room.noticed, {}, 'no chance, no noticing');
  });
});

test('a secret of the room can come without sensing, and sensing then tells the next', () => {
  withNotice({ near: 0, reach: 8, secret: 1 }, () => {
    const g = newGame({ seed: 21 });
    g.room = g.level.toadRoom;
    const room = openRoom(g);
    [g.x, g.y] = [5, 5];
    room.t[idx(5, 5)] = 'floor';
    let from = g.nextLogId;
    act(g, { type: 'wait' });
    assert.deepEqual(saidSince(g, from), [TEXT.senseToad[0]]);
    assert.equal(g.log[g.log.length - 1].kind, 'sense');
    from = g.nextLogId;
    act(g, { type: 'context' });
    assert.deepEqual(saidSince(g, from), [TEXT.senseToad[1]], 'one sensing, one line: the next');
  });
});

test('the wide button never blinks', () => {
  const g = newGame({ seed: 21 });
  g.room = g.level.toadRoom;
  openRoom(g);
  [g.x, g.y] = [5, 5];
  assert.equal(view(g).context.id, 'sense');
  assert.equal(view(g).context.more, false, 'even with all of the room still to sense');
});

test('an item blinks in the inventory until you inspect it', () => {
  const g = newGame({ seed: 21 });
  act(g, { type: 'menu', id: 'inv' });
  assert.equal(view(g).inv.items[0].more, true, 'the sword, never inspected');
  act(g, { type: 'context' }); // inspect
  assert.equal(view(g).inv.items[0].more, false);
  act(g, { type: 'back' });
  act(g, { type: 'menu', id: 'inv' });
  assert.equal(view(g).inv.items[0].more, false, 'and stays so');
});

