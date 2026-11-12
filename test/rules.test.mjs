import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TEXT, isSlot } from '../src/text.js';
import { ARRIVAL, OPP, DOOR } from '../src/gen.js';
import { newGame, act, view, currentRoom, playerDamage } from '../src/game.js';
import { clearGoblins, makeGoblin, findSpot, plainFloor, isLegalGoblinCell, STEP, DIRS, S, idx } from './helpers.mjs';

// The last lines said.
const said = (g, n = 1) => g.log.slice(-n);
const descendLine = (g) => TEXT.log.descend[g.level.entrance.ground];
const BACK = { label: TEXT.menu.back, kind: 'back', disabled: false };
const things = (v, kind) => v.cells.filter((c) => c.thing && c.thing.kind === kind);

function tough(g) {
  g.hp = g.maxHp = 100000;
}

// A spot with plain floor east of it, and the player put there.
function standWithFloorEast(g) {
  const at = findSpot(g, (x, y, room) => plainFloor(room, x, y) && plainFloor(room, x + 1, y) && room.t[idx(x, y)] !== 'stairs');
  [g.x, g.y] = at;
  return at;
}

function seedWith(pred) {
  for (let seed = 1; seed < 5000; seed++) {
    const g = newGame({ seed });
    if (pred(g)) return g;
  }
  throw new Error('no seed found');
}

test('unknown actions are ignored', () => {
  const g = newGame({ seed: 3 });
  const before = view(g);
  for (const a of [null, undefined, 5, {}, { type: 'fly' }, { type: 'move', dir: 'up' }, { type: 'menu', id: 'x' }, { type: 'choose', index: 1 }, { type: 'back' }]) {
    assert.deepEqual(act(g, a), []);
  }
  assert.deepEqual(view(g), before);
});

test('bumping a wall takes no turn and returns nothing', () => {
  const g = newGame({ seed: 4 });
  const room = currentRoom(g);
  let dir = null;
  const at = findSpot(g, (x, y, r) => {
    if (!plainFloor(r, x, y)) return false;
    dir = DIRS.find((d) => r.t[idx(x + STEP[d][0], y + STEP[d][1])] === 'wall');
    return !!dir;
  });
  [g.x, g.y] = at;
  const before = view(g);
  assert.deepEqual(act(g, { type: 'move', dir }), []);
  assert.deepEqual(view(g), before);
  assert.equal(room.t[idx(at[0] + STEP[dir][0], at[1] + STEP[dir][1])], 'wall');
});

test('fighting a goblin to death leaves a corpse; the wide button then says corpse', () => {
  const g = newGame({ seed: 5 });
  tough(g);
  clearGoblins(g);
  const [x, y] = standWithFloorEast(g);
  const room = currentRoom(g);
  room.goblins.push(makeGoblin(x + 1, y, true));
  let killed = false;
  for (let k = 0; k < 200 && !killed; k++) {
    const ev = act(g, { type: 'move', dir: 'e' });
    const a = ev.find((e) => e.type === 'attack' && e.by === 'player');
    assert.ok(a, 'an attack');
    assert.deepEqual([a.x, a.y], [x + 1, y]);
    if (a.hit) assert.equal(a.dmg, playerDamage(g));
    killed = ev.some((e) => e.type === 'kill');
  }
  assert.ok(killed);
  assert.equal(room.goblins.length, 0);
  let v = view(g);
  assert.deepEqual(v.cells[idx(x + 1, y)].thing, { kind: 'corpse' });
  assert.ok(g.log.some((l) => l.text === TEXT.log.goblinDies && l.kind === 'good'));
  act(g, { type: 'move', dir: 'e' });
  v = view(g);
  assert.deepEqual([v.player.x, v.player.y], [x + 1, y]);
  assert.deepEqual(v.context, { id: 'corpse', label: TEXT.context.corpse });

  // The corpse menu: nothing on it.
  const turn = g.turn;
  assert.deepEqual(act(g, { type: 'context' }), []);
  v = view(g);
  assert.equal(v.turn, turn, 'opening the corpse takes no time');
  assert.equal(v.menu.id, 'corpse');
  assert.equal(v.menu.title, TEXT.context.corpse);
  assert.deepEqual(v.menu.options, [{ label: TEXT.menu.nothing, kind: 'info', disabled: true }, null, null, BACK]);
  assert.equal(v.menu.cursor, 3);
  assert.equal(said(g)[0].text, TEXT.log.corpseEmpty);

  // Taking something from a corpse.
  act(g, { type: 'back' });
  room.corpses[0].items.push({ key: 'sword' });
  act(g, { type: 'context' });
  v = view(g);
  assert.deepEqual(v.menu.options[0], { label: TEXT.thing.sword, kind: 'item', disabled: false });
  act(g, { type: 'choose', index: 0 });
  assert.equal(said(g)[0].text, TEXT.log.take(TEXT.thing.sword));
  assert.equal(g.items.length, 2);
  assert.deepEqual(view(g).menu.options[0], { label: TEXT.menu.nothing, kind: 'info', disabled: true });
});

