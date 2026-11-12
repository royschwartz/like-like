// Draws a View into the page. Builds the elements once, then touches only what changed.
// Gets views and events only; never sees the game object.

import { paintCell } from './palette.js';
import { TEXT } from './text.js';
import { CONFIG } from './config.js';

const SIZE = CONFIG.roomSize;
const LOG_KEEP = 12; // lines kept in #log-lines
const FX_SAFETY_MS = 900; // remove an effect class even if no animationend comes
const SCREEN_SAFETY_MS = 1300; // longer: fx-death runs 1000 ms
const SLIDE_SAFETY_MS = 400; // same, for the room slide
const DIRS = ['n', 'e', 's', 'w'];
const SCREEN_FX = ['fx-hurt', 'fx-death', 'fx-descend', 'fx-sense'];
const PASSAGE_STAGGER_MS = 650; // passages that come together come in one after another

export function createRenderer(root = document) {
  const $ = (id) => root.querySelector('#' + id);
  const screen = $('screen');
  const mapWrap = $('map-wrap');
  const map = $('map');
  const logLines = $('log-lines');
  const invEl = $('inv');
  const invTitle = $('inv-title');
  const invRows = $('inv-rows');
  const eventEl = $('event');
  const eventLines = $('event-lines');
  const controls = $('controls');
  const btnContext = $('btn-context');
  const menuButtons = { inv: $('btn-inv'), psy: $('btn-psy'), act: $('btn-act'), sys: $('btn-sys') };
  const btnWait = $('btn-wait');
  const btnUse = $('btn-use');
  const optButtons = [0, 1, 2, 3].map((i) => root.querySelector(`#options [data-choose="${i}"]`));

  const cells = buildMap(map);
  const lastPaint = new Array(SIZE * SIZE).fill(null);
  const stats = buildStats($('stats'));
  const logEls = new Map(); // Line.id -> { el, text, turn }
  let invKey = null; // what the inventory screen last showed
  let eventKey = null; // what the event panel last showed
  let eventDrawn = { sig: null, texts: [] }; // the open event, and the text of each passage drawn
  const fx = createFx();
  let slide = null; // { ghost, dirClass, timer }

  function draw(view, events = []) {
    if (!view) return;
    events = Array.isArray(events) ? events : [];

    const room = events.find((e) => e && e.type === 'room' && DIRS.includes(e.dir));
    if (room) startSlide(room.dir);

    drawLook(view);
    drawMap(view);
    drawLog(view.log, view.fresh);
    drawScreenMode(view);
    drawInv(view.inv);
    drawEvent(view.event);
    drawStats(view.stats);
    drawButtons(view);
    // In an event, its options are the menu at the bottom.
    drawOptions(view.event ? { id: 'event', options: view.event.options, cursor: view.event.cursor } : view.menu);

    for (const e of events) cellEffect(e);
    for (const e of events) screenEffect(e, view);
  }

  // --- map ---

  function drawMap(view) {
    const list = Array.isArray(view.cells) ? view.cells : [];
    const p = view.player || { x: -99, y: -99 };
    const env = { look: view.look, px: p.x, py: p.y, key: view.room ? view.room.key : 0 };
    for (let i = 0; i < SIZE * SIZE; i++) {
      const x = i % SIZE;
      const y = (i - x) / SIZE;
      const paint = paintCell(list[i] || null, x, y, env);
      const last = lastPaint[i];
      if (last && last.ch === paint.ch && last.fg === paint.fg && last.bg === paint.bg && last.bold === paint.bold) {
        continue;
      }
      const el = cells[i];
      if (!last || last.ch !== paint.ch) el.textContent = paint.ch;
      if (!last || last.fg !== paint.fg) el.style.color = paint.fg;
      if (!last || last.bg !== paint.bg) el.style.backgroundColor = paint.bg;
      if (!last || last.bold !== paint.bold) el.classList.toggle('b', !!paint.bold);
      lastPaint[i] = paint;
    }
  }

  function drawLook(view) {
    if (view.look && screen.getAttribute('data-look') !== view.look) screen.setAttribute('data-look', view.look);
  }

  // --- room slide ---

  function startSlide(dir) {
    endSlide();
    const ghost = map.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = `map ghost out-${dir}`;
    for (const c of ghost.children) c.className = c.classList.contains('b') ? 'c b' : 'c';
    mapWrap.appendChild(ghost);
    const dirClass = `in-${dir}`;
    map.classList.remove(...DIRS.map((d) => `in-${d}`));
    void map.offsetWidth;
    map.classList.add(dirClass);
    const done = (e) => {
      if (e && e.target !== ghost && e.target !== map) return;
      endSlide();
    };
    ghost.addEventListener('animationend', done);
    map.addEventListener('animationend', onMapSlideEnd);
    slide = { ghost, dirClass, done, timer: setTimeout(endSlide, SLIDE_SAFETY_MS) };
  }

  function onMapSlideEnd(e) {
    if (slide && e.target === map && String(e.animationName || '').startsWith('in-')) endSlide();
  }

  function endSlide() {
    if (!slide) return;
    clearTimeout(slide.timer);
    slide.ghost.removeEventListener('animationend', slide.done);
    if (slide.ghost.parentNode) slide.ghost.parentNode.removeChild(slide.ghost);
    map.removeEventListener('animationend', onMapSlideEnd);
    map.classList.remove(slide.dirClass);
    slide = null;
  }

  // --- effects ---

  function cellEffect(e) {
    if (!e || !inRoom(e.x, e.y)) return;
    const el = cells[e.y * SIZE + e.x];
    if (e.type === 'attack') fx.play(el, e.hit ? 'fx-hit' : 'fx-miss');
    else if (e.type === 'kill') fx.play(el, 'fx-kill');
    else if (e.type === 'observe') fx.play(el, 'fx-observe');
  }

  function screenEffect(e, view) {
    if (!e) return;
    if (e.type === 'attack' && e.by !== 'player' && e.hit) fx.play(screen, 'fx-hurt', SCREEN_FX);
    else if (e.type === 'death') fx.play(screen, 'fx-death', SCREEN_FX);
    else if (e.type === 'descend' || e.type === 'restart') fx.play(screen, 'fx-descend', SCREEN_FX);
    else if (e.type === 'sense') {
      const p = view.player || { x: (SIZE - 1) / 2, y: (SIZE - 1) / 2 };
      mapWrap.style.setProperty('--sx', pct(p.x));
      mapWrap.style.setProperty('--sy', pct(p.y));
      fx.play(screen, 'fx-sense', SCREEN_FX);
    }
  }

  // --- log: one list. The lines the latest action said are bright; older ones dim. ---

  function drawLog(log, fresh) {
    const lines = Array.isArray(log) ? log.filter(Boolean).slice(-LOG_KEEP) : [];
    const freshFrom = Number.isInteger(fresh) ? fresh : lines.length ? lines[lines.length - 1].id : 0;
    const keep = new Set();

    lines.forEach((line, i) => {
      let rec = logEls.get(line.id);
      if (rec && (rec.text !== line.text || rec.turn !== line.turn)) {
        // Same id but a different line (e.g. a new game restarted the ids).
        rec.el.remove();
        logEls.delete(line.id);
        rec = null;
      }
      if (!rec) {
        const el = logLines.ownerDocument.createElement('div');
        el.textContent = line.text == null ? '' : String(line.text);
        rec = { el, text: line.text, turn: line.turn, kind: null };
        logEls.set(line.id, rec);
        el.className = 'line';
        fx.play(el, 'enter');
      }
      if (rec.kind !== line.kind) {
        if (rec.kind) rec.el.classList.remove(`k-${rec.kind}`);
        rec.el.classList.add(`k-${line.kind}`);
        rec.kind = line.kind;
      }
      const now = line.id >= freshFrom;
      rec.el.classList.toggle('now', now);
      rec.el.classList.toggle('old', !now);
      if (logLines.children[i] !== rec.el) logLines.insertBefore(rec.el, logLines.children[i] || null);
      keep.add(line.id);
    });

    for (const [id, rec] of logEls) {
      if (!keep.has(id)) {
        rec.el.remove();
        logEls.delete(id);
      }
    }
  }

  // --- the inventory: a list in place of the map ---

  // What takes the slab: an event, the inventory, or the game.
  function drawScreenMode(view) {
    const mode = view.event ? 'event' : view.inv ? 'inv' : null;
    if (mode) setAttr(screen, 'data-screen', mode);
    else screen.removeAttribute('data-screen');
  }

  function drawInv(inv) {
    const open = !!inv;
    if (!invEl) return;
    invEl.hidden = !open;
    const items = open && Array.isArray(inv.items) ? inv.items : [];
    const key = open ? JSON.stringify([inv.title, inv.cursor, items]) : '';
    if (key === invKey) return;
    invKey = key;
    setText(invTitle, open && inv.title != null ? String(inv.title) : '');
    while (invRows.firstChild) invRows.removeChild(invRows.firstChild);
    items.forEach((it, i) => {
      const doc = invRows.ownerDocument;
      const row = doc.createElement('div');
      row.className = i === inv.cursor ? 'row cursor' : 'row';
      row.dataset.pick = String(i);
      const name = doc.createElement('span');
      name.className = 'name';
      name.textContent = it && it.name != null ? String(it.name) : '';
      const state = doc.createElement('span');
      state.className = 'state';
      state.textContent = it && it.state != null ? String(it.state) : '';
      row.appendChild(name);
      row.appendChild(state);
      invRows.appendChild(row);
    });
  }

  // --- an event: the whole slab but the options. Passages stack up; older ones dim. ---

  function drawEvent(event) {
    if (!eventEl) return;
    if (!event) {
      eventEl.hidden = true;
      eventKey = null;
      eventDrawn = { sig: null, texts: [] };
      return;
    }
    const lines = Array.isArray(event.lines) ? event.lines.filter(Boolean) : [];
    const key = JSON.stringify([event.id, event.now, lines]);
    if (key === eventKey) return;
    eventKey = key;
    const groups = [];
    for (const l of lines) {
      const n = Number.isInteger(l.passage) && l.passage >= 0 ? l.passage : 0;
      (groups[n] = groups[n] || []).push(l);
    }
    // The same event keeps the passages it already shows still, and brings in only
    // the ones that are new or changed.
    const sig = `${event.id}|${lines.length ? lines[0].text : ''}`;
    const texts = groups.map((group) => JSON.stringify(group || []));
    let from = 0;
    if (!eventEl.hidden && eventDrawn.sig === sig) {
      while (from < texts.length && texts[from] === eventDrawn.texts[from]) from++;
    }
    if (eventEl.hidden) {
      eventEl.hidden = false;
      fx.play(eventEl, 'opening');
    }
    const doc = eventLines.ownerDocument;
    while (eventLines.firstChild) eventLines.removeChild(eventLines.firstChild);
    groups.forEach((group, n) => {
      const box = doc.createElement('div');
      box.className = 'passage ' + (n >= event.now ? 'now' : 'old') + (n >= from ? ' enter' : '');
      if (n > from) box.style.animationDelay = `${(n - from) * PASSAGE_STAGGER_MS}ms`;
      for (const l of group || []) {
        const el = doc.createElement('div');
        el.className = l.song ? 'ev-line song' : 'ev-line';
        el.textContent = l.text == null ? '' : String(l.text);
        box.appendChild(el);
      }
      eventLines.appendChild(box);
    });
    eventDrawn = { sig, texts };
  }

  // --- stats ---

  function drawStats(s) {
    s = s || {};
    setStat(stats.str, s.str);
    setStat(stats.love, s.love);
    const hpKnown = s.hp != null && s.maxHp != null;
    setStat(stats.hp, hpKnown ? `${s.hp}/${s.maxHp}` : null);
    stats.hp.wrap.classList.toggle('hurt', hpKnown && s.hp < s.maxHp);
    stats.hp.wrap.classList.toggle('low', s.hp != null && s.hp <= 1);
  }

  // --- buttons ---

  function drawButtons(view) {
    for (const id of Object.keys(menuButtons)) setText(menuButtons[id], TEXT.button[id] ?? '');
    // On the inventory screen the inv button is the way back.
    if (view.inv) setText(menuButtons.inv, TEXT.menu.back ?? '');
    setText(btnWait, TEXT.button.wait ?? '');
    setText(btnUse, TEXT.button.use ?? '');
    const ctx = view.context || {};
    setText(btnContext, ctx.label == null ? '' : ctx.label);
    if (ctx.id) setAttr(btnContext, 'data-context', ctx.id);
    else btnContext.removeAttribute('data-context');
  }

  function drawOptions(menu) {
    if (menu && menu.id != null) setAttr(controls, 'data-menu', menu.id);
    else controls.removeAttribute('data-menu');

    const opts = menu && Array.isArray(menu.options) ? menu.options : [];
    optButtons.forEach((btn, i) => {
      if (!btn) return;
      const o = opts[i] || null;
      setText(btn, o ? String(o.label ?? '') : '');
      if (o && o.kind) setAttr(btn, 'data-kind', o.kind);
      else btn.removeAttribute('data-kind');
      btn.disabled = !!(o && o.disabled);
      btn.classList.toggle('empty', !o);
      btn.classList.toggle('cursor', !!(o && menu.cursor === i));
    });
  }

  return { draw };
}

