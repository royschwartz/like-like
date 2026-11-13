import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { newGame, act, view } from '../src/game.js';
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

test('units blink while they have something you have not observed', () => {
  const { g, room } = openGame();
  const far = [5 + NEAR + 1, 5];
  putToad(g, ...far, true);
  room.t[idx(5, 2)] = 'statue';
  room.statue = { x: 5, y: 2, spoke: false };
  const more = () => view(g).cells.map((c, i) => (c.more ? i : -1)).filter((i) => i >= 0);
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
