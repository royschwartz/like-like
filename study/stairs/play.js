// The stairs study: the game as it is (a copy of src/main.js, esoteric edition only), with
// ways of going up and down stairs to try in place of the blink. Taking stairs plays the
// one picked in the panel, over the map, on copies of the floor left and the floor reached.
// The panel's down and up put you just inside the stairs and walk you in.

import { newGame, act, view } from '../../src/game.js';
import { createRenderer } from '../../src/render.js';
import { bindInput } from '../../src/input.js';
import { paintEsoteric } from '../../esoteric/edition.js';
import { moreMark } from '../../esoteric/more.js';
import { createStairsFx } from './fx.js';
import { createPanel } from './panel.js';

const LOOK_KEY = 'likelike.esoteric.look';
const OUTLINES_KEY = 'likelike.esoteric.outlines';
const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

function readSeed() {
  const s = new URLSearchParams(location.search).get('seed');
  if (s != null && /^-?\d+$/.test(s.trim())) return parseInt(s, 10);
  return Date.now() % 2147483647;
}

function readLook() {
  try {
    const look = localStorage.getItem(LOOK_KEY);
    if (look === 'paper' || look === 'dark') return look;
  } catch (e) {
    // storage unavailable: fall through
  }
  return 'dark';
}

function readOutlines() {
  try {
    const n = localStorage.getItem(OUTLINES_KEY);
    if (n != null && /^\d+$/.test(n)) return parseInt(n, 10);
  } catch (e) {
    // storage unavailable: fall through
  }
  return undefined;
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // storage unavailable: nothing to do
  }
}

if (document.fonts) await document.fonts.load('1em "Crooked Hand"').catch(() => {});
// study: no opening screen, straight into the first room
const game = newGame({ seed: readSeed(), look: readLook(), outlines: readOutlines(), edition: 'esoteric', opening: false });
const first = view(game);
const size = first.room.size ?? Math.sqrt(first.cells.length);
const renderer = createRenderer(document, { cellPainter: paintEsoteric, moreMark, size });
renderer.draw(first);
const timing = renderer.timing;

// study: the animations, and the panel that picks them
const mapEl = document.getElementById('map');
const fx = createStairsFx(mapEl.parentElement, size);
const panel = createPanel({ onDown: goDown, onUp: goUp, mapWrap: document.getElementById('map-wrap') });

let stepTimer = null; // the next step of a fast move
let aim = null; // a drag on the map: the cell letting go would go to, { x, y }, or null

// act, draw, and keep a fast move going. Taking stairs plays the panel's animation.
function run(action) {
  const before = view(game);
  const events = act(game, action) || [];
  for (const e of events) {
    if (e && e.type === 'look' && typeof e.look === 'string') save(LOOK_KEY, e.look);
    if (e && e.type === 'outlines') save(OUTLINES_KEY, e.outlines);
  }
  const v = view(game);
  const way = events.some((e) => e && e.type === 'descend') ? 'down' : events.some((e) => e && e.type === 'ascend') ? 'up' : null;
  // the map still shows the floor you were on until it is drawn
  const oldMap = way ? mapEl.cloneNode(true) : null;
  renderer.draw(v, events);
  if (way) playStairs(oldMap, before, v, way);
  nextStep(v, events);
  return events;
}

function playStairs(oldMap, before, after, way) {
  const s = panel.settings;
  const key = way === 'down' ? s.down : s.up;
  const opts = s.opts[key];
  const frames = fx.play({ oldMap, newMap: mapEl.cloneNode(true), before, after, way, key, opts, frameMs: s.frame });
  panel.played({ way, key, frames, ms: frames * s.frame });
}

// A fast move takes its next step one step's time from now, unless something has taken
// over: a death, a restart, going down, an event, a menu, the page being hidden.
function nextStep(v, events) {
  clearTimeout(stepTimer);
  stepTimer = null;
  if (!v.going) return;
  const over = events.some((e) => e && ['death', 'restart', 'descend', 'ascend', 'event'].includes(e.type));
  if (over || v.event || v.inv || v.menu || document.hidden) return stop();
  const wait = events.some((e) => e && e.type === 'room') ? timing.slideMs : timing.stepMs;
  stepTimer = setTimeout(() => {
    stepTimer = null;
    run({ type: 'continue' });
  }, wait);
}

function stop() {
  clearTimeout(stepTimer);
  stepTimer = null;
  const events = act(game, { type: 'stop' }) || [];
  renderer.draw(view(game), events);
}

// ---- study: down and up from the panel --------------------------------------------------

