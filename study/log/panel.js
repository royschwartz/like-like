// The log study's panel. On a phone it sits under the map, over the buttons, and the map
// can still be played; on a wide screen it sits beside the game. Its first row puts lines in
// the log; the rest is how they show. Every number is a first guess, kept in localStorage.

const KEY = 'likelike.study.log.1';

export const DEFAULTS = {
  blinks: 2, // off-and-on blinks; past 8, until the next action
  off: 2, // frames off in a blink
  on: 2, // frames on in a blink, and before the first if it starts on
  frame: 70, // ms, the game's frame
  starts: 'on', // a new line first shows on, or off
  offIs: 'gone', // what off looks like: gone, dim, inverse
  repeat: 'line', // a count going up blinks the line, or its count alone
  apart: 0, // ms between the first line's blink and the second's; 0, together
  lit: 'bright', // how the latest action's lines are lit: bright, inverse
  older: 60, // older lines' brightness, %
  space: 'even', // the gap above every entry: even, or grouped (the game's now)
  gap: 0.72, // em
};

const RANGES = {
  blinks: { min: 0, max: 9, step: 1 },
  off: { min: 1, max: 8, step: 1 },
  on: { min: 1, max: 8, step: 1 },
  frame: { min: 30, max: 200, step: 10 },
  apart: { min: 0, max: 700, step: 10 },
  older: { min: 20, max: 100, step: 5 },
  gap: { min: 0.24, max: 1.6, step: 0.04 },
};

const CHOICES = {
  starts: ['on', 'off'],
  offIs: ['gone', 'dim', 'inverse'],
  repeat: ['line', 'count'],
  lit: ['bright', 'inverse'],
  space: ['even', 'grouped'],
};

const clamp = (v, { min, max, step }) => Number((Math.round(Math.min(max, Math.max(min, Number(v))) / step) * step).toFixed(2));

function load() {
  const s = { ...DEFAULTS };
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return s;
  for (const [k, r] of Object.entries(RANGES)) if (Number.isFinite(Number(saved[k]))) s[k] = clamp(saved[k], r);
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(saved[k])) s[k] = saved[k];
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

const button = (cls, text, onClick) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

// How many frames a new line's blink takes, and the words for it.
export function blinkFrames(s) {
  const n = s.blinks > 8 ? 1 : s.blinks;
  return (s.starts === 'on' ? s.on : 0) + n * (s.off + s.on);
}

