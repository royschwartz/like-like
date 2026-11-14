import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { putToad, openRoom, findSpot, plainFloor, logLines, saidSince } from './helpers.mjs';

function tough(g) {
  g.hp = g.maxHp = 100000;
}

test('a new game: the opening, then the descend line, which is the status; one line on each descend', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame({ seed });
    tough(g);
    let v = view(g);
    assert.deepEqual(v.log.map((l) => l.text), [TEXT.opening[0], TEXT.log.descend[g.level.entrance.ground]]);
    assert.equal(v.fresh, v.log[1].id, 'the opening is behind you; what you arrive in is the status');
    for (let k = 0; k < 3; k++) {
      seen.add(g.level.entrance.ground);
      const st = g.level.stairs;
      g.room = st.room;
      [g.x, g.y] = [st.x, st.y];
      const from = g.nextLogId;
      act(g, { type: 'context' });
      v = view(g);
      assert.deepEqual(saidSince(g, from), [TEXT.log.descend[g.level.entrance.ground]]);
      assert.equal(v.fresh, from);
    }
  }
  assert.deepEqual([...seen].sort(), ['dirt', 'grass']);
});

test('fresh moves only when something is said', () => {
  const g = newGame({ seed: 41 });
  const start = view(g).fresh;
  act(g, { type: 'wait' }); //           time passes, nothing said
  act(g, { type: 'menu', id: 'psy' }); // nothing said
  act(g, { type: 'menu', id: 'psy' });
  assert.equal(view(g).fresh, start);
  const from = g.nextLogId;
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'choose', index: 0 }); // rest: says lines
  assert.equal(view(g).fresh, from);
  assert.ok(g.log.some((l) => l.id === from && l.text === TEXT.log.youRest));
});

test('a fight: your strike, then the toad answer, in order, with damage numbers', () => {
  const g = newGame({ seed: 42 });
  tough(g);
  const at = findSpot(g, (x, y, r) => plainFloor(r, x, y) && plainFloor(r, x + 1, y));
  [g.x, g.y] = at;
  const toad = putToad(g, at[0] + 1, at[1], true);
  toad.hp = 1000;
  const from = g.nextLogId;
  act(g, { type: 'move', dir: 'e' }); // asleep: a sure hit
  const texts = saidSince(g, from);
  assert.equal(texts.length, 2);
  assert.equal(texts[0], `you strike the toad for ${1000 - toad.hp} damage`);
  assert.ok([`the toad strikes you for ${CONFIG.toad.damage} damage`, TEXT.log.toadMisses].includes(texts[1]), texts[1]);
  assert.equal(view(g).fresh, from);

  // Then a kill: the strike and the death, and no answer.
  toad.hp = 1;
  toad.asleep = true;
  const k = g.nextLogId;
  const ev = act(g, { type: 'move', dir: 'e' });
  const dmg = ev.find((e) => e.type === 'attack').dmg;
  assert.deepEqual(saidSince(g, k), [TEXT.log.youHitToad(dmg), TEXT.log.toadDies]);
  assert.equal(currentRoom(g).corpses.length, 1);
  assert.equal(currentRoom(g).toad, null);
});

test('the blow that kills you says only that you die, so a fight never says three lines', () => {
  let died = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = newGame({ seed });
    const at = findSpot(g, (x, y, r) => plainFloor(r, x, y) && plainFloor(r, x + 1, y));
    [g.x, g.y] = at;
    const toad = putToad(g, at[0] + 1, at[1], false);
    toad.hp = 1000;
    for (let k = 0; k < 50; k++) {
      const from = g.nextLogId;
      const ev = act(g, { type: 'move', dir: 'e' }); // strike it; it answers
      const texts = saidSince(g, from);
      assert.ok(texts.length <= CONFIG.saysAtMost, texts.join(' | '));
      if (ev.some((e) => e.type === 'death')) {
        died++;
        assert.equal(texts[texts.length - 1], TEXT.log.youDie);
        assert.ok(!texts.some((t) => t === TEXT.log.toadHits(CONFIG.toad.damage)), 'no strike line with the death');
        break;
      }
    }
  }
  assert.ok(died > 0);
});

