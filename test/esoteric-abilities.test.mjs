import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, currentRoom, newGame, view } from '../src/game.js';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { terrainGrid } from '../src/grid.js';
import { putToad } from './helpers.mjs';
import { chromeLift } from '../esoteric/center.js';

const start = () => newGame({ seed: 7, edition: 'esoteric' });
const shortcuts = (g) => view(g).abilities.map(({ id }) => id);
const openList = (g) => {
  act(g, { type: 'menu', id: 'act' });
  const event = view(g).event;
  assert.equal(event.id, 'abilities');
  assert.equal(event.lines[0].text, TEXT.button.abilities);
  assert.ok(event.options.every(({ label }) => typeof label === 'string' && label.length > 0));
  return event.options.map(({ label }) => label);
};
const texts = (g) => g.log.map((l) => l.text);

// Into the toad's room, beside nothing, with the toad gone unless a test puts one there.
function toadRoom(g) {
  while (g.level.toadRoom == null) {
    const st = g.level.stairs;
    [g.room, g.x, g.y] = [st.room, st.x, st.y];
    act(g, { type: 'ability', id: 'stairs' });
  }
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  room.toad = null;
  return room;
}

function grassIn(room) {
  const { size } = terrainGrid(room.t);
  const i = room.t.findIndex((c) => c === 'grass');
  return i < 0 ? null : [i % size, Math.floor(i / size)];
}

test('the esoteric edition has no sense: the first place is what is here, and wait is always listed', () => {
  const g = start();
  assert.deepEqual(shortcuts(g), []);
  assert.equal(view(g).context.label, '');
  assert.deepEqual(openList(g), [TEXT.button.waitName, TEXT.menu.rest, TEXT.menu.back]);
  act(g, { type: 'menu', id: 'act' });
  assert.equal(act(g, { type: 'ability', id: 'sense' }).length, 0);
  assert.equal(act(g, { type: 'context' }).length, 0);
  assert.equal(g.turn, 0);
  assert.ok(!texts(g).includes(TEXT.log.senseNothing));

  // in the grass, inspect comes first; hurt, rest beside it
  [g.x, g.y] = [2, 2];
  assert.equal(currentRoom(g).t[2 * 7 + 2], 'grass');
  assert.deepEqual(shortcuts(g), ['inspect']);
  assert.equal(view(g).context.id, 'inspect');
  g.hp--;
  g.knowsWorms = true;
  assert.deepEqual(shortcuts(g), ['inspect', 'rest']);
  // the first room's grass glows, and has no worms: no digging there
  assert.deepEqual(openList(g), [TEXT.context.inspect, TEXT.menu.rest, TEXT.button.waitName, TEXT.menu.back]);
  act(g, { type: 'back' });
  // in the toad's purple-green grass, knowing of worms, dig as well
  [g.x, g.y] = grassIn(toadRoom(g));
  assert.deepEqual(openList(g), [TEXT.context.inspect, TEXT.menu.rest, TEXT.menu.dig, TEXT.button.waitName, TEXT.menu.back]);
  act(g, { type: 'choose', index: 1 });
  assert.equal(g.hp, g.maxHp);
  assert.deepEqual(shortcuts(g), ['inspect', 'dig']);
  const before = g.turn;
  assert.ok(act(g, { type: 'ability', id: 'dig' }).some((e) => e.type === 'dig'));
  assert.equal(g.turn, before + CONFIG.digTurns);
  assert.ok(g.items.some((it) => it.key === 'worms'));
  // wait is taken from the row as an ability too
  const t = g.turn;
  act(g, { type: 'ability', id: 'wait' });
  assert.equal(g.turn, t + 1);
});

