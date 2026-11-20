// Boot: make a game, draw it, and from then on: action -> act -> draw.
// A press on the map is a gesture that input.js follows; here it becomes rules actions:
// a tap goes there, a hold looks and then observes, a drag shows the way and letting go goes.

import { newGame, act, view } from './game.js';
import { createRenderer } from './render.js';
import { bindInput } from './input.js';

const esoteric = document.documentElement.dataset.edition === 'esoteric';
const edition = esoteric ? await import('../esoteric/edition.js') : null;
const preferenceKey = esoteric ? 'likelike.esoteric' : 'likelike';
const LOOK_KEY = preferenceKey + '.look';
const OUTLINES_KEY = preferenceKey + '.outlines';

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
  return esoteric ? 'dark' : 'paper';
}

function saveLook(look) {
  save(LOOK_KEY, look);
}

// The lines round the buttons, as last set in the menu; the game checks the number.
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

// Measure the ink of the wait and action buttons after the edition's face has loaded.
if (esoteric && document.fonts) await document.fonts.load('1em "Crooked Hand"').catch(() => {});
// The esoteric edition begins on its opening screen.
const game = newGame({ seed: readSeed(), look: readLook(), outlines: readOutlines(), edition: document.documentElement.dataset.edition, opening: esoteric });
const opening = view(game);
const size = opening.room.size ?? Math.sqrt(opening.cells.length);
const renderer = createRenderer(document, { cellPainter: edition?.paintEsoteric, size });
renderer.draw(opening);
const timing = renderer.timing;

let stepTimer = null; // the next step of a fast move
let aim = null; // a drag on the map: the cell letting go would go to, { x, y }, or null

// act, draw, and keep a fast move going
function run(action) {
  const events = act(game, action) || [];
  for (const e of events) {
    // the paper or dark look (a looked-at cell's look event has no look of that kind)
    if (e && e.type === 'look' && typeof e.look === 'string') saveLook(e.look);
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
  // a room sliding in is waited out
  const wait = events.some((e) => e && e.type === 'room') ? timing.slideMs : timing.stepMs;
  stepTimer = setTimeout(() => {
    stepTimer = null;
    run({ type: 'continue' });
  }, wait);
}

// End a fast move. Not through run(), so it can never schedule another step.
function stop() {
  clearTimeout(stepTimer);
  stepTimer = null;
  const events = act(game, { type: 'stop' }) || [];
  renderer.draw(view(game), events);
}

// Can (x, y) be looked at? Its look event (with the way there), or null. Looking is free
// and changes nothing on the screen, so nothing is drawn.
function lookAt(x, y) {
  const events = act(game, { type: 'look', x, y }) || [];
  return events.find((e) => e && e.type === 'look' && e.x === x && e.y === y) || null;
}

// Have you ever seen (x, y)? A dark cell can be gone to but not observed.
const known = (x, y) => {
  const c = view(game).cells?.[y * size + x];
  return !!c && c.state !== 'unknown';
};

const isPlayer = (x, y) => {
  const p = view(game).player;
  return !!p && p.x === x && p.y === y;
};

// In the esoteric edition a wall, or the black outside a room, that you can see and that
// has nothing on it, is nothing to drag to: letting go there goes nowhere (decision 262).
function obstruction(at) {
  if (!esoteric || !at) return false;
  const c = view(game).cells?.[at.y * size + at.x];
  return !!c && c.state !== 'unknown' && !c.thing && (c.t === 'wall' || c.t === 'void');
}

// A drag is over the cell `at` (null: off the map). Its way is drawn, bright, and the
// cell is marked; over your own cell or one never seen there is nothing to go to.
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

// Let go after a drag: go to the cell aimed at, if it is still one to go to.
function drop() {
  const at = aim;
  aim = null;
  renderer.clearAim();
  if (!at || isPlayer(at.x, at.y) || obstruction(at) || !lookAt(at.x, at.y)) return;
  if (!esoteric) renderer.flashAim(at.x, at.y);
  run({ type: 'travel', x: at.x, y: at.y });
}

// Every press comes here. During a fast move a press only stops it.
// A press on the map is a gesture (see input.js); its later parts come only if it started.
function dispatch(action) {
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
      // held a moment: the cell blinks, if it can be looked at and you have seen it
      if (!lookAt(action.x, action.y) || !known(action.x, action.y)) return false;
      renderer.showLook(action.x, action.y);
      return true;
    }
    case 'hold':
      // held through the blink: observe
      renderer.dropLook();
      return run({ type: 'observe', x: action.x, y: action.y });
    case 'tap':
      // let go before the blink was done: go there (or hit what's there, or wait).
      // Somewhere else, its corners flash, to show which square the finger hit.
      renderer.dropLook();
      // (not in the esoteric edition: no corners on a tap, decision 261)
      if (!esoteric && !isPlayer(action.x, action.y) && lookAt(action.x, action.y)) renderer.flashAim(action.x, action.y);
      return run({ type: 'travel', x: action.x, y: action.y });
    case 'interrupt':
      return;
  }
  run(action);
}

bindInput(document.getElementById('screen'), dispatch, { graceMs: timing.graceMs, lookMs: timing.lookMs }, size);

// Hidden, nothing goes on by itself: no fast move. (input.js drops a gesture under way.)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (stepTimer || view(game).going) stop();
});

window.__likelike = { game, act, view };
