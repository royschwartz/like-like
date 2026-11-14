import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { los } from '../src/fov.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { chebyshev } from '../src/path.js';
import { putToad, openRoom, DIRS, STEP, S, idx } from './helpers.mjs';

const texts = (g, from) => g.log.filter((l) => l.id >= from).map((l) => l.text);
const open = (c) => c === 'floor' || c === 'grass';
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// A game in the toad's room, you `dist` steps (eight ways) from the toad and in its sight.
function atToad(seed = 21, dist = 1) {
  const g = newGame({ seed });
  g.hp = g.maxHp = 100000;
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  const t = room.toad;
  let spot = null;
  for (let i = 0; i < S * S && !spot; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    // steps count diagonals; one step away is a straight one, so an arrow reaches it
    if (!open(room.t[i]) || chebyshev(x, y, t.x, t.y) !== dist || !los(room.t, x, y, t.x, t.y)) continue;
    if (dist === 1 && manhattan(x, y, t.x, t.y) !== 1) continue;
    spot = [x, y];
  }
  assert.ok(spot, 'a spot by the toad');
  [g.x, g.y] = spot;
  return { g, room, t };
}

function seedWithToadAt(dist) {
  for (let seed = 1; seed < 500; seed++) {
    try {
      return atToad(seed, dist);
    } catch (e) {
      // no such spot in this seed
    }
  }
  throw new Error('no seed');
}

// Observe the toad once; the lines said.
function lookAtToad(g, t) {
  const from = g.nextLogId;
  const ev = act(g, { type: 'observe', x: t.x, y: t.y });
  return { ev, said: texts(g, from) };
}

// Click on the toad until its event opens (one observation a click).
function openItsEvent(g, t) {
  for (let k = 0; k < 6 && !view(g).event; k++) act(g, { type: 'observe', x: t.x, y: t.y });
  assert.equal(view(g).event.id, 'toad');
}

const labels = (v) => v.event.options.map((o) => o.label);
const eventTexts = (v) => v.event.lines.map((l) => l.text);

test('level 1 has the toad asleep with its key; level 2 has none', () => {
  const g = newGame({ seed: 5 });
  const tr = g.level.toadRoom;
  assert.ok(tr > 0);
  assert.equal(g.level.rooms[tr].toad.asleep, true);
  const st = g.level.stairs;
  g.room = st.room;
  [g.x, g.y] = [st.x, st.y];
  act(g, { type: 'context' });
  assert.equal(g.depth, 2);
  assert.equal(g.level.toadRoom, null);
  assert.ok(g.level.rooms.every((r) => r.toad === null));
});

test('the toad and the golden door are drawn', () => {
  const { g, t } = atToad();
  let v = view(g);
  assert.deepEqual(v.cells[idx(t.x, t.y)].thing, { kind: 'toad', asleep: true });
  const gd = g.level.golddoor;
  assert.equal(v.cells[idx(gd.x, gd.y)].t, 'golddoor');
});

test('observing the toad from afar: one line a click, no event', () => {
  const { g, t } = seedWithToadAt(CONFIG.observeClose + 1);
  const turn = g.turn;
  const first = lookAtToad(g, t);
  assert.deepEqual(first.said, ['a large sleeping toad']);
  assert.deepEqual(first.ev, [{ type: 'observe', x: t.x, y: t.y }]);
  assert.deepEqual(lookAtToad(g, t).said, ['it seems stronger than you']);
  assert.deepEqual(lookAtToad(g, t).said, ['it seems stronger than you']);
  assert.equal(view(g).event, null);
  assert.equal(g.turn, turn);
});

