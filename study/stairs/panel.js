// The stairs study's panel. Above the map: the animations, each a button; tapping one picks
// it and plays it. Below the map: whether it is picked for going down, up or both, its
// numbers, and down and up, which take you to the stairs and through them. The map stays in
// sight and can be played. Kept in localStorage.

import { ANIMS, byKey } from './fx.js';

const KEY = 'likelike.study.stairs';
const FRAME = { min: 30, max: 200, step: 10 };
const BLACK = { min: 0, max: 8, step: 1 };

function defaults() {
  const opts = {};
  for (const a of ANIMS) opts[a.key] = { black: a.black ?? 0, n: a.n ? a.n.value : 0 };
  return { frame: 70, down: 'behind', up: 'behind', target: 'both', focus: 'behind', opts };
}

const clamp = (v, { min, max, step }) => Math.round(Math.min(max, Math.max(min, Number(v))) / step) * step;

function load() {
  const s = defaults();
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return s;
  if (Number.isFinite(Number(saved.frame))) s.frame = clamp(saved.frame, FRAME);
  for (const k of ['down', 'up', 'focus']) if (byKey[saved[k]]) s[k] = saved[k];
  if (['both', 'down', 'up'].includes(saved.target)) s.target = saved.target;
  for (const a of ANIMS) {
    const o = saved.opts?.[a.key];
    if (!o) continue;
    if (a.black !== null && Number.isFinite(Number(o.black))) s.opts[a.key].black = clamp(o.black, BLACK);
    if (a.n && Number.isFinite(Number(o.n))) s.opts[a.key].n = clamp(o.n, { ...a.n, step: 1 });
  }
  return s;
}

