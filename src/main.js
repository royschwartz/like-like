// Boot: make a game, draw it, and from then on: action -> act -> draw.

import { newGame, act, view } from './game.js';
import { createRenderer } from './render.js';
import { bindInput } from './input.js';

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
const renderer = createRenderer(document);
renderer.draw(view(game));
const timing = renderer.timing;

// What the screen is waiting on. Only one at a time, and either is dropped by any input.
let pending = null; // a looked-at cell, observed when its blink is done: { x, y, timer }
let stepTimer = null; // the next step of a fast move

// act, draw, and keep a fast move going
function run(action) {
  const events = act(game, action) || [];
  for (const e of events) {
    // the paper or dark look (a tapped cell's look event has no look of that kind)
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
  renderer.draw(view(game), events);
}

function dropPending() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending = null;
  renderer.dropLook();
}

// A tap on the map. Once: look (the cell blinks, the way there lights up), and when the
// blink is done, observe. Again on the same cell while it blinks: go there instead.
function tap(x, y) {
  if (pending && pending.x === x && pending.y === y) {
    clearTimeout(pending.timer);
    pending = null;
    run({ type: 'travel', x, y });
    return;
  }
  dropPending();
  const events = run({ type: 'look', x, y });
  if (!events.some((e) => e && e.type === 'look' && e.x === x && e.y === y)) return;
  pending = {
    x,
    y,
    timer: setTimeout(() => {
      pending = null;
      run({ type: 'observe', x, y });
    }, timing.lookMs),
  };
}

// Every press comes here. During a fast move a press only stops it.
function dispatch(action) {
  if (stepTimer || view(game).going) {
    dropPending();
    stop();
    return;
  }
  if (action.type === 'tap') return tap(action.x, action.y);
  dropPending();
  if (action.type === 'interrupt') return;
  run(action);
}

bindInput(document.getElementById('screen'), dispatch);

// Hidden, nothing goes on by itself: no fast move, no observation still to come.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  dropPending();
  if (stepTimer || view(game).going) stop();
});

window.__likelike = { game, act, view };
