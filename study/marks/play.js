// The marks study: the game as it is (a copy of src/main.js), with the marks drawn round
// the cell you drag to and the cell you hold, and a panel to pick and tune them.
// Boot: make a game, draw it, and from then on: action -> act -> draw.
// A press on the map is a gesture that input.js follows; here it becomes rules actions:
// a tap goes there, a hold looks and then observes, a drag shows the way and letting go goes.

import { newGame, act, view } from '../../src/game.js';
import { createRenderer } from '../../src/render.js';
import { bindInput } from '../../src/input.js';
import { createMarks } from './marks.js';
import { createPanel } from './panel.js';

const LOOK_KEY = 'likelike.look';
const OUTLINES_KEY = 'likelike.outlines';

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
  return 'paper';
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

const game = newGame({ seed: readSeed(), look: readLook(), outlines: readOutlines() });
// the study draws its own marks, so the game's are off
const renderer = createRenderer(document, { marks: false });
renderer.draw(view(game));
// study: a copy, so the panel can change the hold's times while it is played
const timing = { ...renderer.timing };

// study: the marks, and the panel that sets them and the hold's times
const marks = createMarks(document.getElementById('map-wrap'), { size: 11, frameMs: timing.frameMs });
const cellEl = (x, y) => document.querySelector('#map [data-cell="' + (y * 11 + x) + '"]');
const { settings } = createPanel(document.getElementById('stage'), {
  frameMs: timing.frameMs,
  onChange(s) {
    marks.set(s);
    timing.graceMs = timing.frameMs * s.grace;
    timing.lookMs = timing.frameMs * s.look;
    document.getElementById('screen').style.setProperty('--look-on', s.look);
  },
});

// study: a screen that takes over the map, or a new room, takes the marks away
function clearMarksAfter(v, events) {
  const over = events.some((e) => e && ['room', 'death', 'restart', 'descend'].includes(e.type));
  if (over || v.event || v.inv || v.menu) marks.clear();
}

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
  clearMarksAfter(v, events);
  nextStep(v, events);
  return events;
}

// A fast move takes its next step one step's time from now, unless something has taken
// over: a death, a restart, going down, an event, a menu, the page being hidden.
function nextStep(v, events) {
  clearTimeout(stepTimer);
  stepTimer = null;
  if (!v.going) return;
  const over = events.some((e) => e && ['death', 'restart', 'descend', 'event'].includes(e.type));
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
  const v = view(game);
  renderer.draw(v, events);
  clearMarksAfter(v, events);
}

// Can (x, y) be looked at? Its look event (with the way there), or null. Looking is free
// and changes nothing on the screen, so nothing is drawn.
function lookAt(x, y) {
  const events = act(game, { type: 'look', x, y }) || [];
  return events.find((e) => e && e.type === 'look' && e.x === x && e.y === y) || null;
}

const isPlayer = (x, y) => {
  const p = view(game).player;
  return !!p && p.x === x && p.y === y;
};

// A drag is over the cell `at` (null: off the map). Its way is drawn, bright, and the
// cell is marked; over your own cell or one never seen there is nothing to go to.
function aimAt(at) {
  renderer.dropLook();
  marks.endLook();
  const seen = at ? lookAt(at.x, at.y) : null;
  if (!seen || isPlayer(at.x, at.y)) {
    aim = null;
    renderer.clearAim();
    marks.aim(null);
    return;
  }
  aim = { x: at.x, y: at.y };
  renderer.showAim(at.x, at.y, seen.path);
  marks.aim({ x: at.x, y: at.y }, cellEl(at.x, at.y));
}

// Let go after a drag: go to the cell aimed at, if it is still one to go to.
function drop() {
  const at = aim;
  aim = null;
  renderer.clearAim();
  marks.aim(null);
  if (!at || isPlayer(at.x, at.y) || !lookAt(at.x, at.y)) return;
  marks.tap(at, cellEl(at.x, at.y));
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
      marks.clear();
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
      // held a moment: the cell blinks, if it can be looked at
      if (!lookAt(action.x, action.y)) return false;
      renderer.showLook(action.x, action.y);
      marks.look({ x: action.x, y: action.y }, settings.look);
      return true;
    }
    case 'hold':
      // held through the blink: observe
      marks.endLook();
      return run({ type: 'observe', x: action.x, y: action.y });
    case 'tap':
      // let go before the blink was done: go there (or hit what's there, or wait)
      renderer.dropLook();
      marks.endLook();
      if (!isPlayer(action.x, action.y) && lookAt(action.x, action.y)) {
        marks.tap({ x: action.x, y: action.y }, cellEl(action.x, action.y));
      }
      return run({ type: 'travel', x: action.x, y: action.y });
    case 'interrupt':
      return;
  }
  run(action);
}

bindInput(document.getElementById('screen'), dispatch, timing);

// Hidden, nothing goes on by itself: no fast move. (input.js drops a gesture under way.)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (stepTimer || view(game).going) stop();
});

window.__likelike = { game, act, view, marks, settings };