test('observing it close: a line a click, the chain, then its song opens its event', () => {
  for (const dist of [1, CONFIG.observeClose]) {
    const { g, t } = seedWithToadAt(dist);
    const turn = g.turn;
    assert.equal(view(g).cells[idx(t.x, t.y)].more, false, 'not until it is sensed');
    currentRoom(g).noticed = { toad: true }; // as noticing it leaves it
    assert.equal(view(g).cells[idx(t.x, t.y)].more, true, 'it blinks');
    assert.deepEqual(lookAtToad(g, t).said, ['a large sleeping toad']);
    assert.deepEqual(lookAtToad(g, t).said, ['it seems stronger than you']);
    assert.deepEqual(lookAtToad(g, t).said, ['it wears a chain with a golden key around its neck']);
    assert.equal(view(g).event, null);
    assert.equal(view(g).cells[idx(t.x, t.y)].more, true, 'one more');
    const { ev, said } = lookAtToad(g, t);
    assert.deepEqual(said, ['it is singing in its sleep, in an Irish style']);
    assert.deepEqual(ev, [{ type: 'observe', x: t.x, y: t.y }, { type: 'event', id: 'toad' }]);
    const v = view(g);
    assert.deepEqual(v.event.lines, [
      { text: 'it is singing in its sleep, in an Irish style', song: false, slot: false, passage: 0 },
      { text: 'when I was small', song: true, slot: false, passage: 1 },
      { text: 'a mischievous girl did I love', song: true, slot: false, passage: 1 },
      { text: 'who I let open my mouth', song: true, slot: false, passage: 1 },
      { text: 'and she pulled out my tongue', song: true, slot: false, passage: 1 },
    ]);
    assert.equal(v.event.now, 0);
    assert.deepEqual(v.event.options, [
      { label: 'listen more', kind: 'action', slot: false },
      { label: 'go for the key', kind: 'action', slot: false },
      { label: 'attack!', kind: 'action', slot: false },
      { label: 'back', kind: 'back', slot: false },
    ]);
    assert.equal(v.event.cursor, 0);
    assert.equal(g.turn, turn);
    act(g, { type: 'back' });
    assert.equal(view(g).cells[idx(t.x, t.y)].more, false, 'nothing new now');
  }
});

test('observing the golden door, and the awake toad', () => {
  const { g, room, t } = atToad();
  const gd = g.level.golddoor;
  room.seen[idx(gd.x, gd.y)] = true;
  let from = g.nextLogId;
  act(g, { type: 'observe', x: gd.x, y: gd.y });
  assert.deepEqual(texts(g, from), ['the door at the far corner of the room is golden']);
  t.asleep = false;
  from = g.nextLogId;
  const ev = act(g, { type: 'observe', x: t.x, y: t.y });
  assert.deepEqual(texts(g, from), ['[toad, awake]']);
  assert.equal(g.log[g.log.length - 1].kind, 'slot');
  assert.ok(!ev.some((e) => e.type === 'event'));
});

test('the event: listen more three times, the toad stirs, then wakes; each choice is a new page', () => {
  const { g, t } = atToad();
  openItsEvent(g, t);
  const turn = g.turn;
  act(g, { type: 'context' }); // listen more (the cursor's option)
  let v = view(g);
  assert.equal(t.stirred, true);
  assert.equal(v.event.now, 0);
  assert.deepEqual(
    v.event.lines.map((l) => [l.text, l.song, l.passage]),
    [["and she didn't care", true, 0], ['so she never knew', true, 0], ['that my tongue grew back', true, 0], ['the toad stirs momentarily, interrupting the song', false, 1]],
  );
  act(g, { type: 'choose', index: 0 });
  v = view(g);
  assert.deepEqual(eventTexts(v), ['I changed for a long time', "I'm coming back different"]);
  assert.equal(t.asleep, true);
  act(g, { type: 'choose', index: 0 });
  v = view(g);
  assert.deepEqual(eventTexts(v), ['the toad wakes up']);
  assert.equal(t.asleep, false);
  assert.deepEqual(labels(v), ['back']);
  assert.equal(v.event.cursor, 0);
  assert.equal(g.turn, turn, 'nothing in an event takes time');
  act(g, { type: 'context' });
  assert.equal(view(g).event, null);
  assert.equal(g.turn, turn);
});

