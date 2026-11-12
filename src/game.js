// The simulation. The UI only calls newGame, act and view.
// The game object is plain data; everything random comes from game.rng.

import { CONFIG } from './config.js';
import { TEXT, isSlot } from './text.js';
import { makeRng, chance, pick, deriveSeed } from './rng.js';
import { S, DIRS, STEP, OPP, ARRIVAL, idx, makeLevel, roomDistances, arrivalCells } from './gen.js';
import { fov, frame, los } from './fov.js';

const SQUARE_MENUS = ['inv', 'act', 'psy', 'sys'];

// ---- a new game --------------------------------------------------------

function makeState(seed, look, nextLogId) {
  const rng = makeRng(seed);
  const level = makeLevel(rng, 1);
  const g = {
    seed,
    look,
    rng,
    depth: 1,
    turn: 0,
    level,
    room: level.entrance.room,
    x: level.entrance.x,
    y: level.entrance.y,
    hp: CONFIG.player.hp,
    maxHp: CONFIG.player.hp,
    str: CONFIG.player.str,
    love: CONFIG.player.love,
    will: CONFIG.player.will,
    items: [{ key: 'sword', inHand: true }],
    selfUntil: -1, //  you perceive your own numbers while turn < selfUntil
    sensedTurn: -1, // every goblin is drawn while turn === sensedTurn ...
    sensedRoom: -1, // ... in this room
    menu: null, // an option menu, or null
    inv: null, //  the inventory screen: { cursor }, or null
    event: null, // an event over the whole screen, or null (see "events" below)
    knowsWorms: false, // sense in the toad's room tells you; then * offers digging
    memories: [], //   the memories you have, by id, in the order they came back
    recall: null, //   a memory on its way back: { id, turn }, or null
    heardSounds: false, // the bust's sounds were heard on this approach to it
    log: [], //    everything said, in order
    nextLogId,
    fresh: nextLogId, // the first line said by the latest action that said anything
  };
  for (const line of TEXT.opening) say(g, line, 'story');
  sayDescend(g);
  see(g);
  return g;
}

export function newGame({ seed, look } = {}) {
  const s = Number.isInteger(seed) ? seed : Date.now() % 2147483647;
  return makeState(s, look === 'dark' ? 'dark' : 'paper', 1);
}

// ---- small helpers -----------------------------------------------------

export function currentRoom(g) {
  return g.level.rooms[g.room];
}

export function goblinAt(room, x, y) {
  return room.goblins.find((b) => b.x === x && b.y === y) || null;
}

export function toadAt(room, x, y) {
  const t = room.toad;
  return t && t.x === x && t.y === y ? t : null;
}

// Whatever lives on a cell: the toad or a goblin.
function creatureAt(room, x, y) {
  return toadAt(room, x, y) || goblinAt(room, x, y);
}

const kindOf = (room, c) => (c === room.toad ? 'toad' : 'goblin');

// The goblins, then the toad.
function creatures(room) {
  return room.toad ? [...room.goblins, room.toad] : room.goblins.slice();
}

function hasItem(g, key) {
  return g.items.some((it) => it.key === key);
}

function corpseAt(room, x, y) {
  // The newest corpse on a cell is the one on top.
  for (let k = room.corpses.length - 1; k >= 0; k--) {
    const c = room.corpses[k];
    if (c.x === x && c.y === y) return c;
  }
  return null;
}

function say(g, text, kind) {
  g.log.push({ id: g.nextLogId++, turn: g.turn, text, kind: isSlot(text) ? 'slot' : kind });
}

function sayDescend(g) {
  say(g, TEXT.log.descend[g.level.entrance.ground], 'story');
}

// Remember what is in sight now.
function see(g) {
  const room = currentRoom(g);
  const vis = fov(room.t, g.x, g.y);
  const shown = frame(room.t, vis);
  for (let i = 0; i < S * S; i++) {
    if (shown[i]) room.seen[i] = true;
    if (vis[i]) room.memCorpse[i] = !!corpseAt(room, i % S, Math.floor(i / S));
  }
}

const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// Cells a goblin or the toad may never stand on: walls, doors, the golden door
// (locked or open), arrival cells. The only terrain that changes after a level is
// made is the golden door opening, and both are blocked, so this is worked out once per room.
const goblinBlockCache = new WeakMap();
const CREATURE_BLOCKED = new Set(['wall', 'door', 'golddoor', 'opendoor', 'statue']);
function goblinBlocked(room) {
  let b = goblinBlockCache.get(room);
  if (!b) {
    b = room.t.map((c) => CREATURE_BLOCKED.has(c));
    for (const [x, y] of arrivalCells(room)) b[idx(x, y)] = true;
    goblinBlockCache.set(room, b);
  }
  return b;
}

// Could this goblin (or the toad) stand here? (Not on you, not on another creature.)
export function goblinMayStand(g, room, x, y, self = null) {
  if (x < 0 || y < 0 || x >= S || y >= S) return false;
  if (goblinBlocked(room)[idx(x, y)]) return false;
  if (room === currentRoom(g) && x === g.x && y === g.y) return false;
  const other = creatureAt(room, x, y);
  return !other || other === self;
}

