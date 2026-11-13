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
    sensedTurn: -1, // what pillars hide is drawn while turn === sensedTurn ...
    sensedRoom: -1, // ... in this room
    menu: null, // an option menu, or null
    inv: null, //  the inventory screen: { cursor }, or null
    event: null, // an event over the whole screen, or null (see "events" below)
    observed: {}, // the observations you have had, by id (see "observe" below)
    sensed: {}, //   the things you have sensed, by id
    knowsWorms: false, // the last thing sensed in the toad's room tells you; then * offers digging
    memories: [], //   the memories you have, by id, in the order they came back
    recall: null, //   a memory on its way back: { id, turn }, or null
    heardSounds: false, // the bust's sounds were heard on this approach to it
    log: [], //    everything said, in order
    nextLogId,
    fresh: nextLogId, // the first line said by the latest action that said anything
    said: 0, //    how many wrapped lines the action under way has said
    busy: false, // resting or digging: a memory waits until it is done
  };
  for (const line of TEXT.opening) say(g, line, 'story');
  g.said = 0; // the opening is already behind you: what you arrive in is the status
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

export function toadAt(room, x, y) {
  const t = room.toad;
  return t && t.x === x && t.y === y ? t : null;
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

// The log is monospaced and wraps at spaces. Count the actual lines a status uses
// so a two-line observation leaves no room for a second status in the same action.
function statusLines(text) {
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    let width = word.length;
    if (used > 0 && used + 1 + width <= CONFIG.logWidth) {
      used += 1 + width;
      continue;
    }
    if (used > 0) lines++;
    while (width > CONFIG.logWidth) {
      lines++;
      width -= CONFIG.logWidth;
    }
    used = width;
  }
  return lines;
}

// At most two wrapped lines per action ("2 lines at a time"). The opening is
// historical text; the first status an action says is `fresh`.
function say(g, text, kind) {
  const id = g.nextLogId++;
  if (g.said === 0) g.fresh = id;
  g.said += statusLines(text);
  g.log.push({ id, turn: g.turn, text, kind: isSlot(text) ? 'slot' : kind });
}

// Has the action under way room for another line? For lines that can wait or go unsaid.
const canSay = (g, text) => g.said + statusLines(text) <= CONFIG.saysAtMost;

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

// Cells the toad may never stand on: walls, doors, the golden door (locked or open),
// the bust, arrival cells. The only terrain that changes after a level is made is the
// golden door opening, and both are blocked, so this is worked out once per room.
const blockCache = new WeakMap();
const CREATURE_BLOCKED = new Set(['wall', 'door', 'golddoor', 'opendoor', 'statue']);
function creatureBlocked(room) {
  let b = blockCache.get(room);
  if (!b) {
    b = room.t.map((c) => CREATURE_BLOCKED.has(c));
    for (const [x, y] of arrivalCells(room)) b[idx(x, y)] = true;
    blockCache.set(room, b);
  }
  return b;
}

// Could the toad stand here? (Not on you.)
export function mayStand(g, room, x, y, self = null) {
  if (x < 0 || y < 0 || x >= S || y >= S) return false;
  if (creatureBlocked(room)[idx(x, y)]) return false;
  if (room === currentRoom(g) && x === g.x && y === g.y) return false;
  const other = toadAt(room, x, y);
  return !other || other === self;
}

