// The simulation. The UI only calls newGame, act and view.
// The game object is plain data; everything random comes from game.rng.

import { CONFIG } from './config.js';
import { terrainGrid } from './grid.js';
import { TEXT, isSlot } from './text.js';
import { makeRng, chance, pick, deriveSeed } from './rng.js';
import { DIRS, STEP, OPP, walkable, makeLevel, arrivalCells } from './gen.js';
import { fov, frame, los } from './fov.js';
import { NEIGHBOURS, chebyshev, cutsCorner, isStep, stepsFrom, walkDown } from './path.js';

const SQUARE_MENUS = ['inv', 'act', 'psy', 'sys'];

// ---- a new game --------------------------------------------------------

function makeState(seed, look, nextLogId, outlines = CONFIG.outlines.start, edition, opening = false) {
  const rng = makeRng(seed);
  const level = makeLevel(rng, 1, edition);
  const g = {
    seed,
    edition,
    opening, // esoteric: the game begins on its opening screen (and so does a restart)
    look,
    outlines, // the lines round the buttons in the dark look: 0 none, up to CONFIG.outlines.levels
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
    lastObserved: {}, // the id of the last one said, by what was observed: they go round
    sensed: {}, //   the things you have sensed, by id
    floors: {}, //   esoteric: each floor as you left it, by depth, to go back up and down
    inspected: {}, // the items you have inspected, by key: until then one blinks in the inventory
    // noticing without trying has its own chance, so it changes nothing else's luck
    noticeRng: makeRng((seed ^ 0x6e07ce) >>> 0),
    knowsWorms: false, // the toad's room's last line tells you (inspecting its grass); then digging
    memories: [], //   the memories you have, by id, in the order they came back
    recall: null, //   a memory on its way back: { id, turn }, or null
    heardSounds: false, // the bust's sounds were heard on this approach to it
    log: [], //    everything said, in order
    nextLogId,
    fresh: nextLogId, // the first line said by the latest action that said anything
    said: 0, //    how many wrapped lines the action under way has said
    busy: false, // resting or digging: a memory waits until it is done
    going: null, // a fast move under way: where to, { x, y }, or null
  };
  // The opening is already behind you: what you arrive in is the status. Each of its lines
  // is an entry of its own. The esoteric edition's opening is a screen of its own instead,
  // so its log begins with where you land.
  if (edition !== 'esoteric') {
    for (const line of TEXT.opening) {
      say(g, line, 'story');
      g.said = 0;
    }
  }
  sayDescend(g);
  see(g);
  // Its one choice, jump into the hole, closes it and you are in the room (eventChoose).
  if (edition === 'esoteric' && opening) {
    g.event = { id: 'opening', passages: TEXT.openingEsoteric.lines.map((l) => [prose(l)]), now: 0, cursor: 0 };
  }
  return g;
}

// opening: begin on the esoteric edition's opening screen. The page asks for it; a game
// made without it starts in the room, as the tests do.
export function newGame({ seed, look, outlines, edition, opening } = {}) {
  const s = Number.isInteger(seed) ? seed : Date.now() % 2147483647;
  const lines = Number.isInteger(outlines) && outlines >= 0 && outlines <= CONFIG.outlines.levels ? outlines : undefined;
  const ed = edition === 'esoteric' ? edition : undefined;
  return makeState(s, look === 'dark' ? 'dark' : 'paper', 1, lines, ed, !!ed && opening === true);
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
  const line = { id, actionId: g.fresh, turn: g.turn, text, kind: isSlot(text) ? 'slot' : kind };
  g.log.push(line);
  return line;
}

// Has the action under way room for another line? For lines that can wait or go unsaid.
const canSay = (g, text) => g.said + statusLines(text) <= CONFIG.saysAtMost;

function sayDescend(g) {
  const line = say(g, TEXT.log.descend[g.level.entrance.ground], 'story');
  line.arrival = true;
}

function logView(g) {
  const rows = [];
  for (const line of g.log) {
    const previous = rows[rows.length - 1];
    if (g.edition === 'esoteric' && line.arrival && previous?.arrival && line.text === previous.text) {
      // Both descents happened. Keep their history and show one row with the latest id.
      rows[rows.length - 1] = { ...line, count: (previous.count ?? 1) + 1 };
    } else {
      rows.push({ ...line });
    }
  }
  return rows;
}

// Remember what is in sight now.
function see(g) {
  const room = currentRoom(g);
  const { size } = terrainGrid(room.t);
  const vis = fov(room.t, g.x, g.y);
  const shown = frame(room.t, vis);
  for (let i = 0; i < room.t.length; i++) {
    if (shown[i]) room.seen[i] = true;
    if (vis[i]) room.memCorpse[i] = !!corpseAt(room, i % size, Math.floor(i / size));
  }
}

// Cells the toad may never stand on: walls, doors, the golden door (locked or open),
// the bust, arrival cells. The only terrain that changes after a level is made is the
// golden door opening, and both are blocked, so this is worked out once per room.
const blockCache = new WeakMap();
const CREATURE_BLOCKED = new Set(['wall', 'door', 'golddoor', 'opendoor', 'statue', 'upstairs', 'void']);
function creatureBlocked(room) {
  const { idx } = terrainGrid(room.t);
  let b = blockCache.get(room);
  if (!b) {
    // stairs in the wall (esoteric rooms) are the way down, never somewhere to stand
    const walled = terrainGrid(room.t).size === CONFIG.esotericInteriorSize + 2;
    b = room.t.map((c) => CREATURE_BLOCKED.has(c) || (walled && c === 'stairs'));
    for (const [x, y] of arrivalCells(room)) b[idx(x, y)] = true;
    blockCache.set(room, b);
  }
  return b;
}

// Could the toad stand here? (Not on you.)
export function mayStand(g, room, x, y, self = null) {
  const { size, idx } = terrainGrid(room.t);
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  if (creatureBlocked(room)[idx(x, y)]) return false;
  if (room === currentRoom(g) && x === g.x && y === g.y) return false;
  const other = toadAt(room, x, y);
  return !other || other === self;
}

// The free cell nearest (x, y) by walking, for `self` to be put on; null if none.
function nearestFree(g, room, x, y, self) {
  const { size, idx } = terrainGrid(room.t);
  const dist = stepsFrom(room.t, [idx(x, y)], (i) => walkable(room.t[i]));
  let best = null;
  for (let i = 0; i < room.t.length; i++) {
    if (dist[i] < 0 || !mayStand(g, room, i % size, Math.floor(i / size), self)) continue;
    if (!best || dist[i] < dist[idx(best[0], best[1])]) best = [i % size, Math.floor(i / size)];
  }
  return best;
}

function swordInHand(g) {
  return g.items.find((it) => it.key === 'sword' && it.inHand) || null;
}

// An enchanted sword does more; twice the more if it held a memory.
export function playerDamage(g) {
  const sword = swordInHand(g);
  return sword ? swordDamage(g, sword) : Math.max(1, Math.round(g.str * CONFIG.fistDamagePerStr));
}

// ---- the turn ----------------------------------------------------------

