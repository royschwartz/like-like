import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, view } from '../src/game.js';
import { randomActions } from './helpers.mjs';

test('same seed and same actions give the same views and events', () => {
  for (const seed of [1, 42, 9999]) {
    const actions = randomActions(seed + 5, 1500);
    const a = newGame({ seed });
    const b = newGame({ seed });
    assert.deepEqual(view(a), view(b));
    for (const action of actions) {
      assert.deepEqual(act(a, action), act(b, action));
      assert.deepEqual(view(a), view(b));
    }
  }
});

test('different seeds give different games', () => {
  const views = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(view(newGame({ seed })).cells));
  assert.equal(new Set(views).size, views.length);
  assert.notDeepEqual(view(newGame({ seed: 10 })), view(newGame({ seed: 11 })));
});

test('newGame without a seed still works, and look defaults to paper', () => {
  const v = view(newGame());
  assert.equal(typeof v.seed, 'number');
  assert.equal(v.look, 'paper');
  assert.equal(view(newGame({ seed: 1, look: 'dark' })).look, 'dark');
});
