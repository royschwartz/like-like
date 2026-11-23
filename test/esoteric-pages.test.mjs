import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { TEXT } from '../src/text.js';

const start = () => newGame({ seed: 7, edition: 'esoteric' });
const menu = (g, id) => act(g, { type: 'menu', id });
const back = (g) => act(g, { type: 'back' });
const lines = (g) => view(g).event.lines.map((line) => line.text);

test('the esoteric psyche page shows the same masked or perceived stats as the player sees', () => {
  const g = start();
  g.hp = 2;
  for (const sensed of [false, true]) {
    // no sense in this edition: observing yourself shows your numbers
    if (sensed) act(g, { type: 'observe', x: g.x, y: g.y });
    const { turn, stats, log } = view(g);
    assert.deepEqual(menu(g, 'psy'), [{ type: 'event', id: 'psyche' }]);
    const wanted = (stat) => sensed ? g[stat] : TEXT.stat.unknown;
    assert.deepEqual(lines(g), [
      'psyche',
      `${TEXT.stat.str} ${wanted('str')}`,
      `${TEXT.stat.will} ${wanted('will')}`,
      `${TEXT.stat.love} ${wanted('love')}`,
      `${TEXT.stat.hp} ${stats.hp}/${stats.maxHp}`,
    ]);
    // the way to what had icons at the bottom of the screen (November 23)
    assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.button.inventory, TEXT.button.memories, TEXT.button.options, TEXT.menu.back]);
    act(g, { type: 'wait' });
    back(g);
    assert.equal(g.turn, turn);
    assert.equal(g.event, null);
    assert.equal(g.menu, null);
    assert.deepEqual(view(g).log, log);
  }
});

test('psyche preserves a menu cursor through its own system menu', () => {
  // (The inventory is a page of its own now, with no stat row to open the psyche from.)
  for (const id of ['sys']) {
    const g = start();
    g.items.push({ key: 'key', inHand: false });
    menu(g, id);
    act(g, id === 'inv' ? { type: 'pick', index: 1 } : { type: 'move', dir: 'e' });
    const origin = view(g);
    assert.equal((origin.inv ?? origin.menu).cursor, 1);
    menu(g, 'psy');
    assert.equal(g.event.id, 'psyche');
    assert.equal(g.inv, null);
    assert.equal(g.menu, null);
    menu(g, 'sys');
    assert.equal(g.menu.cursor, 0, 'the system menu on this page starts fresh');
    back(g);
    assert.equal(g.event.id, 'psyche');
    act(g, { type: 'choose', index: 3 }); // back
    assert.deepEqual(view(g), origin);
  }
});

test('restarting from psyche discards its originating inventory', () => {
  const g = start();
  menu(g, 'inv');
  menu(g, 'psy');
  menu(g, 'sys');
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.inv, null);
  assert.equal(g.menu, null);
  assert.equal(g.event, null);
  menu(g, 'psy');
  back(g);
  assert.equal(g.inv, null);
});

test('the empty memories list has only back and can be reopened without taking a turn', () => {
  const g = start();
  const before = view(g);
  for (let i = 0; i < 2; i++) {
    menu(g, 'memories');
    assert.equal(g.event.id, 'memories');
    assert.deepEqual(lines(g), ['memories', TEXT.menu.nothing]);
    assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.menu.back]);
    act(g, { type: 'context' });
    assert.deepEqual(view(g), before);
  }
});

test('an automatic memory closes to play; reading it from the list returns there through the system menu', () => {
  const g = start();
  g.recall = { id: 'worms', turn: g.turn + 1 };
  act(g, { type: 'wait' });
  assert.deepEqual(lines(g), TEXT.memories.worms);
  back(g);
  assert.equal(g.event, null);
  const { turn, log } = view(g);
  menu(g, 'memories');
  assert.deepEqual(lines(g), ['memories']);
  assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.menu.memory, TEXT.menu.back]);
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.event.id, 'memory');
  assert.deepEqual(lines(g), TEXT.memories.worms);
  menu(g, 'sys');
  act(g, { type: 'choose', index: 1 });
  back(g);
  assert.equal(g.menu, null);
  assert.equal(g.event.id, 'memory');
  back(g);
  assert.equal(g.event.id, 'memories');
  assert.equal(g.event.cursor, 0);
  back(g);
  assert.equal(g.event, null);
  assert.equal(g.turn, turn);
  assert.deepEqual(view(g).log, log);
  assert.deepEqual(g.memories, ['worms']);
});

