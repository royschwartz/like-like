// The log study: the game as it is (a copy of src/main.js, esoteric edition only), with the
// log drawn the panel's way. Every line the latest action said is lit, and each new line
// blinks as it arrives (log.js). The panel's buttons put lines in the log without hunting
// for them: one, the two that inspecting the toad room's grass says at once, and the newest
// again, so its count goes up. All their words are his, from text.js.

import { newGame, act, view } from '../../src/game.js';
import { createRenderer } from '../../src/render.js';
import { bindInput } from '../../src/input.js';
import { TEXT } from '../../src/text.js';
import { paintEsoteric } from '../../esoteric/edition.js';
import { moreMark } from '../../esoteric/more.js';
import { createStairs } from '../../esoteric/stairs.js';
import { createLogLayer } from './log.js';
import { createPanel } from './panel.js';

const LOOK_KEY = 'likelike.esoteric.look';
const OUTLINES_KEY = 'likelike.esoteric.outlines';

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
const renderer = createRenderer(document, { cellPainter: paintEsoteric, moreMark, size, stairs: createStairs });

// study: the log's way of showing new lines, and the panel that sets it. The layer watches
// the log before the first draw, so the first room's line blinks too.
const screen = document.getElementById('screen');
const layer = createLogLayer(screen, document.getElementById('log-lines'));
const panel = createPanel({
  screen,
  mapWrap: document.getElementById('map-wrap'),
  onSay: say,
  onChange: (settings) => layer.set(settings),
});
layer.set(panel.settings);
panel.replay = () => layer.replay();
layer.onBlink((info) => panel.blinking(info));

renderer.draw(first);
const timing = renderer.timing;

let stepTimer = null; // the next step of a fast move
let aim = null; // a drag on the map: the cell letting go would go to, { x, y }, or null

// act, draw, and keep a fast move going
function run(action) {
  const events = act(game, action) || [];
  for (const e of events) {
    if (e && e.type === 'look' && typeof e.look === 'string') save(LOOK_KEY, e.look);
    if (e && e.type === 'outlines') save(OUTLINES_KEY, e.outlines);
  }
  const v = view(game);
  renderer.draw(v, events);
  nextStep(v, events);
  return events;
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

// A wall, or the black outside a room, that you can see and that has nothing on it, is
// nothing to drag to (decision 262).
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
  if (renderer.busy()) return false;
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

bindInput(screen, dispatch, { graceMs: timing.graceMs, lookMs: timing.lookMs }, size);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (stepTimer || view(game).going) stop();
});

// ---- study: lines from the panel ---------------------------------------------------------

// What the panel's buttons say, all his words: one line, the two the toad room's grass says
// at once (his screenshot), and the newest line again.
const LINES = {
  one: [TEXT.inspect.glowing],
  two: [TEXT.inspect.purple.struggles, TEXT.inspect.purple.gained],
};

// Say `which` as one action of its own, as the game's say() does: the first line it says is
// the fresh one, and every line carries it as its action. Not on a page or in a menu, where
// the log can't be seen; a fast move is stopped first.
function say(which) {
  if (stepTimer || view(game).going) stop();
  const v = view(game);
  if (v.event || v.inv || v.menu) return false;
  const texts = which === 'again' ? [game.log.at(-1)?.text].filter(Boolean) : LINES[which];
  if (!texts?.length) return false;
  game.said = 0;
  const first = game.nextLogId;
  game.fresh = first;
  for (const text of texts) {
    game.log.push({ id: game.nextLogId++, actionId: first, turn: game.turn, text, kind: 'observe' });
  }
  renderer.draw(view(game), []);
  return true;
}

window.__likelike = { game, act, view, renderer, layer, panel };
