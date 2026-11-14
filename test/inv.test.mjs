import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { newGame, act, view, playerDamage } from '../src/game.js';

const said = (g, from) => g.log.filter((l) => l.id >= from).map((l) => [l.text, l.kind]);

test('the inventory screen: toggle, its view, inspect, use, back', () => {
  const g = newGame({ seed: 51 });
  const turn = g.turn;
  assert.equal(view(g).inv, null);
  act(g, { type: 'menu', id: 'inv' });
  let v = view(g);
  assert.equal(v.menu, null);
  assert.deepEqual(v.inv, {
    title: TEXT.button.inv,
    items: [{ key: 'sword', name: TEXT.thing.sword, state: TEXT.menu.inHand, more: true }],
    cursor: 0,
  });
  assert.deepEqual(v.context, { id: 'inspect', label: TEXT.context.inspect, more: false });

  // Inspect: the description.
  let from = g.nextLogId;
  assert.deepEqual(act(g, { type: 'context' }), []);
  assert.deepEqual(said(g, from), [[TEXT.slot.sword, 'slot']]);

  // Use: put away, then in hand again.
  from = g.nextLogId;
  act(g, { type: 'use' });
  assert.deepEqual(said(g, from), [[TEXT.log.putAway(TEXT.thing.sword), 'plain']]);
  assert.equal(view(g).inv.items[0].state, '');
  assert.equal(playerDamage(g), Math.max(1, Math.round(CONFIG.player.str * CONFIG.fistDamagePerStr)));
  from = g.nextLogId;
  act(g, { type: 'use' });
  assert.deepEqual(said(g, from), [[TEXT.log.inHand(TEXT.thing.sword), 'plain']]);
  assert.equal(view(g).inv.items[0].state, TEXT.menu.inHand);
  assert.equal(playerDamage(g), Math.max(1, Math.round(CONFIG.player.str * CONFIG.swordDamagePerStr)));

  // Nothing here takes time; wait, observe and choose do nothing.
  const before = view(g);
  for (const a of [{ type: 'wait' }, { type: 'observe', x: g.x, y: g.y }, { type: 'choose', index: 0 }, { type: 'move', dir: 'e' }, { type: 'move', dir: 'w' }]) {
    act(g, a);
  }
  assert.deepEqual(view(g), before);
  assert.equal(g.turn, turn);

  // Back closes it; so does the inv button.
  act(g, { type: 'back' });
  assert.equal(view(g).inv, null);
  assert.equal(view(g).context.id === 'inspect', false);
  act(g, { type: 'menu', id: 'inv' });
  act(g, { type: 'menu', id: 'inv' });
  assert.equal(view(g).inv, null);
  assert.equal(g.turn, turn);
});

test('the inventory cursor: up and down clamped, pick', () => {
  const g = newGame({ seed: 52 });
  g.items.push({ key: 'sword', inHand: false }, { key: 'sword', inHand: false });
  act(g, { type: 'menu', id: 'inv' });
  const cursor = (a) => {
    act(g, a);
    return view(g).inv.cursor;
  };
  assert.equal(cursor({ type: 'move', dir: 'n' }), 0);
  assert.equal(cursor({ type: 'move', dir: 's' }), 1);
  assert.equal(cursor({ type: 'move', dir: 's' }), 2);
  assert.equal(cursor({ type: 'move', dir: 's' }), 2, 'no wrap');
  assert.equal(cursor({ type: 'move', dir: 'n' }), 1);
  assert.equal(cursor({ type: 'pick', index: 0 }), 0);
  assert.equal(cursor({ type: 'pick', index: 2 }), 2);
  assert.equal(cursor({ type: 'pick', index: 3 }), 2, 'no such row');
  assert.equal(cursor({ type: 'pick', index: -1 }), 2);
  // Use acts on the row under the cursor.
  act(g, { type: 'use' });
  assert.deepEqual(g.items.map((it) => it.inHand), [true, false, true]);
});

test('use and pick do nothing with the inventory closed', () => {
  const g = newGame({ seed: 53 });
  const before = view(g);
  assert.deepEqual(act(g, { type: 'use' }), []);
  assert.deepEqual(act(g, { type: 'pick', index: 0 }), []);
  assert.deepEqual(view(g), before);
});

test('the inventory and the option menus close each other', () => {
  const g = newGame({ seed: 54 });
  for (const id of ['act', 'psy', 'sys']) {
    act(g, { type: 'menu', id: 'inv' });
    act(g, { type: 'menu', id });
    let v = view(g);
    assert.equal(v.inv, null, id);
    assert.equal(v.menu.id, id);
    act(g, { type: 'menu', id: 'inv' });
    v = view(g);
    assert.equal(v.menu, null, id);
    assert.ok(v.inv);
    act(g, { type: 'back' });
  }
});

test('restart and descend leave the inventory closed', () => {
  const g = newGame({ seed: 55 });
  const st = g.level.stairs;
  g.room = st.room;
  [g.x, g.y] = [st.x, st.y];
  act(g, { type: 'menu', id: 'inv' });
  act(g, { type: 'context' }); // inspect, not the stairs
  assert.equal(g.depth, 1);
  act(g, { type: 'back' });
  act(g, { type: 'context' });
  assert.equal(g.depth, 2);
  assert.equal(view(g).inv, null);
  act(g, { type: 'menu', id: 'sys' });
  act(g, { type: 'choose', index: 0 });
  assert.equal(view(g).inv, null);
});