test('a corpse: eat, take items or back, and stepping off closes it too; the stairs are walked into', () => {
  const g = start();
  act(g, { type: 'move', dir: 's' });
  assert.deepEqual(shortcuts(g), []);
  currentRoom(g).corpses.push({ x: g.x, y: g.y, items: [{ key: 'key' }] });
  assert.deepEqual(shortcuts(g), ['corpse']);
  assert.deepEqual(openList(g), [TEXT.context.corpse, TEXT.button.waitName, TEXT.menu.rest, TEXT.menu.back]);
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).menu.id, 'corpse');
  // eat, take items and back (decision 276)
  assert.deepEqual(view(g).menu.options.map((o) => o?.label ?? null), [TEXT.menu.eat, TEXT.menu.takeItems, null, TEXT.menu.back]);
  act(g, { type: 'choose', index: 3 });
  assert.equal(view(g).menu, null, 'back closes it');
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).menu, null, 'nothing to choose with it closed');
  act(g, { type: 'context' });
  assert.equal(view(g).menu.id, 'corpse');
  act(g, { type: 'back' });
  assert.equal(view(g).menu, null, 'the back key closes it too');
  act(g, { type: 'context' });
  assert.equal(view(g).menu.id, 'corpse');
  // take items: a view of its own, the corpse's things and back
  act(g, { type: 'choose', index: 1 });
  assert.equal(view(g).event.id, 'loot');
  assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.thing.key, TEXT.menu.back]);
  act(g, { type: 'choose', index: 0 });
  assert.ok(g.items.some((it) => it.key === 'key'));
  assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.menu.back]);
  assert.ok(view(g).event.lines.some((l) => l.text === TEXT.menu.nothing));
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).event, null);
  assert.equal(view(g).menu.id, 'corpse', 'back to the corpse');
  // eat: once, a turn, and some hp back
  g.hp = 1;
  const turn = g.turn;
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.hp, 1 + CONFIG.eatHeals);
  assert.equal(g.turn, turn + 1);
  assert.equal(view(g).menu.options[0].disabled, true);
  assert.equal(g.log.at(-1).text, TEXT.log.eat);
  // stepping off closes it
  act(g, { type: 'move', dir: 'n' });
  assert.equal(view(g).menu, null);
  assert.deepEqual([g.x, g.y], [3, 4]);
  // the stairs are in the wall: a step into them goes down
  const { depth } = g;
  const { room, x, y, side } = g.level.stairs;
  const [dx, dy] = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[side];
  [g.room, g.x, g.y] = [room, x - dx, y - dy];
  currentRoom(g).toad = null;
  act(g, { type: 'move', dir: side });
  assert.equal(g.depth, depth + 1);

  const original = newGame({ seed: 7 });
  assert.equal(view(original).context.id, 'sense');
  assert.ok(act(original, { type: 'context' }).some((e) => e.type === 'sense'));
});

test('an awake toad blocks quiet actions and shortcuts cannot act through another screen', () => {
  const g = start();
  [g.x, g.y] = [2, 2];
  g.hp--;
  g.knowsWorms = true;
  putToad(g, 1, 2);
  assert.deepEqual(shortcuts(g), ['inspect']);
  const { turn } = g;
  for (const id of ['dig', 'rest', 'stairs', 'corpse', 'sense']) assert.deepEqual(act(g, { type: 'ability', id }), []);
  assert.deepEqual(openList(g), [TEXT.context.inspect, TEXT.button.waitName, TEXT.menu.back]);
  act(g, { type: 'back' });
  // the inventory is a page of its own: nothing on the map can be done while it is up
  act(g, { type: 'menu', id: 'inv' });
  assert.equal(view(g).event.id, 'inventory');
  assert.deepEqual(act(g, { type: 'ability', id: 'inspect' }), []);
  assert.equal(g.turn, turn);
});

test('inspecting the first room\'s grass: it glows; nothing under it, and no digging there', () => {
  const g = start();
  [g.x, g.y] = [1, 1];
  for (let k = 0; k < 3; k++) {
    const turn = g.turn;
    act(g, { type: 'ability', id: 'inspect' });
    assert.equal(g.turn, turn + 1);
    assert.equal(texts(g).at(-1), TEXT.inspect.glowing);
  }
  assert.equal(g.knowsWorms, false);
  assert.ok(!shortcuts(g).includes('dig'));
});

test('holding on grass uses its local name without learning to dig', () => {
  const g = start();
  const observeGrass = (x, y, name) => {
    const cell = view(g).cells[y * 7 + x];
    assert.equal(cell.t, 'grass');
    assert.equal(cell.label, name);
    act(g, { type: 'observe', x, y });
    assert.equal(g.log.at(-1).text, name);
    assert.equal(g.knowsWorms, false);
  };
  observeGrass(2, 2, TEXT.observe.grass);
  toadRoom(g);
  [g.x, g.y] = [1, 3];
  const i = view(g).cells.findIndex((c) => c.t === 'grass' && c.state === 'visible' && !c.thing);
  assert.ok(i >= 0);
  observeGrass(i % 7, Math.floor(i / 7), 'purplish grass');
});