test('restarting from a library memory clears its return page; the original psy menu is independent', () => {
  const g = start();
  g.memories.push('worms');
  menu(g, 'memories');
  act(g, { type: 'context' });
  menu(g, 'sys');
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.event, null);
  assert.equal(g.menu, null);
  menu(g, 'memories');
  assert.deepEqual(lines(g), ['memories', TEXT.menu.nothing]);

  const original = newGame({ seed: 7 });
  assert.deepEqual(menu(original, 'memories'), []);
  menu(original, 'psy');
  assert.equal(original.event, null);
  assert.equal(original.menu.id, 'psy');
});

test('the esoteric opening: his two lines on a screen of their own, one way on, none back', () => {
  for (const seed of [7, 19, 39]) {
    const g = newGame({ seed, edition: 'esoteric', opening: true });
    const v = view(g);
    assert.equal(v.event.id, 'opening');
    assert.deepEqual(lines(g), TEXT.openingEsoteric.lines);
    // each its own paragraph
    assert.deepEqual(v.event.lines.map((l) => l.passage), [0, 1]);
    assert.deepEqual(v.event.options.map((o) => o.label), [TEXT.openingEsoteric.jump]);
    // the log already has where you land, and nothing of the opening
    assert.deepEqual(v.log.map((l) => l.text), [TEXT.log.descend[g.level.entrance.ground]]);
    // no way back, and nothing moves you while it is up
    const at = [g.x, g.y];
    assert.deepEqual(back(g), []);
    act(g, { type: 'move', dir: 's' });
    assert.deepEqual([g.x, g.y], at);
    assert.equal(view(g).event.id, 'opening');
    // jumping into the hole: the room, with the stairs' cover, and no turn gone
    const turn = g.turn;
    const events = act(g, { type: 'choose', index: 0 });
    assert.deepEqual(events, [{ type: 'descend' }]);
    assert.equal(view(g).event, null);
    assert.equal(g.turn, turn);
    assert.equal(g.depth, 1);
  }
});

test('the opening comes back on a restart, and never without being asked for', () => {
  const g = newGame({ seed: 7, edition: 'esoteric', opening: true });
  act(g, { type: 'context' }); // the keys' choice: jump into the hole
  assert.equal(view(g).event, null);
  menu(g, 'sys');
  const restart = view(g).menu.options.findIndex((o) => o && o.label === TEXT.menu.restart);
  act(g, { type: 'choose', index: restart });
  assert.equal(view(g).event?.id, 'opening');
  // a game made without it starts in the room, and so does its restart
  const plain = start();
  assert.equal(view(plain).event, null);
  menu(plain, 'sys');
  act(plain, { type: 'choose', index: restart });
  assert.equal(view(plain).event, null);
  // the original edition never has it
  assert.equal(view(newGame({ seed: 7, opening: true })).event, null);
});