// The free cell nearest (x, y) by walking, for `self` to be put on; null if none.
function nearestFree(g, room, x, y, self) {
  const dist = roomDistances(room.t, x, y);
  let best = null;
  for (let i = 0; i < S * S; i++) {
    if (dist[i] < 0 || !goblinMayStand(g, room, i % S, Math.floor(i / S), self)) continue;
    if (!best || dist[i] < dist[idx(best[0], best[1])]) best = [i % S, Math.floor(i / S)];
  }
  return best;
}

function swordInHand(g) {
  return g.items.find((it) => it.key === 'sword' && it.inHand) || null;
}

// An enchanted sword does more; twice the more if it held a memory.
export function playerDamage(g) {
  const sword = swordInHand(g);
  const k = sword ? CONFIG.swordDamagePerStr : CONFIG.fistDamagePerStr;
  let dmg = Math.max(1, Math.round(g.str * k));
  if (sword && sword.enchanted) dmg += CONFIG.enchant.swordDamage * (sword.strong ? 2 : 1);
  return dmg;
}

// ---- the turn ----------------------------------------------------------

// After your action: the goblins and the toad here act, the turn goes up, you
// look around, and a memory on its way may come back.
function endTurn(g, ev) {
  const r = creaturesAct(g, ev);
  g.turn++;
  see(g);
  recallDue(g, ev);
  return r;
}

function creaturesAct(g, ev) {
  const room = currentRoom(g);
  let hit = false;
  for (const c of creatures(room)) {
    if (creatureTurn(g, room, c, ev)) hit = true;
    if (g.hp <= 0) {
      die(g, ev);
      return { hit, died: true };
    }
  }
  return { hit, died: false };
}

// One goblin's or the toad's turn. Returns true if it hit you.
function creatureTurn(g, room, gob, ev) {
  const kind = kindOf(room, gob);
  const dist = manhattan(gob.x, gob.y, g.x, g.y);
  if (gob.asleep) {
    if (kind === 'toad') return false; // only its event or a blow wakes the toad
    if (dist <= CONFIG.goblin.wakeRange && chance(g.rng, CONFIG.goblin.wakeChance)) {
      gob.asleep = false;
      if (los(room.t, g.x, g.y, gob.x, gob.y)) say(g, TEXT.log.goblinWakes, 'plain');
    }
    return false;
  }
  if (los(room.t, gob.x, gob.y, g.x, g.y)) {
    gob.lastSeen = { x: g.x, y: g.y };
    if (dist === 1) return creatureAttacks(g, kind, ev);
    stepToward(g, room, gob, g.x, g.y);
    return false;
  }
  if (gob.lastSeen) {
    const moved = stepToward(g, room, gob, gob.lastSeen.x, gob.lastSeen.y);
    if (!moved || (gob.x === gob.lastSeen.x && gob.y === gob.lastSeen.y)) gob.lastSeen = null;
    return false;
  }
  if (chance(g.rng, CONFIG.goblin.wanderChance)) {
    const options = DIRS.map((d) => [gob.x + STEP[d][0], gob.y + STEP[d][1]]).filter(([x, y]) =>
      goblinMayStand(g, room, x, y, gob),
    );
    if (options.length) [gob.x, gob.y] = pick(g.rng, options);
  }
  return false;
}

// What each kind hits with, and the lines its fights say.
function fighter(kind) {
  if (kind === 'toad') {
    return {
      hits: CONFIG.toad.hits,
      damage: CONFIG.toad.damage,
      youHit: TEXT.log.youHitToad,
      youMiss: TEXT.log.youMissToad,
      hitsYou: TEXT.log.toadHits,
      missesYou: TEXT.log.toadMisses,
      dies: TEXT.log.toadDies,
    };
  }
  return {
    hits: CONFIG.goblinHits,
    damage: CONFIG.goblin.damage,
    youHit: TEXT.log.youHit,
    youMiss: TEXT.log.youMiss,
    hitsYou: TEXT.log.goblinHits,
    missesYou: TEXT.log.goblinMisses,
    dies: TEXT.log.goblinDies,
  };
}

function creatureAttacks(g, kind, ev) {
  const f = fighter(kind);
  const hit = chance(g.rng, f.hits);
  const dmg = hit ? f.damage : 0;
  ev.push({ type: 'attack', by: kind, x: g.x, y: g.y, hit, dmg });
  if (hit) {
    g.hp -= dmg;
    say(g, f.hitsYou(dmg), 'bad');
  } else {
    say(g, f.missesYou, 'plain');
  }
  return hit;
}

