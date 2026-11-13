import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { los } from '../src/fov.js';
import { newGame, act, view, currentRoom, playerDamage } from '../src/game.js';
import { DIRS, STEP, S, idx, logLines } from './helpers.mjs';

const texts = (g, from) => g.log.filter((l) => l.id >= from).map((l) => l.text);
const open = (c) => c === 'floor' || c === 'grass';
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

const DESCRIPTION =
  'on a pedestal, the granite bust of a man of young or middle age, bushy hair sprouting at the sides, with a ravenous expression. underneath the bust is an opening where items might be placed';
const LIFELESS = 'the lifeless bust of DEE.';

// Run fn with CONFIG.noiseWakes set to p.
function withNoise(p, fn) {
  const keep = CONFIG.noiseWakes;
  CONFIG.noiseWakes = p;
  try {
    return fn();
  } finally {
    CONFIG.noiseWakes = keep;
  }
}

function inToadRoom(seed) {
  const g = newGame({ seed });
  g.hp = g.maxHp = 100000;
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  return { g, room, s: room.statue, t: room.toad };
}

// You `dist` steps from the bust, in its sight, on open ground; the first seed from `seed` that has such a spot.
function atBust(dist = 1, seed = 1) {
  for (let k = seed; k < seed + 500; k++) {
    const r = inToadRoom(k);
    const { g, room, s, t } = r;
    for (let i = 0; i < S * S; i++) {
      const x = i % S;
      const y = Math.floor(i / S);
      if (!open(room.t[i]) || (x === t.x && y === t.y)) continue;
      if (manhattan(x, y, s.x, s.y) !== dist || !los(room.t, x, y, s.x, s.y)) continue;
      [g.x, g.y] = [x, y];
      return r;
    }
  }
  throw new Error('no seed');
}

// Move into the bust from beside it.
function intoBust(g, s) {
  const dir = DIRS.find((d) => g.x + STEP[d][0] === s.x && g.y + STEP[d][1] === s.y);
  assert.ok(dir, 'beside the bust');
  return act(g, { type: 'move', dir });
}

const DEE = [
  [DESCRIPTION],
  ['suddenly the empty eyes begin to glow and the statue speaks'],
  ['"long time no see, compadre."'],
  ['you: "do we know each other?"'],
  ['"are you on one? it\'s your old friend DEE. we used to stack boxes together"'],
  ['he winks at you. "now we\'re doing other things"'],
  ['the statue goes lifeless'],
];

function passages(v) {
  const out = [];
  for (const l of v.event.lines) (out[l.passage] = out[l.passage] || []).push(l.text);
  return out;
}
const labels = (v) => v.event.options.map((o) => o.label);

// A game beside the bust that has already spoken, with no noise.
function spokenBust(seed = 1) {
  const r = atBust(1, seed);
  r.s.spoke = true;
  return r;
}

function observeBust(g, s) {
  const from = g.nextLogId;
  const ev = act(g, { type: 'observe', x: s.x, y: s.y });
  return { ev, said: texts(g, from) };
}

test('moving into the bust: no turn, never onto it; the first time it speaks', () => {
  withNoise(0, () => {
    const { g, s } = atBust(1);
    const turn = g.turn;
    const at = [g.x, g.y];
    const ev = intoBust(g, s);
    assert.deepEqual(ev, [{ type: 'event', id: 'dee' }, { type: 'noise' }]);
    assert.equal(g.turn, turn, 'no time');
    assert.deepEqual([g.x, g.y], at, 'you stay where you were');
    assert.equal(s.spoke, true);
    const v = view(g);
    assert.equal(v.cells[idx(s.x, s.y)].t, 'statue');
    assert.deepEqual(passages(v), DEE, 'what you see as you walk into it, then what it says');
    assert.equal(v.event.now, 0, 'all of it is new');
    assert.ok(v.event.lines.every((l) => l.song === false && l.slot === false));
    assert.deepEqual(v.event.options, [{ label: 'back', kind: 'back', slot: false }]);
    assert.equal(v.event.cursor, 0);
    act(g, { type: 'context' });
    assert.equal(view(g).event, null);

    // Every time after: its opening, the items you carry, back last.
    const ev2 = intoBust(g, s);
    assert.deepEqual(ev2, [{ type: 'event', id: 'bust' }], 'no noise for opening it');
    const v2 = view(g);
    assert.deepEqual(passages(v2), [[LIFELESS]]);
    assert.deepEqual(labels(v2), ['sword', 'back']);
    assert.equal(v2.event.cursor, 0);
    assert.equal(g.turn, turn);
    act(g, { type: 'back' });
    assert.equal(view(g).event, null);
    assert.equal(g.log.filter((l) => l.text.startsWith('suddenly') || l.text === DESCRIPTION).length, 0, 'the event is not the log');
  });
});

