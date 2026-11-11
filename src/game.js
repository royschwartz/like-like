// The simulation. The UI only calls newGame, act and view.
// The game object is plain data; everything random comes from game.rng.

import { CONFIG } from './config.js';
import { TEXT } from './text.js';
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
    menu: null,
    log: [],
    nextLogId,
  };
  for (const line of TEXT.opening) say(g, line, 'story');
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

function corpseAt(room, x, y) {
  // The newest corpse on a cell is the one on top.
  for (let k = room.corpses.length - 1; k >= 0; k--) {
    const c = room.corpses[k];
    if (c.x === x && c.y === y) return c;
  }
  return null;
}

function say(g, text, kind) {
  g.log.push({ id: g.nextLogId++, turn: g.turn, text, kind });
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

// Cells a goblin may never stand on: walls, doors, arrival cells. Terrain never
// changes after a level is made, so this is worked out once per room.
const goblinBlockCache = new WeakMap();
function goblinBlocked(room) {
  let b = goblinBlockCache.get(room);
  if (!b) {
    b = room.t.map((c) => c === 'wall' || c === 'door');
    for (const [x, y] of arrivalCells(room)) b[idx(x, y)] = true;
    goblinBlockCache.set(room, b);
  }
  return b;
}

// Could this goblin stand here? (Not on you, not on another goblin.)
export function goblinMayStand(g, room, x, y, self = null) {
  if (x < 0 || y < 0 || x >= S || y >= S) return false;
  if (goblinBlocked(room)[idx(x, y)]) return false;
  if (room === currentRoom(g) && x === g.x && y === g.y) return false;
  const other = goblinAt(room, x, y);
  return !other || other === self;
}

function swordInHand(g) {
  return g.items.some((it) => it.key === 'sword' && it.inHand);
}

export function playerDamage(g) {
  const k = swordInHand(g) ? CONFIG.swordDamagePerStr : CONFIG.fistDamagePerStr;
  return Math.max(1, Math.round(g.str * k));
}

// ---- the turn ----------------------------------------------------------

// After your action: the goblins here act, the turn goes up, you look around.
function endTurn(g, ev) {
  const r = goblinsAct(g, ev);
  g.turn++;
  see(g);
  return r;
}

function goblinsAct(g, ev) {
  const room = currentRoom(g);
  let hit = false;
  for (const gob of room.goblins.slice()) {
    if (goblinTurn(g, room, gob, ev)) hit = true;
    if (g.hp <= 0) {
      die(g, ev);
      return { hit, died: true };
    }
  }
  return { hit, died: false };
}

// One goblin's turn. Returns true if it hit you.
function goblinTurn(g, room, gob, ev) {
  const dist = manhattan(gob.x, gob.y, g.x, g.y);
  if (gob.asleep) {
    if (dist <= CONFIG.goblin.wakeRange && chance(g.rng, CONFIG.goblin.wakeChance)) {
      gob.asleep = false;
      if (los(room.t, g.x, g.y, gob.x, gob.y)) say(g, TEXT.log.goblinWakes, 'plain');
    }
    return false;
  }
  if (los(room.t, gob.x, gob.y, g.x, g.y)) {
    gob.lastSeen = { x: g.x, y: g.y };
    if (dist === 1) return goblinAttacks(g, ev);
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

function goblinAttacks(g, ev) {
  const hit = chance(g.rng, CONFIG.goblinHits);
  const dmg = hit ? CONFIG.goblin.damage : 0;
  ev.push({ type: 'attack', by: 'goblin', x: g.x, y: g.y, hit, dmg });
  if (hit) {
    g.hp -= dmg;
    say(g, TEXT.log.goblinHits, 'bad');
  } else {
    say(g, TEXT.log.goblinMisses, 'plain');
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
  const room = currentRoom(g);
  const squatter = goblinAt(room, e.x, e.y);
  if (squatter) {
    // Move it to the nearest free cell.
    const dist = roomDistances(room.t, e.x, e.y);
    let best = null;
    for (let i = 0; i < S * S; i++) {
      const x = i % S;
      const y = Math.floor(i / S);
      if (dist[i] <= 0 || !goblinMayStand(g, room, x, y, squatter)) continue;
      if (!best || dist[i] < dist[idx(best[0], best[1])]) best = [x, y];
    }
    if (best) [squatter.x, squatter.y] = best;
  }
}

// ---- your actions ------------------------------------------------------

function move(g, dir, ev) {
  const room = currentRoom(g);
  const x = g.x + STEP[dir][0];
  const y = g.y + STEP[dir][1];
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const c = room.t[idx(x, y)];
  if (c === 'wall') return; // no turn, nothing
  const gob = goblinAt(room, x, y);
  if (gob) {
    attack(g, room, gob, ev);
  } else if (c === 'door') {
    g.room = room.nb[dir];
    [g.x, g.y] = ARRIVAL[OPP[dir]];
    ev.push({ type: 'room', dir });
  } else {
    g.x = x;
    g.y = y;
  }
  endTurn(g, ev);
}

function attack(g, room, gob, ev) {
  const hit = gob.asleep || chance(g.rng, CONFIG.playerHits);
  gob.asleep = false;
  const dmg = hit ? playerDamage(g) : 0;
  ev.push({ type: 'attack', by: 'player', x: gob.x, y: gob.y, hit, dmg });
  if (!hit) {
    say(g, TEXT.log.youMiss, 'plain');
    return;
  }
  say(g, TEXT.log.youHit, 'plain');
  gob.hp -= dmg;
  if (gob.hp <= 0) {
    room.goblins.splice(room.goblins.indexOf(gob), 1);
    room.corpses.push({ x: gob.x, y: gob.y, items: [] });
    say(g, TEXT.log.goblinDies, 'good');
    ev.push({ type: 'kill', x: gob.x, y: gob.y });
  }
}

function contextId(g) {
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

function descend(g, ev) {
  g.depth++;
  g.level = makeLevel(g.rng, g.depth);
  const e = g.level.entrance;
  g.room = e.room;
  g.x = e.x;
  g.y = e.y;
  say(g, TEXT.log.level(g.depth), 'plain');
  ev.push({ type: 'descend' });
  g.turn++; // no goblin acts this turn
  see(g);
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
  return room.goblins.some((b) => !b.asleep && los(room.t, g.x, g.y, b.x, b.y));
}

function rest(g, ev) {
  say(g, TEXT.log.youRest, 'plain');
  if (awakeGoblinInSight(g)) {
    say(g, TEXT.log.restStopped, 'plain');
    return;
  }
  for (let k = 0; k < CONFIG.restTurns; k++) {
    const r = endTurn(g, ev);
    if (r.died) return;
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
    case 'inv':
      return g.items.map((it, i) => ({ label: TEXT.thing[it.key], kind: 'item', disabled: false, run: 'item', arg: i }));
    case 'item': {
      const it = g.items[menu.item];
      const label = it.inHand ? TEXT.menu.putAway : TEXT.menu.hold;
      return [{ label, kind: 'action', disabled: false, run: 'toggle' }];
    }
    case 'act':
      return [
        { label: TEXT.menu.wait, kind: 'action', disabled: false, run: 'wait' },
        { label: TEXT.menu.rest, kind: 'action', disabled: false, run: 'rest' },
      ];
    case 'psy':
      return ['will', 'love'].map((s) => ({
        label: `${TEXT.stat[s]} ${perceived(g, s) ?? TEXT.stat.unknown}`,
        kind: 'info',
        disabled: true,
      }));
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
  if (menu.id === 'item') return TEXT.thing[g.items[menu.item].key];
  if (menu.id === 'corpse') return TEXT.context.corpse;
  return TEXT.button[menu.id];
}

function openMenu(g, id, item = null) {
  g.menu = { id, page: 0, item, cursor: 0 };
  g.menu.cursor = firstChoosable(slots(g, g.menu));
  if (id === 'corpse' && corpseHere(g).items.length === 0) say(g, TEXT.log.corpseEmpty, 'plain');
}

function toggleMenu(g, id) {
  const open = g.menu && (g.menu.id === 'item' ? 'inv' : g.menu.id);
  if (open === id) g.menu = null;
  else openMenu(g, id);
}

function back(g) {
  const m = g.menu;
  if (m.page > 0) {
    m.page--;
    m.cursor = firstChoosable(slots(g, m));
  } else if (m.id === 'item') {
    openMenu(g, 'inv');
  } else {
    g.menu = null;
  }
}

function moveCursor(g, dir) {
  const s = slots(g, g.menu);
  const c = g.menu.cursor;
  const col = c % 2;
  if (dir === 'n' || dir === 's') {
    const row = dir === 'n' ? 0 : 2;
    if (c - col === row) return;
    if (choosable(s[row + col])) g.menu.cursor = row + col;
    else if (choosable(s[row + 1 - col])) g.menu.cursor = row + 1 - col;
  } else {
    const to = c - col + (dir === 'e' ? 1 : 0);
    if (choosable(s[to])) g.menu.cursor = to;
  }
}

function itemLog(g, it) {
  const name = TEXT.thing[it.key];
  say(g, it.inHand ? TEXT.log.inHand(name) : TEXT.log.putAway(name), 'plain');
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
    case 'item': {
      const it = g.items[slot.arg];
      openMenu(g, 'item', slot.arg);
      itemLog(g, it);
      say(g, TEXT.slot[it.key], 'slot');
      break;
    }
    case 'toggle': {
      const it = g.items[g.menu.item];
      it.inHand = !it.inHand;
      itemLog(g, it);
      break;
    }
    case 'wait':
      g.menu = null;
      endTurn(g, ev);
      break;
    case 'rest':
      g.menu = null;
      rest(g, ev);
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

export function act(g, a) {
  if (!a || typeof a !== 'object') return [];
  const ev = [];
  switch (a.type) {
    case 'move':
      if (!DIRS.includes(a.dir)) return [];
      if (g.menu) moveCursor(g, a.dir);
      else move(g, a.dir, ev);
      break;
    case 'context':
      if (g.menu) chooseSlot(g, g.menu.cursor, ev);
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
      if (g.menu) back(g);
      break;
    case 'wait':
      if (!g.menu) endTurn(g, ev);
      break;
    default:
      return [];
  }
  return ev;
}

export function view(g) {
  const room = currentRoom(g);
  const vis = fov(room.t, g.x, g.y); //  true sight: goblins and corpses
  const shown = frame(room.t, vis); // sight plus the walls around it: cell state
  const sensed = g.sensedTurn === g.turn && g.sensedRoom === g.room;
  const cells = [];
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const state = shown[i] ? 'visible' : room.seen[i] ? 'remembered' : 'unknown';
    let thing = null;
    if (x === g.x && y === g.y) {
      thing = { kind: 'player' };
    } else if (state !== 'unknown') {
      const gob = goblinAt(room, x, y);
      if (gob && (vis[i] || sensed)) thing = { kind: 'goblin', id: gob.id, asleep: gob.asleep };
      else if (vis[i] ? corpseAt(room, x, y) : room.memCorpse[i]) thing = { kind: 'corpse' };
    }
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
    log: g.log.map((l) => ({ ...l })),
  };
}
