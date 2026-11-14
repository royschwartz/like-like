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

function dispatch(action) {
  const events = act(game, action) || [];
  for (const e of events) {
    if (e && e.type === 'look') saveLook(e.look);
    if (e && e.type === 'outlines') save(OUTLINES_KEY, e.outlines);
  }
  renderer.draw(view(game), events);
}

bindInput(document.getElementById('screen'), dispatch);

window.__likelike = { game, act, view };