// --- building, once ---

function buildMap(map) {
  const doc = map.ownerDocument;
  while (map.firstChild) map.removeChild(map.firstChild);
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const c = doc.createElement('span');
    c.className = 'c';
    c.dataset.cell = String(i);
    map.appendChild(c);
    cells.push(c);
  }
  return cells;
}

function buildStats(box) {
  const doc = box.ownerDocument;
  while (box.firstChild) box.removeChild(box.firstChild);
  const make = (key) => {
    const wrap = doc.createElement('span');
    wrap.className = key === 'hp' ? 'stat hp' : 'stat';
    const k = doc.createElement('span');
    k.className = 'k';
    k.textContent = TEXT.stat[key];
    const v = doc.createElement('span');
    v.className = 'v';
    wrap.appendChild(k);
    wrap.appendChild(v);
    box.appendChild(wrap);
    return { wrap, v, value: undefined };
  };
  return { str: make('str'), love: make('love'), hp: make('hp') };
}

function setStat(stat, value) {
  if (stat.value === value) return;
  stat.value = value;
  const unknown = value == null;
  stat.v.textContent = unknown ? TEXT.stat.unknown : String(value);
  stat.v.classList.toggle('unknown', unknown);
}

// --- effect classes: add, restart on re-add, remove on animationend or a safety timeout ---