test('in an event, other actions do nothing; the arrows move down and up the links; back closes it', () => {
  const { g, t } = atToad();
  openItsEvent(g, t);
  const before = view(g);
  for (const a of [{ type: 'wait' }, { type: 'menu', id: 'inv' }, { type: 'observe', x: t.x, y: t.y }, { type: 'use' }, { type: 'pick', index: 0 }, { type: 'choose', index: 4 }, { type: 'choose', index: -1 }, { type: 'choose', index: 1.5 }, { type: 'move', dir: 'q' }]) {
    assert.deepEqual(act(g, a), []);
  }
  assert.deepEqual(view(g), before);
  const cursor = (dir) => {
    act(g, { type: 'move', dir });
    return view(g).event.cursor;
  };
  assert.equal(cursor('n'), 0, 'already at the top');
  assert.equal(cursor('s'), 1);
  assert.equal(cursor('e'), 2);
  assert.equal(cursor('s'), 3);
  assert.equal(cursor('s'), 3, 'already at the bottom');
  assert.equal(cursor('w'), 2);
  assert.equal(cursor('n'), 1);
  act(g, { type: 'back' });
  assert.equal(view(g).event, null);
  assert.equal(t.asleep, true);
});

test('the system menu preserves an event and its cursor through look changes and back', () => {
  const { g, t } = atToad();
  openItsEvent(g, t);
  act(g, { type: 'move', dir: 's' });
  const before = view(g).event;
  const turn = g.turn;
  act(g, { type: 'menu', id: 'sys' });
  assert.equal(view(g).menu.id, 'sys');
  assert.deepEqual(view(g).event, before);
  act(g, { type: 'move', dir: 's' });
  assert.equal(view(g).menu.cursor, 1, 'arrows follow the event menu links in order');
  assert.deepEqual(act(g, { type: 'context' }), [{ type: 'look', look: 'dark' }]);
  assert.deepEqual(view(g).event, before);
  act(g, { type: 'move', dir: 's' });
  assert.equal(view(g).menu.cursor, 2, 'the outlines setting');
  assert.equal(act(g, { type: 'context' })[0].type, 'outlines');
  assert.deepEqual(view(g).event, before);
  act(g, { type: 'move', dir: 's' });
  assert.equal(view(g).menu.cursor, 3, 'then back');
  act(g, { type: 'context' });
  assert.equal(view(g).menu, null);
  assert.deepEqual(view(g).event, before);
  for (const close of [{ type: 'back' }, { type: 'menu', id: 'sys' }]) {
    act(g, { type: 'menu', id: 'sys' });
    act(g, close);
    assert.equal(view(g).menu, null);
    assert.deepEqual(view(g).event, before);
  }
  assert.equal(g.turn, turn);
});

test('restart from an event menu closes the event and retains the selected look', () => {
  const { g, t } = atToad();
  openItsEvent(g, t);
  const seed = g.seed;
  act(g, { type: 'menu', id: 'sys' });
  act(g, { type: 'choose', index: 1 });
  assert.deepEqual(act(g, { type: 'choose', index: 0 }), [{ type: 'restart' }]);
  const v = view(g);
  assert.equal(v.event, null);
  assert.equal(v.menu, null);
  assert.equal(v.turn, 0);
  assert.equal(v.look, 'dark');
  assert.notEqual(g.seed, seed);
});

test('a memory system menu preserves the psy menu underneath it', () => {
  const g = newGame({ seed: 18 });
  g.memories.push('worms');
  act(g, { type: 'menu', id: 'psy' });
  const psy = view(g).menu;
  act(g, { type: 'context' });
  const memory = view(g).event;
  assert.equal(memory.id, 'memory');
  act(g, { type: 'menu', id: 'sys' });
  assert.equal(view(g).menu.id, 'sys');
  act(g, { type: 'back' });
  assert.deepEqual(view(g).event, memory);
  assert.deepEqual(view(g).menu, psy);
  act(g, { type: 'back' });
  assert.equal(view(g).event, null);
  assert.deepEqual(view(g).menu, psy);
});

