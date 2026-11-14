import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { fov } from '../src/fov.js';
import { DOOR } from '../src/gen.js';
import { chebyshev, isStep, cutsCorner } from '../src/path.js';
import { putToad, openRoom, S, idx, DIRS } from './helpers.mjs';

// A game in an open room: floor inside, wall round it, all of it seen; you at (x, y).
function openGame(x = 5, y = 5, seed = 31) {
  const g = newGame({ seed });
  const room = openRoom(g);
  room.t = room.t.map((c, i) => {
    const cx = i % S;
    const cy = Math.floor(i / S);
    return cx === 0 || cy === 0 || cx === S - 1 || cy === S - 1 ? 'wall' : 'floor';
  });
  room.seen.fill(true);
  room.noticed = { toad: true, statue: true }; // so noticing never stops a travel by chance
  [g.x, g.y] = [x, y];
  return { g, room };
}

const travel = (g, x, y) => act(g, { type: 'travel', x, y });
const pathOf = (g, x, y) => act(g, { type: 'look', x, y })[0].path;
const at = (g) => [g.x, g.y];

// Travel to (x, y), continuing while it goes on. The cells walked and the turns it took.
function go(g, x, y) {
  const turn = g.turn;
  const walked = [];
  let ev = travel(g, x, y);
  walked.push([g.x, g.y]);
  for (let k = 0; k < 50 && view(g).going; k++) {
    ev = act(g, { type: 'continue' });
    walked.push([g.x, g.y]);
  }
  return { turns: g.turn - turn, walked, last: ev };
}

// Every step of a path is one legal step onto a seen cell you could stand on.
function assertWalkable(room, from, path) {
  let [x, y] = from;
  for (const c of path) {
    const i = idx(c.x, c.y);
    assert.ok(room.seen[i], `${c.x},${c.y} seen`);
    assert.ok(!['wall', 'statue', 'golddoor'].includes(room.t[i]), `${c.x},${c.y} is ${room.t[i]}`);
    assert.ok(isStep(room.t, x, y, c.x, c.y), `${x},${y} to ${c.x},${c.y} is a legal step`);
    [x, y] = [c.x, c.y];
  }
}

test('look shows the way, straight as it can be, and changes nothing', () => {
  const { g, room } = openGame(2, 2);
  act(g, { type: 'wait' });
  const before = JSON.stringify(g);
  const ev = act(g, { type: 'look', x: 8, y: 5 });
  assert.deepEqual(ev, [
    { type: 'look', x: 8, y: 5, path: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 5 }, { x: 8, y: 5 }] },
  ]);
  assert.equal(JSON.stringify(g), before, 'no turn, no line, no chance used');
  assertWalkable(room, [2, 2], ev[0].path);
  // your own cell, and a cell never seen
  assert.deepEqual(act(g, { type: 'look', x: 2, y: 2 }), [{ type: 'look', x: 2, y: 2, path: [] }]);
  room.t[idx(8, 8)] = 'wall'; // (9, 9) out of sight behind it
  room.seen[idx(9, 9)] = false;
  assert.deepEqual(act(g, { type: 'look', x: 9, y: 9 }), []);
  assert.deepEqual(act(g, { type: 'travel', x: 9, y: 9 }), []);
  // off the room, or under a menu
  assert.deepEqual(act(g, { type: 'look', x: 11, y: 2 }), []);
  assert.deepEqual(act(g, { type: 'look', x: 2.5, y: 2 }), []);
  act(g, { type: 'menu', id: 'act' });
  assert.deepEqual(act(g, { type: 'look', x: 8, y: 5 }), []);
  assert.deepEqual(act(g, { type: 'travel', x: 8, y: 5 }), []);
});