// One step along the shortest path to (tx, ty). Other goblins don't bend the
// path; they only stop a step onto their cell. Returns whether it moved.
function stepToward(g, room, gob, tx, ty) {
  const blocked = goblinBlocked(room);
  const dist = roomDistances(room.t, tx, ty, (c, x, y) => !blocked[idx(x, y)]);
  let best = null;
  let bestD = dist[idx(gob.x, gob.y)];
  if (bestD < 0) bestD = Infinity;
  for (const d of DIRS) {
    const x = gob.x + STEP[d][0];
    const y = gob.y + STEP[d][1];
    if (!goblinMayStand(g, room, x, y, gob)) continue;
    const dd = dist[idx(x, y)];
    if (dd >= 0 && dd < bestD) {
      best = [x, y];
      bestD = dd;
    }
  }
  if (!best) return false;
  [gob.x, gob.y] = best;
  return true;
}

function die(g, ev) {
  say(g, TEXT.log.youDie, 'bad');
  ev.push({ type: 'death' });
  const e = g.level.entrance;
  g.hp = g.maxHp;
  g.room = e.room;
  g.x = e.x;
  g.y = e.y;
  g.menu = null;
  g.inv = null;
  const room = currentRoom(g);
  const squatter = goblinAt(room, e.x, e.y);
  if (squatter) {
    // Move it to the nearest free cell.
    const best = nearestFree(g, room, e.x, e.y, squatter);
    if (best) [squatter.x, squatter.y] = best;
  }
  // The toad goes back to sleep where it slept.
  const tr = g.level.toadRoom;
  if (tr !== null && tr !== undefined && g.level.rooms[tr].toad) toadSleeps(g, g.level.rooms[tr]);
}

function toadSleeps(g, room) {
  const t = room.toad;
  t.asleep = true;
  t.stirred = false;
  t.lastSeen = null;
  if (t.x === t.home.x && t.y === t.home.y) return;
  const best = goblinMayStand(g, room, t.home.x, t.home.y, t) ? [t.home.x, t.home.y] : nearestFree(g, room, t.home.x, t.home.y, t);
  if (best) [t.x, t.y] = best;
}

// ---- your actions ------------------------------------------------------

function move(g, dir, ev) {
  const room = currentRoom(g);
  const x = g.x + STEP[dir][0];
  const y = g.y + STEP[dir][1];
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const c = room.t[idx(x, y)];
  if (c === 'wall') return; // no turn, nothing
  if (c === 'statue') return openBust(g, ev); // into the bust, never onto it: its event, no turn
  if (c === 'golddoor') return goldDoor(g, room, x, y, ev);
  const gob = creatureAt(room, x, y);
  if (gob) {
    attack(g, room, gob, ev);
  } else if (c === 'door') {
    g.room = room.nb[dir];
    [g.x, g.y] = ARRIVAL[OPP[dir]];
    ev.push({ type: 'room', dir });
    hearSounds(g);
  } else {
    g.x = x;
    g.y = y;
    hearSounds(g);
  }
  endTurn(g, ev);
}

// Walking into the golden door: with the key it opens (and that takes the turn);
// without it, nothing but a line.
function goldDoor(g, room, x, y, ev) {
  if (!hasItem(g, 'key')) {
    say(g, TEXT.log.golddoorLocked, 'plain');
    return;
  }
  room.t[idx(x, y)] = 'opendoor';
  say(g, TEXT.log.golddoorOpens, 'good');
  ev.push({ type: 'unlock', x, y });
  endTurn(g, ev);
}

function attack(g, room, gob, ev) {
  const kind = kindOf(room, gob);
  const f = fighter(kind);
  const hit = gob.asleep || chance(g.rng, CONFIG.playerHits);
  gob.asleep = false;
  const dmg = hit ? playerDamage(g) : 0;
  ev.push({ type: 'attack', by: 'player', x: gob.x, y: gob.y, hit, dmg });
  if (!hit) {
    say(g, f.youMiss, 'plain');
    return;
  }
  say(g, f.youHit(dmg), 'plain');
  gob.hp -= dmg;
  if (gob.hp <= 0) {
    const items = [];
    if (kind === 'toad') {
      room.toad = null;
      if (!hasItem(g, 'key')) items.push({ key: 'key' }); // its key, on its corpse
    } else {
      room.goblins.splice(room.goblins.indexOf(gob), 1);
    }
    room.corpses.push({ x: gob.x, y: gob.y, items });
    say(g, f.dies, 'good');
    ev.push({ type: 'kill', x: gob.x, y: gob.y });
  }
}

function contextId(g) {
  if (g.inv) return 'inspect';
  const room = currentRoom(g);
  if (room.t[idx(g.x, g.y)] === 'stairs') return 'stairs';
  if (corpseAt(room, g.x, g.y)) return 'corpse';
  return 'sense';
}

function context(g, ev) {
  const id = contextId(g);
  if (id === 'stairs') descend(g, ev);
  else if (id === 'corpse') openMenu(g, 'corpse');
  else sense(g, ev);
}

// ---- the bust of DEE -----------------------------------------------------------

function besideStatue(g) {
  const s = currentRoom(g).statue;
  return !!s && manhattan(g.x, g.y, s.x, s.y) === 1;
}