test('the stairs take you down a level', () => {
  const g = newGame({ seed: 6 });
  const st = g.level.stairs;
  g.room = st.room;
  [g.x, g.y] = [st.x, st.y];
  assert.deepEqual(view(g).context, { id: 'stairs', label: TEXT.context.stairs });
  const ev = act(g, { type: 'context' });
  assert.deepEqual(ev, [{ type: 'descend' }]);
  const v = view(g);
  assert.equal(v.depth, 2);
  assert.equal(v.room.id, g.level.entrance.room);
  assert.deepEqual([v.player.x, v.player.y], [g.level.entrance.x, g.level.entrance.y]);
  assert.equal(v.cells[idx(v.player.x, v.player.y)].t, 'entrance');
  assert.deepEqual(v.log.slice(-2).map((l) => [l.text, l.kind]), [
    [TEXT.log.level(2), 'plain'],
    [descendLine(g), isSlot(descendLine(g)) ? 'slot' : 'story'],
  ]);
});

test('dying puts you back on the entrance with full hp, the level otherwise as it was', () => {
  const g = newGame({ seed: 7 });
  clearGoblins(g);
  const [x, y] = standWithFloorEast(g);
  g.x = x;
  g.y = y;
  currentRoom(g).goblins.push(makeGoblin(x + 1, y, false));
  const terrain = JSON.stringify(g.level.rooms.map((r) => r.t));
  const level = g.level;
  g.hp = 1;
  let died = false;
  for (let k = 0; k < 200 && !died; k++) {
    const ev = act(g, { type: 'wait' });
    died = ev.some((e) => e.type === 'death');
    if (died) assert.deepEqual(ev[ev.length - 1], { type: 'death' });
  }
  assert.ok(died);
  const v = view(g);
  assert.equal(v.stats.hp, v.stats.maxHp);
  assert.equal(g.level, level);
  assert.equal(JSON.stringify(g.level.rooms.map((r) => r.t)), terrain);
  assert.equal(v.room.id, g.level.entrance.room);
  assert.deepEqual([v.player.x, v.player.y], [g.level.entrance.x, g.level.entrance.y]);
  assert.equal(v.depth, 1);
  assert.deepEqual(said(g).map((l) => [l.text, l.kind]), [[TEXT.log.youDie, 'bad']]);
  assert.ok(!v.log.some((l) => l.text === descendLine(g) && l.turn > 0), 'no descend line on death');
  assert.equal(currentRoom(g).goblins.length, 1, 'the goblin is still there');
});

test('dying moves a goblin off the entrance', () => {
  const g = newGame({ seed: 8 });
  clearGoblins(g);
  const e = g.level.entrance;
  const room = g.level.rooms[e.room];
  // Stand far from the entrance, next to a goblin that will kill you.
  const at = findSpot(g, (x, y, r) => plainFloor(r, x, y) && plainFloor(r, x + 1, y) && Math.abs(x - e.x) + Math.abs(y - e.y) > 4);
  [g.x, g.y] = at;
  room.goblins.push(makeGoblin(at[0] + 1, at[1], false, 1));
  room.goblins.push(makeGoblin(e.x, e.y, true, 2));
  g.hp = 1;
  let died = false;
  for (let k = 0; k < 200 && !died; k++) died = act(g, { type: 'wait' }).some((ev) => ev.type === 'death');
  assert.ok(died);
  assert.deepEqual([g.x, g.y], [e.x, e.y]);
  for (const b of room.goblins) assert.ok(isLegalGoblinCell(g, room, b));
  assert.equal(things(view(g), 'player').length, 1);
});