test('the way never crosses an unseen cell or a wall, and never cuts a corner', () => {
  const { g, room } = openGame(2, 2);
  // a wall down x = 4 with a gap at the bottom
  for (let y = 1; y <= 7; y++) room.t[idx(4, y)] = 'wall';
  let path = pathOf(g, 6, 2);
  assertWalkable(room, [2, 2], path);
  assert.ok(path.some((c) => c.x === 4), 'through the gap');
  assert.deepEqual(path[path.length - 1], { x: 6, y: 2 });
  // out of the gap: never diagonally past the end of the wall
  for (let k = 1; k < path.length; k++) {
    const [a, b] = [path[k - 1], path[k]];
    assert.ok(!cutsCorner(room.t, a.x, a.y, b.x - a.x, b.y - a.y));
  }
  // with (4, 9) unseen, only (4, 8) is left
  room.seen[idx(4, 9)] = false;
  path = pathOf(g, 6, 2);
  assertWalkable(room, [2, 2], path);
  assert.ok(path.some((c) => c.x === 4 && c.y === 8));
  // with the gap unseen, there is no way: no turn, nothing
  room.seen[idx(4, 8)] = false;
  assert.deepEqual(pathOf(g, 6, 2), []);
  const turn = g.turn;
  assert.deepEqual(travel(g, 6, 2), []);
  assert.equal(g.turn, turn);
  assert.equal(view(g).going, false);
});

test('a wall: the way goes to a cell beside it', () => {
  const { g, room } = openGame(1, 5);
  room.t[idx(7, 5)] = 'wall';
  const path = pathOf(g, 7, 5);
  assert.equal(path.length, 5);
  assert.deepEqual(path[path.length - 1], { x: 6, y: 5 });
  assert.deepEqual(pathOf(g, 0, 5), [], 'already beside the room wall');
});

test('travel walks a far cell in as many turns as steps, eight ways', () => {
  const { g } = openGame(2, 2);
  const look = pathOf(g, 8, 5);
  const ev = travel(g, 8, 5);
  assert.deepEqual(ev.find((e) => e.type === 'travel'), { type: 'travel', x: 8, y: 5, path: look.slice(1) });
  assert.equal(view(g).going, true);
  assert.deepEqual(g.going, { x: 8, y: 5 });
  const walked = [{ x: g.x, y: g.y }];
  let last = ev;
  while (view(g).going) {
    last = act(g, { type: 'continue' });
    walked.push({ x: g.x, y: g.y });
  }
  assert.deepEqual(at(g), [8, 5]);
  assert.equal(walked.length, chebyshev(2, 2, 8, 5), 'a turn a step');
  assert.equal(g.turn, 6);
  assert.deepEqual(walked, look, 'it walks what look showed');
  assert.deepEqual(last.find((e) => e.type === 'travel').path, []);
  assert.equal(view(g).going, false);
  assert.equal(g.going, null);
  assert.deepEqual(act(g, { type: 'continue' }), [], 'nothing to go on with');
});

test('travel to your own cell waits a turn', () => {
  const { g } = openGame();
  const turn = g.turn;
  const ev = travel(g, 5, 5);
  assert.equal(g.turn, turn + 1);
  assert.deepEqual(at(g), [5, 5]);
  assert.ok(!ev.some((e) => e.type === 'travel'));
  assert.equal(view(g).going, false);
});

test('travel to the bust stops beside it; from there, travel to it opens it', () => {
  const { g, room } = openGame(2, 5);
  room.t[idx(8, 5)] = 'statue';
  room.statue = { x: 8, y: 5, spoke: false };
  const r = go(g, 8, 5);
  assert.deepEqual(at(g), [7, 5]);
  assert.equal(r.turns, 5);
  assert.equal(view(g).event, null, 'no event on the way');
  assert.deepEqual(pathOf(g, 8, 5), []);
  const turn = g.turn;
  const ev = travel(g, 8, 5);
  assert.ok(ev.some((e) => e.type === 'event' && e.id === 'dee'));
  assert.equal(g.turn, turn, 'the bust takes no turn');
  assert.deepEqual(at(g), [7, 5]);
});

test('travel to the bust from a diagonal it can reach opens it', () => {
  const { g, room } = openGame(7, 6);
  room.t[idx(8, 5)] = 'statue';
  room.statue = { x: 8, y: 5, spoke: false };
  assert.ok(travel(g, 8, 5).some((e) => e.type === 'event' && e.id === 'dee'));
});