test('go for the key: CONFIG.keyChance, calm and stirred, from the seeded chance', () => {
  const keep = { ...CONFIG.keyChance };
  try {
    // Sure success while calm.
    CONFIG.keyChance.calm = 1;
    CONFIG.keyChance.stirred = 0;
    let { g, t } = atToad();
    openItsEvent(g, t);
    act(g, { type: 'choose', index: 1 });
    let v = view(g);
    assert.deepEqual(eventTexts(v), ['success!']);
    assert.deepEqual(labels(v), ['back']);
    assert.ok(g.items.some((it) => it.key === 'key'));
    assert.equal(t.key, false);
    assert.equal(t.asleep, true);
    act(g, { type: 'back' });
    // Without its key: no chain line, and no key option.
    g.observed = {};
    assert.deepEqual([0, 1, 2].map(() => lookAtToad(g, t).said[0]), ['a large sleeping toad', 'it seems stronger than you', 'it is singing in its sleep, in an Irish style']);
    assert.deepEqual(labels(view(g)), ['listen more', 'attack!', 'back']);
    act(g, { type: 'back' });
    // The inventory: the key's name and description are his to write.
    act(g, { type: 'menu', id: 'inv' });
    assert.deepEqual(view(g).inv.items.map((it) => it.name), ['sword', '[golden key]']);
    act(g, { type: 'move', dir: 's' });
    const from = g.nextLogId;
    act(g, { type: 'context' });
    assert.deepEqual(texts(g, from), ['[golden key, description]']);

    // Once stirred, the stirred chance: here, sure failure.
    ({ g, t } = atToad());
    openItsEvent(g, t);
    act(g, { type: 'choose', index: 0 }); // listen: it stirs
    act(g, { type: 'choose', index: 1 });
    v = view(g);
    assert.deepEqual(eventTexts(v), ['failure! the toad wakes up']);
    assert.deepEqual(labels(v), ['back']);
    assert.equal(t.asleep, false);
    assert.ok(!g.items.some((it) => it.key === 'key'));
  } finally {
    Object.assign(CONFIG.keyChance, keep);
  }
  // With the real chances: the same seed always goes the same way, and both ways happen.
  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const runs = [0, 1].map(() => {
      const { g, t } = atToad(seed);
      openItsEvent(g, t);
      act(g, { type: 'choose', index: 1 });
      return g.items.some((it) => it.key === 'key');
    });
    assert.equal(runs[0], runs[1], `seed ${seed}`);
    outcomes.add(runs[0]);
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
});

test('attack! closes the event and strikes the toad, which wakes; a turn passes', () => {
  const { g, t } = atToad();
  openItsEvent(g, t);
  const turn = g.turn;
  const from = g.nextLogId;
  const ev = act(g, { type: 'choose', index: 2 });
  assert.equal(view(g).event, null);
  assert.equal(t.asleep, false);
  const dmg = ev.find((e) => e.type === 'attack' && e.by === 'player').dmg;
  assert.equal(t.hp, CONFIG.toad.hp - dmg);
  assert.equal(texts(g, from)[0], `you strike the toad for ${dmg} damage`);
  assert.equal(g.turn, turn + 1);
});

test('the awake toad fights with CONFIG.toad; when you die it sleeps again where it slept', () => {
  const { g, room, t } = atToad();
  const home = { ...t.home };
  t.asleep = false;
  g.hp = g.maxHp = 3;
  let hits = 0;
  let died = false;
  for (let k = 0; k < 200 && !died; k++) {
    const ev = act(g, { type: 'wait' });
    for (const e of ev) {
      if (e.type === 'attack' && e.by === 'toad' && e.hit) {
        hits++;
        assert.equal(e.dmg, CONFIG.toad.damage);
      }
    }
    died = ev.some((e) => e.type === 'death');
  }
  assert.ok(died && hits > 0);
  assert.ok(g.log.some((l) => l.text === `the toad strikes you for ${CONFIG.toad.damage} damage`));
  assert.equal(t.asleep, true);
  assert.equal(t.stirred, false);
  assert.deepEqual([t.x, t.y], [home.x, home.y]);
  assert.equal(room.toad, t);
});