test('SENSE: your numbers for a while, the room, the doors, the goblins until your next action', () => {
  const g = seedWith((g) => currentRoom(g).goblins.length > 0 && DIRS.some((d) => currentRoom(g).nb[d] !== null));
  tough(g);
  const room = currentRoom(g);
  let v = view(g);
  assert.deepEqual([v.stats.str, v.stats.love, v.stats.will], [null, null, null]);
  assert.equal(v.context.id, 'sense');
  const goblins = room.goblins.length;
  const asleep = room.goblins.filter((b) => b.asleep).length;
  const logLen = g.log.length;
  const ev = act(g, { type: 'context' });
  assert.deepEqual(ev[0], { type: 'sense' });
  v = view(g);
  assert.deepEqual([v.stats.str, v.stats.love, v.stats.will], [CONFIG.player.str, CONFIG.player.love, CONFIG.player.will]);
  // The sense lines come first, then whatever the goblins did.
  const want = [TEXT.log.senseHere(goblins, asleep)];
  for (const d of DIRS) {
    const n = room.nb[d];
    if (n === null) continue;
    want.push(TEXT.log.senseDoor(TEXT.dir[d], g.level.rooms[n].goblins.length, g.level.stairs.room === n));
  }
  const lines = g.log.slice(logLen).filter((l) => l.kind === 'sense');
  assert.deepEqual(lines.map((l) => l.text), want);
  assert.deepEqual(g.log.slice(logLen, logLen + want.length).map((l) => l.kind), want.map(() => 'sense'));
  assert.ok(v.cells.every((c) => c.state !== 'unknown'), 'whole room seen');
  assert.equal(things(v, 'goblin').length, room.goblins.length, 'every goblin drawn');

  // Next action: only goblins in sight.
  act(g, { type: 'wait' });
  v = view(g);
  const inSight = v.cells.filter((c, i) => c.state === 'visible' && room.goblins.some((b) => idx(b.x, b.y) === i)).length;
  assert.equal(things(v, 'goblin').length, inSight);
  for (const c of things(v, 'goblin')) assert.equal(c.state, 'visible');

  // Numbers last CONFIG.senseSelfTurns turns from the sense.
  for (let k = 1; k < CONFIG.senseSelfTurns; k++) {
    assert.equal(view(g).stats.str, CONFIG.player.str, `turn ${k}`);
    act(g, { type: 'wait' });
  }
  v = view(g);
  assert.deepEqual([v.stats.str, v.stats.love, v.stats.will], [null, null, null]);
});

test('doors: arrive on the matching arrival cell; the room you left stays as it was', () => {
  const g = seedWith((g) => g.level.rooms.length >= 2);
  tough(g);
  const room0 = currentRoom(g);
  const d = DIRS.find((k) => room0.nb[k] !== null);
  [g.x, g.y] = ARRIVAL[d];
  // Walk into the door.
  const ev = act(g, { type: 'move', dir: d });
  assert.deepEqual(ev[0], { type: 'room', dir: d });
  let v = view(g);
  assert.equal(v.room.id, room0.nb[d]);
  assert.deepEqual([v.player.x, v.player.y], ARRIVAL[OPP[d]]);
  assert.equal(v.cells[idx(...DOOR[OPP[d]])].t, 'door');
  assert.notEqual(v.room.key, room0.key);
  const snapshot = structuredClone(room0);
  for (let k = 0; k < 8; k++) act(g, { type: 'wait' });
  assert.deepEqual(room0, snapshot, 'the room you left did not change');
  // Come back.
  [g.x, g.y] = ARRIVAL[OPP[d]];
  act(g, { type: 'move', dir: OPP[d] });
  v = view(g);
  assert.equal(v.room.id, room0.id);
  assert.deepEqual([v.player.x, v.player.y], ARRIVAL[d]);
  for (let i = 0; i < S * S; i++) if (snapshot.seen[i]) assert.notEqual(v.cells[i].state, 'unknown');
});