export function createPanel({ screen, mapWrap, onSay, onChange }) {
  const settings = load();
  const root = el('div', '');
  root.id = 'study';
  const panel = el('div', 'st-panel');

  const head = el('div', 'st-head');
  head.append(el('span', 'st-title', 'log study'));
  const headButtons = el('span', 'st-head-buttons');
  headButtons.append(
    button('st-small', 'defaults', () => {
      Object.assign(settings, DEFAULTS);
      changed();
    }),
    button('st-small', 'hide', () => setOpen(false)),
  );
  head.append(headButtons);

  // ---- lines into the log, his words ----
  const sayRow = el('div', 'st-row st-say');
  const said = el('div', 'st-note');
  const sayButton = (label, which) => button('st-go-btn', label, () => {
    said.textContent = onSay(which) ? '' : 'close the page or menu first';
  });
  sayRow.append(
    sayButton('> one line', 'one'),
    sayButton('> two at once', 'two'),
    sayButton('> again', 'again'),
    button('st-go-btn', '> blink again', () => api.replay?.()),
  );

  // ---- rows ----
  const rows = new Map(); // key -> { draw }
  const slider = (key, label, show) => {
    const r = RANGES[key];
    const row = el('label', 'st-row st-slider');
    const input = el('input');
    input.type = 'range';
    input.min = r.min;
    input.max = r.max;
    input.step = r.step;
    const value = el('span', 'st-value');
    input.addEventListener('input', () => {
      settings[key] = clamp(input.value, r);
      changed();
    });
    row.append(el('span', 'st-label', label), input, value);
    rows.set(key, {
      row,
      draw() {
        input.value = settings[key];
        value.textContent = show(settings[key]);
      },
    });
    return row;
  };
  const segments = (key, label) => {
    const row = el('div', 'st-row');
    row.append(el('span', 'st-label', label));
    const bs = CHOICES[key].map((c) => {
      const b = button('st-seg', c, () => {
        settings[key] = c;
        changed();
      });
      row.append(b);
      return [c, b];
    });
    rows.set(key, {
      row,
      draw() {
        for (const [c, b] of bs) b.classList.toggle('on', settings[key] === c);
      },
    });
    return row;
  };
  const section = (text) => el('div', 'st-section', text);

  const readout = el('div', 'st-readout');
  const now = el('div', 'st-now');

  panel.append(
    head,
    sayRow,
    said,
    section('blink'),
    slider('blinks', 'blinks', (v) => (v > 8 ? 'until next' : String(v))),
    slider('off', 'frames off', String),
    slider('on', 'frames on', String),
    slider('frame', 'frame', (v) => `${v} ms`),
    segments('starts', 'starts'),
    segments('offIs', 'off is'),
    segments('repeat', 'a count blinks'),
    slider('apart', 'second line after', (v) => (v ? `${v} ms` : 'together')),
    section('lit'),
    segments('lit', 'latest lines'),
    slider('older', 'older lines', (v) => `${v}%`),
    segments('space', 'spacing'),
    slider('gap', 'gap', (v) => `${v.toFixed(2)} em`),
    readout,
    now,
  );

  const show = button('st-show', 'log study', () => setOpen(true));
  root.append(panel, show);
  document.body.append(root);

  function describe() {
    const s = settings;
    const frames = blinkFrames(s);
    const n = s.blinks > 8 ? 'until the next action' : `${s.blinks}×`;
    const first = s.starts === 'on' ? `on ${s.on}, then ` : '';
    const blink = s.blinks === 0 ? 'none, a new line just appears' : `${first}(off ${s.off}, on ${s.on}) ${n}`;
    const length = s.blinks > 8 ? `${s.frame} ms frames, blinking on` : `${frames} frames × ${s.frame} ms = ${frames * s.frame} ms`;
    const two = s.apart ? `the second line starts ${s.apart} ms after the first` : 'two lines blink together';
    const lit = `${s.lit === 'bright' ? 'lit bright' : 'lit in inverse'}: every line of the latest action · older ${s.older}%`;
    const gap = `${s.space === 'even' ? 'every entry' : 'entries, one action closer'} ${s.gap.toFixed(2)} em apart`;
    return [`blink: ${blink}`, s.blinks ? length : '', `off is ${s.offIs} · a count blinks the ${s.repeat === 'count' ? 'count alone' : 'whole line'}`, two, lit, gap]
      .filter(Boolean)
      .join('\n');
  }

  function draw() {
    for (const r of rows.values()) r.draw();
    readout.textContent = describe();
  }

  function changed() {
    store(settings);
    draw();
    onChange({ ...settings });
  }

  function setOpen(on) {
    root.classList.toggle('closed', !on);
    place();
  }

  // Beside the game if there's room, else under the map, over the buttons.
  function place() {
    const slab = screen.getBoundingClientRect();
    const map = mapWrap.getBoundingClientRect();
    const side = slab.left >= 280;
    root.classList.toggle('side', side);
    if (side) {
      const width = Math.min(360, slab.left - 16);
      Object.assign(panel.style, { left: `${slab.left - width - 8}px`, width: `${width}px`, top: '0px', height: `${innerHeight}px` });
    } else {
      Object.assign(panel.style, { left: `${map.left}px`, width: `${map.width}px`, top: `${map.bottom}px`, height: `${Math.max(0, innerHeight - map.bottom)}px` });
    }
  }
  addEventListener('resize', place);
  if (window.ResizeObserver) new ResizeObserver(place).observe(mapWrap);
  requestAnimationFrame(place);
  setTimeout(place, 300);

  draw();

  const api = {
    settings,
    replay: null,
    blinking(info) {
      now.textContent = info
        ? `now: frame ${info.frame} of ${info.total === Infinity ? '∞' : info.total} · ${info.lines} ${info.lines === 1 ? 'line' : 'lines'}`
        : 'now: still';
    },
  };
  api.blinking(null);
  return api;
}