test('travel to the sleeping toad stops beside it without a blow; again, and you strike', () => {
  const { g, room } = openGame(2, 5);
  const t = putToad(g, 8, 5, true);
  const path = pathOf(g, 8, 5);
  assert.deepEqual(path[path.length - 1], { x: 7, y: 5 }, 'the way ends beside it');
  const r = go(g, 8, 5);
  assert.deepEqual(at(g), [7, 5]);
  assert.equal(r.turns, 5);
  assert.equal(t.asleep, true);
  assert.equal(t.hp, 8);
  assert.equal(room.toad, t);
  const ev = travel(g, 8, 5);
  assert.ok(ev.some((e) => e.type === 'attack' && e.by === 'player'));
  assert.equal(t.asleep, false);
});

test('the way goes round a toad you can see', () => {
  const { g } = openGame(2, 5);
  putToad(g, 5, 5, true);
  const path = pathOf(g, 8, 5);
  assert.equal(path.length, 6);
  assert.ok(!path.some((c) => c.x === 5 && c.y === 5));
});

test('travel into a door changes room and stops', () => {
  const g = newGame({ seed: 31 });
  const room = openRoom(g);
  room.seen.fill(true);
  room.noticed = { toad: true, statue: true };
  const dir = DIRS.find((d) => room.nb[d] !== null);
  assert.ok(dir, 'a door');
  const [dx, dy] = DOOR[dir];
  [g.x, g.y] = [5, 5];
  const path = pathOf(g, dx, dy);
  assert.deepEqual(path[path.length - 1], { x: dx, y: dy });
  assert.ok(path.slice(0, -1).every((c) => room.t[idx(c.x, c.y)] !== 'door'), 'a door only at the end');
  const r = go(g, dx, dy);
  assert.equal(g.room, room.nb[dir]);
  assert.ok(r.last.some((e) => e.type === 'room'));
  assert.deepEqual(r.last.find((e) => e.type === 'travel').path, []);
  assert.equal(view(g).going, false);
});

test('travel stops when a toad comes into view', () => {
  const { g, room } = openGame(2, 8);
  // the toad behind a wall down x = 6
  for (let y = 1; y <= 7; y++) room.t[idx(6, y)] = 'wall';
  const t = putToad(g, 8, 2, true);
  const inView = () => fov(room.t, g.x, g.y)[idx(t.x, t.y)];
  assert.equal(inView(), false);
  go(g, 9, 9);
  assert.equal(inView(), true);
  assert.notDeepEqual(at(g), [9, 9], 'stopped short');
  assert.equal(view(g).going, false);
  // already in view, asleep: it goes on
  go(g, 9, 9);
  assert.deepEqual(at(g), [9, 9]);
});

test('with an awake toad in sight, each travel is one step', () => {
  const { g } = openGame(2, 2);
  putToad(g, 9, 9, false);
  const ev = travel(g, 2, 8);
  assert.deepEqual(at(g), [2, 3]);
  assert.deepEqual(ev.find((e) => e.type === 'travel').path, []);
  assert.equal(view(g).going, false);
});

test('travel stops when something is said', () => {
  // passing beside the bust with worms that hold a memory: its sounds
  const { g, room } = openGame(1, 5);
  room.t[idx(5, 4)] = 'statue';
  room.statue = { x: 5, y: 4, spoke: false };
  g.items.push({ key: 'worms', inHand: false });
  const from = g.nextLogId;
  go(g, 9, 5);
  assert.deepEqual(at(g), [4, 5]);
  assert.equal(g.log.filter((l) => l.id >= from).length, 1);
  assert.equal(view(g).going, false);
});

test('travel stops when it notices a unit', () => {
  // noticing: the bust unnoticed in sight is noticed sooner or later
  const { g, room } = openGame(1, 1);
  room.t[idx(9, 9)] = 'statue';
  room.statue = { x: 9, y: 9, spoke: false };
  room.noticed = {};
  let stops = 0;
  for (let k = 0; k < 20 && !room.noticed.statue; k++) {
    const before = at(g);
    go(g, before[0] === 1 ? 8 : 1, 1);
    if (!room.noticed.statue) continue;
    stops++;
    assert.equal(view(g).going, false);
  }
  assert.equal(stops, 1, 'noticed, and that stopped it');
});