function store(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    // storage unavailable: nothing to do
  }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function createPanel({ onDown, onUp, mapWrap }) {
  const settings = load();
  const root = el('div', '');
  root.id = 'study';

  // ---- above the map: the animations ----
  const top = el('div', 'st-panel st-top');
  const head = el('div', 'st-head');
  head.append(el('span', 'st-title', 'stairs study · tap one to try it'));
  const hide = el('button', 'st-hide', 'hide');
  hide.type = 'button';
  head.append(hide);
  const grid = el('div', 'st-grid');
  const buttons = new Map();
  for (const a of ANIMS) {
    const b = el('button', 'st-anim');
    b.type = 'button';
    b.append(el('span', 'st-name', a.name), el('span', 'st-marks'));
    b.addEventListener('click', () => pick(a.key));
    grid.append(b);
    buttons.set(a.key, b);
  }
  const source = el('div', 'st-source');
  top.append(head, grid, source);

  // ---- below the map: what it is for, its numbers, down and up ----
  const bottom = el('div', 'st-panel st-bottom');
  const targetRow = el('div', 'st-row st-target');
  targetRow.append(el('span', 'st-label', 'set for'));
  const targets = new Map();
  for (const t of ['both', 'down', 'up']) {
    const b = el('button', 'st-seg', t);
    b.type = 'button';
    b.addEventListener('click', () => {
      settings.target = t;
      changed();
    });
    targetRow.append(b);
    targets.set(t, b);
  }

  const slider = (label) => {
    const row = el('label', 'st-row st-slider');
    const name = el('span', 'st-label', label);
    const input = el('input');
    input.type = 'range';
    const value = el('span', 'st-value');
    row.append(name, input, value);
    return { row, name, input, value };
  };
  const frame = slider('frame');
  const black = slider('black');
  const own = slider('');

  frame.input.min = FRAME.min;
  frame.input.max = FRAME.max;
  frame.input.step = FRAME.step;
  frame.input.addEventListener('input', () => {
    settings.frame = clamp(frame.input.value, FRAME);
    changed();
  });
  black.input.min = BLACK.min;
  black.input.max = BLACK.max;
  black.input.step = BLACK.step;
  black.input.addEventListener('input', () => {
    settings.opts[settings.focus].black = clamp(black.input.value, BLACK);
    changed();
  });
  own.input.step = 1;
  own.input.addEventListener('input', () => {
    const a = byKey[settings.focus];
    if (a.n) settings.opts[settings.focus].n = clamp(own.input.value, { ...a.n, step: 1 });
    changed();
  });

  const go = el('div', 'st-row st-go');
  const down = el('button', 'st-go-btn', '> down');
  const up = el('button', 'st-go-btn', '> up');
  down.type = 'button';
  up.type = 'button';
  down.addEventListener('click', () => onDown());
  up.addEventListener('click', () => onUp());
  go.append(down, up);

  const readout = el('div', 'st-readout');
  bottom.append(targetRow, frame.row, black.row, own.row, go, readout);

  // ---- shown again after hide ----
  const show = el('button', 'st-show', 'stairs');
  show.type = 'button';
  hide.addEventListener('click', () => setOpen(false));
  show.addEventListener('click', () => setOpen(true));

  root.append(top, bottom, show);
  document.body.append(root);

  let open = true;
  let last = null; // what was last played: { way, key, frames, ms }

  function setOpen(on) {
    open = on;
    root.classList.toggle('closed', !on);
    place();
  }

  // Tapping an animation picks it for down, up or both, and plays it.
  function pick(key) {
    settings.focus = key;
    if (settings.target !== 'up') settings.down = key;
    if (settings.target !== 'down') settings.up = key;
    changed();
    if (settings.target === 'up') onUp();
    else onDown();
  }

  function describe(key) {
    const a = byKey[key];
    const o = settings.opts[key];
    const parts = [];
    if (a.n) parts.push(`${a.n.name} ${o.n}`);
    if (a.black !== null) parts.push(`black ${o.black}`);
    return parts.length ? `${a.name} (${parts.join(', ')})` : a.name;
  }

  function draw() {
    for (const [key, b] of buttons) {
      b.classList.toggle('focus', key === settings.focus);
      b.classList.toggle('down', key === settings.down);
      b.classList.toggle('up', key === settings.up);
      b.querySelector('.st-marks').textContent = (key === settings.down ? '↓' : '') + (key === settings.up ? '↑' : '');
    }
    for (const [t, b] of targets) b.classList.toggle('on', t === settings.target);
    const a = byKey[settings.focus];
    source.textContent = `${a.name}: ${a.source}`;
    frame.input.value = settings.frame;
    frame.value.textContent = `${settings.frame} ms`;
    const o = settings.opts[settings.focus];
    black.row.hidden = a.black === null;
    black.input.value = o.black;
    black.value.textContent = `${o.black} frame${o.black === 1 ? '' : 's'}`;
    own.row.hidden = !a.n;
    if (a.n) {
      own.name.textContent = a.n.name;
      own.input.min = a.n.min;
      own.input.max = a.n.max;
      own.input.value = o.n;
      own.value.textContent = String(o.n);
    }
    const lastLine = last ? `last: ${last.way} · ${byKey[last.key].name} · ${last.frames} frames · ${last.ms} ms` : 'last: none yet';
    readout.textContent = `${lastLine}\ndown: ${describe(settings.down)}\nup: ${describe(settings.up)}\nframe ${settings.frame} ms`;
  }

  function changed() {
    store(settings);
    draw();
  }

  // The panels sit above and below the map, wherever the page has put it.
  function place() {
    const r = mapWrap.getBoundingClientRect();
    Object.assign(top.style, { left: `${r.left}px`, width: `${r.width}px`, top: '0px', height: `${Math.max(0, r.top)}px` });
    Object.assign(bottom.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${r.bottom}px`, height: `${Math.max(0, innerHeight - r.bottom)}px` });
  }
  addEventListener('resize', place);
  if (window.ResizeObserver) new ResizeObserver(place).observe(mapWrap);
  requestAnimationFrame(place);
  setTimeout(place, 300);

  draw();
  return {
    settings,
    played(info) {
      last = info;
      draw();
    },
  };
}