test('goblins never stand on doors or arrival cells, even when you wait on one', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame({ seed });
    const room = currentRoom(g);
    const d = DIRS.find((k) => room.nb[k] !== null);
    if (!d) continue;
    tough(g);
    for (const r of g.level.rooms) for (const b of r.goblins) b.asleep = false;
    [g.x, g.y] = ARRIVAL[d];
    for (let k = 0; k < 40; k++) {
      act(g, { type: 'wait' });
      for (const b of currentRoom(g).goblins) assert.ok(isLegalGoblinCell(g, currentRoom(g), b));
    }
  }
});

test('menus: toggling, switching, paging, and nothing passes time', () => {
  const g = newGame({ seed: 10 });
  act(g, { type: 'menu', id: 'psy' });
  act(g, { type: 'menu', id: 'psy' });
  assert.equal(view(g).menu, null);
  act(g, { type: 'menu', id: 'psy' });
  act(g, { type: 'menu', id: 'act' });
  assert.equal(view(g).menu.id, 'act');
  const turn = g.turn;
  assert.deepEqual(act(g, { type: 'wait' }), []);
  assert.equal(g.turn, turn, 'wait does nothing with a menu open');
  act(g, { type: 'menu', id: 'act' });

  // A corpse with six swords: two a page, then more; the last page holds up to three.
  clearGoblins(g);
  const room = currentRoom(g);
  room.corpses.push({ x: g.x, y: g.y, items: Array.from({ length: 6 }, () => ({ key: 'sword' })) });
  act(g, { type: 'context' });
  assert.equal(view(g).menu.id, 'corpse');
  const sword = { label: TEXT.thing.sword, kind: 'item', disabled: false };
  const more = { label: TEXT.menu.more, kind: 'more', disabled: false };
  assert.deepEqual(view(g).menu.options, [sword, sword, more, BACK]);
  act(g, { type: 'choose', index: 2 });
  assert.deepEqual(view(g).menu.options, [sword, sword, more, BACK]);
  act(g, { type: 'choose', index: 2 });
  assert.deepEqual(view(g).menu.options, [sword, sword, null, BACK]);
  act(g, { type: 'back' }); // back a page
  assert.deepEqual(view(g).menu.options, [sword, sword, more, BACK]);
  act(g, { type: 'back' });
  act(g, { type: 'back' });
  assert.equal(view(g).menu, null);
  assert.equal(g.turn, turn);
});

test('the act menu holds only rest; cursor movement', () => {
  const g = newGame({ seed: 11 });
  tough(g);
  act(g, { type: 'menu', id: 'act' });
  const v = view(g);
  assert.equal(v.menu.title, TEXT.button.act);
  assert.deepEqual(v.menu.options, [{ label: TEXT.menu.rest, kind: 'action', disabled: false }, null, null, BACK]);
  const cursor = (dir) => {
    act(g, { type: 'move', dir });
    return view(g).menu.cursor;
  };
  assert.equal(view(g).menu.cursor, 0);
  assert.equal(cursor('e'), 0, 'slot 1 is empty');
  assert.equal(cursor('s'), 3, 'empty slot 2: the other one in that row');
  assert.equal(cursor('w'), 3, 'slot 2 is empty');
  assert.equal(cursor('n'), 0);
});

test('the wait action: one turn, with no menu open', () => {
  const g = newGame({ seed: 11 });
  tough(g);
  clearGoblins(g);
  const turn = g.turn;
  assert.deepEqual(act(g, { type: 'wait' }), []);
  assert.equal(g.turn, turn + 1);
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'wait' });
  assert.equal(g.turn, turn + 1, 'not with a menu open');
});

