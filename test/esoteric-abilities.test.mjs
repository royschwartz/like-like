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

  // in the grass, inspect comes first; hurt, rest beside it; knowing of worms, dig as well
  [g.x, g.y] = [2, 2];
  assert.equal(currentRoom(g).t[2 * 7 + 2], 'grass');
  assert.deepEqual(shortcuts(g), ['inspect']);
  assert.equal(view(g).context.id, 'inspect');
  g.hp--;
  g.knowsWorms = true;
  assert.deepEqual(shortcuts(g), ['inspect', 'rest']);
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

test('a corpse: eat or take items, no back, stepping off closes it; the stairs are walked into', () => {
  const g = start();
  act(g, { type: 'move', dir: 's' });
  assert.deepEqual(shortcuts(g), []);
  currentRoom(g).corpses.push({ x: g.x, y: g.y, items: [{ key: 'key' }] });
  assert.deepEqual(shortcuts(g), ['corpse']);
  assert.deepEqual(openList(g), [TEXT.context.corpse, TEXT.button.waitName, TEXT.menu.rest, TEXT.menu.back]);
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).menu.id, 'corpse');
  // eat and take items, and no back
  assert.deepEqual(view(g).menu.options.map((o) => o?.label ?? null), [TEXT.menu.eat, TEXT.menu.takeItems, null, null]);
  assert.deepEqual(act(g, { type: 'back' }), []);
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
  act(g, { type: 'move', dir: 's' });
  const { depth } = g;
  // the stairs are in the wall below: a step into them goes down
  act(g, { type: 'move', dir: 's' });
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
  act(g, { type: 'menu', id: 'inv' });
  assert.deepEqual(shortcuts(g), []);
  assert.deepEqual(act(g, { type: 'ability', id: 'inspect' }), []);
  assert.equal(view(g).context.id, 'inspect');
  assert.equal(g.turn, turn);
});

test('inspecting the grass of the toad\'s room tells of the worms, once; then of the grass', () => {
  let found = false;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const g = newGame({ seed, edition: 'esoteric' });
    const room = toadRoom(g);
    const spot = grassIn(room);
    if (!spot) continue;
    found = true;
    [g.x, g.y] = spot;
    assert.deepEqual(shortcuts(g), ['inspect']);
    const worms = TEXT.senseToad[TEXT.senseToad.length - 1];
    act(g, { type: 'ability', id: 'inspect' });
    assert.equal(texts(g).at(-1), worms);
    assert.equal(g.knowsWorms, true);
    act(g, { type: 'ability', id: 'inspect' });
    assert.equal(texts(g).filter((t) => t === worms).length, 1);
    assert.equal(texts(g).at(-1), [].concat(TEXT.observe.grass)[0]);
  }
  assert.ok(found, 'some toad room has grass');
});

test('going about the toad\'s room, its air and ground come by themselves, but never the worms', () => {
  const g = newGame({ seed: 3, edition: 'esoteric' });
  toadRoom(g);
  const ambient = TEXT.senseToad.slice(0, -1);
  for (let k = 0; k < 400; k++) act(g, { type: 'wait' });
  for (const line of ambient) assert.ok(texts(g).includes(line), line);
  assert.ok(!texts(g).includes(TEXT.senseToad.at(-1)));
  assert.equal(g.knowsWorms, false);
  // one at a time
  const at = (t) => g.log.find((l) => l.text === t).id;
  assert.equal(new Set(ambient.map(at)).size, ambient.length);
});

test('beside a sleeping toad you notice its details, never its plain line, and nothing blinks', () => {
  const g = newGame({ seed: 3, edition: 'esoteric' });
  toadRoom(g);
  // a toad beside you, put back to sleep every turn
  const room = currentRoom(g);
  const { size } = terrainGrid(room.t);
  const open = (x, y) => ['floor', 'grass'].includes(room.t[y * size + x]);
  let spot = null;
  for (let y = 1; y < size - 1 && !spot; y++) for (let x = 1; x < size - 2 && !spot; x++) if (open(x, y) && open(x + 1, y)) spot = [x, y];
  [g.x, g.y] = spot;
  const toad = putToad(g, spot[0] + 1, spot[1], true);
  for (let k = 0; k < 60 && !(g.observed['unit.toad.chain'] && g.observed['unit.toad.sings']); k++) {
    act(g, { type: 'wait' });
    toad.asleep = true;
    assert.ok(view(g).cells.every((c) => !c.more));
  }
  for (const id of ['unit.toad.stronger', 'unit.toad.chain', 'unit.toad.sings']) assert.ok(g.observed[id], id);
  assert.ok(!g.observed['unit.toad.asleep']);
  g.items.push({ key: 'key', inHand: false });
  act(g, { type: 'menu', id: 'inv' });
  assert.ok(view(g).inv.items.every((it) => !it.more));
});

test('observing yourself shows your numbers for a while', () => {
  const g = start();
  assert.equal(view(g).stats.str, null);
  act(g, { type: 'observe', x: g.x, y: g.y });
  assert.equal(view(g).stats.str, g.str);
  for (let k = 0; k < CONFIG.senseSelfTurns; k++) act(g, { type: 'wait' });
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