test('observing the bust never opens its event: a short line, then lifeless; it blinks while one is new', () => {
  withNoise(0, () => {
    assert.ok(logLines(TEXT.observe.statue) <= 2 && logLines(LIFELESS) <= 2, 'the statue description is short');
    for (const dist of [1, CONFIG.observeClose, CONFIG.observeClose + 1]) {
      const { g, s } = atBust(dist);
      assert.equal(view(g).cells[idx(s.x, s.y)].more, true);
      const r = observeBust(g, s);
      assert.deepEqual(r.said, ['[bust]'], `dist ${dist}`);
      assert.deepEqual(r.ev, [{ type: 'observe', x: s.x, y: s.y }]);
      assert.equal(s.spoke, false);
      assert.equal(view(g).event, null);
      assert.equal(view(g).cells[idx(s.x, s.y)].more, false);
    }
    const { g, s } = atBust(1);
    intoBust(g, s);
    act(g, { type: 'back' });
    assert.equal(view(g).cells[idx(s.x, s.y)].more, true, 'it has spoken: something new to see');
    for (let k = 0; k < 2; k++) {
      const r = observeBust(g, s);
      assert.deepEqual(r.said, [LIFELESS]);
      assert.equal(view(g).event, null);
      assert.equal(view(g).cells[idx(s.x, s.y)].more, false);
    }
  });
});

test('noise: the bust speaking wakes the sleeping toad by CONFIG.noiseWakes, from the seeded chance', () => {
  for (const [p, wake] of [[1, true], [0, false]]) {
    withNoise(p, () => {
      const { g, s, t } = atBust(1);
      const from = g.nextLogId;
      intoBust(g, s);
      assert.equal(t.asleep, !wake, `toad, noise ${p}`);
      const said = texts(g, from);
      assert.ok(said.length <= 1, 'the exchange is the event, not the log');
      if (said.length) assert.deepEqual(said, ['[the toad wakes]']);
    });
  }
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const runs = [0, 1].map(() => {
      const { g, s, t } = atBust(1, seed);
      intoBust(g, s);
      return t.asleep;
    });
    assert.equal(runs[0], runs[1]);
    seen.add(runs[0]);
  }
  assert.deepEqual([...seen].sort(), [false, true]);
});

test('the opening: everything you carry as links, in order, back last', () => {
  const { g, s } = spokenBust();
  g.items.push({ key: 'key', inHand: false }, { key: 'worms', inHand: false }, { key: 'sword', inHand: false }, { key: 'key', inHand: false });
  g.memories.push('worms'); // nothing to give up here
  intoBust(g, s);
  const v = view(g);
  assert.deepEqual(v.event.options, [
    { label: 'sword', kind: 'item', slot: false },
    { label: '[golden key]', kind: 'item', slot: true },
    { label: '[worms]', kind: 'item', slot: true },
    { label: 'sword', kind: 'item', slot: false },
    { label: '[golden key]', kind: 'item', slot: true },
    { label: 'back', kind: 'back', slot: false },
  ]);
  assert.equal(v.event.cursor, 0);
  for (let k = 0; k < 9; k++) act(g, { type: 'move', dir: 's' });
  assert.equal(view(g).event.cursor, 5, 'the keys stop at the last link');
  act(g, { type: 'context' });
  assert.equal(view(g).event, null);
});

