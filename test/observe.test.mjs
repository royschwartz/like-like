import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { clearGoblins, makeGoblin, S, idx } from './helpers.mjs';

// A game in an open room: floor inside, wall round it, nothing else; you at (5, 5).
function openGame(seed = 31) {
  const g = newGame({ seed });
  clearGoblins(g);
  const room = currentRoom(g);
  room.t = room.t.map((c, i) => {
    const x = i % S;
    const y = Math.floor(i / S);
    return x === 0 || y === 0 || x === S - 1 || y === S - 1 ? 'wall' : 'floor';
  });
  room.corpses = [];
  [g.x, g.y] = [5, 5];
  return { g, room };
}

// Observe (x, y): the events and the texts of the lines said.
function look(g, x, y) {
  const from = g.nextLogId;
  const ev = act(g, { type: 'observe', x, y });
  return { ev, texts: g.log.filter((l) => l.id >= from).map((l) => l.text), lines: g.log.filter((l) => l.id >= from) };
}

test('observe names each kind of cell in sight', () => {
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
    const r = look(g, x, y);
    assert.deepEqual(r.texts, [TEXT.observe[name]], name);
    assert.deepEqual(r.ev, [{ type: 'observe', x, y }]);
    assert.ok(r.lines.every((l) => l.kind === 'slot' || l.kind === 'observe'));
  }
  room.corpses.push({ x: 7, y: 5, items: [] });
  assert.deepEqual(look(g, 7, 5).texts, [TEXT.observe.corpse]);
});

test('goblins, awake and asleep, and the close line inside CONFIG.observeClose', () => {
  const { g, room } = openGame();
  const near = CONFIG.observeClose;
  for (const asleep of [false, true]) {
    const name = asleep ? 'goblinAsleep' : 'goblin';
    room.goblins = [makeGoblin(5 + near, 5, asleep)];
    assert.deepEqual(look(g, 5 + near, 5).texts, [TEXT.observe[name], TEXT.observeClose[name]], `${name} close`);
    room.goblins = [makeGoblin(5 + near + 1, 5, asleep)];
    assert.deepEqual(look(g, 5 + near + 1, 5).texts, [TEXT.observe[name]], `${name} far`);
  }
  // A goblin on a corpse: the goblin is what you see.
  room.corpses.push({ x: 6, y: 5, items: [] });
  room.goblins = [makeGoblin(6, 5, false)];
  assert.equal(look(g, 6, 5).texts[0], TEXT.observe.goblin);
});

test('remembered cells: the corpse you remember, never a goblin out of sight unless sensed', () => {
  const { g, room } = openGame();
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 4)] = 'wall'; // a wall across, you below it
  room.seen.fill(false);
  room.memCorpse.fill(false);
  room.seen[idx(3, 2)] = true;
  room.memCorpse[idx(3, 2)] = true;
  room.seen[idx(6, 2)] = true;
  room.goblins = [makeGoblin(6, 2, false)];
  assert.deepEqual(look(g, 3, 2).texts, [TEXT.observe.corpse]);
  assert.deepEqual(look(g, 6, 2).texts, [TEXT.observe.dirt]);
  g.sensedTurn = g.turn;
  g.sensedRoom = g.room;
  assert.deepEqual(look(g, 6, 2).texts, [TEXT.observe.goblin]);
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