// Every string the log can be given, with stand-in values for the ones that take any.
function statuses() {
  const out = [];
  const add = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === 'function') {
      // a damage number, or the longest name a thing has
      const names = Object.values(TEXT.thing);
      const longest = names.reduce((a, b) => (b.length > a.length ? b : a));
      out.push(v(99), v(longest));
    } else if (v && typeof v === 'object') Object.values(v).forEach(add);
  };
  add(TEXT.log);
  add(TEXT.observe);
  add(TEXT.observeClose);
  add(TEXT.slot);
  add(TEXT.senseToad);
  add(TEXT.toad.singing);
  return out;
}

test('no status runs past two lines of the log', () => {
  const all = statuses();
  assert.ok(all.length > 30);
  for (const text of all) assert.ok(logLines(text) <= 2, `${logLines(text)} lines: ${text}`);
  // The long texts are only ever in an event.
  assert.ok(logLines(TEXT.dee.bust) > 2);
  assert.ok(!all.includes(TEXT.dee.bust));
  // The opening is his, as he wrote it, and is the one line that runs over: three lines.
  // It is said once, before anything else. (open-questions.md, 88)
  assert.equal(logLines(TEXT.opening[0]), 3);
});

test('logLines wraps as the page does', () => {
  assert.equal(logLines('a'.repeat(41)), 1);
  assert.equal(logLines('a'.repeat(42)), 2);
  assert.equal(logLines('you descend and find yourself in low, soft grass'), 2);
  assert.equal(logLines('the worms look normal, but you cannot help but imagine them as limbless people'), 2);
  assert.equal(logLines('aaaa bbbb', 4), 2);
  assert.equal(logLines('aaaa bbbb cc', 7), 2);
});

test('a sense interrupted by combat leaves its two-line discovery unread', () => {
  const hits = CONFIG.toad.hits;
  try {
    for (const outcome of ['hit', 'miss', 'death']) {
      CONFIG.toad.hits = outcome === 'miss' ? 0 : 1;
      const g = newGame({ seed: 51 });
      g.room = g.level.toadRoom;
      openRoom(g);
      [g.x, g.y] = [3, 3];
      const toad = putToad(g, 4, 3, false);
      g.hp = outcome === 'death' ? 1 : 3;
      const from = g.nextLogId;
      const ev = act(g, { type: 'context' });
      assert.ok(ev.some((e) => e.type === 'attack'));
      assert.equal(saidSince(g, from).length, 1, outcome);
      assert.equal(Object.keys(g.sensed).length, 0, 'the unsaid discovery remains unread');
      assert.ok(saidSince(g, from).reduce((sum, s) => sum + logLines(s), 0) <= 2);
      if (outcome === 'death') {
        assert.deepEqual(saidSince(g, from), [TEXT.log.youDie]);
        assert.notEqual(g.sensedTurn, g.turn, 'no sensing glow in the respawn room');
      } else {
        toad.asleep = true;
        const next = g.nextLogId;
        act(g, { type: 'context' });
        assert.deepEqual(saidSince(g, next), [TEXT.senseToad[0]], 'the next quiet sense delivers it');
      }
    }
  } finally {
    CONFIG.toad.hits = hits;
  }
});

test('a due memory waits until after a two-line sense or arrival', () => {
  const grassChance = CONFIG.entranceInGrass;
  try {
    CONFIG.entranceInGrass = 1;
    for (const action of ['sense', 'descend']) {
      const g = newGame({ seed: 52 });
      g.room = g.level.toadRoom;
      if (action === 'sense') {
        openRoom(g);
        [g.x, g.y] = [3, 3];
      } else {
        [g.x, g.y] = [g.level.stairs.x, g.level.stairs.y];
      }
      g.recall = { id: 'worms', turn: g.turn + 1 };
      const from = g.nextLogId;
      act(g, { type: 'context' });
      const text = action === 'sense' ? TEXT.senseToad[0] : TEXT.log.descend.grass;
      assert.deepEqual(saidSince(g, from), [text]);
      assert.equal(logLines(text), 2);
      assert.equal(view(g).event, null, 'the memory did not add a third line');
      const next = g.nextLogId;
      act(g, { type: 'wait' });
      assert.deepEqual(saidSince(g, next), [TEXT.log.memory]);
      assert.equal(view(g).event.id, 'memory');
    }
  } finally {
    CONFIG.entranceInGrass = grassChance;
  }
});