// An item that still holds a memory you have not got back.
function holdsMemory(g, it) {
  const m = MEMORY_OF[it.key];
  return !!m && !g.memories.includes(m);
}

// Stepping beside the bust with an item that holds a memory: sounds, once each time you come near.
function hearSounds(g) {
  const s = currentRoom(g).statue;
  if (!s || Math.max(Math.abs(g.x - s.x), Math.abs(g.y - s.y)) > 1) {
    g.heardSounds = false; // away from it: the next approach is a new one
    return;
  }
  if (g.heardSounds || !besideStatue(g) || !g.items.some((it) => holdsMemory(g, it))) return;
  g.heardSounds = true;
  say(g, TEXT.log.sounds, 'sense');
}

// Noise: every sleeping toad or goblin in the room may wake. Anything noisy calls this.
function makeNoise(g, ev) {
  const room = currentRoom(g);
  for (const c of creatures(room)) {
    if (!c.asleep || !chance(g.rng, CONFIG.noiseWakes)) continue;
    c.asleep = false;
    if (!los(room.t, g.x, g.y, c.x, c.y)) continue;
    say(g, kindOf(room, c) === 'toad' ? TEXT.log.toadWakes : TEXT.log.goblinWakes, 'plain');
  }
  ev.push({ type: 'noise' });
}

// Putting item i in the opening: it is enchanted, once, and is noise. A memory in it
// comes back at once (its event takes the bust's place). Returns the line said.
function enchant(g, i, ev) {
  const it = g.items[i];
  if (it.enchanted) {
    say(g, TEXT.log.nothingMore, 'plain');
    return TEXT.log.nothingMore;
  }
  const memory = holdsMemory(g, it) ? MEMORY_OF[it.key] : null;
  it.enchanted = true;
  if (memory) it.strong = true;
  say(g, TEXT.log.enchants, 'good');
  ev.push({ type: 'enchant', key: it.key });
  makeNoise(g, ev);
  if (memory) recall(g, memory, ev);
  return TEXT.log.enchants;
}

function descend(g, ev) {
  g.depth++;
  g.level = makeLevel(g.rng, g.depth);
  const e = g.level.entrance;
  g.room = e.room;
  g.x = e.x;
  g.y = e.y;
  g.menu = null;
  g.inv = null;
  say(g, TEXT.log.level(g.depth), 'plain');
  sayDescend(g);
  ev.push({ type: 'descend' });
  g.turn++; // no goblin acts this turn
  see(g);
  recallDue(g, ev);
}

function sense(g, ev) {
  const room = currentRoom(g);
  const asleep = room.goblins.filter((b) => b.asleep).length;
  say(g, TEXT.log.senseHere(room.goblins.length, asleep), 'sense');
  for (const d of DIRS) {
    const n = room.nb[d];
    if (n === null) continue;
    const there = g.level.rooms[n];
    say(g, TEXT.log.senseDoor(TEXT.dir[d], there.goblins.length, g.level.stairs.room === n), 'sense');
  }
  if (g.room === g.level.toadRoom) {
    for (const line of TEXT.senseToad) say(g, line, 'sense');
    g.knowsWorms = true;
  }
  for (let i = 0; i < S * S; i++) {
    room.seen[i] = true;
    room.memCorpse[i] = !!corpseAt(room, i % S, Math.floor(i / S));
  }
  ev.push({ type: 'sense' });
  const here = g.room;
  endTurn(g, ev);
  g.selfUntil = g.turn + CONFIG.senseSelfTurns;
  g.sensedTurn = g.turn;
  g.sensedRoom = here;
}

function awakeGoblinInSight(g) {
  const room = currentRoom(g);
  return creatures(room).some((b) => !b.asleep && los(room.t, g.x, g.y, b.x, b.y));
}

function rest(g, ev) {
  say(g, TEXT.log.youRest, 'plain');
  if (awakeGoblinInSight(g)) {
    say(g, TEXT.log.restStopped, 'plain');
    return;
  }
  for (let k = 0; k < CONFIG.restTurns; k++) {
    const r = endTurn(g, ev);
    if (r.died || g.event) return;
    if (r.hit || awakeGoblinInSight(g)) {
      say(g, TEXT.log.restStopped, 'plain');
      return;
    }
  }
  const gain = Math.min(CONFIG.restHeal, g.maxHp - g.hp);
  if (gain > 0) {
    g.hp += gain;
    say(g, TEXT.log.restBetter, 'good');
  }
}

// Digging for worms: a few turns on grass or dirt. A blow stops it.
function canDig(g) {
  const c = currentRoom(g).t[idx(g.x, g.y)];
  return c === 'grass' || c === 'floor';
}

function dig(g, ev) {
  say(g, TEXT.log.dig, 'plain');
  for (let k = 0; k < CONFIG.digTurns; k++) {
    const r = endTurn(g, ev);
    if (r.died || g.event) return;
    if (r.hit) {
      say(g, TEXT.log.digStopped, 'plain');
      return;
    }
  }
  g.items.push({ key: 'worms', inHand: false });
  say(g, TEXT.log.digFound, 'good');
  ev.push({ type: 'dig', x: g.x, y: g.y });
}