// After your action the toad acts, the turn goes up and sight is updated. A
// discovery gets reported if you survived, before idle notices and memories.
// `idle`: you may notice things without trying this turn (not while sensing, which is
// the strong search in the archived original, and not while resting or digging).
// `waiting`: the turn was a wait, in which the esoteric edition notices more.
function endTurn(g, ev, report, idle = true, waiting = false) {
  const r = toadActs(g, ev);
  g.turn++;
  see(g);
  if (!r.died) report?.();
  if (idle && !r.died && !g.busy) noticeIdly(g, waiting);
  recallDue(g, ev);
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

// Woken, by its song, a blow, noise or a grab for its key. It stays awake until it has not
// seen you for CONFIG.toad.sleepsAfter turns: "it should take much longer for monsters to
// fall asleep again" (decision 193).
function wake(g, toad) {
  toad.asleep = false;
  toad.sawAt = g.turn;
}

// The toad's turn. Asleep, it does nothing: only its event, a blow or noise wakes it.
// Returns true if it hit you.
function toadTurn(g, room, toad, ev) {
  if (!toad.asleep && g.turn - (toad.sawAt ?? g.turn) >= CONFIG.toad.sleepsAfter) {
    toad.asleep = true;
    toad.stirred = false;
    toad.lastSeen = null;
  }
  if (toad.asleep) return false;
  if (los(room.t, toad.x, toad.y, g.x, g.y)) {
    toad.lastSeen = { x: g.x, y: g.y };
    toad.sawAt = g.turn;
    if (isStep(room.t, toad.x, toad.y, g.x, g.y)) return toadAttacks(g, ev);
    stepToward(g, room, toad, g.x, g.y);
    return false;
  }
  if (toad.lastSeen) {
    const moved = stepToward(g, room, toad, toad.lastSeen.x, toad.lastSeen.y);
    if (!moved || (toad.x === toad.lastSeen.x && toad.y === toad.lastSeen.y)) toad.lastSeen = null;
    return false;
  }
  if (chance(g.rng, CONFIG.toad.wander)) {
    const options = NEIGHBOURS.map(([dx, dy]) => [toad.x + dx, toad.y + dy]).filter(
      ([x, y]) => isStep(room.t, toad.x, toad.y, x, y) && mayStand(g, room, x, y, toad),
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

// One step along the shortest path to (tx, ty), eight ways. Returns whether it moved.
function stepToward(g, room, toad, tx, ty) {
  const { idx } = terrainGrid(room.t);
  const blocked = creatureBlocked(room);
  const dist = stepsFrom(room.t, [idx(tx, ty)], (i) => !blocked[i]);
  let best = null;
  let bestD = dist[idx(toad.x, toad.y)];
  if (bestD < 0) bestD = Infinity;
  for (const [dx, dy] of NEIGHBOURS) {
    const x = toad.x + dx;
    const y = toad.y + dy;
    if (!isStep(room.t, toad.x, toad.y, x, y) || !mayStand(g, room, x, y, toad)) continue;
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
  g.going = null;
  // The toad goes back to where it slept, still awake and bloodthirsty: "the toad should be
  // awake and bloodthirsty when you come back" (decision 191). It sleeps again only after
  // a long time without seeing you (193).
  const tr = g.level.toadRoom;
  if (tr !== null && tr !== undefined && g.level.rooms[tr].toad) toadGoesHome(g, g.level.rooms[tr]);
}

function toadGoesHome(g, room) {
  const t = room.toad;
  t.lastSeen = null;
  if (t.x === t.home.x && t.y === t.home.y) return;
  const best = mayStand(g, room, t.home.x, t.home.y, t) ? [t.home.x, t.home.y] : nearestFree(g, room, t.home.x, t.home.y, t);
  if (best) [t.x, t.y] = best;
}

// ---- your actions ------------------------------------------------------

// The arrows: a straight step.
function move(g, dir, ev) {
  step(g, STEP[dir][0], STEP[dir][1], ev);
}

// One step by (dx, dy), any of the eight ways: by arrow or by travel, the same thing.
// A diagonal that cuts a corner is no step at all.
function step(g, dx, dy, ev) {
  const room = currentRoom(g);
  const { idx, arrivals } = terrainGrid(room.t);
  const x = g.x + dx;
  const y = g.y + dy;
  if (!isStep(room.t, g.x, g.y, x, y)) return;
  const c = room.t[idx(x, y)];
  if (c === 'wall' || c === 'void') return; // no turn, nothing
  if (c === 'statue') return openBust(g, ev); // into the bust, never onto it: its event, no turn
  if (c === 'golddoor') return goldDoor(g, room, x, y, ev);
  if ((c === 'stairs' && g.edition === 'esoteric') || c === 'upstairs') {
    // Stairs in the wall (esoteric, decisions 251, 257) are walked into, as a gap is, and
    // you go down or back up. Only a straight step reaches them.
    if (dx && dy) return;
    return c === 'stairs' ? descend(g, ev) : ascend(g, ev);
  }
  const toad = toadAt(room, x, y);
  if (toad) {
    // Into the toad asleep: its song, and no turn, as the bust (decision 155). Awake, it is
    // always hostile for now: a blow.
    if (toad.asleep) return openToad(g, ev);
    attack(g, room, toad, ev);
  } else if (c === 'door') {
    // a door is in the wall's ring: only a straight step reaches it
    const dir = DIRS.find((d) => STEP[d][0] === dx && STEP[d][1] === dy);
    if (!dir) return;
    g.room = room.nb[dir];
    [g.x, g.y] = arrivals[OPP[dir]];
    ev.push({ type: 'room', dir });
    hearSounds(g);
  } else {
    g.x = x;
    g.y = y;
    pickUp(g, room);
    hearSounds(g);
  }
  endTurn(g, ev);
}

// Walking into the golden door: with the key it opens (and that takes the turn);
// without it, nothing but a line.
function goldDoor(g, room, x, y, ev) {
  const { idx } = terrainGrid(room.t);
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
  wake(g, toad);
  const dmg = hit ? playerDamage(g) : 0;
  ev.push({ type: 'attack', by: 'player', x: toad.x, y: toad.y, hit, dmg });
  if (!hit) {
    say(g, TEXT.log.youMissToad, 'plain');
    return;
  }
  say(g, TEXT.log.youHitToad(dmg), 'plain');
  wound(g, room, toad, dmg, ev);
}

// The toad takes dmg; at none left it dies, and its corpse keeps its key.
function wound(g, room, toad, dmg, ev) {
  toad.hp -= dmg;
  if (toad.hp <= 0) {
    room.toad = null;
    // its key, on its corpse
    room.corpses.push({ x: toad.x, y: toad.y, items: hasItem(g, 'key') ? [] : [{ key: 'key' }] });
    say(g, TEXT.log.toadDies, 'good');
    ev.push({ type: 'kill', x: toad.x, y: toad.y });
  }
}

// ---- throwing (esoteric, decision 307) --------------------------------------------
// A thrown item leaves you and takes the turn. If the toad is in sight it flies to it:
// the toad wakes, the sword wounds it as a blow with it would, and the item lands where
// the toad is. Otherwise it lands on an open square in sight two or three steps away, or
// nearer if there is none. It lies there, drawn, until you step on it and pick it up.

const looseIn = (room) => (room.loose ??= []);
const looseAt = (room, x, y) => looseIn(room).find((it) => it.x === x && it.y === y) ?? null;

function throwItem(g, i, ev) {
  const it = g.items[i];
  if (!it) return;
  g.event = null;
  g.items.splice(i, 1);
  const room = currentRoom(g);
  const name = TEXT.thing[it.key];
  const { inHand, ...rest } = it;
  const t = room.toad;
  if (t && los(room.t, g.x, g.y, t.x, t.y)) {
    looseIn(room).push({ ...rest, x: t.x, y: t.y });
    const dmg = it.key === 'sword' ? swordDamage(g, it) : 0;
    wake(g, t);
    ev.push({ type: 'attack', by: 'player', x: t.x, y: t.y, hit: true, dmg });
    say(g, TEXT.log.thrownHits(name, dmg), 'plain');
    if (dmg) wound(g, room, t, dmg, ev);
  } else {
    const [x, y] = landing(g, room);
    looseIn(room).push({ ...rest, x, y });
    say(g, TEXT.log.throws(name), 'plain');
  }
  ev.push({ type: 'throw' });
  endTurn(g, ev);
}

// What a sword does in a blow, held or thrown.
function swordDamage(g, sword) {
  let dmg = Math.max(1, Math.round(g.str * CONFIG.swordDamagePerStr));
  if (sword.enchanted) dmg += CONFIG.enchant.swordDamage * (sword.strong ? 2 : 1);
  return dmg;
}

// Where a thrown item lands with nothing to fly at: an open square in sight, two or three
// steps away, else one, else your own.
function landing(g, room) {
  const { size, idx } = terrainGrid(room.t);
  const vis = fov(room.t, g.x, g.y);
  const open = (x, y) => ['floor', 'grass', 'entrance'].includes(room.t[idx(x, y)]) && vis[idx(x, y)];
  for (const [near, far] of [[2, 3], [1, 1]]) {
    const spots = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = chebyshev(x, y, g.x, g.y);
      if (d >= near && d <= far && open(x, y)) spots.push([x, y]);
    }
    if (spots.length) return pick(g.rng, spots);
  }
  return [g.x, g.y];
}

// Stepping onto items on the floor picks them up, as part of the step.
function pickUp(g, room) {
  const here = looseIn(room).filter((it) => it.x === g.x && it.y === g.y);
  if (!here.length) return;
  room.loose = room.loose.filter((it) => !here.includes(it));
  for (const { x, y, ...it } of here) {
    g.items.push({ ...it, inHand: false });
    say(g, TEXT.log.pickUp(TEXT.thing[it.key]), 'plain');
  }
}

function contextId(g) {
  if (g.inv) return 'inspect';
  const room = currentRoom(g);
  const { idx } = terrainGrid(room.t);
  if (room.t[idx(g.x, g.y)] === 'stairs') return 'stairs';
  if (corpseAt(room, g.x, g.y)) return 'corpse';
  // The esoteric edition has no sense: the ground is inspected where there is
  // something to it, in the grass, and otherwise the first place has nothing.
  if (g.edition === 'esoteric') return room.t[idx(g.x, g.y)] === 'grass' ? 'inspect' : null;
  return 'sense';
}

// The esoteric edition's variable actions, by where you stand and what is about:
// the ground's first, then resting and digging. Waiting is always offered beside them.
function variableIds(g) {
  const ids = [];
  const room = currentRoom(g);
  const { idx } = terrainGrid(room.t);
  const ground = room.t[idx(g.x, g.y)];
  if (ground === 'stairs') ids.push('stairs');
  if (corpseAt(room, g.x, g.y)) ids.push('corpse');
  if (ground === 'grass') ids.push('inspect');
  const quiet = !awakeInSight(g);
  if (quiet && g.hp < g.maxHp) ids.push('rest');
  if (quiet && g.knowsWorms && canDig(g)) ids.push('dig');
  return ids;
}

// Ground-specific actions come first. The map only needs a second shortcut
// when there is something useful to do here; the full list also offers waiting.
function abilityIds(g, shortcutsOnly = false) {
  if (g.edition === 'esoteric') {
    const ids = variableIds(g);
    if (shortcutsOnly) return ids.slice(0, 2);
    ids.push('wait');
    if (!awakeInSight(g) && g.hp === g.maxHp) ids.push('rest');
    return ids;
  }
  const here = contextId(g);
  const ids = [here];
  if (here === 'stairs' && corpseHere(g)) ids.push('corpse');
  const quiet = !awakeInSight(g);
  if (quiet && g.hp < g.maxHp) ids.push('rest');
  if (quiet && g.knowsWorms && canDig(g)) ids.push('dig');
  if (here !== 'sense') ids.push('sense');
  if (shortcutsOnly) return ids.slice(0, 2);
  ids.push('wait');
  if (quiet && g.hp === g.maxHp) ids.push('rest');
  return ids;
}

function abilityLabel(id) {
  return id === 'wait' ? TEXT.button.waitName : TEXT.context[id] ?? TEXT.menu[id];
}

function runAbility(g, id, ev) {
  switch (id) {
    case 'stairs': return descend(g, ev);
    case 'corpse': return openMenu(g, 'corpse');
    case 'sense': return sense(g, ev);
    case 'wait': return wait(g, ev);
    case 'rest': return rest(g, ev);
    case 'dig': return dig(g, ev);
    case 'inspect': return inspectGround(g, ev);
  }
}

// ---- the bust of DEE -----------------------------------------------------------

function besideStatue(g) {
  const s = currentRoom(g).statue;
  return !!s && chebyshev(g.x, g.y, s.x, s.y) === 1;
}

// An item that still holds a memory you have not got back.
function holdsMemory(g, it) {
  const m = MEMORY_OF[it.key];
  return !!m && !g.memories.includes(m);
}

// Stepping beside the bust with an item that holds a memory: sounds, once each time you come near.
function hearSounds(g) {
  const s = currentRoom(g).statue;
  if (!s || chebyshev(g.x, g.y, s.x, s.y) > 1) {
    g.heardSounds = false; // away from it: the next approach is a new one
    return;
  }
  if (g.heardSounds || !besideStatue(g) || !g.items.some((it) => holdsMemory(g, it))) return;
  g.heardSounds = true;
  say(g, TEXT.log.sounds, g.edition === 'esoteric' ? 'observe' : 'sense');
}

// Noise: a sleeping animal in the room may wake. Anything noisy calls this.
function makeNoise(g, ev) {
  const room = currentRoom(g);
  const toad = room.toad;
  if (toad && toad.asleep && chance(g.rng, CONFIG.noiseWakes)) {
    wake(g, toad);
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
  const spoke = currentRoom(g).statue?.spoke;
  const esoteric = g.edition === 'esoteric';
  // esoteric: each floor is kept as you left it, so you can go back up and down again
  // (decision 257). The stairs up below are anywhere on its edge (decision 323).
  if (esoteric) g.floors[g.depth] = g.level;
  g.depth++;
  g.level = (esoteric && g.floors[g.depth]) || makeLevel(g.rng, g.depth, g.edition);
  // In the esoteric edition the same bust is accessible beneath the drawing.
  if (esoteric && g.depth === 2 && spoke) {
    g.level.rooms[g.level.toadRoom].statue.spoke = true;
  }
  const e = g.level.entrance;
  g.room = e.room;
  g.x = e.x;
  g.y = e.y;
  g.menu = null;
  g.inv = null;
  g.going = null;
  sayDescend(g);
  ev.push({ type: 'descend' });
  g.turn++; // nothing acts this turn
  see(g);
  recallDue(g, ev);
}

// Up the stairs you came down (esoteric): back to the floor above as you left it, just
// inside its stairs down (decision 257).
function ascend(g, ev) {
  const above = g.floors[g.depth - 1];
  if (!above) return;
  g.floors[g.depth] = g.level;
  g.depth--;
  g.level = above;
  const s = above.stairs;
  g.room = s.room;
  g.x = s.x - STEP[s.side][0];
  g.y = s.y - STEP[s.side][1];
  g.menu = null;
  g.inv = null;
  g.going = null;
  say(g, TEXT.log.ascend, 'story');
  ev.push({ type: 'ascend' });
  g.turn++; // nothing acts this turn
  see(g);
  recallDue(g, ev);
}

// The room's own lines, in order: [{ id, text, worms }]. Only the toad's room has any yet;
// its last tells of the worms.
function roomLines(g) {
  if (g.room !== g.level.toadRoom) return [];
  const last = TEXT.toadRoom.length - 1;
  return TEXT.toadRoom.map((text, k) => ({ id: `toad.${k}`, text, worms: k === last }));
}

// Within CONFIG.observeClose steps of you (eight ways).
const isNear = (g, x, y) => chebyshev(x, y, g.x, g.y) <= CONFIG.observeClose;

// Everything a sensing could find now, in order: the room's own lines. Sense is ambient: the
// air, a feeling, the ground and what is under it. What is about a thing you can point at is
// observed, never sensed (decision 180).
function senseFinds(g) {
  return roomLines(g);
}

// How sensing goes out (decision 113, "for now"): from you, a step at a time, to every
// cell it can go, which is anything you could walk on, and through the toad. What stands
// in its way (a wall, the locked golden door, the bust) takes it in and passes it no
// further. Returns [{ x, y, d, absorb }] in the order it gets there: d is the step it
// arrives on (you are 0); absorb, the cell takes it in. Steps go eight ways, and never
// cut a corner; a cell that takes it in is reached from any of the eight round it.
const SENSE_STOPS = new Set(['wall', 'golddoor', 'statue']);
function senseWave(g) {
  const room = currentRoom(g);
  const { size, idx } = terrainGrid(room.t);
  const d = new Array(room.t.length).fill(-1);
  const wave = [];
  const start = idx(g.x, g.y);
  d[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % size;
    const y = (i - x) / size;
    wave.push({ x, y, d: d[i], absorb: false });
    for (const [dx, dy] of NEIGHBOURS) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = idx(nx, ny);
      if (d[n] >= 0 || SENSE_STOPS.has(room.t[n]) || cutsCorner(room.t, x, y, dx, dy)) continue;
      d[n] = d[i] + 1;
      queue.push(n);
    }
  }
  // what takes it in: a stop beside a reached cell, one step after the nearest of them
  const taken = [];
  for (let i = 0; i < room.t.length; i++) {
    if (d[i] >= 0 || !SENSE_STOPS.has(room.t[i])) continue;
    const x = i % size;
    const y = (i - x) / size;
    let near = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [nx, ny] = [x + dx, y + dy];
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) {
          const k = d[idx(nx, ny)];
          if (k >= 0 && (near < 0 || k < near)) near = k;
        }
      }
    }
    if (near >= 0) taken.push({ x, y, d: near + 1, absorb: true });
  }
  return wave.concat(taken).sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
}

// ---- noticing: like Brogue's searching (decisions 114, 118, 119) ----------------
// What is unknown about a unit is shown once you have noticed it: from then on it blinks
// while it has something you have not observed. Marks are kept by the room, for good.
// Sensing is the strong search: every unit its wave reaches or that takes it in is noticed,
// and it finds one new thing. Without trying, each turn, you may notice a unit in sight (the
// nearer, the likelier), and now and then a secret of the room comes to you.
const noticedIn = (room) => room.noticed || (room.noticed = {});

function noticeSensed(g, wave) {
  const room = currentRoom(g);
  const marks = noticedIn(room);
  for (const c of wave) {
    if (room.toad && room.toad.x === c.x && room.toad.y === c.y) marks.toad = true;
    if (room.statue && room.statue.x === c.x && room.statue.y === c.y) marks.statue = true;
  }
}

// The units of a room you have not noticed: [kind, x, y].
function unnoticed(room) {
  const marks = noticedIn(room);
  const out = [];
  if (room.toad && !marks.toad) out.push(['toad', room.toad.x, room.toad.y]);
  if (room.statue && !marks.statue) out.push(['statue', room.statue.x, room.statue.y]);
  return out;
}

// The chance, this turn, of noticing a unit this many steps away without trying.
export function noticeChance(steps) {
  const { near, reach } = CONFIG.notice;
  return near * Math.max(0, 1 - (steps - 1) / reach);
}

function noticeIdly(g, waiting) {
  if (g.edition === 'esoteric') return noticeEsoteric(g, waiting);
  const room = currentRoom(g);
  const { idx } = terrainGrid(room.t);
  const vis = fov(room.t, g.x, g.y);
  for (const [kind, x, y] of unnoticed(room)) {
    if (!vis[idx(x, y)] || !hasNew(g, unitCycle(g, room, kind))) continue;
    if (chance(g.noticeRng, noticeChance(chebyshev(x, y, g.x, g.y)))) noticedIn(room)[kind] = true;
  }
  // a secret of the room, unbidden: its next line, but never the worms, which only sensing
  // tells ("worms are down there only happen when you sense"). Never what a unit has to find.
  const line = roomLines(g).find((l) => !g.sensed[l.id]);
  if (line && !line.worms && chance(g.noticeRng, CONFIG.notice.secret) && canSay(g, line.text)) {
    say(g, line.text, 'sense');
    g.sensed[line.id] = true;
  }
}

// The esoteric edition has no sense ("there is no more sense in the game", decisions 244,
// 297). As you go about, or wait, now and then the air or the ground comes to you as an
// observation, a line of the room's own, never the worms, which only inspecting the grass
// tells; or you notice a detail of something in sight, as if you had observed it: the
// nearer, the likelier. Waiting, both are likelier. One at a time, never over anything said.
function noticeEsoteric(g, waiting = false) {
  if (g.said > 0) return;
  const room = currentRoom(g);
  const { detail, reach, ambient, waiting: more } = CONFIG.notice.esoteric;
  const k = waiting ? more : 1;
  const t = room.toad;
  if (t && los(room.t, g.x, g.y, t.x, t.y)) {
    const steps = chebyshev(t.x, t.y, g.x, g.y);
    const o = unitCycle(g, room, 'toad').find((it, n) => n > 0 && !g.observed[it.id]);
    const p = Math.min(1, k * detail * Math.max(0, 1 - (steps - 1) / reach));
    if (o && chance(g.noticeRng, p) && sayObserved(g, 'toad', o)) return;
  }
  const line = roomLines(g).find((l) => !g.observed[l.id] && !l.worms);
  if (line && chance(g.noticeRng, Math.min(1, k * ambient)) && canSay(g, line.text)) {
    say(g, line.text, 'observe');
    g.observed[line.id] = true;
  }
}

// Waiting a turn. In the esoteric edition you notice more (noticeEsoteric), and a memory on
// its way back may come now instead of later ("if you wait you may also make more
// observations or gain new memories", decision 297).
function wait(g, ev) {
  if (g.edition !== 'esoteric') return endTurn(g, ev);
  if (g.recall && g.recall.turn > g.turn + 1 && chance(g.noticeRng, CONFIG.memoryWait)) g.recall.turn = g.turn + 1;
  return endTurn(g, ev, undefined, true, true);
}

// Inspecting the grass you stand in: in the toad's room, what is under it (the worms,
// once); otherwise, or after, what the grass is, going round as observing does.
function inspectGround(g, ev) {
  ev.push({ type: 'inspect', x: g.x, y: g.y });
  endTurn(g, ev, () => {
    const find = roomLines(g).find((l) => l.worms && !g.observed[l.id]);
    if (find) {
      if (!canSay(g, find.text)) return;
      say(g, find.text, 'observe');
      g.observed[find.id] = true;
      g.knowsWorms = true;
      return;
    }
    const list = sayings('grass');
    const last = list.findIndex((it) => it.id === g.lastObserved.grass);
    sayObserved(g, 'grass', list.find((it) => !g.observed[it.id]) ?? list[(last + 1) % list.length]);
  }, false);
}

// One sensing, one new thing ("1 thing per sense", decision 150): the first it can find now
// that you have not sensed, or else that there is nothing new, wherever you are.
// The last line of the toad's room is the worms.
function sense(g, ev) {
  const room = currentRoom(g);
  const { size } = terrainGrid(room.t);
  for (let i = 0; i < room.t.length; i++) {
    room.seen[i] = true;
    room.memCorpse[i] = !!corpseAt(room, i % size, Math.floor(i / size));
  }
  const wave = senseWave(g);
  noticeSensed(g, wave);
  const find = senseFinds(g).find((f) => !g.sensed[f.id]);
  ev.push({ type: 'sense', wave });
  const here = g.room;
  // A blow or a death has priority over a discovery. An unsaid discovery stays
  // available for the next sense; a memory waits for spare room.
  endTurn(g, ev, () => {
    const text = find?.text ?? TEXT.log.senseNothing;
    if (canSay(g, text)) {
      say(g, text, 'sense');
      if (find) {
        g.sensed[find.id] = true;
        if (find.worms) g.knowsWorms = true;
      }
    }
    g.selfUntil = g.turn + CONFIG.selfTurns;
    g.sensedTurn = g.turn;
    g.sensedRoom = here;
  }, false);
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
  const { t } = currentRoom(g);
  const { idx } = terrainGrid(t);
  const c = t[idx(g.x, g.y)];
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
  const fresh = makeState(deriveSeed(g.seed), g.look, g.nextLogId, g.outlines, g.edition, g.opening);
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
        // the lines round the buttons: each choice is the next step, round to none again
        { label: TEXT.menu.outlines(g.outlines), kind: 'action', disabled: false, run: 'outlines' },
      ];
    case 'corpse': {
      const items = corpseHere(g)?.items ?? [];
      // esoteric (decision 264): eat it, or take what it has on a view of its own
      if (g.edition === 'esoteric') {
        return [
          { label: TEXT.menu.eat, kind: 'action', disabled: !!corpseHere(g)?.eaten, run: 'eat' },
          { label: TEXT.menu.takeItems, kind: 'action', disabled: false, run: 'loot' },
        ];
      }
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

// ---- a corpse, in the esoteric edition (decisions 264, 276) -------------------------
// Standing on it, its menu offers eat, take items and back; stepping off it also closes
// the menu. Take items opens a view of its own, its things as links and back, which goes
// back to the corpse's menu.

function takeFromCorpse(g, i) {
  const [it] = corpseHere(g).items.splice(i, 1);
  g.items.push({ key: it.key, inHand: false });
  say(g, TEXT.log.take(TEXT.thing[it.key]), 'plain');
}

function lootPassages(g, e) {
  const empty = (corpseHere(g)?.items ?? []).length === 0;
  e.passages = [[prose(TEXT.context.corpse)], ...(empty ? [[prose(TEXT.menu.nothing)]] : [])];
}

function openLoot(g, ev) {
  const e = { id: 'loot', passages: [] };
  openEvent(g, e, ev, true); // back returns to the corpse's menu
  lootPassages(g, g.event);
}

// Eating it takes a turn and does you good, once; it stays, with whatever it has.
function eatCorpse(g, ev) {
  const corpse = corpseHere(g);
  if (!corpse || corpse.eaten) return;
  corpse.eaten = true;
  g.hp = Math.min(g.maxHp, g.hp + CONFIG.eatHeals);
  say(g, TEXT.log.eat, 'good');
  ev.push({ type: 'eat', x: g.x, y: g.y });
  endTurn(g, ev);
}

// Is the esoteric corpse menu open? Moving, tapping or dragging closes it and goes.
const corpseMenuOpen = (g) => g.edition === 'esoteric' && g.menu?.id === 'corpse';

function openMenu(g, id) {
  g.inv = null;
  g.menu = { id, page: 0, cursor: 0 };
  g.menu.cursor = firstChoosable(slots(g, g.menu));
  if (id === 'corpse' && g.edition !== 'esoteric' && corpseHere(g).items.length === 0) say(g, TEXT.log.corpseEmpty, 'plain');
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
  inspected(g, it);
}

// Inspecting an item: it has been, and an item holding a memory starts it on its way back.
function inspected(g, it) {
  g.inspected[it.key] = true;
  const m = MEMORY_OF[it.key];
  if (m && !g.memories.includes(m) && !g.recall) g.recall = { id: m, turn: g.turn + CONFIG.memoryDelay };
}

// Items that can be held.
const HOLDABLE = new Set(['sword']);

// Use the selected item. The sword: in hand, or put away. Nothing else has a use yet.
function use(g) {
  useItem(g, g.items[g.inv.cursor]);
}

// What using it said, or null if it has no use.
function useItem(g, it) {
  if (!it || !HOLDABLE.has(it.key)) return null;
  it.inHand = !it.inHand;
  const name = TEXT.thing[it.key];
  const line = it.inHand ? TEXT.log.inHand(name) : TEXT.log.putAway(name);
  say(g, line, 'plain');
  return line;
}

// How an item is, beside it: in hand, enchanted, or nothing.
const itemState = (it) => [it.inHand ? TEXT.menu.inHand : '', it.enchanted ? TEXT.menu.enchanted : ''].filter(Boolean).join(' ');

// The esoteric inventory is a page of its own, as the psyche, the abilities and take items
// are (decision 297): what you carry as links, and back. Each item opens its own page.
function openInventory(g, ev, cursor = 0) {
  const passages = [[prose(TEXT.button.inventory)]];
  if (g.items.length === 0) passages.push([prose(TEXT.menu.nothing)]);
  openEvent(g, { id: 'inventory', passages }, ev);
  g.event.cursor = cursor;
}

// An item's page (decision 306): its name and how it is (in hand, enchanted), and once
// inspected, what it is. Its choices: inspect, equip or unequip if it can be held, throw,
// and back to the inventory.
function itemPassages(it, shown) {
  const state = itemState(it);
  return [[prose(TEXT.thing[it.key])], ...(state ? [[prose(state)]] : []), ...(shown ? [[prose(TEXT.slot[it.key])]] : [])];
}

function openItem(g, i, ev) {
  openEvent(g, { id: 'item', item: i, shown: false, passages: itemPassages(g.items[i], false) }, ev);
}

// ---- observe -------------------------------------------------------------
// One hold, one observation ("in single instances, not many stacked"). What a thing has
// goes round: each hold says the first one you have not had, and once you have had them
// all, the one after the last it said. A unit's are its plain line and then what sensing has
// found about it (decision 152). Nothing blinks for being there to look at (decision 112),
// nor for its default observation: a unit blinks only once you have noticed it, and then
// while sensing has found something about it you have not had (view: cell.more).

// What is drawn on a cell, by the same sight rules as view():
// 'player', 'toad', 'corpse', or null; undefined for a cell never seen.
function thingAt(g, room, i, vis, shown, sensed) {
  const { size } = terrainGrid(room.t);
  const x = i % size;
  const y = Math.floor(i / size);
  if (x === g.x && y === g.y) return { kind: 'player' };
  if (!shown[i] && !room.seen[i]) return undefined;
  const toad = toadAt(room, x, y);
  if (toad && (vis[i] || sensed)) return { kind: 'toad', asleep: toad.asleep };
  const item = looseAt(room, x, y);
  if (item) return { kind: 'item', key: item.key };
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
  upstairs: 'upstairs',
};

// The lines of a name in TEXT.observe, going round: [{ id, text }].
const sayings = (name) => [].concat(TEXT.observe[name]).map((text, k) => ({ id: `${name}.${k}`, text }));

// The toad's plain line, as Brogue's: who, doing what, on what ground. Its id is by what it
// is doing, so a toad that wakes has a new line to observe. Always "a toad" (decision 185).
function toadLine(room, toad) {
  const { idx } = terrainGrid(room.t);
  if (!toad.asleep) return { id: 'unit.toad.awake', text: TEXT.observe.toad, plain: true };
  const u = TEXT.unit;
  const ground = u.ground[room.t[idx(toad.x, toad.y)]];
  return { id: 'unit.toad.asleep', text: ground ? u.line(u.who.toad, u.doing.asleep, ground) : u.elsewhere.toad, plain: true };
}

// What observing a unit goes round, in order: [{ id, text }]. The toad: its plain line and
// what else observing it tells: that it seems stronger, at any distance (172); and within
// CONFIG.observeClose steps, its chain while it has the key and its song while it sleeps.
// One you have had stays at any distance while it holds (decision 180). The bust: its line.
// plain: from observing, not found by sensing, so it never makes a unit blink. Everything
// is, for now: sensing finds nothing about a unit (180).
function unitCycle(g, room, kind) {
  if (kind === 'toad') {
    const t = room.toad;
    const s = TEXT.toadSeen;
    const close = isNear(g, t.x, t.y);
    const out = [toadLine(room, t), { id: 'unit.toad.stronger', text: s.stronger, plain: true }];
    const near = (id, text) => (close || g.observed[id]) && out.push({ id, text, plain: true });
    if (t.key) near('unit.toad.chain', s.chain);
    if (t.asleep) near('unit.toad.sings', TEXT.toad.singing);
    return out;
  }
  return sayings(room.statue?.spoke ? 'statueLifeless' : 'statue').map((o) => ({ ...o, plain: true }));
}

// Something found that you have not observed: a default observation never counts
// ("default observations should not cause them to blink").
const hasNew = (g, list) => list.some((o) => !o.plain && !g.observed[o.id]);

// What holding on cell i observes: { key, unit, list }. key: what the last one said is kept
// by; unit: the kind of unit, which can blink, or null.
function observable(g, room, i, thing) {
  if (thing?.kind === 'toad') return { key: 'toad', unit: 'toad', list: unitCycle(g, room, 'toad') };
  // an item on the floor: its name
  if (thing?.kind === 'item') return { key: 'item', unit: null, list: [{ id: `item.${thing.key}`, text: TEXT.thing[thing.key] }] };
  if (thing) {
    const name = thing.kind === 'player' ? 'you' : 'corpse';
    return { key: name, unit: null, list: sayings(name) };
  }
  if (room.t[i] === 'statue') return { key: 'statue', unit: 'statue', list: unitCycle(g, room, 'statue') };
  const name = TERRAIN_NAME[room.t[i]];
  return { key: name, unit: null, list: sayings(name) };
}

function sight(g) {
  const room = currentRoom(g);
  const vis = fov(room.t, g.x, g.y); //  true sight: the toad and corpses
  const shown = frame(room.t, vis); // sight plus the walls around it: cell state
  const sensed = g.sensedTurn === g.turn && g.sensedRoom === g.room;
  return { room, vis, shown, sensed };
}

function observe(g, x, y, ev) {
  const { room, vis, shown, sensed } = sight(g);
  const { idx } = terrainGrid(room.t);
  const i = idx(x, y);
  const thing = thingAt(g, room, i, vis, shown, sensed);
  if (thing === undefined || (!thing && room.t[i] === 'void')) return;
  const { key, list } = observable(g, room, i, thing);
  const last = list.findIndex((it) => it.id === g.lastObserved[key]);
  const o = list.find((it) => !g.observed[it.id]) ?? list[(last + 1) % list.length];
  // Look at the thing under the finger before it gets its turn to move.
  ev.push({ type: 'observe', x, y });
  endTurn(g, ev, () => {
    if (!sayObserved(g, key, o)) return;
    // In the esoteric edition, with no sense, looking at yourself lets you see your numbers.
    if (key === 'you' && g.edition === 'esoteric') g.selfUntil = g.turn + CONFIG.selfTurns;
  });
}

// Say observation o of the thing kept by `key`, and keep it as had. "it" only right after
// an observation of the same thing, including when a combat line intervenes. A detail is
// left unread if its line doesn't fit. Returns whether it was said.
function sayObserved(g, key, o) {
  const prev = g.log[g.log.length - 1];
  const text = key === 'toad' && prev?.about !== 'toad' ? TEXT.unit.named(o.text, TEXT.unit.the.toad) : o.text;
  if (!canSay(g, text)) return false;
  say(g, text, 'observe');
  if (key === 'toad') g.log[g.log.length - 1].about = 'toad';
  g.observed[o.id] = true;
  g.lastObserved[key] = o.id;
  return true;
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

// Moving into the toad asleep. Each time from the first verse; whether it has stirred is kept.
// If you have not been told of its key, the first line tells you (decision 176): from then
// on its chain is one of what observing it goes round, already had, and you can go for it.
function openToad(g, ev) {
  const toad = currentRoom(g).toad;
  // Its key, if you have not been told of it, then that it sings: "it" right after the
  // necklace; alone, the event's first line has nothing before it, so "the toad" (183, 186).
  let opening = [TEXT.unit.named(TEXT.toad.sings, TEXT.unit.the.toad)];
  if (toad.key && !g.observed['unit.toad.chain']) {
    opening = [TEXT.toad.necklace, TEXT.toad.sings];
    g.observed['unit.toad.chain'] = true;
  }
  const passages = [opening.map(prose), TEXT.toad.verses[0].map(sung)];
  openEvent(g, { id: 'toad', passages, heard: 1, over: false }, ev);
}

// Moving into the bust: the first time it speaks; after that, its opening, with what you carry.
function openBust(g, ev) {
  const s = currentRoom(g).statue;
  if (!s.spoke) return openDee(g, ev);
  openEvent(g, { id: 'bust', passages: [[prose(TEXT.observe.statueLifeless)]], over: false }, ev);
}

// The bust's first event, two pages (decision 157). The first ends at its greeting, and its
// one choice is what you say back; the second is what it answers, and then only back.
function openDee(g, ev) {
  const t = TEXT.dee;
  const passages = [t.bust, t.speaks, t.greets].map((l) => [prose(l)]);
  currentRoom(g).statue.spoke = true;
  openEvent(g, { id: 'dee', passages, over: false }, ev);
  makeNoise(g, ev);
}

function openMemory(g, id, ev, keepMenu = false) {
  const passages = TEXT.memories[id].map((l) => [prose(l)]);
  openEvent(g, { id: 'memory', memory: id, passages, over: true }, ev, keepMenu);
}

function openPsyche(g, ev) {
  const stats = ['str', 'will', 'love'].map((stat) =>
    prose(`${TEXT.stat[stat]} ${perceived(g, stat) ?? TEXT.stat.unknown}`)
  );
  stats.push(prose(`${TEXT.stat.hp} ${g.hp}/${g.maxHp}`));
  // The stat row is also available in inventory and menus. Keep that
  // selection separate from the system menu that can open over this page.
  const returnScreen = { inv: g.inv, menu: g.menu };
  openEvent(g, { id: 'psyche', passages: [[prose(TEXT.button.psyche)], stats], returnScreen }, ev);
}

function openMemories(g, ev) {
  const passages = [[prose(TEXT.button.memories)]];
  if (g.memories.length === 0) passages.push([prose(TEXT.menu.nothing)]);
  openEvent(g, { id: 'memories', passages }, ev);
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
// DEE's first page has no way back: it ends at its greeting, and you answer.
function eventOptions(g) {
  const e = g.event;
  // The opening has one way on and no way back.
  if (e.id === 'opening') return [{ label: TEXT.openingEsoteric.jump, kind: 'action', run: 'jump' }];
  if (!e.over && e.id === 'dee') return [{ label: TEXT.dee.ask, kind: 'action', run: 'ask' }];
  const list = [];
  if (e.id === 'memories') {
    // things in a list, as items are: not marked as choices (decision 305)
    for (const id of g.memories) list.push({ label: TEXT.menu.memory, kind: 'item', run: 'readMemory', arg: id });
  }
  if (e.id === 'abilities') {
    for (const id of abilityIds(g)) list.push({ label: abilityLabel(id), kind: 'action', run: 'ability', arg: id });
  }
  if (e.id === 'loot') {
    (corpseHere(g)?.items ?? []).forEach((it, i) => list.push({ label: TEXT.thing[it.key], kind: 'item', run: 'take', arg: i }));
  }
  if (e.id === 'inventory') {
    g.items.forEach((it, i) => list.push({ label: TEXT.thing[it.key], kind: 'item', run: 'item', arg: i }));
  }
  if (e.id === 'item') {
    const it = g.items[e.item];
    list.push({ label: TEXT.context.inspect, kind: 'action', run: 'inspectItem' });
    if (HOLDABLE.has(it?.key)) list.push({ label: it.inHand ? TEXT.item.unequip : TEXT.item.equip, kind: 'action', run: 'equip' });
    list.push({ label: TEXT.item.throw, kind: 'action', run: 'throw' });
  }
  if (!e.over && e.id === 'bust') {
    // The bust's opening: what you carry, by name.
    g.items.forEach((it, i) => list.push({ label: TEXT.thing[it.key], kind: 'item', run: 'give', arg: i }));
  }
  if (!e.over && e.id === 'toad') {
    const toad = currentRoom(g).toad;
    const o = TEXT.toad.options;
    list.push({ label: o.listen, kind: 'action', run: 'listen' });
    // only once you know of the key: you have observed its chain, or been told of it here
    if (toad && toad.key && g.observed['unit.toad.chain']) list.push({ label: o.key, kind: 'action', run: 'key' });
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
    case 'jump':
      // into the room, with the same cover as going down stairs; no turn passes
      g.event = null;
      ev.push({ type: 'descend' });
      break;
    case 'ability':
      g.event = null;
      runAbility(g, o.arg, ev);
      break;
    case 'back':
      // a memory read from the list goes back to the list; an item, to the inventory
      g.event = e.memoryList ?? e.inventory ?? null;
      if (g.event) ev.push({ type: 'event', id: g.event.id });
      if (e.returnScreen) {
        g.inv = e.returnScreen.inv;
        g.menu = e.returnScreen.menu;
      }
      break;
    case 'take': {
      takeFromCorpse(g, o.arg);
      lootPassages(g, e);
      e.cursor = Math.min(e.cursor, eventOptions(g).length - 1);
      break;
    }
    case 'item':
      e.cursor = i;
      openItem(g, o.arg, ev);
      g.event.inventory = e;
      break;
    case 'inspectItem': {
      const it = g.items[e.item];
      e.shown = true;
      e.passages = itemPassages(it, true);
      e.now = e.passages.length - 1;
      inspected(g, it);
      break;
    }
    case 'equip': {
      const it = g.items[e.item];
      useItem(g, it);
      e.passages = itemPassages(it, e.shown);
      e.now = e.passages.length;
      break;
    }
    case 'throw':
      throwItem(g, e.item, ev);
      break;
    case 'readMemory':
      e.cursor = i;
      openMemory(g, o.arg, ev);
      g.event.memoryList = e;
      break;
    case 'ask':
      // what you say to DEE: its answer is the second page, and the event is over
      e.passages = [...TEXT.dee.lines, TEXT.statue.opens, TEXT.dee.still].map((l) => [prose(l)]);
      e.now = 0;
      e.over = true;
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
        if (e.heard === 3) e.passages.unshift([prose(TEXT.toad.growls)]); // before it (188)
        if (e.heard === 2) {
          e.passages.push([prose(TEXT.toad.stirs)]);
          toad.stirred = true;
        }
      } else {
        e.passages = [TEXT.toad.wakes.map(prose)];
        wake(g, toad);
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
        wake(g, toad);
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
  if (g.event.id === 'abilities' && a.type === 'menu' && a.id === 'act') {
    g.event = null;
    return true;
  }
  const options = eventOptions(g);
  const n = options.length;
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
      // the way back, when there is one: never another choice made for you
      if (options[n - 1].run !== 'back') return false;
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
    case 'eat':
      eatCorpse(g, ev);
      break;
    case 'loot':
      openLoot(g, ev);
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
    case 'outlines':
      g.outlines = (g.outlines + 1) % (CONFIG.outlines.levels + 1);
      ev.push({ type: 'outlines', outlines: g.outlines });
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

// ---- travel: a fast move, as Brogue's ----------------------------------------
// Tap a cell to go there, or drag to see the way there and let go to go. Each step is a
// real turn, taken as a step by arrow is. A cell you have never seen is taken to be open
// ground until you see otherwise, so the way can go into the dark and to a dark cell; it is
// planned again at each step, from what you know then. It never goes through a wall, the
// bust or the locked golden door you know of, never through a door (one can only be its
// end), and around any toad you can see. Into what
// you bump rather than step on (the bust, the locked golden door, a toad you can see)
// it never steps: it stops beside it, and from there a travel to it is the bump.

const PATH_STOPS = new Set(['wall', 'statue', 'golddoor', 'void']);

// The way to (tx, ty): { bump, path }. bump: (tx, ty) is a bump one legal step away.
// path: [{ x, y }] from the first step to where it stops; [] if there is no way, or you
// are already there; for a cell that can't be stood on, it stops at the nearest cell
// beside it (by a legal step, for a bump).
function plan(g, tx, ty) {
  const { room, vis, shown, sensed } = sight(g);
  const { size, idx } = terrainGrid(room.t);
  // the room as you know it: what you have never seen is open ground
  // (void, outside an esoteric room's shape, is never seen or drawn, but never walked on)
  const t = room.t.map((c, i) => (room.seen[i] || shown[i] || c === 'void' ? c : 'floor'));
  const there = idx(tx, ty);
  if (tx === g.x && ty === g.y) return { bump: false, path: [] };
  const drawnToad = (i) => thingAt(g, room, i, vis, shown, sensed)?.kind === 'toad';
  // gaps and stairs up are gone to, never through
  const pass = (i) => !PATH_STOPS.has(t[i]) && t[i] !== 'door' && t[i] !== 'upstairs' && !drawnToad(i);
  const isBump = t[there] === 'statue' || t[there] === 'golddoor' || drawnToad(there);
  if (isBump && isStep(t, g.x, g.y, tx, ty)) return { bump: true, path: [] };
  let goals;
  if (pass(there) || t[there] === 'door' || t[there] === 'upstairs') {
    goals = [there];
  } else {
    // beside it: one legal step from it for a bump, any of the eight round a wall
    goals = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const [x, y] = [tx + dx, ty + dy];
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (!pass(idx(x, y)) && !(x === g.x && y === g.y)) continue;
      if (isBump && !isStep(t, x, y, tx, ty)) continue;
      goals.push(idx(x, y));
    }
  }
  const dist = stepsFrom(t, goals, (i) => pass(i) || i === idx(g.x, g.y));
  return { bump: false, path: walkDown(t, dist, g.x, g.y, tx, ty) ?? [] };
}

function toadInView(g) {
  const room = currentRoom(g);
  const { idx } = terrainGrid(room.t);
  const t = room.toad;
  return !!t && fov(room.t, g.x, g.y)[idx(t.x, t.y)];
}

// One step of a travel to (tx, ty). `first`: the press that starts it, which may wait
// (your own cell) or bump; a continuing travel only ever steps.
function travel(g, tx, ty, ev, first) {
  g.going = null;
  if (first && tx === g.x && ty === g.y) {
    endTurn(g, ev); // a wait
    return;
  }
  const way = plan(g, tx, ty);
  if (way.bump) {
    if (first) step(g, tx - g.x, ty - g.y, ev);
    return;
  }
  const next = way.path[0];
  const room = currentRoom(g);
  // never into a toad, seen or not: travel only bumps what it was sent to
  if (!next || toadAt(room, next.x, next.y)) return;
  const before = { hp: g.hp, room: g.room, turn: g.turn, saw: toadInView(g), ...noticedIn(room) };
  step(g, next.x - g.x, next.y - g.y, ev);
  const now = currentRoom(g);
  const marks = noticedIn(now);
  const stopped =
    g.turn === before.turn ||
    g.hp < before.hp ||
    ev.some((e) => e.type === 'death') ||
    g.room !== before.room ||
    !!g.event ||
    g.said > 0 ||
    (!before.saw && toadInView(g)) ||
    awakeInSight(g) ||
    (marks.toad && !before.toad) ||
    (marks.statue && !before.statue);
  const path = stopped ? [] : plan(g, tx, ty).path;
  ev.push({ type: 'travel', x: tx, y: ty, path });
  if (path.length) g.going = { x: tx, y: ty };
}

// Looking at a cell: the way a travel there would walk. Free.
function look(g, x, y) {
  return [{ type: 'look', x, y, path: plan(g, x, y).path }];
}

// Can a cell be looked at or travelled to? Any cell of the room, a dark one too, but not
// under a menu, the inventory or an event.
function canTarget(g, a) {
  return (!g.menu || corpseMenuOpen(g)) && !g.inv && !g.event && inRoom(a.x, g) && inRoom(a.y, g);
}

// ---- the API -----------------------------------------------------------

const inRoom = (n, g) => Number.isInteger(n) && n >= 0 && n < terrainGrid(currentRoom(g).t).size;

export function act(g, a) {
  if (!a || typeof a !== 'object') return [];
  const ev = [];
  g.said = 0;
  // anything but going on with it ends a travel
  const going = g.going;
  if (a.type !== 'continue') g.going = null;
  if (a.type === 'stop') return going ? [{ type: 'stop' }] : [];
  if (g.event) return eventAct(g, a, ev) ? ev : [];
  switch (a.type) {
    case 'move':
      if (!DIRS.includes(a.dir)) return [];
      if (g.inv) invMove(g, a.dir);
      else if (corpseMenuOpen(g)) {
        g.menu = null;
        move(g, a.dir, ev);
      } else if (g.menu) moveCursor(g, a.dir);
      else move(g, a.dir, ev);
      break;
    case 'context':
      if (g.inv) inspect(g);
      else if (g.menu) chooseSlot(g, g.menu.cursor, ev);
      else runAbility(g, contextId(g), ev);
      break;
    case 'ability':
      if (g.edition !== 'esoteric' || g.inv || g.menu || !abilityIds(g).includes(a.id)) return [];
      runAbility(g, a.id, ev);
      break;
    case 'menu':
      if (g.edition === 'esoteric' && a.id === 'psy') {
        openPsyche(g, ev);
        break;
      }
      if (g.edition === 'esoteric' && a.id === 'memories') {
        openMemories(g, ev);
        break;
      }
      if (g.edition === 'esoteric' && a.id === 'inv') {
        openInventory(g, ev);
        break;
      }
      if (!SQUARE_MENUS.includes(a.id)) return [];
      if (g.edition === 'esoteric' && a.id === 'act') {
        if (!g.inv && !g.menu) openEvent(g, { id: 'abilities', passages: [[prose(TEXT.button.abilities)]] }, ev);
        break;
      }
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
      if (!g.menu && !g.inv) wait(g, ev);
      break;
    case 'use':
      if (g.inv) use(g);
      break;
    case 'pick':
      if (g.inv && Number.isInteger(a.index) && a.index >= 0 && a.index < g.items.length) g.inv.cursor = a.index;
      break;
    case 'observe':
      if ((g.menu && !corpseMenuOpen(g)) || g.inv || !inRoom(a.x, g) || !inRoom(a.y, g)) return [];
      observe(g, a.x, a.y, ev);
      break;
    case 'look':
      return canTarget(g, a) ? look(g, a.x, a.y) : [];
    case 'travel':
      if (!canTarget(g, a)) return [];
      if (corpseMenuOpen(g) && !(a.x === g.x && a.y === g.y)) g.menu = null;
      else if (corpseMenuOpen(g)) return [];
      travel(g, a.x, a.y, ev, true);
      break;
    case 'continue':
      if (!g.going) return [];
      travel(g, g.going.x, g.going.y, ev, false);
      break;
    default:
      return [];
  }
  return ev;
}

export function view(g) {
  const { room, vis, shown, sensed } = sight(g);
  const cells = [];
  for (let i = 0; i < room.t.length; i++) {
    const state = room.t[i] === 'void' ? 'unknown' : shown[i] ? 'visible' : room.seen[i] ? 'remembered' : 'unknown';
    const thing = thingAt(g, room, i, vis, shown, sensed) ?? null;
    // A unit in sight that you have noticed, with something you have not observed, blinks.
    let more = false;
    if (state === 'visible') {
      const o = observable(g, room, i, thing);
      // Nothing blinks in the esoteric edition (decision 245).
      more = g.edition !== 'esoteric' && !!o.unit && !!noticedIn(room)[o.unit] && hasNew(g, o.list);
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
        // something to find out by inspecting it: it blinks in the list (decision 117)
        more: g.edition !== 'esoteric' && !g.inspected[it.key],
      })),
      cursor: g.inv.cursor,
    };
  }
  return {
    seed: g.seed,
    depth: g.depth,
    turn: g.turn,
    going: !!g.going, // a travel is under way: the screen sends continue, or stop
    look: g.look,
    outlines: g.outlines,
    room: { id: g.room, key: room.key, size: terrainGrid(room.t).size },
    player: { x: g.x, y: g.y },
    cells,
    stats: {
      str: perceived(g, 'str'),
      love: perceived(g, 'love'),
      will: perceived(g, 'will'),
      hp: g.hp,
      maxHp: g.maxHp,
    },
    // The wide button never blinks any more (decision 116); `more` stays for the screen code.
    context: { id: ctx, label: ctx ? TEXT.context[ctx] : '', more: false },
    abilities: g.edition === 'esoteric' && !g.menu && !g.inv && !g.event
      ? abilityIds(g, true).map((id) => ({ id, label: abilityLabel(id) }))
      : [],
    menu,
    inv,
    event,
    log: logView(g),
    fresh: g.fresh,
  };
}
