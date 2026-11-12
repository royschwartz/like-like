import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { randomAction, isLegalGoblinCell, idx, DIRS, STEP } from './helpers.mjs';

const SEEDS = 60;
const STEPS = 3000;

function check(g, v, lastId) {
  const room = currentRoom(g);
  assert.equal(v.cells.length, 121);
  const c = room.t[idx(g.x, g.y)];
  assert.ok(c !== 'wall' && c !== 'door' && c !== 'statue' && c !== 'golddoor', `player on ${c}`);
  assert.ok(g.x > 0 && g.y > 0 && g.x < 10 && g.y < 10, 'player inside the room');
  assert.ok(v.stats.hp > 0 && v.stats.hp <= v.stats.maxHp, `hp ${v.stats.hp}`);
  assert.equal(v.cells.filter((cell) => cell.thing && cell.thing.kind === 'player').length, 1);
  assert.deepEqual(v.cells[idx(v.player.x, v.player.y)].thing, { kind: 'player' });
  let prev = lastId;
  for (const line of v.log) {
    assert.ok(Number.isInteger(line.id) && line.id > prev, 'log ids increase');
    assert.ok(typeof line.text === 'string' && line.text.length > 0, 'line text');
    prev = line.id;
  }
  assert.ok(Number.isInteger(v.fresh) && v.fresh <= prev, `fresh ${v.fresh}`);
  assert.ok(!(v.inv && v.menu), 'the inventory and a menu are not both open');
  if (v.inv) {
    assert.ok(Number.isInteger(v.inv.cursor) && v.inv.cursor >= 0 && v.inv.cursor < v.inv.items.length, 'inventory cursor');
    assert.equal(v.context.id, 'inspect');
  }
  for (const r of g.level.rooms) for (const b of r.goblins) assert.ok(isLegalGoblinCell(g, r, b), 'goblin on a legal cell');
  for (const r of g.level.rooms) {
    const t = r.toad;
    if (!t) continue;
    assert.ok(['floor', 'grass'].includes(r.t[idx(t.x, t.y)]), 'toad on open ground');
    assert.ok(!r.goblins.some((b) => b.x === t.x && b.y === t.y), 'toad and goblin apart');
    assert.ok(!(r === room && t.x === g.x && t.y === g.y), 'toad not on you');
  }
  if (v.event) {
    assert.equal(v.event.options.length, 4);
    assert.equal(v.event.options[3].kind, 'back');
    const at = v.event.options[v.event.cursor];
    assert.ok(at && !at.disabled, 'event cursor on a choosable option');
    assert.ok(v.event.lines.length > 0 && v.event.lines.every((l) => typeof l.text === 'string' && l.text.length > 0));
  }
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
  let observed = 0;
  let used = 0;
  let events = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = newGame({ seed: seed * 7919 });
    const r = makeRng(seed);
    // Random play rarely finds the toad or gets past its door: start some games there.
    const tr = g.level.toadRoom;
    const toad = g.level.rooms[tr].toad;
    if (seed % 3 === 1) {
      g.room = tr;
      const step = DIRS.map((d) => [toad.x + STEP[d][0], toad.y + STEP[d][1]]).find(
        ([x, y]) => ['floor', 'grass'].includes(currentRoom(g).t[idx(x, y)]) && !currentRoom(g).goblins.some((b) => b.x === x && b.y === y),
      );
      if (!step) continue;
      [g.x, g.y] = step;
    } else if (seed % 3 === 2) {
      g.items.push({ key: 'key', inHand: false });
      g.room = tr;
      const st = g.level.stairs;
      [g.x, g.y] = [st.x === 1 ? 2 : st.x - 1, st.y];
    }
    check(g, view(g), 0);
    for (let k = 0; k < STEPS; k++) {
      const action = randomAction(r);
      const ev = act(g, action);
      assert.ok(Array.isArray(ev));
      if (ev.some((e) => e.type === 'restart')) restarts++;
      if (ev.some((e) => e.type === 'death')) deaths++;
      if (ev.some((e) => e.type === 'observe')) observed++;
      if (ev.some((e) => e.type === 'event')) events++;
      if (action && action.type === 'use' && g.inv) used++;
      check(g, view(g), 0);
      depthMax = Math.max(depthMax, g.depth);
    }
  }
  // The fuzz reached the interesting places.
  assert.ok(depthMax > 1, 'went down stairs');
  assert.ok(restarts > 0, 'restarted');
  assert.ok(deaths > 0, 'died');
  assert.ok(observed > 0, 'observed');
  assert.ok(used > 0, 'used an item');
  assert.ok(events > 0, 'opened an event');
});
