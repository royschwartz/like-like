import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { randomAction, isLegalGoblinCell, idx } from './helpers.mjs';

const SEEDS = 60;
const STEPS = 3000;

function check(g, v, lastId) {
  const room = currentRoom(g);
  assert.equal(v.cells.length, 121);
  const c = room.t[idx(g.x, g.y)];
  assert.ok(c !== 'wall' && c !== 'door', `player on ${c}`);
  assert.ok(g.x > 0 && g.y > 0 && g.x < 10 && g.y < 10, 'player inside the room');
  assert.ok(v.stats.hp > 0 && v.stats.hp <= v.stats.maxHp, `hp ${v.stats.hp}`);
  assert.equal(v.cells.filter((cell) => cell.thing && cell.thing.kind === 'player').length, 1);
  assert.deepEqual(v.cells[idx(v.player.x, v.player.y)].thing, { kind: 'player' });
  let prev = lastId;
  for (const line of v.log) {
    assert.ok(Number.isInteger(line.id) && line.id > prev, 'log ids increase');
    prev = line.id;
  }
  for (const r of g.level.rooms) for (const b of r.goblins) assert.ok(isLegalGoblinCell(g, r, b), 'goblin on a legal cell');
  if (v.menu) {
    assert.equal(v.menu.options.length, 4);
    assert.equal(v.menu.options[3].kind, 'back');
    const at = v.menu.options[v.menu.cursor];
    assert.ok(at && !at.disabled, 'cursor on a choosable slot');
  }
  assert.deepEqual(view(g), v, 'view is pure');
}

test('fuzz: random play never breaks the rules', () => {
  let depthMax = 0;
  let restarts = 0;
  let deaths = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = newGame({ seed: seed * 7919 });
    const r = makeRng(seed);
    check(g, view(g), 0);
    for (let k = 0; k < STEPS; k++) {
      const action = randomAction(r);
      const ev = act(g, action);
      assert.ok(Array.isArray(ev));
      if (ev.some((e) => e.type === 'restart')) restarts++;
      if (ev.some((e) => e.type === 'death')) deaths++;
      check(g, view(g), 0);
      depthMax = Math.max(depthMax, g.depth);
    }
  }
  // The fuzz reached the interesting places.
  assert.ok(depthMax > 1, 'went down stairs');
  assert.ok(restarts > 0, 'restarted');
  assert.ok(deaths > 0, 'died');
});