// Nothing going on: no fast move, no page open.
function quiet() {
  if (stepTimer || view(game).going) stop();
  game.event = null;
  game.menu = null;
  game.inv = null;
}

// Put you just inside the stairs at (sx, sy) in room, facing `side`, and walk in.
function walkInto(room, sx, sy, side) {
  const [dx, dy] = STEP[side];
  const at = [sx - dx, sy - dy];
  const there = game.room === room && game.x === at[0] && game.y === at[1];
  if (!there) {
    game.room = room;
    [game.x, game.y] = at;
    renderer.draw(view(game), []);
  }
  setTimeout(() => run({ type: 'move', dir: side }), there ? 0 : 350);
}

function goDown() {
  if (fx.playing()) return;
  quiet();
  const s = game.level.stairs;
  walkInto(s.room, s.x, s.y, s.side);
}

// The stairs up are beside where you arrive on a floor. The first floor has none, so from
// there you go down first, with no animation.
function goUp() {
  if (fx.playing()) return;
  quiet();
  if (game.depth === 1) {
    const s = game.level.stairs;
    const [dx, dy] = STEP[s.side];
    game.room = s.room;
    [game.x, game.y] = [s.x - dx, s.y - dy];
    act(game, { type: 'move', dir: s.side });
    renderer.draw(view(game), []);
  }
  const e = game.level.entrance;
  const t = game.level.rooms[e.room].t;
  for (const [side, [dx, dy]] of Object.entries(STEP)) {
    const x = e.x + dx;
    const y = e.y + dy;
    if (x >= 0 && y >= 0 && x < size && y < size && t[y * size + x] === 'upstairs') return walkInto(e.room, x, y, side);
  }
}

// ---- the game's own input, as main.js has it -------------------------------------------

function lookAt(x, y) {
  const events = act(game, { type: 'look', x, y }) || [];
  return events.find((e) => e && e.type === 'look' && e.x === x && e.y === y) || null;
}

const known = (x, y) => {
  const c = view(game).cells?.[y * size + x];
  return !!c && c.state !== 'unknown';
};

const isPlayer = (x, y) => {
  const p = view(game).player;
  return !!p && p.x === x && p.y === y;
};

function obstruction(at) {
  if (!at) return false;
  const c = view(game).cells?.[at.y * size + at.x];
  return !!c && c.state !== 'unknown' && !c.thing && (c.t === 'wall' || c.t === 'void');
}

function aimAt(at) {
  renderer.dropLook();
  const seen = at && !obstruction(at) ? lookAt(at.x, at.y) : null;
  if (!seen || isPlayer(at.x, at.y)) {
    aim = null;
    renderer.clearAim();
    return;
  }
  aim = { x: at.x, y: at.y };
  renderer.showAim(at.x, at.y, seen.path);
}

function drop() {
  const at = aim;
  aim = null;
  renderer.clearAim();
  if (!at || isPlayer(at.x, at.y) || obstruction(at) || !lookAt(at.x, at.y)) return;
  run({ type: 'travel', x: at.x, y: at.y });
}

function dispatch(action) {
  // study: nothing is pressed while stairs are animating
  if (fx.playing()) return false;
  switch (action.type) {
    case 'aim':
      return aimAt(action.at);
    case 'drop':
      return drop();
    case 'cancel':
      aim = null;
      renderer.dropLook();
      renderer.clearAim();
      return;
  }
  if (stepTimer || view(game).going) {
    stop();
    return false;
  }
  switch (action.type) {
    case 'press':
      return true;
    case 'blink': {
      if (!lookAt(action.x, action.y) || !known(action.x, action.y)) return false;
      renderer.showLook(action.x, action.y);
      return true;
    }
    case 'hold':
      renderer.dropLook();
      return run({ type: 'observe', x: action.x, y: action.y });
    case 'tap':
      renderer.dropLook();
      return run({ type: 'travel', x: action.x, y: action.y });
    case 'interrupt':
      return;
  }
  if (action.type === 'wait') return waited(action);
  run(action);
}

function waited(action) {
  const before = view(game).fresh;
  const events = run(action);
  const v = view(game);
  const over = events.some((e) => e && ['death', 'restart', 'descend', 'ascend', 'event'].includes(e.type));
  return !over && !v.event && !v.menu && !v.inv && v.fresh === before;
}

bindInput(document.getElementById('screen'), dispatch, { graceMs: timing.graceMs, lookMs: timing.lookMs }, size);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (stepTimer || view(game).going) stop();
});

window.__likelike = { game, act, view, fx, panel };
