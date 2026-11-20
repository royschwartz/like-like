import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, currentRoom, newGame, view } from '../src/game.js';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { putToad } from './helpers.mjs';

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

test('the map offers a useful second action, and the star lists every usable action together', () => {
  const g = start();
  assert.deepEqual(shortcuts(g), ['sense']);
  assert.deepEqual(openList(g), [TEXT.context.sense, TEXT.button.waitName, TEXT.menu.rest, TEXT.menu.back]);
  assert.deepEqual(shortcuts(g), []);
  act(g, { type: 'menu', id: 'act' });
  assert.equal(view(g).event, null);
  openList(g);
  act(g, { type: 'move', dir: 's' });
  assert.equal(view(g).event.cursor, 1);
  act(g, { type: 'context' });
  assert.equal(g.turn, 1);
  assert.equal(view(g).event, null);

  act(g, { type: 'move', dir: 'n' });
  g.hp--;
  g.knowsWorms = true;
  assert.deepEqual(shortcuts(g), ['sense', 'rest']);
  assert.deepEqual(openList(g), [TEXT.context.sense, TEXT.menu.rest, TEXT.menu.dig, TEXT.button.waitName, TEXT.menu.back]);
  act(g, { type: 'choose', index: 1 });
  assert.equal(g.turn, 2 + CONFIG.restTurns);
  assert.equal(g.hp, g.maxHp);
  assert.deepEqual(shortcuts(g), ['sense', 'dig']);
  const before = g.turn;
  const effects = act(g, { type: 'ability', id: 'dig' });
  assert.ok(effects.some(e => e.type === 'dig'));
  assert.equal(g.turn, before + CONFIG.digTurns);
  assert.ok(g.items.some(it => it.key === 'worms'));
});

test('stairs and corpses retain their actions and still allow sensing from the same square', () => {
  const g = start();
  act(g, { type: 'move', dir: 's' });
  assert.deepEqual(shortcuts(g), ['stairs', 'sense']);
  const { depth } = g;
  assert.ok(act(g, { type: 'ability', id: 'sense' }).some(e => e.type === 'sense'));
  assert.equal(g.depth, depth);
  currentRoom(g).corpses.push({ x: g.x, y: g.y, items: [{ key: 'key' }] });
  g.knowsWorms = true;
  assert.deepEqual(shortcuts(g), ['stairs', 'corpse']);
  assert.deepEqual(openList(g), [TEXT.context.stairs, TEXT.context.corpse, TEXT.context.sense, TEXT.button.waitName, TEXT.menu.rest, TEXT.menu.back]);
  act(g, { type: 'choose', index: 1 });
  assert.equal(view(g).menu.id, 'corpse');
  act(g, { type: 'choose', index: 0 });
  assert.ok(g.items.some(it => it.key === 'key'));
  act(g, { type: 'back' });
  act(g, { type: 'ability', id: 'stairs' });
  assert.equal(g.depth, depth + 1);
});

test('an awake toad blocks quiet actions and shortcuts cannot act through another screen', () => {
  const g = start();
  g.hp--;
  g.knowsWorms = true;
  putToad(g, g.x - 1, g.y);
  assert.deepEqual(shortcuts(g), ['sense']);
  const { turn } = g;
  for (const id of ['dig', 'rest', 'stairs', 'corpse']) assert.deepEqual(act(g, { type: 'ability', id }), []);
  assert.deepEqual(openList(g), [TEXT.context.sense, TEXT.button.waitName, TEXT.menu.back]);
  assert.deepEqual(act(g, { type: 'ability', id: 'sense' }), []);
  act(g, { type: 'back' });
  act(g, { type: 'menu', id: 'inv' });
  act(g, { type: 'menu', id: 'act' });
  assert.deepEqual(shortcuts(g), []);
  assert.deepEqual(act(g, { type: 'ability', id: 'sense' }), []);
  assert.equal(view(g).context.id, 'inspect');
  assert.equal(g.turn, turn);

  const original = newGame({ seed: 7 });
  act(original, { type: 'ability', id: 'sense' });
  assert.equal(original.turn, 0);
  act(original, { type: 'menu', id: 'act' });
  assert.equal(view(original).menu.id, 'act');
  assert.equal(view(original).event, null);
  assert.deepEqual(shortcuts(original), []);
});