function restart(g, ev) {
  const fresh = makeState(deriveSeed(g.seed), g.look, g.nextLogId);
  for (const k of Object.keys(g)) delete g[k];
  Object.assign(g, fresh);
  ev.push({ type: 'restart' });
}

// ---- menus -------------------------------------------------------------

const BACK = { label: TEXT.menu.back, kind: 'back', disabled: false, run: 'back' };
const MORE = { label: TEXT.menu.more, kind: 'more', disabled: false, run: 'more' };

function perceived(g, stat) {
  return g.turn < g.selfUntil ? g[stat] : null;
}

function corpseHere(g) {
  return corpseAt(currentRoom(g), g.x, g.y);
}

function entries(g, menu) {
  switch (menu.id) {
    case 'act': {
      const list = [{ label: TEXT.menu.rest, kind: 'action', disabled: false, run: 'rest' }];
      if (g.knowsWorms) list.push({ label: TEXT.menu.dig, kind: 'action', disabled: !canDig(g), run: 'dig' });
      return list;
    }
    case 'psy':
      return [
        ...['will', 'love'].map((s) => ({
          label: `${TEXT.stat[s]} ${perceived(g, s) ?? TEXT.stat.unknown}`,
          kind: 'info',
          disabled: true,
        })),
        ...g.memories.map((id, i) => ({ label: TEXT.menu.memory, kind: 'action', disabled: false, run: 'memory', arg: i })),
      ];
    case 'sys':
      return [
        { label: TEXT.menu.restart, kind: 'action', disabled: false, run: 'restart' },
        {
          label: g.look === 'paper' ? TEXT.menu.lookDark : TEXT.menu.lookPaper,
          kind: 'action',
          disabled: false,
          run: 'look',
        },
      ];
    case 'corpse': {
      const items = corpseHere(g)?.items ?? [];
      if (items.length === 0) return [{ label: TEXT.menu.nothing, kind: 'info', disabled: true }];
      return items.map((it, i) => ({ label: TEXT.thing[it.key], kind: 'item', disabled: false, run: 'take', arg: i }));
    }
  }
  return [];
}

// More than three entries: two per page, then `more`; the last page holds up to three.
function pages(list) {
  const out = [];
  let rest = list;
  while (rest.length > 3) {
    out.push([...rest.slice(0, 2), MORE]);
    rest = rest.slice(2);
  }
  out.push(rest);
  return out;
}

function slots(g, menu) {
  const all = pages(entries(g, menu));
  const page = all[Math.min(menu.page, all.length - 1)];
  return [page[0] ?? null, page[1] ?? null, page[2] ?? null, BACK];
}

const choosable = (s) => !!s && !s.disabled;

function firstChoosable(list) {
  return list.findIndex(choosable); // slot 3 (back) always can be chosen
}

function menuTitle(g, menu) {
  if (menu.id === 'corpse') return TEXT.context.corpse;
  return TEXT.button[menu.id];
}

function openMenu(g, id) {
  g.inv = null;
  g.menu = { id, page: 0, cursor: 0 };
  g.menu.cursor = firstChoosable(slots(g, g.menu));
  if (id === 'corpse' && corpseHere(g).items.length === 0) say(g, TEXT.log.corpseEmpty, 'plain');
}

function toggleMenu(g, id) {
  if (id === 'inv') {
    g.menu = null;
    g.inv = g.inv ? null : { cursor: 0 };
  } else if (g.menu && g.menu.id === id) {
    g.menu = null;
  } else {
    openMenu(g, id);
  }
}

function back(g) {
  const m = g.menu;
  if (m.page > 0) {
    m.page--;
    m.cursor = firstChoosable(slots(g, m));
  } else {
    g.menu = null;
  }
}

function moveCursor(g, dir) {
  moveCursorOn(g.menu, slots(g, g.menu), dir);
}

// Four options two by two: the arrows move `holder.cursor` among the choosable ones.
function moveCursorOn(holder, s, dir) {
  const c = holder.cursor;
  const col = c % 2;
  if (dir === 'n' || dir === 's') {
    const row = dir === 'n' ? 0 : 2;
    if (c - col === row) return;
    if (choosable(s[row + col])) holder.cursor = row + col;
    else if (choosable(s[row + 1 - col])) holder.cursor = row + 1 - col;
  } else {
    const to = c - col + (dir === 'e' ? 1 : 0);
    if (choosable(s[to])) holder.cursor = to;
  }
}

// ---- the inventory screen ------------------------------------------------

function invMove(g, dir) {
  if (dir === 'n') g.inv.cursor = Math.max(0, g.inv.cursor - 1);
  if (dir === 's') g.inv.cursor = Math.min(g.items.length - 1, g.inv.cursor + 1);
}

// Items whose first inspection brings a memory back, a while later.
const MEMORY_OF = { worms: 'worms' };