test('rest heals after quiet turns, and stops for an awake goblin in sight', () => {
  const g = newGame({ seed: 12 });
  clearGoblins(g);
  g.hp = 1;
  const turn = g.turn;
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.turn, turn + CONFIG.restTurns);
  assert.equal(g.hp, Math.min(g.maxHp, 1 + CONFIG.restHeal));
  assert.equal(view(g).menu, null);
  assert.deepEqual(said(g).map((l) => [l.text, l.kind]), [[TEXT.log.restBetter, 'good']]);
  assert.ok(g.log.some((l) => l.text === TEXT.log.youRest));

  // An awake goblin in sight: rest stops at once.
  const room = currentRoom(g);
  const at = findSpot(g, (x, y, r) => plainFloor(r, x, y) && plainFloor(r, x + 1, y) && plainFloor(r, x + 2, y));
  [g.x, g.y] = at;
  room.goblins.push(makeGoblin(at[0] + 2, at[1], false));
  const t2 = g.turn;
  const hp = g.hp;
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'choose', index: 0 });
  assert.equal(g.turn, t2);
  assert.equal(g.hp, hp);
  assert.deepEqual(said(g, 2).map((l) => l.text), [TEXT.log.youRest, TEXT.log.restStopped]);

  // An asleep goblin next to you: it may wake, and then rest stops.
  room.goblins = [makeGoblin(at[0] + 1, at[1], true)];
  for (let k = 0; k < 20; k++) {
    act(g, { type: 'menu', id: 'act' });
    act(g, { type: 'choose', index: 0 });
    if (!room.goblins[0].asleep) break;
  }
  assert.equal(room.goblins[0].asleep, false);
  assert.equal(said(g)[0].text, TEXT.log.restStopped);
});

test('the psy menu shows will and love as you perceive them', () => {
  const g = newGame({ seed: 13 });
  tough(g);
  act(g, { type: 'menu', id: 'psy' });
  let v = view(g);
  assert.equal(v.menu.title, TEXT.button.psy);
  assert.deepEqual(v.menu.options, [
    { label: `${TEXT.stat.will} ${TEXT.stat.unknown}`, kind: 'info', disabled: true },
    { label: `${TEXT.stat.love} ${TEXT.stat.unknown}`, kind: 'info', disabled: true },
    null,
    BACK,
  ]);
  assert.equal(v.menu.cursor, 3);
  act(g, { type: 'move', dir: 'n' });
  assert.equal(view(g).menu.cursor, 3, 'nothing to move to');
  assert.deepEqual(act(g, { type: 'choose', index: 0 }), []);
  act(g, { type: 'menu', id: 'psy' });
  assert.equal(view(g).context.id, 'sense');
  act(g, { type: 'context' });
  act(g, { type: 'menu', id: 'psy' });
  v = view(g);
  assert.equal(v.menu.options[0].label, `${TEXT.stat.will} ${CONFIG.player.will}`);
  assert.equal(v.menu.options[1].label, `${TEXT.stat.love} ${CONFIG.player.love}`);
});

test('the sys menu: look switch and restart', () => {
  const g = newGame({ seed: 14 });
  act(g, { type: 'menu', id: 'sys' });
  let v = view(g);
  assert.equal(v.menu.title, TEXT.button.sys);
  assert.deepEqual(v.menu.options, [
    { label: TEXT.menu.restart, kind: 'action', disabled: false },
    { label: TEXT.menu.lookDark, kind: 'action', disabled: false },
    null,
    BACK,
  ]);
  assert.deepEqual(act(g, { type: 'choose', index: 1 }), [{ type: 'look', look: 'dark' }]);
  v = view(g);
  assert.equal(v.look, 'dark');
  assert.equal(v.menu.id, 'sys');
  assert.equal(v.menu.options[1].label, TEXT.menu.lookPaper);
  assert.deepEqual(act(g, { type: 'choose', index: 1 }), [{ type: 'look', look: 'paper' }]);
  act(g, { type: 'choose', index: 1 });

  // Play a little, then restart.
  act(g, { type: 'back' });
  for (let k = 0; k < 5; k++) act(g, { type: 'wait' });
  const old = view(g);
  const lastId = old.log[old.log.length - 1].id;
  act(g, { type: 'menu', id: 'sys' });
  assert.deepEqual(act(g, { type: 'choose', index: 0 }), [{ type: 'restart' }]);
  v = view(g);
  assert.notEqual(v.seed, old.seed);
  assert.equal(v.look, 'dark', 'the look is kept');
  assert.equal(v.turn, 0);
  assert.equal(v.depth, 1);
  assert.equal(v.menu, null);
  assert.equal(v.stats.hp, CONFIG.player.hp);
  assert.deepEqual(v.log.map((l) => l.text), [...TEXT.opening, descendLine(g)]);
  assert.equal(v.fresh, v.log[0].id);
  assert.ok(v.log[0].id > lastId, 'log ids keep going up');
  // The same seed restarts the same way.
  const h = newGame({ seed: 14 });
  act(h, { type: 'menu', id: 'sys' });
  act(h, { type: 'choose', index: 0 });
  assert.deepEqual(view(h).cells, v.cells);
});