test('inspecting the toad\'s purple-green grass: the ground struggles, and you can dig for worms', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame({ seed, edition: 'esoteric' });
    const room = toadRoom(g);
    const spot = grassIn(room);
    assert.ok(spot, `seed ${seed}: the toad's room has grass`);
    [g.x, g.y] = spot;
    assert.deepEqual(shortcuts(g), ['inspect']);
    assert.ok(view(g).cells.filter((c) => c.t === 'grass').every((c) => c.grass === 'purple'));
    const from = g.nextLogId;
    act(g, { type: 'ability', id: 'inspect' });
    // his two lines, one after the other: the one time an action says past two lines
    const { struggles, gained } = TEXT.inspect.purple;
    assert.deepEqual(g.log.filter((l) => l.id >= from).map((l) => [l.text, l.kind]), [[struggles, 'observe'], [gained, 'good']]);
    assert.equal(g.knowsWorms, true);
    assert.deepEqual(shortcuts(g), ['inspect', 'dig']);
    // again: the ground, and no more
    const again = g.nextLogId;
    act(g, { type: 'ability', id: 'inspect' });
    assert.deepEqual(g.log.filter((l) => l.id >= again).map((l) => l.text), [struggles]);
    // digging elsewhere: none, not even on the dirt beside it
    const { size } = terrainGrid(room.t);
    const dirt = room.t.findIndex((c) => c === 'floor');
    [g.x, g.y] = [dirt % size, Math.floor(dirt / size)];
    assert.ok(!shortcuts(g).includes('dig'));
  }
});

test('going about the toad\'s room, nothing comes by itself: what was sensed is gone', () => {
  const g = newGame({ seed: 3, edition: 'esoteric' });
  toadRoom(g);
  for (let k = 0; k < 400; k++) act(g, { type: 'wait' });
  for (const line of TEXT.toadRoom) assert.ok(!texts(g).includes(line), line);
  assert.ok(!texts(g).includes(TEXT.log.sounds));
  assert.equal(g.knowsWorms, false);
});

test('waiting beside a sleeping toad reveals only its necklace, and nothing blinks', () => {
  const g = newGame({ seed: 3, edition: 'esoteric' });
  putToad(g, g.x + 1, g.y, true);
  for (let k = 0; k < 60; k++) {
    act(g, { type: 'wait' });
    assert.ok(view(g).cells.every((c) => !c.more));
  }
  assert.deepEqual(g.log.filter((l) => l.kind === 'observe').map((l) => l.text), [
    'around the toad’s neck is necklace holding a golden key',
  ]);
  g.items.push({ key: 'key', inHand: false });
  act(g, { type: 'menu', id: 'inv' });
  assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.thing.sword, TEXT.thing.key, TEXT.menu.back]);
});

test('observing yourself shows your numbers for a while', () => {
  const g = start();
  assert.equal(view(g).stats.str, null);
  act(g, { type: 'observe', x: g.x, y: g.y });
  assert.equal(view(g).stats.str, g.str);
  for (let k = 0; k < CONFIG.selfTurns; k++) act(g, { type: 'wait' });
  assert.equal(view(g).stats.str, null);
});

test('in Chrome on an Android phone the room is lifted to the middle of the whole screen', () => {
  const phone = { android: true, touch: true, standalone: false, screenH: 915, pageH: 808 };
  assert.equal(chromeLift({ ...phone, bottomInset: 24 }), 54); // the page runs under the nav bar
  assert.equal(chromeLift({ ...phone, bottomInset: 0 }), 6); // a nav bar of 48 below it
  assert.equal(chromeLift({ ...phone, bottomInset: 24, standalone: true }), 0);
  assert.equal(chromeLift({ ...phone, bottomInset: 24, android: false }), 0);
  assert.equal(chromeLift({ ...phone, bottomInset: 24, touch: false }), 0);
  assert.equal(chromeLift({ ...phone, bottomInset: 0, pageH: 915 }), 0);
});