function inspect(g) {
  const it = g.items[g.inv.cursor];
  say(g, TEXT.slot[it.key], 'observe');
  const m = MEMORY_OF[it.key];
  if (m && !g.memories.includes(m) && !g.recall) g.recall = { id: m, turn: g.turn + CONFIG.memoryDelay };
}

// Items that can be held.
const HOLDABLE = new Set(['sword']);

// Use the selected item. The sword: in hand, or put away. Nothing else has a use yet.
function use(g) {
  const it = g.items[g.inv.cursor];
  if (!HOLDABLE.has(it.key)) return;
  it.inHand = !it.inHand;
  const name = TEXT.thing[it.key];
  say(g, it.inHand ? TEXT.log.inHand(name) : TEXT.log.putAway(name), 'plain');
}

// ---- observe -------------------------------------------------------------

// What is drawn on a cell, by the same sight rules as view():
// 'player', 'toad', 'goblin', 'corpse', or null; undefined for a cell never seen.
function thingAt(g, room, i, vis, shown, sensed) {
  const x = i % S;
  const y = Math.floor(i / S);
  if (x === g.x && y === g.y) return { kind: 'player' };
  if (!shown[i] && !room.seen[i]) return undefined;
  const toad = toadAt(room, x, y);
  if (toad && (vis[i] || sensed)) return { kind: 'toad', asleep: toad.asleep };
  const gob = goblinAt(room, x, y);
  if (gob && (vis[i] || sensed)) return { kind: 'goblin', id: gob.id, asleep: gob.asleep };
  if (vis[i] ? corpseAt(room, x, y) : room.memCorpse[i]) return { kind: 'corpse' };
  return null;
}

const TERRAIN_NAME = {
  grass: 'grass',
  floor: 'dirt',
  wall: 'wall',
  door: 'door',
  golddoor: 'golddoor',
  opendoor: 'door',
  stairs: 'stairs',
  entrance: 'entrance',
};

function sight(g) {
  const room = currentRoom(g);
  const vis = fov(room.t, g.x, g.y); //  true sight: goblins and corpses
  const shown = frame(room.t, vis); // sight plus the walls around it: cell state
  const sensed = g.sensedTurn === g.turn && g.sensedRoom === g.room;
  return { room, vis, shown, sensed };
}

function observe(g, x, y, ev) {
  const { room, vis, shown, sensed } = sight(g);
  const i = idx(x, y);
  const thing = thingAt(g, room, i, vis, shown, sensed);
  if (thing === undefined) return;
  let name;
  if (!thing && room.t[i] === 'statue') name = room.statue && room.statue.spoke ? 'statueLifeless' : 'statue';
  else if (!thing) name = TERRAIN_NAME[room.t[i]];
  else if (thing.kind === 'player') name = 'you';
  else if (thing.kind === 'toad') name = thing.asleep ? 'toadAsleep' : 'toad';
  else if (thing.kind === 'goblin') name = thing.asleep ? 'goblinAsleep' : 'goblin';
  else name = 'corpse';
  for (const line of [].concat(TEXT.observe[name])) say(g, line, 'observe');
  const near = manhattan(x, y, g.x, g.y) <= CONFIG.observeClose;
  let close = TEXT.observeClose[name];
  if (name === 'toadAsleep' && !room.toad.key) close = undefined; // the key is gone from its chain
  if (close !== undefined && near) say(g, close, 'observe');
  ev.push({ type: 'observe', x, y });
  // Close to the sleeping toad, you hear it sing: its event.
  if (name === 'toadAsleep' && near) openToad(g, ev);
}

// ---- events ----------------------------------------------------------------
// An event takes the whole screen but its options. Nothing in it takes time.
// g.event: { id: 'toad' | 'dee' | 'bust' | 'memory', passages: [[{ text, song }]], now, over,
//            page, cursor, heard (toad: verses heard), memory (memory: its id) }
// `now` is the first passage the latest step brought; those from it on are new.

const prose = (text) => ({ text, song: false });
const sung = (text) => ({ text, song: true });

function openEvent(g, e, ev, keepMenu = false) {
  if (!keepMenu) g.menu = null;
  g.inv = null;
  g.event = { now: 0, page: 0, ...e, cursor: 0 };
  g.event.cursor = firstChoosable(eventSlots(g));
  ev.push({ type: 'event', id: e.id });
}

function openToad(g, ev) {
  const first = [prose(TEXT.toad.singing), ...TEXT.toad.verses[0].map(sung)];
  openEvent(g, { id: 'toad', passages: [first], heard: 1, over: false }, ev);
}

// Moving into the bust: the first time it speaks; after that, its opening, with what you carry.
function openBust(g, ev) {
  const s = currentRoom(g).statue;
  if (!s.spoke) return openDee(g, ev);
  openEvent(g, { id: 'bust', passages: [[prose(TEXT.observe.statueLifeless)]], over: false }, ev);
}