test('the inventory is a page: its items listed, each its own page of choices', () => {
  const g = start();
  const turn = g.turn;
  g.items.push({ key: 'worms', inHand: false });
  assert.deepEqual(menu(g, 'inv'), [{ type: 'event', id: 'inventory' }]);
  assert.equal(view(g).inv, null, 'not in the map any more');
  assert.deepEqual(lines(g), [TEXT.button.inventory]);
  const options = () => view(g).event.options.map((o) => [o.label, o.kind]);
  // items are things listed, not choices; back is a choice
  assert.deepEqual(options(), [[TEXT.thing.sword, 'item'], [TEXT.thing.worms, 'item'], [TEXT.menu.back, 'back']]);
  // the sword's page: its name and how it is; inspect, unequip (it is in hand), throw, back
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).event.id, 'item');
  assert.deepEqual(lines(g), [TEXT.thing.sword, TEXT.menu.inHand]);
  const labels = () => view(g).event.options.map((o) => o.label);
  assert.deepEqual(labels(), [TEXT.context.inspect, TEXT.item.unequip, TEXT.item.throw, TEXT.menu.back]);
  assert.ok(view(g).event.options.every((o) => o.kind !== 'item'), 'all choices');
  act(g, { type: 'choose', index: 0 }); // inspect: what it is, under it
  assert.deepEqual(lines(g), [TEXT.thing.sword, TEXT.menu.inHand, TEXT.slot.sword]);
  act(g, { type: 'choose', index: 1 }); // unequip
  assert.equal(g.items[0].inHand, false);
  assert.deepEqual(lines(g), [TEXT.thing.sword, TEXT.slot.sword]);
  assert.deepEqual(labels(), [TEXT.context.inspect, TEXT.item.equip, TEXT.item.throw, TEXT.menu.back]);
  assert.equal(view(g).log.at(-1).text, TEXT.log.putAway(TEXT.thing.sword));
  act(g, { type: 'choose', index: 1 }); // equip
  assert.equal(g.items[0].inHand, true);
  // back to the inventory, on the sword; the worms cannot be held; inspecting them starts
  // their memory on its way back, and only then
  back(g);
  assert.equal(view(g).event.id, 'inventory');
  assert.equal(view(g).event.cursor, 0);
  act(g, { type: 'choose', index: 1 });
  assert.deepEqual(lines(g), [TEXT.thing.worms]);
  assert.deepEqual(labels(), [TEXT.context.inspect, TEXT.item.throw, TEXT.menu.back]);
  assert.equal(g.recall, null);
  act(g, { type: 'choose', index: 0 });
  assert.deepEqual(lines(g), [TEXT.thing.worms, TEXT.slot.worms]);
  assert.equal(g.inspected.worms, true);
  assert.equal(g.recall?.id, 'worms', 'their memory is on its way back');
  back(g);
  back(g);
  assert.equal(view(g).event, null);
  assert.equal(g.turn, turn, 'none of it takes a turn');
});

test('memories in their list are things, not choices', () => {
  const g = start();
  g.memories.push('worms');
  menu(g, 'memories');
  assert.deepEqual(view(g).event.options.map((o) => o.kind), ['item', 'back']);
});

test('waiting, a memory on its way back may come sooner; it comes back only once', () => {
  let sooner = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame({ seed, edition: 'esoteric' });
    g.recall = { id: 'worms', turn: g.turn + 1000 };
    for (let k = 0; k < 40 && !g.memories.includes('worms'); k++) {
      act(g, { type: 'wait' });
      if (view(g).event) back(g);
    }
    if (g.memories.includes('worms')) sooner++;
    assert.equal(g.memories.filter((m) => m === 'worms').length <= 1, true);
  }
  assert.ok(sooner >= 35, `most waits bring it within 40 turns (${sooner} of 40)`);
});

// Open the item page of item i and throw it.
function throwIt(g, i) {
  menu(g, 'inv');
  act(g, { type: 'choose', index: i });
  const k = view(g).event.options.findIndex((o) => o.label === TEXT.item.throw);
  return act(g, { type: 'choose', index: k });
}

