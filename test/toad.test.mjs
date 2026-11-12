import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/text.js';
import { los } from '../src/fov.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { clearGoblins, makeGoblin, DIRS, STEP, S, idx } from './helpers.mjs';

const texts = (g, from) => g.log.filter((l) => l.id >= from).map((l) => l.text);
const open = (c) => c === 'floor' || c === 'grass';
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// A game in the toad's room, no goblins, you `dist` steps from the toad and in its sight.
function atToad(seed = 21, dist = 1) {
  const g = newGame({ seed });
  clearGoblins(g);
  g.hp = g.maxHp = 100000;
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  const t = room.toad;
  let spot = null;
  for (let i = 0; i < S * S && !spot; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    if (open(room.t[i]) && manhattan(x, y, t.x, t.y) === dist && los(room.t, x, y, t.x, t.y)) spot = [x, y];
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

// Observe the toad; the lines said.
function lookAtToad(g, t) {
  const from = g.nextLogId;
  const ev = act(g, { type: 'observe', x: t.x, y: t.y });
  return { ev, said: texts(g, from) };
}

const labels = (v) => v.event.options.map((o) => (o ? o.label : null));
const O = TEXT.toad.options;

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

test('observing the toad from afar: two lines, no event', () => {
  const { g, t } = seedWithToadAt(CONFIG.observeClose + 1);
  const turn = g.turn;
  const { ev, said } = lookAtToad(g, t);
  assert.deepEqual(said, ['a large sleeping toad', 'it seems stronger than you']);
  assert.deepEqual(ev, [{ type: 'observe', x: t.x, y: t.y }]);
  assert.equal(view(g).event, null);
  assert.equal(g.turn, turn);
});

test('observing it close: the chain, then its event opens', () => {
  for (const dist of [1, CONFIG.observeClose]) {
    const { g, t } = seedWithToadAt(dist);
    const turn = g.turn;
    const { ev, said } = lookAtToad(g, t);
    assert.deepEqual(said, ['a large sleeping toad', 'it seems stronger than you', 'it wears a chain with a golden key around its neck']);
    assert.deepEqual(ev, [{ type: 'observe', x: t.x, y: t.y }, { type: 'event', id: 'toad' }]);
    const v = view(g);
    assert.deepEqual(v.event.lines, [
      { text: 'it is singing in its sleep, in an Irish style', song: false, passage: 0 },
      { text: 'when I was small', song: true, passage: 0 },
      { text: 'a mischievous girl did I love', song: true, passage: 0 },
      { text: 'who I let open my mouth', song: true, passage: 0 },
      { text: 'and she pulled out my tongue', song: true, passage: 0 },
    ]);
    assert.equal(v.event.now, 0);
    assert.deepEqual(labels(v), ['listen more', 'go for the key', 'attack!', 'back']);
    assert.equal(v.event.cursor, 0);
    assert.equal(g.turn, turn);
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

test('the event: listen more three times, the toad stirs, then wakes', () => {
  const { g, t } = atToad();
  lookAtToad(g, t);
  const turn = g.turn;
  act(g, { type: 'context' }); // listen more (the cursor's option)
  let v = view(g);
  assert.equal(t.stirred, true);
  assert.equal(v.event.now, 1);
  assert.deepEqual(
    v.event.lines.filter((l) => l.passage === 1).map((l) => [l.text, l.song]),
    [["and she didn't care", true], ['so she never knew', true], ['that my tongue grew back', true], ['the toad stirs momentarily, interrupting the song', false]],
  );
  act(g, { type: 'choose', index: 0 });
  v = view(g);
  assert.deepEqual(v.event.lines.filter((l) => l.passage === 2).map((l) => l.text), ['I changed for a long time', "I'm coming back different"]);
  assert.equal(t.asleep, true);
  act(g, { type: 'choose', index: 0 });
  v = view(g);
  assert.deepEqual(v.event.lines.filter((l) => l.passage === 3).map((l) => l.text), ['the toad wakes up']);
  assert.equal(t.asleep, false);
  assert.deepEqual(labels(v), [null, null, null, 'back']);
  assert.equal(v.event.cursor, 3);
  assert.equal(g.turn, turn, 'nothing in an event takes time');
  act(g, { type: 'context' });
  assert.equal(view(g).event, null);
  assert.equal(g.turn, turn);
});

test('in an event, other actions do nothing; the arrows move the cursor; back closes it', () => {
  const { g, t } = atToad();
  lookAtToad(g, t);
  const before = view(g);
  for (const a of [{ type: 'wait' }, { type: 'menu', id: 'inv' }, { type: 'menu', id: 'sys' }, { type: 'observe', x: t.x, y: t.y }, { type: 'use' }, { type: 'pick', index: 0 }, { type: 'choose', index: 7 }, { type: 'move', dir: 'q' }]) {
    assert.deepEqual(act(g, a), []);
  }
  assert.deepEqual(view(g), before);
  const cursor = (dir) => {
    act(g, { type: 'move', dir });
    return view(g).event.cursor;
  };
  assert.equal(cursor('e'), 1);
  assert.equal(cursor('s'), 3);
  assert.equal(cursor('w'), 2);
  assert.equal(cursor('n'), 0);
  act(g, { type: 'back' });
  assert.equal(view(g).event, null);
  assert.equal(t.asleep, true);
});

test('go for the key: CONFIG.keyChance, calm and stirred, from the seeded chance', () => {
  const keep = { ...CONFIG.keyChance };
  try {
    // Sure success while calm.
    CONFIG.keyChance.calm = 1;
    CONFIG.keyChance.stirred = 0;
    let { g, t } = atToad();
    lookAtToad(g, t);
    act(g, { type: 'choose', index: 1 });
    let v = view(g);
    assert.deepEqual(v.event.lines.filter((l) => l.passage === 1).map((l) => l.text), ['success!']);
    assert.deepEqual(labels(v), [null, null, null, 'back']);
    assert.ok(g.items.some((it) => it.key === 'key'));
    assert.equal(t.key, false);
    assert.equal(t.asleep, true);
    act(g, { type: 'back' });
    // Without its key: no chain line, and no key option.
    const { said } = lookAtToad(g, t);
    assert.deepEqual(said, ['a large sleeping toad', 'it seems stronger than you']);
    assert.deepEqual(labels(view(g)), ['listen more', 'attack!', null, 'back']);
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
    lookAtToad(g, t);
    act(g, { type: 'choose', index: 0 }); // listen: it stirs
    act(g, { type: 'choose', index: 1 });
    v = view(g);
    assert.deepEqual(v.event.lines.filter((l) => l.passage === 2).map((l) => l.text), ['failure! the toad wakes up']);
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
      lookAtToad(g, t);
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
  lookAtToad(g, t);
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
  clearGoblins(g);
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

test('sense in the toad room adds his four lines, and then you know about the worms', () => {
  const g = newGame({ seed: 12 });
  clearGoblins(g);
  g.hp = g.maxHp = 100000;
  // Elsewhere: nothing more.
  let from = g.nextLogId;
  act(g, { type: 'context' });
  assert.ok(!texts(g, from).includes('worms are down there you think'));
  assert.equal(g.knowsWorms, false);
  act(g, { type: 'menu', id: 'act' });
  assert.deepEqual(view(g).menu.options.map((o) => o && o.label), ['rest', null, null, 'back']);
  act(g, { type: 'back' });
  // In the toad's room.
  g.room = g.level.toadRoom;
  const room = currentRoom(g);
  const at = room.t.findIndex((c, i) => c === 'floor' && !(room.toad.x === i % S && room.toad.y === Math.floor(i / S)) && i % S > 0);
  [g.x, g.y] = [at % S, Math.floor(at / S)];
  from = g.nextLogId;
  act(g, { type: 'context' });
  const lines = g.log.filter((l) => l.id >= from);
  const said = lines.map((l) => l.text);
  assert.deepEqual(said.slice(-4), [
    'there is the smell of [cinnamon] in the air',
    'you have a feeling you have been here before',
    'the ground struggles gently beneath your feet',
    'worms are down there you think',
  ]);
  assert.ok(lines.slice(-4).every((l) => l.kind === 'sense'));
  assert.equal(g.knowsWorms, true);
  act(g, { type: 'menu', id: 'act' });
  assert.deepEqual(view(g).menu.options[1], { label: 'dig for worms', kind: 'action', disabled: false });
});

test('dig for worms: grass or dirt only, three turns, then worms; inspecting them brings a memory', () => {
  const g = newGame({ seed: 13 });
  clearGoblins(g);
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
  assert.deepEqual(v.event.lines.map((l) => l.text), [
    'memory! you are standing amongst people wearing full bodied suits, all white. you are in a suit yourself. the figure next to you extends his hand, upon which rests a single, normal looking worm',
    '"we have programmed these worms to consume harmful substances that are in the ground, or just about any substance"',
  ]);
  assert.deepEqual(labels(v), [null, null, null, 'back']);
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

test('a memory that comes back during a rest stops the rest', () => {
  const g = newGame({ seed: 14 });
  clearGoblins(g);
  g.hp = 1;
  g.recall = { id: 'worms', turn: g.turn + 3 };
  const turn = g.turn;
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.turn, turn + 3);
  assert.equal(view(g).event.id, 'memory');
  assert.equal(g.hp, 1, 'no rest finished');
});

test('a goblin never steps onto the toad, and the toad never onto a goblin', () => {
  const { g, room, t } = atToad();
  t.asleep = false;
  for (let k = 0; k < 6; k++) room.goblins.push(makeGoblin(1 + (k % 3), 1 + Math.floor(k / 3), false, 800 + k));
  room.goblins = room.goblins.filter((b) => open(room.t[idx(b.x, b.y)]) && !(b.x === t.x && b.y === t.y) && !(b.x === g.x && b.y === g.y));
  for (let k = 0; k < 60; k++) {
    act(g, { type: 'wait' });
    if (!room.toad) break;
    assert.ok(!room.goblins.some((b) => b.x === room.toad.x && b.y === room.toad.y));
  }
});