function openDee(g, ev) {
  const t = TEXT.dee;
  const passages = [[prose(t.speaks)], ...t.lines.map((l) => [prose(l)]), [prose(t.lifeless)]];
  currentRoom(g).statue.spoke = true;
  openEvent(g, { id: 'dee', passages, over: true }, ev);
  makeNoise(g, ev);
}

function openMemory(g, id, ev, keepMenu = false) {
  openEvent(g, { id: 'memory', memory: id, passages: [TEXT.memories[id].map(prose)], over: true }, ev, keepMenu);
}

// A memory on its way back comes back once its turn is reached.
function recallDue(g, ev) {
  if (!g.recall || g.turn < g.recall.turn) return;
  recall(g, g.recall.id, ev);
}

// A memory comes back: the log says so and its event opens. Never twice.
function recall(g, id, ev) {
  if (g.recall && g.recall.id === id) g.recall = null;
  if (g.memories.includes(id)) return;
  g.memories.push(id);
  say(g, TEXT.log.memory, 'story');
  openMemory(g, id, ev);
}

function eventEntries(g) {
  const e = g.event;
  if (e.over) return [];
  // The bust's opening: what you carry, by name.
  if (e.id === 'bust') {
    return g.items.map((it, i) => ({ label: TEXT.thing[it.key], kind: 'item', disabled: false, run: 'give', arg: i }));
  }
  if (e.id !== 'toad') return [];
  const toad = currentRoom(g).toad;
  const o = TEXT.toad.options;
  const list = [{ label: o.listen, kind: 'action', disabled: false, run: 'listen' }];
  if (toad && toad.key) list.push({ label: o.key, kind: 'action', disabled: false, run: 'key' });
  list.push({ label: o.attack, kind: 'action', disabled: false, run: 'attack' });
  return list;
}

// Four options as a menu has them: paged with more, back last.
function eventSlots(g) {
  const all = pages(eventEntries(g));
  const page = all[Math.min(g.event.page, all.length - 1)];
  const label = { toad: TEXT.toad.options.back, dee: TEXT.dee.back, bust: TEXT.dee.back }[g.event.id] ?? TEXT.menu.back;
  const back = { label, kind: 'back', disabled: false, run: 'back' };
  return [page[0] ?? null, page[1] ?? null, page[2] ?? null, back];
}

function eventChoose(g, i, ev) {
  const slot = eventSlots(g)[i];
  if (!choosable(slot)) return;
  const e = g.event;
  const room = currentRoom(g);
  const toad = room.toad;
  switch (slot.run) {
    case 'back':
      if (e.page > 0) e.page--; // back a page, as a menu does
      else g.event = null;
      break;
    case 'more':
      e.page++;
      e.cursor = firstChoosable(eventSlots(g));
      break;
    case 'give': {
      // The line it says goes under the bust's text, in place of the last one.
      const line = enchant(g, slot.arg, ev);
      if (g.event === e) {
        e.passages = [e.passages[0], [prose(line)]];
        e.now = 1;
      }
      break;
    }
    case 'listen': {
      e.now = e.passages.length;
      e.heard++;
      const verses = TEXT.toad.verses;
      if (e.heard <= verses.length) {
        const p = verses[e.heard - 1].map(sung);
        if (e.heard === 2) {
          p.push(prose(TEXT.toad.stirs));
          toad.stirred = true;
        }
        e.passages.push(p);
      } else {
        e.passages.push([prose(TEXT.toad.wakes)]);
        toad.asleep = false;
        e.over = true;
      }
      break;
    }
    case 'key': {
      e.now = e.passages.length;
      const p = toad.stirred ? CONFIG.keyChance.stirred : CONFIG.keyChance.calm;
      if (chance(g.rng, p)) {
        toad.key = false;
        g.items.push({ key: 'key', inHand: false });
        e.passages.push([prose(TEXT.toad.success)]);
        ev.push({ type: 'key' });
      } else {
        toad.asleep = false;
        e.passages.push([prose(TEXT.toad.failure)]);
      }
      e.over = true;
      break;
    }
    case 'attack':
      // The event closes and you strike it, wherever it is in the event's reach.
      g.event = null;
      attack(g, room, toad, ev);
      endTurn(g, ev);
      break;
  }
  if (g.event) {
    const s = eventSlots(g);
    if (!choosable(s[g.event.cursor])) g.event.cursor = firstChoosable(s);
  }
}

// What an action does while an event is open. False: ignored.
function eventAct(g, a, ev) {
  switch (a.type) {
    case 'move':
      if (!DIRS.includes(a.dir)) return false;
      moveCursorOn(g.event, eventSlots(g), a.dir);
      return true;
    case 'context':
      eventChoose(g, g.event.cursor, ev);
      return true;
    case 'choose':
      if (![0, 1, 2, 3].includes(a.index)) return false;
      eventChoose(g, a.index, ev);
      return true;
    case 'back':
      eventChoose(g, 3, ev);
      return true;
  }
  return false;
}