test('the toad dies; its corpse holds the key unless you have it', () => {
  for (const haveKey of [false, true]) {
    const { g, room, t } = atToad();
    if (haveKey) g.items.push({ key: 'key', inHand: false });
    t.hp = 1;
    const dx = t.x - g.x;
    const dy = t.y - g.y;
    const dir = DIRS.find((d) => STEP[d][0] === dx && STEP[d][1] === dy);
    const ev = act(g, { type: 'move', dir }); // asleep: a sure hit
    assert.ok(ev.some((e) => e.type === 'kill'));
    assert.equal(room.toad, null);
    assert.ok(g.log.some((l) => l.text === 'the toad dies'));
    const corpse = room.corpses.find((c) => c.x === t.x && c.y === t.y);
    assert.deepEqual(corpse.items, haveKey ? [] : [{ key: 'key' }]);
  }
});

test('the golden door: locked without the key, opens with it, and the stairs are behind it', () => {
  const g = newGame({ seed: 9 });
  g.hp = g.maxHp = 100000;
  const gd = g.level.golddoor;
  g.room = gd.room;
  const room = currentRoom(g);
  const st = g.level.stairs;
  // The step before the door, on the room's side (the side farther from the stairs).
  const sides = DIRS.filter((d) => open(room.t[idx(gd.x - STEP[d][0], gd.y - STEP[d][1])]));
  const away = (d) => manhattan(gd.x - STEP[d][0], gd.y - STEP[d][1], st.x, st.y);
  const dir = sides.sort((a, b) => away(b) - away(a))[0];
  [g.x, g.y] = [gd.x - STEP[dir][0], gd.y - STEP[dir][1]];
  assert.equal(view(g).cells[idx(st.x, st.y)].state === 'visible', false, 'the locked door hides the stairs');
  const turn = g.turn;
  let from = g.nextLogId;
  assert.deepEqual(act(g, { type: 'move', dir }), []);
  assert.deepEqual(texts(g, from), ['[the golden door is locked]']);
  assert.equal(g.turn, turn);
  assert.equal(room.t[idx(gd.x, gd.y)], 'golddoor');

  g.items.push({ key: 'key', inHand: false });
  from = g.nextLogId;
  const ev = act(g, { type: 'move', dir });
  assert.deepEqual(ev[0], { type: 'unlock', x: gd.x, y: gd.y });
  assert.deepEqual(texts(g, from), ['[the golden door opens]']);
  assert.equal(g.turn, turn + 1);
  assert.equal(room.t[idx(gd.x, gd.y)], 'opendoor');
  assert.ok(g.items.some((it) => it.key === 'key'), 'the key is kept');
  // Through it to the stairs.
  act(g, { type: 'move', dir });
  assert.deepEqual([g.x, g.y], [gd.x, gd.y]);
  assert.equal(g.room, gd.room);
  act(g, { type: 'move', dir });
  assert.equal(view(g).cells[idx(st.x, st.y)].state, 'visible');
  from = g.nextLogId;
  act(g, { type: 'observe', x: gd.x, y: gd.y });
  assert.deepEqual(texts(g, from), ['[door]']);
});