function createFx() {
  const running = new WeakMap(); // el -> Map(cls -> timer)

  function play(el, cls, group = null) {
    const safety = group ? SCREEN_SAFETY_MS : FX_SAFETY_MS;
    let mine = running.get(el);
    if (!mine) {
      mine = new Map();
      running.set(el, mine);
      el.addEventListener('animationend', (e) => onEnd(el, e, group));
    }
    if (mine.has(cls)) clearTimeout(mine.get(cls));
    el.classList.remove(cls);
    void el.offsetWidth; // reflow, so the animation starts again
    el.classList.add(cls);
    mine.set(cls, setTimeout(() => stop(el, cls), safety));
  }

  function onEnd(el, e, group) {
    const mine = running.get(el);
    if (!mine || mine.size === 0) return;
    const name = e.animationName;
    if (mine.has(name)) return stop(el, name);
    // Screen effects bubble from children and must match by name; an element's own
    // animation with another name ends its only running effect.
    if (!group && e.target === el && mine.size === 1) stop(el, mine.keys().next().value);
  }

  function stop(el, cls) {
    const mine = running.get(el);
    if (mine && mine.has(cls)) {
      clearTimeout(mine.get(cls));
      mine.delete(cls);
    }
    el.classList.remove(cls);
  }

  return { play };
}

// --- small helpers ---

function inRoom(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

function pct(n) {
  return `${(((n + 0.5) / SIZE) * 100).toFixed(3)}%`;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setAttr(el, name, value) {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
}