test('any other action ends a travel; stop says so once', () => {
  for (const other of [{ type: 'wait' }, { type: 'look', x: 3, y: 3 }, { type: 'observe', x: 3, y: 3 }, { type: 'menu', id: 'inv' }, { type: 'dance' }]) {
    const { g } = openGame(1, 1);
    travel(g, 9, 9);
    assert.equal(view(g).going, true);
    act(g, other);
    assert.equal(view(g).going, false, JSON.stringify(other));
  }
  const { g } = openGame(1, 1);
  travel(g, 9, 9);
  const turn = g.turn;
  assert.deepEqual(act(g, { type: 'stop' }), [{ type: 'stop' }]);
  assert.equal(g.turn, turn);
  assert.deepEqual(act(g, { type: 'stop' }), []);
  assert.deepEqual(act(g, { type: 'continue' }), []);
  assert.deepEqual(at(g), [2, 2]);
});

test('going starts null, and is null after a restart', () => {
  const { g } = openGame(1, 1);
  travel(g, 9, 9);
  g.going = { x: 9, y: 9 };
  act(g, { type: 'menu', id: 'sys' });
  act(g, { type: 'choose', index: 0 }); // restart
  assert.equal(g.going, null);
  assert.equal(newGame({ seed: 3 }).going, null);
});

test('a step can go diagonally, and the toad strikes diagonally', () => {
  const { g } = openGame();
  const turn = g.turn;
  travel(g, 6, 6);
  assert.deepEqual(at(g), [6, 6]);
  assert.equal(g.turn, turn + 1);
  // an awake toad one diagonal step away strikes
  const t = putToad(g, 7, 7, false);
  const ev = act(g, { type: 'wait' });
  assert.ok(ev.some((e) => e.type === 'attack' && e.by === 'toad'));
  assert.deepEqual([t.x, t.y], [7, 7]);
  // and you strike it diagonally
  const ev2 = travel(g, 7, 7);
  assert.ok(ev2.some((e) => e.type === 'attack' && e.by === 'player'));
});

test('the corner rule: no diagonal past a wall, for you or the toad', () => {
  const { g, room } = openGame();
  room.t[idx(6, 5)] = 'wall';
  // the way to (6, 6) goes round the corner: two steps
  assert.deepEqual(pathOf(g, 6, 6), [{ x: 5, y: 6 }, { x: 6, y: 6 }]);
  // a toad there can't strike across it, nor be struck
  const t = putToad(g, 6, 6, false);
  const ev = act(g, { type: 'wait' });
  assert.ok(!ev.some((e) => e.type === 'attack'), 'no blow across the corner');
  assert.ok(isStep(room.t, t.x, t.y, g.x, g.y), 'it came round to a cell it can strike from');
  // a sleeping toad across the corner: travel walks round to it and does not strike
  const h = openGame();
  h.room.t[idx(6, 5)] = 'wall';
  const s = putToad(h.g, 6, 6, true);
  const r = travel(h.g, 6, 6);
  assert.ok(!r.some((e) => e.type === 'attack'));
  assert.deepEqual(at(h.g), [5, 6]);
  assert.equal(s.asleep, true);
  // the bust too
  const b = openGame();
  b.room.t[idx(6, 5)] = 'wall';
  b.room.t[idx(6, 6)] = 'statue';
  b.room.statue = { x: 6, y: 6, spoke: false };
  const turn = b.g.turn;
  assert.ok(!travel(b.g, 6, 6).some((e) => e.type === 'event'));
  assert.deepEqual(at(b.g), [5, 6]);
  assert.equal(b.g.turn, turn + 1);
  // and a straight arrow into the wall is still nothing
  const before = b.g.turn;
  [b.g.x, b.g.y] = [5, 5];
  assert.deepEqual(act(b.g, { type: 'move', dir: 'e' }), []);
  assert.equal(b.g.turn, before);
});
