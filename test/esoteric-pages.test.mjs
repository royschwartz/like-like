import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, view } from '../src/game.js';
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
    assert.deepEqual(view(g).event.options.map((o) => o.label), [TEXT.menu.back]);
    act(g, { type: 'wait' });
    back(g);
    assert.equal(g.turn, turn);
    assert.equal(g.event, null);
    assert.equal(g.menu, null);
    assert.deepEqual(view(g).log, log);
  }
});

test('psyche preserves an inventory selection or menu cursor through its own system menu', () => {
  for (const id of ['inv', 'sys']) {
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
    act(g, { type: 'choose', index: 0 });
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
