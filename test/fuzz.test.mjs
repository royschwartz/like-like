import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { CONFIG } from '../src/config.js';
import { randomAction, isLegalToadCell, logLines, idx, DIRS, STEP } from './helpers.mjs';

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
  for (const r of g.level.rooms) {
    const t = r.toad;
    if (!t) continue;
    assert.ok(['floor', 'grass'].includes(r.t[idx(t.x, t.y)]), 'toad on open ground');
    assert.ok(isLegalToadCell(g, r), 'toad on a legal cell, and not on you');
  }
  // Only a unit in sight ever blinks, and the wide button only when it says sense.
  for (const cell of v.cells) {
    assert.equal(typeof cell.more, 'boolean');
    if (cell.more) assert.ok(cell.state === 'visible' && (cell.t === 'statue' || (cell.thing && cell.thing.kind === 'toad')), 'only a unit in sight blinks');
  }
  assert.equal(typeof v.context.more, 'boolean');
  if (v.context.more) assert.equal(v.context.id, 'sense');
  if (v.event) {
    const opts = v.event.options;
    assert.ok(opts.length >= 1 && opts.every((o) => o && typeof o.label === 'string' && o.label.length > 0), 'event options: a plain list');
    assert.equal(opts[opts.length - 1].kind, 'back');
    assert.equal(opts.filter((o) => o.kind === 'back').length, 1);
    assert.ok(Number.isInteger(v.event.cursor) && v.event.cursor >= 0 && v.event.cursor < opts.length, 'event cursor on an option');
    assert.ok(v.event.lines.length > 0 && v.event.lines.every((l) => typeof l.text === 'string' && l.text.length > 0));
    assert.ok(v.event.now >= 0 && v.event.now <= Math.max(...v.event.lines.map((l) => l.passage)));
    assert.ok(!v.menu || ['psy', 'sys'].includes(v.menu.id), 'events keep a memory menu or their system menu');
    assert.equal(v.inv, null);
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
  let mostSaid = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = newGame({ seed: seed * 7919 });
    const r = makeRng(seed);
    // Random play rarely finds the toad or gets past its door: start some games there.
    const tr = g.level.toadRoom;
    const toad = g.level.rooms[tr].toad;
    if (seed % 3 === 1) {
      g.room = tr;
      const step = DIRS.map((d) => [toad.x + STEP[d][0], toad.y + STEP[d][1]]).find(([x, y]) =>
        ['floor', 'grass'].includes(currentRoom(g).t[idx(x, y)]),
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
      const from = g.nextLogId;
      const ev = act(g, action);
      assert.ok(Array.isArray(ev));
      // Two wrapped lines in all. The opening is historical text, never fresh.
      const said = g.log.filter((l) => l.id >= from);
      assert.ok(said.length <= CONFIG.saysAtMost, `${JSON.stringify(action)} said ${said.length}: ${said.map((l) => l.text).join(' | ')}`);
      const statuses = ev.some((e) => e.type === 'restart') ? said.slice(1) : said;
      const wrapped = statuses.reduce((sum, l) => sum + logLines(l.text), 0);
      assert.ok(wrapped <= CONFIG.saysAtMost, `${JSON.stringify(action)} said ${wrapped} wrapped lines: ${statuses.map((l) => l.text).join(' | ')}`);
      if (said.length > mostSaid) mostSaid = said.length;
      for (const l of said) {
        if (ev.some((e) => e.type === 'restart') && l === said[0]) continue;
        assert.ok(logLines(l.text) <= 2, `too long for the log: ${l.text}`);
      }
      if (said.length) assert.equal(view(g).fresh, ev.some((e) => e.type === 'restart') ? said[1].id : said[0].id, 'fresh is the first line the action said');
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
  assert.equal(mostSaid, CONFIG.saysAtMost, 'some action said two lines');
});
