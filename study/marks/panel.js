// The study's settings: which marks, and the numbers they and the hold run by.
// A small button at the slab's top right opens a panel over the stat line and the
// controls, so the log and the map stay in sight and can be played while tuning.
// Kept in localStorage and in the address's #hash, so a link carries them.

import { DEST, OBSERVE, DEFAULTS } from './marks.js';

const KEY = 'likelike.study.marks';

// the numbers: the name on the panel, and their range and step
const SLIDERS = [
  { key: 'weight', name: 'line', min: 0.2, max: 2, step: 0.1 },
  { key: 'edge', name: 'edge', min: 0, max: 1, step: 0.05 },
  { key: 'reach', name: 'reach', min: 1, max: 10, step: 1 },
  { key: 'box', name: 'box', min: 1, max: 5, step: 1 },
  { key: 'tap', name: 'tap flash', min: 0, max: 10, step: 1 },
  { key: 'grace', name: 'wait', min: 0, max: 8, step: 1 },
  { key: 'look', name: 'hold', min: 2, max: 16, step: 1 }, // past 16 the game stops its own blink early,
];
const CHOICES = [
  { key: 'dest', name: 'going', list: DEST },
  { key: 'observe', name: 'observing', list: OBSERVE },
];
const ORDER = ['dest', 'observe', 'weight', 'edge', 'reach', 'box', 'tap', 'grace', 'look'];

function defaults() {
  return { ...DEFAULTS, grace: 2, look: 4 };
}

// A value for key, made good: a known name, or a number clamped and put on its step.
// undefined if it can't be.
function valid(key, raw) {
  const choice = CHOICES.find((c) => c.key === key);
  if (choice) return choice.list.includes(raw) ? raw : undefined;
  const s = SLIDERS.find((d) => d.key === key);
  if (!s || raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const k = Math.round((Math.min(s.max, Math.max(s.min, n)) - s.min) / s.step);
  return Number((s.min + k * s.step).toFixed(2));
}

// lay a source's good values over the settings
function merge(settings, source) {
  if (!source || typeof source !== 'object') return;
  for (const key of ORDER) {
    const v = valid(key, source[key]);
    if (v !== undefined) settings[key] = v;
  }
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    return null; // storage unavailable, or not JSON
  }
}

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const out = {};
  for (const key of ORDER) if (p.has(key)) out[key] = p.get(key);
  return out;
}

function store(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) {
    // storage unavailable: the hash still has them
  }
  const p = new URLSearchParams();
  for (const key of ORDER) p.set(key, String(settings[key]));
  try {
    history.replaceState(history.state, '', location.pathname + location.search + '#' + p.toString());
  } catch (e) {
    // not allowed here: nothing to do
  }
}

export function createPanel(stage, { onChange = () => {}, frameMs = 70 } = {}) {
  const doc = stage.ownerDocument;
  const settings = defaults();
  merge(settings, readStored());
  merge(settings, readHash());

  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const root = el('div', null);
  root.id = 'study';
  const toggle = el('button', 'study-toggle');
  toggle.type = 'button';
  toggle.append(el('span', null, 'study'));
  const panel = el('div', 'study-panel');
  panel.hidden = true;
  root.append(toggle, panel);

  // the two rows of marks
  const choiceButtons = {};
  for (const c of CHOICES) {
    const row = el('div', 'study-row');
    row.append(el('div', 'study-label', c.name));
    const btns = el('div', 'study-choices');
    choiceButtons[c.key] = c.list.map((name) => {
      const b = el('button', 'study-btn', name);
      b.type = 'button';
      b.addEventListener('click', () => set(c.key, name));
      btns.append(b);
      return b;
    });
    row.append(btns);
    panel.append(row);
  }

  // every setting on one line, under the marks, so one screenshot says it all
  const readout = el('div', 'study-readout');
  panel.append(readout);

  // the sliders
  const sliders = {};
  for (const s of SLIDERS) {
    const row = el('label', 'study-slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    const value = el('span', 'study-value');
    input.addEventListener('input', () => set(s.key, input.value));
    row.append(el('span', 'study-name', s.name), input, value);
    panel.append(row);
    sliders[s.key] = { input, value };
  }

  const end = el('div', 'study-end');
  const reset = el('button', 'study-btn', 'reset');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    Object.assign(settings, defaults());
    changed();
  });
  const close = el('button', 'study-btn', 'close');
  close.type = 'button';
  close.addEventListener('click', () => show(false));
  end.append(reset, close);
  panel.append(end);

  toggle.addEventListener('click', () => show(panel.hidden));
  // keys pressed in here are the panel's: arrows on a slider must not move you
  root.addEventListener('keydown', (e) => e.stopPropagation());

  stage.append(root);

  function set(key, raw) {
    const v = valid(key, raw);
    if (v === undefined || settings[key] === v) return;
    settings[key] = v;
    changed();
  }

  function changed() {
    draw();
    store(settings);
    onChange(settings);
  }

  function draw() {
    for (const c of CHOICES) {
      choiceButtons[c.key].forEach((b, i) => b.classList.toggle('on', c.list[i] === settings[c.key]));
    }
    for (const s of SLIDERS) {
      const { input, value } = sliders[s.key];
      input.value = String(settings[s.key]);
      value.textContent = String(settings[s.key]);
    }
    const secs = (((settings.grace + settings.look) * frameMs) / 1000).toFixed(2);
    sliders.look.value.textContent = settings.look + ' · ' + secs + 's';
    readout.textContent = [
      'going ' + settings.dest,
      'observing ' + settings.observe,
      'line ' + settings.weight,
      'edge ' + settings.edge,
      'reach ' + settings.reach,
      'box ' + settings.box,
      'tap ' + settings.tap,
      'wait ' + settings.grace,
      'hold ' + settings.look,
    ].join(' · ');
  }

  function show(open) {
    panel.hidden = !open;
    toggle.classList.toggle('on', open);
    place();
  }

  // Placed from the slab as it is now: the button at its top right corner, the panel from
  // just below the map to the bottom, across the slab's whole width.
  function place() {
    const screen = doc.getElementById('screen');
    const wrap = doc.getElementById('map-wrap');
    if (!screen || !wrap) return;
    const s = screen.getBoundingClientRect();
    toggle.style.top = s.top + 'px';
    toggle.style.left = s.right - toggle.offsetWidth + 'px';
    if (panel.hidden) return;
    const top = Math.round(wrap.getBoundingClientRect().bottom);
    panel.style.left = s.left + 'px';
    panel.style.width = s.width + 'px';
    panel.style.top = top + 'px';
    panel.style.height = Math.max(0, s.bottom - top) + 'px';
  }

  const win = doc.defaultView;
  win.addEventListener('resize', place);
  win.addEventListener('orientationchange', place);
  if (win.visualViewport) win.visualViewport.addEventListener('resize', place);
  if (win.ResizeObserver) new win.ResizeObserver(place).observe(doc.getElementById('screen'));

  draw();
  store(settings);
  place();
  onChange(settings);
  return { settings };
}