test('enchanting through the opening: once each item, the line under the text, the options kept', () => {
  withNoise(0, () => {
    const { g, s } = spokenBust();
    const before = playerDamage(g);
    const turn = g.turn;
    intoBust(g, s);
    let from = g.nextLogId;
    const ev = act(g, { type: 'context' }); // the cursor is on the sword
    assert.deepEqual(ev, [{ type: 'enchant', key: 'sword' }, { type: 'noise' }]);
    assert.deepEqual(texts(g, from), [], 'what it says is in the event, not the log');
    let v = view(g);
    assert.deepEqual(passages(v), [[LIFELESS], ['[the statue enchants it]']]);
    assert.deepEqual(v.event.lines.map((l) => l.slot), [false, true]);
    assert.equal(v.event.now, 1, 'only what it says is new');
    assert.deepEqual(labels(v), ['sword', 'back'], 'another item can go in');
    assert.equal(v.event.cursor, 0);
    assert.equal(g.items[0].enchanted, true);
    assert.equal(g.items[0].inHand, true);
    assert.equal(playerDamage(g), before + CONFIG.enchant.swordDamage);
    // Once only; the new line takes the old one's place.
    from = g.nextLogId;
    const ev2 = act(g, { type: 'choose', index: 0 });
    assert.deepEqual(ev2, []);
    assert.deepEqual(texts(g, from), []);
    v = view(g);
    assert.deepEqual(passages(v), [[LIFELESS], ['[nothing more happens]']]);
    assert.equal(playerDamage(g), before + CONFIG.enchant.swordDamage);
    assert.equal(g.turn, turn, 'nothing here takes time');
    act(g, { type: 'back' });
    act(g, { type: 'menu', id: 'inv' });
    assert.equal(view(g).inv.items[0].state, 'in hand [enchanted]');
  });
});

test('enchanting is noise', () => {
  withNoise(1, () => {
    const { g, s, t } = spokenBust();
    intoBust(g, s);
    assert.equal(t.asleep, true, 'opening it is quiet');
    act(g, { type: 'context' });
    assert.equal(t.asleep, false);
  });
});

test('the worms in the opening: their memory at once, back closes everything, and it never comes twice', () => {
  withNoise(0, () => {
    const { g, s } = spokenBust();
    g.items.push({ key: 'worms', inHand: false });
    act(g, { type: 'menu', id: 'inv' });
    act(g, { type: 'move', dir: 's' });
    act(g, { type: 'context' }); // inspect: the memory is on its way
    assert.ok(g.recall);
    act(g, { type: 'back' });
    const turn = g.turn;
    intoBust(g, s);
    const from = g.nextLogId;
    const ev = act(g, { type: 'choose', index: 1 });
    assert.deepEqual(texts(g, from), ['you have a memory']);
    assert.ok(ev.some((e) => e.type === 'event' && e.id === 'memory'));
    let v = view(g);
    assert.equal(v.event.id, 'memory');
    assert.ok(v.event.lines[0].text.startsWith('memory! you are standing amongst people'));
    assert.deepEqual(labels(v), ['back']);
    assert.deepEqual(g.memories, ['worms']);
    assert.equal(g.recall, null);
    assert.equal(g.items[1].enchanted, true);
    assert.equal(g.items[1].strong, true);
    assert.equal(g.turn, turn);
    act(g, { type: 'back' });
    v = view(g);
    assert.equal(v.event, null, 'back closes everything');
    assert.equal(v.inv, null);
    assert.equal(v.menu, null);
    for (let k = 0; k < CONFIG.memoryDelay + 10; k++) {
      act(g, { type: 'wait' });
      assert.equal(view(g).event, null);
    }
    assert.equal(g.log.filter((l) => l.text === 'you have a memory').length, 1);
    // They hold no memory now: in again, nothing more.
    intoBust(g, s);
    act(g, { type: 'choose', index: 1 });
    assert.equal(view(g).event.id, 'bust');
    assert.deepEqual(passages(view(g)), [[LIFELESS], ['[nothing more happens]']]);
  });
});