test('sensing the toad room through to its last line gives you dig for worms', () => {
  const g = newGame({ seed: 12 });
  g.hp = g.maxHp = 100000;
  // Elsewhere: nothing to sense, and only rest under *.
  let from = g.nextLogId;
  act(g, { type: 'context' });
  assert.deepEqual(texts(g, from), ['[you sense nothing]']);
  assert.equal(g.knowsWorms, false);
  const actMenu = () => {
    act(g, { type: 'menu', id: 'act' });
    const labels = view(g).menu.options.map((o) => o && o.label);
    act(g, { type: 'back' });
    return labels;
  };
  assert.deepEqual(actMenu(), ['rest', null, null, 'back']);
  // In the toad's room: a line each time.
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  const at = room.t.findIndex((c, i) => c === 'floor' && !(room.toad.x === i % S && room.toad.y === Math.floor(i / S)) && i % S > 0);
  [g.x, g.y] = [at % S, Math.floor(at / S)];
  const want = [
    'there is the smell of [cinnamon] in the air',
    'you have a feeling you have been here before',
    'the ground struggles gently beneath your feet',
    'worms are down there you think',
  ];
  for (let k = 0; k < want.length; k++) {
    assert.deepEqual(actMenu(), ['rest', null, null, 'back'], `before line ${k + 1}`);
    from = g.nextLogId;
    act(g, { type: 'context' });
    const lines = g.log.filter((l) => l.id >= from);
    assert.deepEqual(lines.map((l) => [l.text, l.kind]), [[want[k], 'sense']]);
  }
  assert.equal(g.knowsWorms, true);
  act(g, { type: 'menu', id: 'act' });
  assert.deepEqual(view(g).menu.options[1], { label: 'dig for worms', kind: 'action', disabled: false });
});

test('dig for worms: grass or dirt only, three turns, then worms; inspecting them brings a memory', () => {
  const g = newGame({ seed: 13 });
  g.hp = g.maxHp = 100000;
  g.knowsWorms = true;
  const room = currentRoom(g);
  // On the entrance you cannot dig.
  act(g, { type: 'menu', id: 'act' });
  assert.equal(view(g).menu.options[1].disabled, true);
  act(g, { type: 'choose', index: 1 });
  assert.ok(view(g).menu, 'nothing happens');
  act(g, { type: 'back' });
  const at = room.t.findIndex((c, i) => open(c) && i % S > 0);
  [g.x, g.y] = [at % S, Math.floor(at / S)];
  const turn = g.turn;
  act(g, { type: 'menu', id: 'act' });
  let from = g.nextLogId;
  const ev = act(g, { type: 'choose', index: 1 });
  assert.deepEqual(ev[ev.length - 1], { type: 'dig', x: g.x, y: g.y });
  assert.equal(g.turn, turn + CONFIG.digTurns);
  assert.deepEqual(texts(g, from), ['[you dig]', '[you find worms]']);
  assert.equal(view(g).menu, null);
  act(g, { type: 'menu', id: 'inv' });
  assert.deepEqual(view(g).inv.items.map((it) => it.name), ['sword', '[worms]']);
  act(g, { type: 'move', dir: 's' });
  from = g.nextLogId;
  act(g, { type: 'context' });
  assert.deepEqual(texts(g, from), ['the worms look normal, but you cannot help but imagine them as limbless people']);
  act(g, { type: 'context' }); // a second look starts no second memory
  act(g, { type: 'back' });
  // CONFIG.memoryDelay turns later: the memory.
  for (let k = 1; k < CONFIG.memoryDelay; k++) {
    act(g, { type: 'wait' });
    assert.equal(view(g).event, null, `turn ${k}`);
  }
  from = g.nextLogId;
  const ev2 = act(g, { type: 'wait' });
  assert.ok(ev2.some((e) => e.type === 'event' && e.id === 'memory'));
  assert.deepEqual(texts(g, from), ['you have a memory']);
  const v = view(g);
  assert.deepEqual(v.event.lines.map((l) => [l.text, l.passage]), [
    ['memory! you are standing amongst people wearing full bodied suits, all white. you are in a suit yourself. the figure next to you extends his hand, upon which rests a single, normal looking worm', 0],
    ['"we have programmed these worms to consume harmful substances that are in the ground, or just about any substance"', 1],
  ]);
  assert.deepEqual(labels(v), ['back']);
  assert.deepEqual(g.memories, ['worms']);
  act(g, { type: 'back' });
  assert.equal(view(g).event, null);
  // It never comes back on its own again.
  for (let k = 0; k < 20; k++) act(g, { type: 'wait' });
  assert.equal(view(g).event, null);
  // Under psy: a [memory] that opens it again, and back returns to psy.
  act(g, { type: 'menu', id: 'psy' });
  let pv = view(g);
  assert.deepEqual(pv.menu.options[2], { label: '[memory]', kind: 'action', disabled: false });
  assert.equal(pv.menu.cursor, 2);
  const t2 = g.turn;
  act(g, { type: 'context' });
  pv = view(g);
  assert.equal(pv.event.id, 'memory');
  assert.equal(pv.event.lines.length, 2);
  act(g, { type: 'back' });
  pv = view(g);
  assert.equal(pv.event, null);
  assert.equal(pv.menu.id, 'psy');
  assert.equal(g.turn, t2);
});