function chooseSlot(g, i, ev) {
  const slot = slots(g, g.menu)[i];
  if (!choosable(slot)) return;
  switch (slot.run) {
    case 'back':
      back(g);
      break;
    case 'more':
      g.menu.page++;
      g.menu.cursor = firstChoosable(slots(g, g.menu));
      break;
    case 'rest':
      g.menu = null;
      rest(g, ev);
      break;
    case 'dig':
      g.menu = null;
      dig(g, ev);
      break;
    case 'memory':
      openMemory(g, g.memories[slot.arg], ev, true); // back returns to psy
      break;
    case 'restart':
      restart(g, ev);
      break;
    case 'look':
      g.look = g.look === 'paper' ? 'dark' : 'paper';
      ev.push({ type: 'look', look: g.look });
      break;
    case 'take': {
      const [it] = corpseHere(g).items.splice(slot.arg, 1);
      g.items.push({ key: it.key, inHand: false });
      say(g, TEXT.log.take(TEXT.thing[it.key]), 'plain');
      const s = slots(g, g.menu);
      if (!choosable(s[g.menu.cursor])) g.menu.cursor = firstChoosable(s);
      break;
    }
  }
}

// ---- the API -----------------------------------------------------------

const inRoom = (n) => Number.isInteger(n) && n >= 0 && n < S;

export function act(g, a) {
  if (!a || typeof a !== 'object') return [];
  const ev = [];
  const firstId = g.nextLogId;
  if (g.event) {
    if (!eventAct(g, a, ev)) return [];
    if (g.nextLogId > firstId) g.fresh = firstId;
    return ev;
  }
  switch (a.type) {
    case 'move':
      if (!DIRS.includes(a.dir)) return [];
      if (g.inv) invMove(g, a.dir);
      else if (g.menu) moveCursor(g, a.dir);
      else move(g, a.dir, ev);
      break;
    case 'context':
      if (g.inv) inspect(g);
      else if (g.menu) chooseSlot(g, g.menu.cursor, ev);
      else context(g, ev);
      break;
    case 'menu':
      if (!SQUARE_MENUS.includes(a.id)) return [];
      toggleMenu(g, a.id);
      break;
    case 'choose':
      if (!g.menu || ![0, 1, 2, 3].includes(a.index)) return [];
      chooseSlot(g, a.index, ev);
      break;
    case 'back':
      if (g.inv) g.inv = null;
      else if (g.menu) back(g);
      break;
    case 'wait':
      if (!g.menu && !g.inv) endTurn(g, ev);
      break;
    case 'use':
      if (g.inv) use(g);
      break;
    case 'pick':
      if (g.inv && Number.isInteger(a.index) && a.index >= 0 && a.index < g.items.length) g.inv.cursor = a.index;
      break;
    case 'observe':
      if (g.menu || g.inv || !inRoom(a.x) || !inRoom(a.y)) return [];
      observe(g, a.x, a.y, ev);
      break;
    default:
      return [];
  }
  if (g.nextLogId > firstId) g.fresh = firstId;
  return ev;
}

export function view(g) {
  const { room, vis, shown, sensed } = sight(g);
  const cells = [];
  for (let i = 0; i < S * S; i++) {
    const state = shown[i] ? 'visible' : room.seen[i] ? 'remembered' : 'unknown';
    const thing = thingAt(g, room, i, vis, shown, sensed) ?? null;
    cells.push({ t: room.t[i], state, thing });
  }
  const ctx = contextId(g);
  let menu = null;
  if (g.menu) {
    menu = {
      id: g.menu.id,
      title: menuTitle(g, g.menu),
      options: slots(g, g.menu).map((s) => (s ? { label: s.label, kind: s.kind, disabled: s.disabled } : null)),
      cursor: g.menu.cursor,
    };
  }
  let event = null;
  if (g.event) {
    const e = g.event;
    event = {
      id: e.id,
      lines: e.passages.flatMap((p, n) => p.map((l) => ({ text: l.text, song: l.song, passage: n }))),
      now: e.now,
      options: eventSlots(g).map((s) => (s ? { label: s.label, kind: s.kind, disabled: s.disabled } : null)),
      cursor: e.cursor,
    };
  }
  let inv = null;
  if (g.inv) {
    inv = {
      title: TEXT.button.inv,
      items: g.items.map((it) => ({
        key: it.key,
        name: TEXT.thing[it.key],
        state: [it.inHand ? TEXT.menu.inHand : '', it.enchanted ? TEXT.menu.enchanted : ''].filter(Boolean).join(' '),
      })),
      cursor: g.inv.cursor,
    };
  }
  return {
    seed: g.seed,
    depth: g.depth,
    turn: g.turn,
    look: g.look,
    room: { id: g.room, key: room.key },
    player: { x: g.x, y: g.y },
    cells,
    stats: {
      str: perceived(g, 'str'),
      love: perceived(g, 'love'),
      will: perceived(g, 'will'),
      hp: g.hp,
      maxHp: g.maxHp,
    },
    context: { id: ctx, label: TEXT.context[ctx] },
    menu,
    inv,
    event,
    log: g.log.map((l) => ({ ...l })),
    fresh: g.fresh,
  };
}