test('a new game: the opening, then the descend line', () => {
  const g = newGame({ seed: 15 });
  const v = view(g);
  assert.equal(TEXT.opening.length, 1);
  const text = descendLine(g);
  assert.deepEqual(v.log.map((l) => [l.text, l.kind, l.turn]), [
    [TEXT.opening[0], 'story', 0],
    [text, isSlot(text) ? 'slot' : 'story', 0],
  ]);
  assert.equal(v.fresh, v.log[0].id);
  assert.equal(things(v, 'player').length, 1);
  assert.equal(v.cells[idx(v.player.x, v.player.y)].t, 'entrance');
});

test('walls and doors next to floor in sight are drawn as in sight', () => {
  const g = newGame({ seed: 16 });
  clearGoblins(g);
  const room = currentRoom(g);
  // An open room: no obstacles, no grass, the doors kept.
  room.t = room.t.map((c, i) => {
    const x = i % S;
    const y = Math.floor(i / S);
    const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
    return edge ? c : 'floor';
  });
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      [g.x, g.y] = [x, y];
      const v = view(g);
      let ring = 0;
      for (let i = 0; i < S * S; i++) {
        const cx = i % S;
        const cy = Math.floor(i / S);
        if (cx === 0 || cy === 0 || cx === S - 1 || cy === S - 1) {
          assert.equal(v.cells[i].state, 'visible', `ring ${cx},${cy} from ${x},${y}`);
          ring++;
        }
      }
      assert.equal(ring, 40);
    }
  }
  // A pillar is in sight when a floor cell beside it is.
  room.t[idx(5, 5)] = 'wall';
  room.t[idx(4, 5)] = 'wall';
  room.t[idx(6, 5)] = 'wall';
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      if (room.t[idx(x, y)] !== 'floor') continue;
      [g.x, g.y] = [x, y];
      const v = view(g);
      for (let i = 0; i < S * S; i++) {
        if (room.t[i] !== 'wall') continue;
        const cx = i % S;
        const cy = Math.floor(i / S);
        let near = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
            const c = v.cells[idx(nx, ny)];
            if (c.state === 'visible' && c.t !== 'wall' && c.t !== 'door') near = true;
          }
        }
        if (near) assert.equal(v.cells[i].state, 'visible', `wall ${cx},${cy} from ${x},${y}`);
      }
    }
  }
  // Remembered afterwards, like any cell seen.
  act(g, { type: 'wait' });
  assert.ok(room.seen[idx(0, 0)]);
});

test('the wall frame never shows a goblin out of line of sight', () => {
  const g = newGame({ seed: 17 });
  clearGoblins(g);
  const room = currentRoom(g);
  room.t = room.t.map((c, i) => {
    const x = i % S;
    const y = Math.floor(i / S);
    return x === 0 || y === 0 || x === S - 1 || y === S - 1 ? c : 'floor';
  });
  // A wall across the room with the goblin behind it.
  for (let x = 1; x < S - 1; x++) room.t[idx(x, 5)] = 'wall';
  room.t[idx(9, 5)] = 'floor';
  room.goblins.push(makeGoblin(2, 6, true));
  [g.x, g.y] = [2, 2];
  const v = view(g);
  assert.equal(v.cells[idx(2, 5)].state, 'visible');
  assert.equal(v.cells[idx(2, 6)].thing, null);
});