const rest = (g) => {
  act(g, { type: 'menu', id: 'act' });
  return act(g, { type: 'choose', index: 0 });
};

test('a memory waits for a rest to end, and for room in the log', () => {
  // Hurt: the rest says its two lines, so the memory comes with the next turn.
  let g = newGame({ seed: 14 });
  g.hp = 1;
  g.recall = { id: 'worms', turn: g.turn + 3 };
  let turn = g.turn;
  let from = g.nextLogId;
  rest(g);
  assert.equal(g.turn, turn + CONFIG.restTurns);
  assert.equal(g.hp, 1 + CONFIG.restHeal, 'the rest finished');
  assert.deepEqual(texts(g, from), ['you rest', 'you feel better']);
  assert.equal(view(g).event, null);
  from = g.nextLogId;
  act(g, { type: 'wait' });
  assert.deepEqual(texts(g, from), ['you have a memory']);
  assert.equal(view(g).event.id, 'memory');

  // Whole: the rest says one line, and the memory comes as it ends.
  g = newGame({ seed: 14 });
  g.recall = { id: 'worms', turn: g.turn + 3 };
  turn = g.turn;
  from = g.nextLogId;
  rest(g);
  assert.equal(g.turn, turn + CONFIG.restTurns);
  assert.deepEqual(texts(g, from), ['you rest', 'you have a memory']);
  assert.equal(view(g).event.id, 'memory');
});

test('digging stops when something awake is in sight, and never says three lines', () => {
  const g = newGame({ seed: 15 });
  g.hp = g.maxHp = 100000;
  g.knowsWorms = true;
  openRoom(g);
  [g.x, g.y] = [3, 3];
  const toad = putToad(g, 7, 3, false);
  const dig = () => {
    act(g, { type: 'menu', id: 'act' });
    return act(g, { type: 'choose', index: 1 });
  };
  let from = g.nextLogId;
  const turn = g.turn;
  dig();
  assert.equal(g.turn, turn, 'it does not begin');
  assert.deepEqual(texts(g, from), ['[you dig]', '[you stop digging]']);
  assert.ok(!g.items.some((it) => it.key === 'worms'));
  // Asleep, it lets you dig; a memory that is due waits for the worms.
  toad.asleep = true;
  g.recall = { id: 'worms', turn: g.turn + 1 };
  from = g.nextLogId;
  dig();
  assert.deepEqual(texts(g, from), ['[you dig]', '[you find worms]']);
  assert.equal(view(g).event, null);
  assert.ok(g.items.some((it) => it.key === 'worms'));
});

test('a memory that is due in a fight waits until there is room to say it', () => {
  const g = newGame({ seed: 16 });
  g.hp = g.maxHp = 100000;
  openRoom(g);
  [g.x, g.y] = [3, 3];
  const toad = putToad(g, 4, 3, false);
  toad.hp = 100000;
  g.recall = { id: 'worms', turn: g.turn };
  let came = false;
  for (let k = 0; k < 40 && !came; k++) {
    const from = g.nextLogId;
    act(g, { type: 'move', dir: 'e' }); // strike it; it answers
    const said = texts(g, from);
    assert.ok(said.length <= CONFIG.saysAtMost, said.join(' | '));
    came = said.includes('you have a memory');
    if (!came) assert.equal(said.length, 2, 'your line and its line leave no room');
  }
  // It came on a turn with room: never, while both of you keep speaking.
  assert.equal(came, false);
  toad.asleep = true;
  const from = g.nextLogId;
  act(g, { type: 'wait' });
  assert.deepEqual(texts(g, from), ['you have a memory']);
});