test('the loudest case says two lines: the worms go in, the toad wakes in sight, the memory comes', () => {
  let woke = 0;
  for (let seed = 1; seed <= 40; seed++) {
    withNoise(1, () => {
      const { g, s, t } = spokenBust(seed);
      g.items.push({ key: 'worms', inHand: false });
      intoBust(g, s);
      const from = g.nextLogId;
      act(g, { type: 'choose', index: 1 });
      const said = texts(g, from);
      assert.equal(t.asleep, false);
      assert.ok(said.length <= CONFIG.saysAtMost, said.join(' | '));
      assert.equal(said[said.length - 1], 'you have a memory');
      if (said.length === 2) {
        woke++;
        assert.equal(said[0], '[the toad wakes]');
      }
      assert.equal(view(g).event.id, 'memory');
    });
  }
  assert.ok(woke > 0, 'in some seed you can see the toad from beside the bust');
});

test('beside the bust the wide button is what it would be anyway, and the inventory has no give mode', () => {
  const { g, room } = atBust(1);
  assert.equal(TEXT.context.statue, undefined);
  assert.deepEqual(view(g).context, { id: 'sense', label: TEXT.context.sense, more: true });
  room.corpses.push({ x: g.x, y: g.y, items: [] });
  assert.equal(view(g).context.id, 'corpse');
  room.corpses = [];
  act(g, { type: 'menu', id: 'inv' });
  const v = view(g);
  assert.ok(!('give' in v.inv));
  act(g, { type: 'use' });
  assert.equal(g.items[0].inHand, false, 'use holds or puts away, as ever');
  assert.ok(!g.items[0].enchanted);
});

test('an enchanted sword that held a memory does twice the more', () => {
  const g = newGame({ seed: 3 });
  const base = playerDamage(g);
  g.items[0].enchanted = true;
  assert.equal(playerDamage(g), base + CONFIG.enchant.swordDamage);
  g.items[0].strong = true;
  assert.equal(playerDamage(g), base + 2 * CONFIG.enchant.swordDamage);
  g.items[0].inHand = false;
  assert.equal(playerDamage(g), Math.max(1, Math.round(g.str * CONFIG.fistDamagePerStr)));
});

// A seed where three open cells run straight out from the bust, and from the first a step aside and in again.
function straightOut() {
  for (let seed = 1; seed < 800; seed++) {
    const r = inToadRoom(seed);
    const { room, s, t } = r;
    const ok = (x, y) => open(room.t[idx(x, y)]) && !(x === t.x && y === t.y);
    for (const d of DIRS) {
      const [dx, dy] = STEP[d];
      if (![1, 2, 3].every((k) => ok(s.x + dx * k, s.y + dy * k))) continue;
      const side = DIRS.find((p) => STEP[p][0] !== dx && STEP[p][1] !== dy && ok(s.x + dx + STEP[p][0], s.y + dy + STEP[p][1]) && ok(s.x + STEP[p][0], s.y + STEP[p][1]));
      if (!side) continue;
      return { ...r, d, side };
    }
  }
  throw new Error('no seed');
}

test('sounds from the opening: stepping beside the bust with a memory in hand, once each approach', () => {
  const { g, s, d, side } = straightOut();
  const [dx, dy] = STEP[d];
  const sounds = () => g.log.filter((l) => l.text === '[sounds from the opening, dee]').length;
  const walk = (dir) => act(g, { type: 'move', dir });

  // Without an item that holds a memory: nothing.
  [g.x, g.y] = [s.x + dx * 3, s.y + dy * 3];
  walk(OPP[d]);
  walk(OPP[d]);
  assert.equal(manhattan(g.x, g.y, s.x, s.y), 1);
  assert.equal(sounds(), 0);

  // With the worms: once as you arrive beside it.
  g.items.push({ key: 'worms', inHand: false });
  walk(d);
  walk(OPP[d]);
  assert.equal(sounds(), 1);
  const line = g.log.find((l) => l.text === '[sounds from the opening, dee]');
  assert.equal(line.kind, 'slot');
  // Not again while you stay, or walk round it.
  act(g, { type: 'wait' });
  walk(side);
  walk(OPP[d]);
  assert.equal(manhattan(g.x, g.y, s.x, s.y), 1, 'beside it on another side');
  assert.equal(sounds(), 1);
  // Away and back: a new approach.
  walk(d);
  walk(OPP[side]);
  walk(d);
  walk(OPP[d]);
  assert.equal(sounds(), 2);
  // Once the memory is back, the worms are quiet.
  g.memories.push('worms');
  walk(d);
  walk(OPP[d]);
  assert.equal(sounds(), 2);
});