// The free cell nearest (x, y) by walking, for `self` to be put on; null if none.
function nearestFree(g, room, x, y, self) {
  const dist = roomDistances(room.t, x, y);
  let best = null;
  for (let i = 0; i < S * S; i++) {
    if (dist[i] < 0 || !mayStand(g, room, i % S, Math.floor(i / S), self)) continue;
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

// After your action: the toad acts if it is here, the turn goes up, you look
// around, and a memory on its way may come back.
function endTurn(g, ev, recallAfter = true) {
  const r = toadActs(g, ev);
  g.turn++;
  see(g);
  if (recallAfter) recallDue(g, ev);
  return r;
}

function toadActs(g, ev) {
  const room = currentRoom(g);
  const toad = room.toad;
  if (!toad) return { hit: false, died: false };
  const hit = toadTurn(g, room, toad, ev);
  if (g.hp <= 0) {
    die(g, ev);
    return { hit, died: true };
  }
  return { hit, died: false };
}

// The toad's turn. Asleep, it does nothing: only its event, a blow or noise wakes it.
// Returns true if it hit you.
function toadTurn(g, room, toad, ev) {
  if (toad.asleep) return false;
  if (los(room.t, toad.x, toad.y, g.x, g.y)) {
    toad.lastSeen = { x: g.x, y: g.y };
    if (manhattan(toad.x, toad.y, g.x, g.y) === 1) return toadAttacks(g, ev);
    stepToward(g, room, toad, g.x, g.y);
    return false;
  }
  if (toad.lastSeen) {
    const moved = stepToward(g, room, toad, toad.lastSeen.x, toad.lastSeen.y);
    if (!moved || (toad.x === toad.lastSeen.x && toad.y === toad.lastSeen.y)) toad.lastSeen = null;
    return false;
  }
  if (chance(g.rng, CONFIG.toad.wander)) {
    const options = DIRS.map((d) => [toad.x + STEP[d][0], toad.y + STEP[d][1]]).filter(([x, y]) =>
      mayStand(g, room, x, y, toad),
    );
    if (options.length) [toad.x, toad.y] = pick(g.rng, options);
  }
  return false;
}

function toadAttacks(g, ev) {
  const hit = chance(g.rng, CONFIG.toad.hits);
  const dmg = hit ? CONFIG.toad.damage : 0;
  ev.push({ type: 'attack', by: 'toad', x: g.x, y: g.y, hit, dmg });
  if (!hit) {
    say(g, TEXT.log.toadMisses, 'plain');
    return false;
  }
  g.hp -= dmg;
  // The blow that kills you says only that you die (see die): two statuses at most.
  if (g.hp > 0) say(g, TEXT.log.toadHits(dmg), 'bad');
  return true;
}

// One step along the shortest path to (tx, ty). Returns whether it moved.
function stepToward(g, room, toad, tx, ty) {
  const blocked = creatureBlocked(room);
  const dist = roomDistances(room.t, tx, ty, (c, x, y) => !blocked[idx(x, y)]);
  let best = null;
  let bestD = dist[idx(toad.x, toad.y)];
  if (bestD < 0) bestD = Infinity;
  for (const d of DIRS) {
    const x = toad.x + STEP[d][0];
    const y = toad.y + STEP[d][1];
    if (!mayStand(g, room, x, y, toad)) continue;
    const dd = dist[idx(x, y)];
    if (dd >= 0 && dd < bestD) {
      best = [x, y];
      bestD = dd;
    }
  }
  if (!best) return false;
  [toad.x, toad.y] = best;
  return true;
}

// You die: back to the level's entrance, whole. The toad never leaves its room, and
// its room is never the entrance's, so nothing can be standing there.
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
  const best = mayStand(g, room, t.home.x, t.home.y, t) ? [t.home.x, t.home.y] : nearestFree(g, room, t.home.x, t.home.y, t);
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
  const toad = toadAt(room, x, y);
  if (toad) {
    attack(g, room, toad, ev);
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

// You strike the toad. Asleep, it is always hit, and wakes.
function attack(g, room, toad, ev) {
  const hit = toad.asleep || chance(g.rng, CONFIG.playerHits);
  toad.asleep = false;
  const dmg = hit ? playerDamage(g) : 0;
  ev.push({ type: 'attack', by: 'player', x: toad.x, y: toad.y, hit, dmg });
  if (!hit) {
    say(g, TEXT.log.youMissToad, 'plain');
    return;
  }
  say(g, TEXT.log.youHitToad(dmg), 'plain');
  toad.hp -= dmg;
  if (toad.hp <= 0) {
    room.toad = null;
    // its key, on its corpse
    room.corpses.push({ x: toad.x, y: toad.y, items: hasItem(g, 'key') ? [] : [{ key: 'key' }] });
    say(g, TEXT.log.toadDies, 'good');
    ev.push({ type: 'kill', x: toad.x, y: toad.y });
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

// Noise: a sleeping animal in the room may wake. Anything noisy calls this.
function makeNoise(g, ev) {
  const room = currentRoom(g);
  const toad = room.toad;
  if (toad && toad.asleep && chance(g.rng, CONFIG.noiseWakes)) {
    toad.asleep = false;
    if (los(room.t, g.x, g.y, toad.x, toad.y)) say(g, TEXT.log.toadWakes, 'plain');
  }
  ev.push({ type: 'noise' });
}

// Putting item i in the opening: it is enchanted, once, and is noise. A memory in it
// comes back at once (its event takes the bust's place). Returns the line the event shows;
// nothing of it goes in the log.
function enchant(g, i, ev) {
  const it = g.items[i];
  if (it.enchanted) return TEXT.dee.nothingMore;
  const memory = holdsMemory(g, it) ? MEMORY_OF[it.key] : null;
  it.enchanted = true;
  if (memory) it.strong = true;
  ev.push({ type: 'enchant', key: it.key });
  makeNoise(g, ev);
  if (memory) recall(g, memory, ev);
  return TEXT.dee.enchants;
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
  sayDescend(g);
  ev.push({ type: 'descend' });
  g.turn++; // nothing acts this turn
  see(g);
  recallDue(g, ev);
}

// What there is to sense where you are, in order: [{ id, text, worms }].
// Only the toad's room has anything yet.
function senseLines(g) {
  if (g.room !== g.level.toadRoom) return [];
  const last = TEXT.senseToad.length - 1;
  return TEXT.senseToad.map((text, k) => ({ id: `toad.${k}`, text, worms: k === last }));
}

// Is there something here you have not sensed? (The wide button blinks.)
function senseMore(g) {
  return senseLines(g).some((l) => !g.sensed[l.id]);
}

// One sensing, one line: the next thing you have not sensed here, or, when there
// is nothing new, the last thing again. The last line of the toad's room is the worms.
function sense(g, ev) {
  const room = currentRoom(g);
  const lines = senseLines(g);
  const line = lines.find((l) => !g.sensed[l.id]) ?? lines[lines.length - 1];
  for (let i = 0; i < S * S; i++) {
    room.seen[i] = true;
    room.memCorpse[i] = !!corpseAt(room, i % S, Math.floor(i / S));
  }
  ev.push({ type: 'sense' });
  const here = g.room;
  // A blow or a death has priority over a discovery. An unsaid discovery stays
  // available (and blinking) for the next sense; a memory waits for spare room.
  const outcome = endTurn(g, ev, false);
  if (!outcome.died) {
    const text = line?.text ?? TEXT.log.senseNothing;
    if (canSay(g, text)) {
      say(g, text, 'sense');
      if (line) {
        g.sensed[line.id] = true;
        if (line.worms) g.knowsWorms = true;
      }
    }
    g.selfUntil = g.turn + CONFIG.senseSelfTurns;
    g.sensedTurn = g.turn;
    g.sensedRoom = here;
  }
  recallDue(g, ev);
}

function awakeInSight(g) {
  const room = currentRoom(g);
  const t = room.toad;
  return !!t && !t.asleep && los(room.t, g.x, g.y, t.x, t.y);
}

// Resting and digging take several turns, and stop as soon as something awake is in
// sight. So nothing can strike you while you do either: it has to come into sight first.
// A memory waits until they are done. Returns true if every turn passed quietly.
// `stopped` is said if there is room for it.
function quietTurns(g, n, stopped, ev) {
  if (awakeInSight(g)) {
    say(g, stopped, 'plain');
    return false;
  }
  g.busy = true;
  let quiet = true;
  for (let k = 0; k < n && quiet; k++) {
    const r = endTurn(g, ev);
    if (r.died) quiet = false;
    else if (r.hit || awakeInSight(g)) {
      if (canSay(g, stopped)) say(g, stopped, 'plain');
      quiet = false;
    }
  }
  g.busy = false;
  return quiet;
}

function rest(g, ev) {
  say(g, TEXT.log.youRest, 'plain');
  if (quietTurns(g, CONFIG.restTurns, TEXT.log.restStopped, ev)) {
    const gain = Math.min(CONFIG.restHeal, g.maxHp - g.hp);
    if (gain > 0) {
      g.hp += gain;
      say(g, TEXT.log.restBetter, 'good');
    }
  }
  recallDue(g, ev);
}

// Digging for worms: a few turns on grass or dirt.
function canDig(g) {
  const c = currentRoom(g).t[idx(g.x, g.y)];
  return c === 'grass' || c === 'floor';
}

function dig(g, ev) {
  say(g, TEXT.log.dig, 'plain');
  if (quietTurns(g, CONFIG.digTurns, TEXT.log.digStopped, ev)) {
    g.items.push({ key: 'worms', inHand: false });
    say(g, TEXT.log.digFound, 'good');
    ev.push({ type: 'dig', x: g.x, y: g.y });
  }
  recallDue(g, ev);
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
// One click, one observation ("in single instances, not many stacked"). A thing can
// have several: each click says the next one you have not had, and when there is
// nothing new it says the last one again. Coming close can add more. A unit with
// one you have not had blinks (view: cell.more).

// What is drawn on a cell, by the same sight rules as view():
// 'player', 'toad', 'corpse', or null; undefined for a cell never seen.
function thingAt(g, room, i, vis, shown, sensed) {
  const x = i % S;
  const y = Math.floor(i / S);
  if (x === g.x && y === g.y) return { kind: 'player' };
  if (!shown[i] && !room.seen[i]) return undefined;
  const toad = toadAt(room, x, y);
  if (toad && (vis[i] || sensed)) return { kind: 'toad', asleep: toad.asleep };
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

// The name, in TEXT.observe, of what a click on cell i observes.
function nameAt(room, i, thing) {
  if (thing) {
    if (thing.kind === 'player') return 'you';
    if (thing.kind === 'toad') return thing.asleep ? 'toadAsleep' : 'toad';
    return 'corpse';
  }
  if (room.t[i] === 'statue') return room.statue && room.statue.spoke ? 'statueLifeless' : 'statue';
  return TERRAIN_NAME[room.t[i]];
}

// What a thing has to observe now, in order: [{ id, text, event }]. `near`: you are close.
// Close to the sleeping toad the last is its song, which is also its event (his "O,E").
function observations(room, name, near) {
  const list = [].concat(TEXT.observe[name]).map((text, k) => ({ id: `${name}.${k}`, text }));
  if (!near) return list;
  if (name === 'toadAsleep') {
    if (room.toad.key) list.push({ id: 'toadAsleep.chain', text: TEXT.observeClose.toadAsleep });
    list.push({ id: 'toadAsleep.sings', text: TEXT.toad.singing, event: 'toad' });
  } else {
    [].concat(TEXT.observeClose[name] ?? []).forEach((text, k) => list.push({ id: `${name}.close.${k}`, text }));
  }
  return list;
}

const isNear = (g, x, y) => manhattan(x, y, g.x, g.y) <= CONFIG.observeClose;

// The units: what blinks when it has something new to observe.
const UNITS = new Set(['toad', 'toadAsleep', 'statue', 'statueLifeless']);

function sight(g) {
  const room = currentRoom(g);
  const vis = fov(room.t, g.x, g.y); //  true sight: the toad and corpses
  const shown = frame(room.t, vis); // sight plus the walls around it: cell state
  const sensed = g.sensedTurn === g.turn && g.sensedRoom === g.room;
  return { room, vis, shown, sensed };
}

function observe(g, x, y, ev) {
  const { room, vis, shown, sensed } = sight(g);
  const i = idx(x, y);
  const thing = thingAt(g, room, i, vis, shown, sensed);
  if (thing === undefined) return;
  const list = observations(room, nameAt(room, i, thing), isNear(g, x, y));
  const o = list.find((it) => !g.observed[it.id]) ?? list[list.length - 1];
  g.observed[o.id] = true;
  say(g, o.text, 'observe');
  ev.push({ type: 'observe', x, y });
  if (o.event === 'toad') openToad(g, ev);
}

// ---- events ----------------------------------------------------------------
// An event is a screen of its own: text, and choices as links. Nothing in it takes time.
// g.event: { id: 'toad' | 'dee' | 'bust' | 'memory', passages: [[{ text, song }]], now, over,
//            cursor, heard (toad: verses heard), memory (memory: its id) }
// A passage is a paragraph. A choice puts new passages in place of the old ones, as a
// page of a Twine story does; `now` is the first passage the latest choice brought.

const prose = (text) => ({ text, song: false });
const sung = (text) => ({ text, song: true });

function openEvent(g, e, ev, keepMenu = false) {
  if (!keepMenu) g.menu = null;
  g.inv = null;
  g.event = { now: 0, ...e, cursor: 0 };
  ev.push({ type: 'event', id: e.id });
}

function openToad(g, ev) {
  const passages = [[prose(TEXT.toad.singing)], TEXT.toad.verses[0].map(sung)];
  openEvent(g, { id: 'toad', passages, heard: 1, over: false }, ev);
}

// Moving into the bust: the first time it speaks; after that, its opening, with what you carry.
function openBust(g, ev) {
  const s = currentRoom(g).statue;
  if (!s.spoke) return openDee(g, ev);
  openEvent(g, { id: 'bust', passages: [[prose(TEXT.observe.statueLifeless)]], over: false }, ev);
}

function openDee(g, ev) {
  const t = TEXT.dee;
  const passages = [t.bust, t.speaks, ...t.lines, t.lifeless].map((l) => [prose(l)]);
  currentRoom(g).statue.spoke = true;
  openEvent(g, { id: 'dee', passages, over: true }, ev);
  makeNoise(g, ev);
}

function openMemory(g, id, ev, keepMenu = false) {
  const passages = TEXT.memories[id].map((l) => [prose(l)]);
  openEvent(g, { id: 'memory', memory: id, passages, over: true }, ev, keepMenu);
}

// A memory on its way back comes back once its turn is reached, when the action
// under way has room to say so and you are not resting or digging.
function recallDue(g, ev) {
  if (!g.recall || g.busy || g.turn < g.recall.turn || !canSay(g, TEXT.log.memory)) return;
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

// The choices of the open event, in order: a plain list, the way back last.
function eventOptions(g) {
  const e = g.event;
  const list = [];
  if (!e.over && e.id === 'bust') {
    // The bust's opening: what you carry, by name.
    g.items.forEach((it, i) => list.push({ label: TEXT.thing[it.key], kind: 'item', run: 'give', arg: i }));
  }
  if (!e.over && e.id === 'toad') {
    const toad = currentRoom(g).toad;
    const o = TEXT.toad.options;
    list.push({ label: o.listen, kind: 'action', run: 'listen' });
    if (toad && toad.key) list.push({ label: o.key, kind: 'action', run: 'key' });
    list.push({ label: o.attack, kind: 'action', run: 'attack' });
  }
  const label = { toad: TEXT.toad.options.back, dee: TEXT.dee.back, bust: TEXT.dee.back }[e.id] ?? TEXT.menu.back;
  list.push({ label, kind: 'back', run: 'back' });
  return list;
}

function eventChoose(g, i, ev) {
  const before = eventOptions(g);
  const o = before[i];
  if (!o) return;
  const e = g.event;
  const room = currentRoom(g);
  const toad = room.toad;
  switch (o.run) {
    case 'back':
      g.event = null;
      break;
    case 'give': {
      // What it says goes under the bust's text, in place of what it said before.
      const line = enchant(g, o.arg, ev);
      if (g.event === e) {
        e.passages = [e.passages[0], [prose(line)]];
        e.now = 1;
      }
      break;
    }
    case 'listen': {
      e.heard++;
      e.now = 0;
      const verses = TEXT.toad.verses;
      if (e.heard <= verses.length) {
        e.passages = [verses[e.heard - 1].map(sung)];
        if (e.heard === 2) {
          e.passages.push([prose(TEXT.toad.stirs)]);
          toad.stirred = true;
        }
      } else {
        e.passages = [[prose(TEXT.toad.wakes)]];
        toad.asleep = false;
        e.over = true;
      }
      break;
    }
    case 'key': {
      e.now = 0;
      const p = toad.stirred ? CONFIG.keyChance.stirred : CONFIG.keyChance.calm;
      if (chance(g.rng, p)) {
        toad.key = false;
        g.items.push({ key: 'key', inHand: false });
        e.passages = [[prose(TEXT.toad.success)]];
        ev.push({ type: 'key' });
      } else {
        toad.asleep = false;
        e.passages = [[prose(TEXT.toad.failure)]];
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
  // The same event with other choices: the keys start from the top again.
  if (g.event === e) {
    const after = eventOptions(g);
    if (after.length !== before.length) e.cursor = 0;
  }
}

// The bottom system menu can cover an event without ending it. A memory opened
// from psy keeps that menu underneath, including its cursor, when sys closes.
function closeEventMenu(g) {
  g.menu = g.event.menuBeforeSys ?? null;
  delete g.event.menuBeforeSys;
}

function chooseEventMenu(g, i, ev) {
  const slot = slots(g, g.menu)[i];
  if (!choosable(slot)) return;
  if (slot.run === 'back') closeEventMenu(g);
  else chooseSlot(g, i, ev);
}

// What an action does while an event is open. False: ignored.
function eventAct(g, a, ev) {
  if (a.type === 'menu' && a.id === 'sys') {
    if (g.menu?.id === 'sys') closeEventMenu(g);
    else {
      g.event.menuBeforeSys = g.menu;
      openMenu(g, 'sys');
    }
    return true;
  }
  if (g.menu?.id === 'sys') {
    switch (a.type) {
      case 'move': {
        if (!DIRS.includes(a.dir)) return false;
        const choices = slots(g, g.menu).map((s, i) => choosable(s) ? i : -1).filter((i) => i >= 0);
        const step = a.dir === 'n' || a.dir === 'w' ? -1 : 1;
        const next = Math.max(0, Math.min(choices.length - 1, choices.indexOf(g.menu.cursor) + step));
        g.menu.cursor = choices[next];
        return true;
      }
      case 'context':
        chooseEventMenu(g, g.menu.cursor, ev);
        return true;
      case 'choose':
        if (![0, 1, 2, 3].includes(a.index)) return false;
        chooseEventMenu(g, a.index, ev);
        return true;
      case 'back':
        closeEventMenu(g);
        return true;
      default:
        return false;
    }
  }
  const n = eventOptions(g).length;
  switch (a.type) {
    case 'move':
      if (!DIRS.includes(a.dir)) return false;
      // up the list or down it
      g.event.cursor = Math.max(0, Math.min(n - 1, g.event.cursor + (a.dir === 'n' || a.dir === 'w' ? -1 : 1)));
      return true;
    case 'context':
      eventChoose(g, g.event.cursor, ev);
      return true;
    case 'choose':
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= n) return false;
      eventChoose(g, a.index, ev);
      return true;
    case 'back':
      eventChoose(g, n - 1, ev);
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
  g.said = 0;
  if (g.event) return eventAct(g, a, ev) ? ev : [];
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
  return ev;
}

export function view(g) {
  const { room, vis, shown, sensed } = sight(g);
  const cells = [];
  for (let i = 0; i < S * S; i++) {
    const state = shown[i] ? 'visible' : room.seen[i] ? 'remembered' : 'unknown';
    const thing = thingAt(g, room, i, vis, shown, sensed) ?? null;
    // A unit in sight with something you have not observed blinks.
    let more = false;
    if (state === 'visible') {
      const name = nameAt(room, i, thing);
      if (UNITS.has(name)) {
        more = observations(room, name, isNear(g, i % S, Math.floor(i / S))).some((o) => !g.observed[o.id]);
      }
    }
    cells.push({ t: room.t[i], state, thing, more });
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
      lines: e.passages.flatMap((p, n) => p.map((l) => ({ text: l.text, song: l.song, slot: isSlot(l.text), passage: n }))),
      now: e.now,
      options: eventOptions(g).map((o) => ({ label: o.label, kind: o.kind, slot: isSlot(o.label) })),
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
    // more: there is something here you have not sensed; the wide button blinks
    context: { id: ctx, label: TEXT.context[ctx], more: ctx === 'sense' && senseMore(g) },
    menu,
    inv,
    event,
    log: g.log.map((l) => ({ ...l })),
    fresh: g.fresh,
  };
}