test('a thrown item lands in sight, takes the turn, closes the pages, and is picked up by stepping on it', () => {
  for (const seed of [7, 19, 39]) {
    const g = newGame({ seed, edition: 'esoteric' });
    const turn = g.turn;
    throwIt(g, 0);
    assert.equal(view(g).event, null);
    assert.equal(g.turn, turn + 1);
    assert.equal(g.items.length, 0);
    assert.equal(view(g).log.at(-1).text, TEXT.log.throws(TEXT.thing.sword));
    const room = currentRoom(g);
    const [it] = room.loose;
    assert.equal(it.key, 'sword');
    const d = Math.max(Math.abs(it.x - g.x), Math.abs(it.y - g.y));
    assert.ok(d >= 1 && d <= 3, `${seed}: lands near (${d})`);
    const i = it.y * Math.sqrt(room.t.length) + it.x;
    assert.deepEqual(view(g).cells[i].thing, { kind: 'item', key: 'sword' });
    // walk there and it is yours again, not in hand
    act(g, { type: 'travel', x: it.x, y: it.y });
    for (let k = 0; k < 10 && view(g).going; k++) act(g, { type: 'continue' });
    assert.deepEqual([g.x, g.y], [it.x, it.y]);
    assert.equal(room.loose.length, 0);
    assert.deepEqual(g.items, [{ key: 'sword', inHand: false }]);
    assert.ok(view(g).log.some((l) => l.text === TEXT.log.pickUp(TEXT.thing.sword)));
  }
});

test('thrown at the toad in sight: it wakes, the sword wounds it, and lands where it is', () => {
  const g = start();
  const room = currentRoom(g);
  const { size } = { size: Math.sqrt(room.t.length) };
  // a toad two squares away in the open
  const open = (x, y) => ['floor', 'grass'].includes(room.t[y * size + x]);
  let spot = null;
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (!spot && open(g.x + dx, g.y + dy) && open(g.x + dx / 2, g.y + dy / 2)) spot = [g.x + dx, g.y + dy];
  room.toad = { x: spot[0], y: spot[1], home: { x: spot[0], y: spot[1] }, hp: 20, asleep: true, key: false, stirred: false, lastSeen: null };
  throwIt(g, 0);
  const toad = room.toad;
  assert.equal(toad.asleep, false);
  assert.ok(toad.hp < 20, 'wounded');
  assert.deepEqual(room.loose.map((it) => [it.key, it.x, it.y]), [['sword', spot[0], spot[1]]]);
  assert.ok(view(g).log.some((l) => l.text.startsWith(`the ${TEXT.thing.sword} hits the toad`)));
});

test('the psyche leads to the inventory, the memories and the options, and back to itself', () => {
  const g = start();
  const turn = g.turn;
  menu(g, 'psy');
  const choose = (label) => act(g, { type: 'choose', index: view(g).event.options.findIndex((o) => o.label === label) });
  for (const [label, id, title] of [
    [TEXT.button.inventory, 'inventory', TEXT.button.inventory],
    [TEXT.button.memories, 'memories', TEXT.button.memories],
    [TEXT.button.options, 'options', TEXT.button.options],
  ]) {
    choose(label);
    assert.equal(g.event.id, id);
    assert.equal(lines(g)[0], title);
    if (id === 'options') {
      // the settings menu's choices, as a page; no full screen where the browser has none
      assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.menu.restart, TEXT.menu.lookDark, TEXT.menu.outlines(g.outlines), TEXT.menu.back]);
      const look = g.look;
      assert.deepEqual(choose(TEXT.menu.lookDark), [{ type: 'look', look: 'dark' }]);
      assert.notEqual(g.look, look);
      assert.equal(g.event.id, 'options');
    }
    choose(TEXT.menu.back);
    assert.equal(g.event.id, 'psyche');
  }
  back(g);
  assert.equal(g.event, null);
  assert.equal(g.turn, turn);

  // where the browser has full screen, the options page offers it
  const f = newGame({ seed: 7, edition: 'esoteric', fullscreen: true });
  menu(f, 'psy');
  act(f, { type: 'choose', index: 2 });
  const labels = view(f).event.options.map((o) => o.label);
  assert.ok(labels.includes(TEXT.menu.fullScreen));
  assert.deepEqual(act(f, { type: 'choose', index: labels.indexOf(TEXT.menu.fullScreen) }), [{ type: 'fullscreen', on: true }]);
});
