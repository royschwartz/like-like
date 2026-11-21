// Draws a View into the page. Builds the elements once, then touches only what changed.
// Gets views and events only; never sees the game object.

import { paintCell } from './palette.js';
import { TEXT } from './text.js';
import { CONFIG } from './config.js';
import { createMarks } from './marks.js';

const LOG_KEEP = 12; // lines kept in #log-lines
const FX_SAFETY_MS = 900; // remove an effect class even if no animationend comes
const SCREEN_SAFETY_MS = 1300;
const SLIDE_SAFETY_MS = 900;
const DIRS = ['n', 'e', 's', 'w'];
const JOLT_FX = ['fx-jolt', 'fx-hurt'];
const COVER_FX = ['fx-death', 'fx-descend'];
// The classes of the sense wave: an open cell the front crosses, one that takes it in, and a
// unit (the toad, the bust), whose icon steps instead: "the individual icon (not the square)".
const WAVE_FX = ['fx-wave', 'fx-absorb', 'fx-wave-icon'];
const CELL_FX = ['fx-hit', 'fx-miss', 'fx-kill', 'fx-observe', 'fx-dig', 'fx-unlock', ...WAVE_FX];

// withMarks: draw the marks round a held or aimed square (marks.js). The marks study
// draws its own, so it turns these off.
// moreMark: the esoteric edition's square for "more", a new version of it each call: given,
// it is set as --more on the stat row once and on each item listed as it is made.
// stairs: the edition's way of going up and down stairs (esoteric/stairs.js), made with
// { host, size, num, paint }; without it, taking stairs blacks the map for two frames.
export function createRenderer(root = document, { marks: withMarks = true, cellPainter = paintCell, size = CONFIG.roomSize, moreMark = null, stairs: makeStairs = null } = {}) {
  const $ = (id) => root.querySelector('#' + id);
  const screen = $('screen');
  const map = $('map');
  const mapHost = map.parentElement; // the grid, its marks and any sliding copy share this box
  const mapField = $('map-field'); // the inset frame of the esoteric room
  const logLines = $('log-lines');
  const invEl = $('inv');
  const invTitle = $('inv-title');
  const invRows = $('inv-rows');
  const eventEl = $('event');
  const eventLines = $('event-lines');
  const eventLinks = $('event-links');
  const eventItems = $('event-items'); // esoteric: things listed under the text, not choices
  const eventMenu = $('btn-event-sys');
  const controls = $('controls');
  const btnContext = $('btn-context');
  const btnSecondary = $('btn-secondary');
  const btnMemories = $('btn-memories');
  const statRow = $('stats');
  const menuButtons = { inv: $('btn-inv'), psy: $('btn-psy'), act: $('btn-act'), sys: $('btn-sys') };
  const btnWait = $('btn-wait');
  const btnUse = $('btn-use');
  const optButtons = [0, 1, 2, 3].map((i) => root.querySelector(`#options [data-choose="${i}"]`));

  screen.style.setProperty('--room-size', size);
  if (moreMark) statRow.style.setProperty('--more', moreMark());
  const cells = buildMap(map, size);
  const lastPaint = new Array(size * size).fill(null);
  const stats = buildStats(statRow);
  const logEls = new Map(); // Line.id -> { el, text, turn }
  let invKey = null; // what the inventory screen last showed
  let eventKey = null; // what the event panel last showed
  let eventDrawn = { sig: null, texts: [] }; // the open event, and the text of each passage drawn
  let passageTimer = null;
  let linksKey = null;
  let roomKey = null;
  let canBlink = false;
  const fx = createFx();
  let slide = null; // { ghost, dirClass, timer }
  let wave = null; // the sense wave while it is going: { els, timer }
  // The trail: the cells of the way a fast move would walk (or is walking), whether it is a
  // fast move's way ahead (route) rather than a drag's, and the cell a drag is aimed at.
  const trail = { els: [], route: false, aimEl: null };
  let lookEl = null; // the cell doing its observing blink
  let shown = null; // the view last drawn
  let lastTurn = null;
  const win = screen.ownerDocument.defaultView;
  const style = win.getComputedStyle(screen);
  const num = (name, fallback) => {
    const n = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  };
  const frameMs = num('--f', 70);
  const passageMs = frameMs * num('--ev-every', 4);
  const paceChoices = screen.ownerDocument.documentElement.dataset.edition === 'esoteric';
  const blinkMs = frameMs * num('--blink-on', 2);
  const blinkEveryMs = frameMs * num('--blink-every', 28);
  const stepMs = frameMs * num('--step-on', 5); // a unit's icon stepping to white and back
  // The times a press on the map runs by. input.js and main.js wait on these, so there is
  // one clock.
  const timing = {
    frameMs,
    graceMs: frameMs * num('--hold-grace', 2), // held this long, the observing blink starts
    lookMs: frameMs * num('--look-on', 4), // the observing blink; held through it, you observe
    stepMs: frameMs * num('--travel-step', 1), // a fast move's step
    slideMs: (frameMs / 2) * size, // a room sliding in: --slide-step, half a frame, a tile
  };
  // going up and down stairs, if the edition has its own way (decision 346)
  const stairs = makeStairs ? makeStairs({ host: mapHost, size, num, paint: cellPainter }) : null;
  // the marks round the square under a finger (--mark-* in style.css)
  const marks = withMarks ? createMarks(mapHost, { size, frameMs, num, dragCorners: !mapField }) : null;
  // The blink: about every two seconds, all in step. An item in the inventory goes white for
  // a couple of frames ("blink"); a unit's icon on the map steps to white and back ("stepping").
  // Nothing blinks while a sense wave is going; when the wave ends the blinking starts
  // again from there, so the first blink comes just after the wave and never during it.
  let blinkOff = null;
  let stepOff = null;
  let blinkNext = null;
  function blinkLoop(wait) {
    clearTimeout(blinkNext);
    blinkNext = setTimeout(() => {
      blinkLoop(blinkEveryMs);
      if (!canBlink || wave || screen.ownerDocument.hidden) return;
      screen.classList.add('blink', 'stepping');
      clearTimeout(blinkOff);
      clearTimeout(stepOff);
      blinkOff = setTimeout(() => screen.classList.remove('blink'), blinkMs);
      stepOff = setTimeout(() => screen.classList.remove('stepping'), stepMs);
    }, wait);
  }
  blinkLoop(blinkEveryMs);
  map.addEventListener('animationend', onWaveCellEnd);

  function draw(view, events = []) {
    if (!view) return;
    events = Array.isArray(events) ? events : [];
    const before = shown;
    shown = view;

    const nextRoom = `${view.depth}:${view.room?.id}:${view.room?.key}`;
    const fresh = nextRoom !== roomKey || events.some((e) => e.type === 'death' || e.type === 'restart');
    if (mapField && (fresh || view.event || view.inv || view.menu)) {
      for (const cls of JOLT_FX) fx.stop(screen, cls);
    }
    if (fresh) {
      stopWave();
      clearTrail();
      dropLook();
      if (marks) marks.clear();
      for (const cell of cells) for (const cls of CELL_FX) fx.stop(cell, cls);
      endSlide();
      if (stairs) stairs.stop();
      roomKey = nextRoom;
    }
    // An event or the inventory takes the map's place: a wave under it is dropped, so
    // none of it is left to finish when the map comes back.
    if (view.event || view.inv) stopWave();
    // and a menu over it, or either, takes the marks away
    if (marks && (view.event || view.inv || view.menu)) marks.clear();
    const room = events.find((e) => e && e.type === 'room' && DIRS.includes(e.dir));
    if (room) startSlide(room.dir);

    // Taking stairs: the map still shows the floor you were on until it is drawn.
    const stairway = stairs ? events.find((e) => e && (e.type === 'descend' || e.type === 'ascend')) : null;
    const oldMap = stairway ? map.cloneNode(true) : null;

    drawLook(view);
    drawMap(view);
    const onStairs = !!oldMap && stairs.play({ oldMap, newMap: map.cloneNode(true), before, after: view, way: stairway.type === 'descend' ? 'down' : 'up' });
    drawLog(view.log, view.fresh);
    drawScreenMode(view);
    drawInv(view.inv);
    drawEvent(view.event);
    if (paceChoices && !view.event && (before?.event || before?.menu?.id !== view.menu?.id)) {
      stopPassages();
      if (view.menu) streamPassages(); // A map menu has no opening paragraph.
    }
    drawEventLinks(view.event, view.menu);
    drawStats(view.stats);
    drawButtons(view);
    drawOptions(view.event ? null : view.menu);
    // What can blink: on the map, a unit with something new to observe; in the inventory,
    // an item with something new to inspect. The sense button never blinks.
    const blinkers = view.inv ? view.inv.items : view.cells;
    canBlink = !view.event && !view.menu && Array.isArray(blinkers) && blinkers.some((c) => c && c.more);
    if (!canBlink) screen.classList.remove('blink', 'stepping');

    const died = events.some((e) => e.type === 'death');
    for (const e of events) {
      // The map already shows the entrance after death; the old room's tile effects
      // must not flash unrelated squares there. The screen still jolts and flashes.
      if (!died) cellEffect(e, view);
      // the stairs' own animation takes the place of the black
      if (!(onStairs && (e.type === 'descend' || e.type === 'ascend'))) screenEffect(e);
    }
    if (!died) drawTrail(view, events);
    lastTurn = view.turn;
  }

  // --- map ---

  function inRoom(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
  }

  function drawMap(view) {
    const list = Array.isArray(view.cells) ? view.cells : [];
    const p = view.player || { x: -99, y: -99 };
    const env = { look: view.look, px: p.x, py: p.y, key: view.room ? view.room.key : 0, cells: list, size, turn: view.turn ?? 0 };
    for (let i = 0; i < size * size; i++) {
      const x = i % size;
      const y = (i - x) / size;
      const paint = cellPainter(list[i] || null, x, y, env);
      const last = lastPaint[i];
      const el = cells[i];
      el.classList.toggle('more', !!list[i]?.more);
      if (last?.passage !== paint.passage) {
        if (paint.passage) el.dataset.passage = paint.passage;
        else delete el.dataset.passage;
      }
      if (last?.mask !== paint.mask) {
        if (paint.mask) el.style.setProperty('--drawing', paint.mask);
        else el.style.removeProperty('--drawing');
        el.toggleAttribute('data-drawing', !!paint.mask);
      }
      if (last?.glints !== paint.glints) {
        if (paint.glints) el.style.setProperty('--glints', paint.glints);
        else el.style.removeProperty('--glints');
        el.toggleAttribute('data-glints', !!paint.glints);
      }
      if (last?.glintInk !== paint.glintInk) {
        if (paint.glintInk) el.style.setProperty('--glint-ink', paint.glintInk);
        else el.style.removeProperty('--glint-ink');
      }
      if (last?.label !== paint.label) {
        if (paint.label) {
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', paint.label);
        } else {
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
        }
      }
      if (!last || last.ch !== paint.ch) el.textContent = paint.ch;
      if (!last || last.fg !== paint.fg) el.style.setProperty('--fg', paint.fg);
      if (!last || last.bg !== paint.bg) el.style.setProperty('--bg', paint.bg);
      if (!last || last.bold !== paint.bold) el.classList.toggle('b', !!paint.bold);
      lastPaint[i] = paint;
    }
  }

  function drawLook(view) {
    if (view.look && screen.getAttribute('data-look') !== view.look) screen.setAttribute('data-look', view.look);
    // the lines round the buttons: style.css draws each step
    if (Number.isInteger(view.outlines)) setAttr(screen, 'data-outlines', view.outlines);
  }

  // --- room slide ---

  function startSlide(dir) {
    endSlide();
    const ghost = map.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.className = `map ghost out-${dir}`;
    for (const c of ghost.children) {
      c.className = c.classList.contains('b') ? 'c b' : 'c';
      c.removeAttribute('data-cell');
    }
    mapHost.appendChild(ghost);
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

  function cellEffect(e, view) {
    if (!e) return;
    if (e.type === 'sense') return startWave(e, view);
    if (!inRoom(e.x, e.y)) return;
    const el = cells[e.y * size + e.x];
    // An observation does not blink its cell: the hold before it already did (showLook).
    if (e.type === 'attack') fx.play(el, e.hit ? 'fx-hit' : 'fx-miss', CELL_FX);
    else if (e.type === 'kill') fx.play(el, 'fx-kill', CELL_FX);
    else if (e.type === 'dig') fx.play(el, 'fx-dig', CELL_FX);
    else if (e.type === 'unlock') fx.play(el, 'fx-unlock', CELL_FX);
  }

  // --- the sense wave ---
  // The rules say which cells the sensing reaches and on which step (d), and which of
  // them take it in (absorb). Each cell gets its step as --d and one class; style.css
  // waits d steps and then flashes it, so a front of flat colour moves out a ring a step
  // and the walls hold it a little longer. Sensing again starts it over from nothing.
  // Any other tile effect on a cell takes that cell out of the wave (one to a tile).
  function startWave(e, view) {
    stopWave();
    const list = Array.isArray(e.wave) ? e.wave : [];
    const f = num('--f', 70);
    const step = num('--sense-step', 0.5);
    const on = num('--sense-on', 1);
    const hold = num('--sense-absorb', 4);
    const stepOn = num('--step-on', 5);
    // Asked for less motion: nothing travels. Only your own square flashes.
    const still = !!win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const todo = [];
    let frames = 0; // how long the whole wave lasts
    for (const c of list) {
      if (!c || !inRoom(c.x, c.y) || !(c.d >= 0)) continue;
      if (still && c.d !== 0) continue;
      const i = c.y * size + c.x;
      // a cell you have never seen is drawn as nothing, and stays that way
      const seen = view.cells && view.cells[i];
      if (!seen || seen.state === 'unknown') continue;
      const el = cells[i];
      for (const cls of CELL_FX) fx.stop(el, cls);
      el.style.setProperty('--d', String(c.d));
      const unit = seen.thing?.kind === 'toad' || seen.t === 'statue';
      todo.push([el, unit ? 'fx-wave-icon' : c.absorb ? 'fx-absorb' : 'fx-wave']);
      frames = Math.max(frames, c.d * step + (unit ? stepOn : c.absorb ? hold : on));
    }
    if (!todo.length) return;
    void map.offsetWidth; // reflow, so a wave that was cut short starts again
    for (const [el, cls] of todo) el.classList.add(cls);
    screen.classList.remove('blink', 'stepping');
    // The timer is what ends the wave; it is set a frame past the last cell's last frame.
    wave = { els: todo.map((t) => t[0]), timer: setTimeout(endWave, (frames + 1) * f) };
  }

  // A cell's part in the wave is over: it goes back to being an ordinary cell.
  function onWaveCellEnd(e) {
    if (!WAVE_FX.includes(e.animationName) || !e.target.classList) return;
    e.target.classList.remove(...WAVE_FX);
    e.target.style.removeProperty('--d');
  }

  // Drop the wave at once, wherever it has got to, leaving nothing on the cells.
  function stopWave() {
    if (!wave) return;
    clearTimeout(wave.timer);
    for (const el of wave.els) {
      el.classList.remove(...WAVE_FX);
      el.style.removeProperty('--d');
    }
    wave = null;
  }

  // The wave has run its course: now what it found may blink, starting two frames on.
  function endWave() {
    stopWave();
    blinkLoop(frameMs * 2);
  }

  // --- the trail, as Brogue draws its travel route ---
  // A drag lights the way to the cell under the finger, bright, and marks that cell; main.js
  // says which (showAim, clearAim). A fast move keeps the way still ahead drawn dim, shorter
  // each step. Anything else that takes a turn, or takes the map away, clears it. Only
  // classes change here (style.css draws the wash), so drawMap's painting never fights it.
  function drawTrail(view, events) {
    if (view.event || view.inv || view.menu) return clearTrail();
    let travel = null;
    for (const e of events) if (e && e.type === 'travel') travel = e;
    if (travel) {
      setTrail(travel.path, view);
      trail.route = true;
      return;
    }
    const turned = lastTurn != null && view.turn !== lastTurn;
    if (turned || (trail.route && !view.going)) clearTrail();
  }

  // A drag over (x, y): the way there bright, and the cell marked steady.
  // The square is under the finger, so its corners are marked round it too.
  function showAim(x, y, path) {
    if (!shown || shown.event || shown.inv || shown.menu || !inRoom(x, y)) return clearAim();
    setTrail(path, shown);
    map.classList.add('trail-hot');
    trail.aimEl = cells[y * size + x];
    trail.aimEl.classList.add('aim');
    if (marks) marks.aim(x, y);
  }

  // The drag has nothing to go to: no way, no mark. A fast move's way is left alone.
  function clearAim() {
    if (marks) marks.aim(null, null);
    if (!trail.route) clearTrail();
  }

  // A tap, or letting go of a drag, that goes somewhere: the corners flash round where
  // the finger was, so you see which square it hit.
  function flashAim(x, y) {
    if (!marks || !shown || shown.event || shown.inv || shown.menu || !inRoom(x, y)) return;
    marks.flash(x, y);
  }

  function setTrail(path, view) {
    clearTrail();
    for (const c of Array.isArray(path) ? path : []) {
      if (!c || !inRoom(c.x, c.y)) continue;
      const i = c.y * size + c.x;
      // dark cells too: the way goes through them as if they were open
      cells[i].classList.add('trail');
      trail.els.push(cells[i]);
    }
  }

  function clearTrail() {
    for (const el of trail.els) el.classList.remove('trail');
    trail.els = [];
    trail.route = false;
    if (trail.aimEl) trail.aimEl.classList.remove('aim');
    trail.aimEl = null;
    map.classList.remove('trail-hot');
  }

  // --- the observing blink: a held cell blinks, and when it is done you observe ---

  function showLook(x, y) {
    dropLook();
    if (!inRoom(x, y)) return;
    lookEl = cells[y * size + x];
    fx.play(lookEl, 'fx-observe', CELL_FX);
    // the box closing in round it, as long as the blink
    if (marks) marks.look(x, y, num('--look-on', 4));
  }

  // Let go early, or dragged away: the blink stops at once.
  function dropLook() {
    if (lookEl) fx.stop(lookEl, 'fx-observe');
    lookEl = null;
    if (marks) marks.endLook();
  }

  function screenEffect(e) {
    if (!e) return;
    if (e.type === 'attack' && e.hit) fx.play(screen, e.by === 'player' ? 'fx-jolt' : 'fx-hurt', JOLT_FX);
    else if (e.type === 'death') fx.play(screen, 'fx-death', COVER_FX);
    else if (e.type === 'descend' || e.type === 'ascend' || e.type === 'restart') fx.play(screen, 'fx-descend', COVER_FX);
  }

  // --- log: one list. The lines the latest action said are bright; older ones dim. ---

  function drawLog(log, fresh) {
    const lines = Array.isArray(log) ? log.filter(Boolean).slice(-LOG_KEEP).reverse() : [];
    const freshFrom = Number.isInteger(fresh) ? fresh : lines.length ? lines[0].id : 0;
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
        const message = words(line.text);
        el.textContent = line.count > 1 ? TEXT.repeated(message, line.count) : message;
        if (mapField && line.id >= freshFrom) {
          // Two messages share the action's two lines. A lone message can
          // wrap at the word break nearest its middle. Most fit at full width.
          const text = el.textContent;
          const paired = lines.length > 1 && lines[1].id >= freshFrom;
          const measure = paired ? text.length : twoLineMeasure(text);
          el.style.setProperty('--log-measure', String(measure));
        }
        rec = { el, text: line.text, turn: line.turn, kind: null };
        logEls.set(line.id, rec);
        el.className = 'line';
      }
      if (rec.kind !== line.kind) {
        if (rec.kind) rec.el.classList.remove(`k-${rec.kind}`);
        rec.el.classList.add(`k-${line.kind}`);
        rec.kind = line.kind;
      }
      const now = line.id >= freshFrom;
      if (mapField) rec.el.classList.toggle('same-action', line.actionId != null && line.actionId === lines[i + 1]?.actionId);
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
      // more: there is something about it you have not inspected; its name blinks
      row.className = (i === inv.cursor ? 'row cursor' : 'row') + (it && it.more ? ' more' : '');
      row.dataset.pick = String(i);
      const name = doc.createElement('span');
      name.className = 'name';
      name.textContent = words(it && it.name);
      const state = doc.createElement('span');
      state.className = 'state';
      state.textContent = words(it && it.state);
      row.appendChild(name);
      row.appendChild(state);
      invRows.appendChild(row);
    });
  }

  // --- an event: its own scrollable text and links, with the system menu below ---

  function stopPassages() {
    clearTimeout(passageTimer);
    passageTimer = null;
    screen.removeAttribute('data-streaming');
  }

  // The first new paragraph is already visible. Reveal the rest, then the choices,
  // on the same clock. Hidden paragraphs and links reserve their space on the page.
  function streamPassages(first) {
    screen.setAttribute('data-streaming', '');
    let next = first?.nextElementSibling;
    for (let p = next; p; p = p.nextElementSibling) p.style.visibility = 'hidden';
    function advance() {
      if (!next) return stopPassages();
      next.style.visibility = '';
      next = next.nextElementSibling;
      passageTimer = setTimeout(advance, passageMs);
    }
    passageTimer = setTimeout(advance, passageMs);
  }

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
    stopPassages();
    eventKey = key;
    setAttr(eventEl, 'data-id', event.id);
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
    }
    const doc = eventLines.ownerDocument;
    while (eventLines.firstChild) eventLines.removeChild(eventLines.firstChild);
    groups.forEach((group, n) => {
      const box = doc.createElement('div');
      box.className = 'passage ' + (n >= event.now ? 'now' : 'old') + (!paceChoices && n >= from ? ' enter' : '');
      box.style.setProperty('--k', Math.max(0, n - from));
      let verse = null;
      for (const l of group || []) {
        const el = doc.createElement('div');
        el.className = l.slot ? 'ev-line slot' : 'ev-line';
        el.textContent = words(l.text);
        if (l.song) {
          if (!verse) {
            verse = doc.createElement('div');
            verse.className = 'verse';
            box.appendChild(verse);
          }
          verse.appendChild(el);
        } else {
          verse = null;
          box.appendChild(el);
        }
      }
      eventLines.appendChild(box);
    });
    if (paceChoices) streamPassages(eventLines.children[from]);
    eventDrawn = { sig, texts };
    eventLines.scrollTop = from > 0 ? eventLines.scrollHeight : 0;
  }

  function drawEventLinks(event, menu) {
    const choices = event && (menu?.id === 'sys' ? menu : event);
    const opts = choices?.options || [];
    const key = JSON.stringify(opts);
    if (key !== linksKey) {
      linksKey = key;
      eventLinks.replaceChildren();
      eventItems?.replaceChildren();
      opts.forEach((o, i) => {
        if (!o) return;
        const link = eventLinks.ownerDocument.createElement('button');
        link.type = 'button';
        link.className = 'link';
        link.dataset.choose = String(i);
        link.dataset.kind = o.kind;
        link.textContent = words(o.label);
        link.disabled = !!o.disabled;
        if (o.kind === 'item' && moreMark) link.style.setProperty('--more', moreMark());
        // Items (and memories) are things in a list, under the text, not choices; the
        // choices, marked with an arrow, come after them (decision 305).
        (o.kind === 'item' && eventItems ? eventItems : eventLinks).appendChild(link);
      });
    }
    for (const link of [...(eventItems?.children ?? []), ...eventLinks.children]) {
      link.classList.toggle('cursor', Number(link.dataset.choose) === choices?.cursor);
    }
    nameOnly(eventMenu, TEXT.button.sys);
    eventMenu.classList.toggle('open', !!event && menu?.id === 'sys');
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
    if (statRow.dataset.menu === 'psy') {
      const values = [stats.str, stats.love, stats.hp].map(({ wrap, v }) =>
        wrap.firstChild.textContent + ' ' + v.textContent
      );
      setAttr(statRow, 'aria-label', [TEXT.button.psyche, ...values].join(', '));
      setAttr(statRow, 'title', TEXT.button.psyche);
    }
  }

  // --- buttons ---

  function drawButtons(view) {
    nameOnly(menuButtons.sys, TEXT.button.sys);
    setText(menuButtons.act, TEXT.button.act);
    setText(menuButtons.psy, TEXT.button.psy);
    if (btnMemories) {
      nameOnly(btnMemories, TEXT.button.memories);
      setAttr(btnMemories, 'title', TEXT.button.memories);
      setAttr(menuButtons.act, 'aria-label', TEXT.button.abilities);
      setAttr(menuButtons.act, 'title', TEXT.button.abilities);
      const invLabel = view.inv ? TEXT.menu.back : TEXT.button.inventory;
      setText(menuButtons.inv, view.inv ? invLabel : '');
      setAttr(menuButtons.inv, 'aria-label', invLabel);
      setAttr(menuButtons.inv, 'title', invLabel);
    } else {
      setText(menuButtons.inv, view.inv ? TEXT.menu.back : TEXT.button.inv);
    }
    // The esoteric edition writes wait out, as its list of abilities does.
    setText(btnWait, (btnMemories ? TEXT.button.waitName : TEXT.button.wait) ?? '');
    setText(btnUse, TEXT.button.use ?? '');
    // the two labels that are marks, not words: their ink in the middle of the button
    centreInk(menuButtons.act);
    if (!btnMemories) centreInk(btnWait);
    const shortcuts = view.abilities || [];
    const ctx = btnSecondary && !view.inv ? shortcuts[0] || {} : shortcuts[0] || view.context || {};
    if (btnSecondary) {
      btnSecondary.hidden = !shortcuts[1];
      setText(btnSecondary, shortcuts[1]?.label);
      if (shortcuts[1]) setAttr(btnSecondary, 'data-ability', shortcuts[1].id);
      else btnSecondary.removeAttribute('data-ability');
      if (shortcuts[0]) setAttr(btnContext, 'data-ability', shortcuts[0].id);
      else btnContext.removeAttribute('data-ability');
      // nothing to do here: the first place stays, empty, so wait never moves
      btnContext.classList.toggle('empty', !ctx.label);
      btnContext.disabled = !ctx.label;
    }
    setText(btnContext, ctx.label == null ? '' : ctx.label);
    if (ctx.id) setAttr(btnContext, 'data-context', ctx.id);
    else btnContext.removeAttribute('data-context');
    // A second variable action only if the row has room for it beside wait and the star:
    // its words set smaller to fit, down to ROW_FIT_LEAST of their size, and else left off.
    if (btnSecondary) {
      const row = btnSecondary.parentElement;
      row.style.removeProperty('--row-fit');
      if (!btnSecondary.hidden && row.scrollWidth > row.clientWidth + 1) {
        const words = [btnContext, btnSecondary, btnWait].reduce((w, b) => w + (b.hidden ? 0 : b.getBoundingClientRect().width), 0);
        const fit = (words - (row.scrollWidth - row.clientWidth) - 2) / words;
        if (fit >= ROW_FIT_LEAST) row.style.setProperty('--row-fit', fit.toFixed(3));
        if (row.scrollWidth > row.clientWidth + 1) {
          row.style.removeProperty('--row-fit');
          btnSecondary.hidden = true;
        }
      }
    }
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

  // Ignore presses until the stairs finish or the event choices appear.
  return { draw, timing, showAim, clearAim, flashAim, showLook, dropLook, busy: () => passageTimer !== null || !!stairs?.playing(), stairs, destroy() {
    stopPassages();
    if (stairs) stairs.stop();
    clearTimeout(blinkNext);
    if (marks) marks.destroy();
    clearTrail();
    dropLook();
    clearTimeout(stepOff);
    clearTimeout(blinkOff);
    stopWave();
    map.removeEventListener('animationend', onWaveCellEnd);
    screen.classList.remove('blink');
    endSlide();
  } };
}

// --- building, once ---

function buildMap(map, size) {
  const doc = map.ownerDocument;
  while (map.firstChild) map.removeChild(map.firstChild);
  const cells = [];
  for (let i = 0; i < size * size; i++) {
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
    for (const other of group || []) if (other !== cls) stop(el, other);
    if (mine.has(cls)) clearTimeout(mine.get(cls));
    el.classList.remove(cls);
    void el.offsetWidth; // reflow, so the animation starts again
    el.classList.add(cls);
    mine.set(cls, setTimeout(() => stop(el, cls), safety));
  }

  function onEnd(el, e, group) {
    const mine = running.get(el);
    if (!mine || mine.size === 0) return;
    // a quieter version of an effect (for less motion) is named after it, with -still
    const name = String(e.animationName || '').replace(/-still$/, '');
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

  return { play, stop };
}

// --- small helpers ---

function setText(el, text) {
  text = words(text);
  if (el && el.textContent !== text) el.textContent = text;
}

// Words as the player reads them: with no square brackets ("all the brackets should be
// removed like around cinnamon"). text.js keeps an empty slot in brackets, so the rules can
// tell it is one (it is still drawn in the slot's grey); the screen leaves them off.
function words(text) {
  return text == null ? '' : String(text).replace(/[[\]]/g, '');
}

// The least the actions row's words are set, as a share of their size, to fit two actions.
const ROW_FIT_LEAST = 0.8;

// Narrowest monospaced measure that fits the complete text in two lines.
function twoLineMeasure(text) {
  let measure = text.length;
  for (let i = text.indexOf(' '); i >= 0; i = text.indexOf(' ', i + 1)) {
    measure = Math.min(measure, Math.max(i, text.length - i - 1));
  }
  return measure;
}

// Put the ink of a short mark ("*", "...") in the middle of its button. A line of type is
// centred by its line, not its ink: Monaco draws "*" high and Menlo near the middle, and
// "..." sits on the baseline in both. So measure the mark in the font the device actually
// uses and give the button --ink-y, how far to move it, in em (style.css pads it by that).
let inkCanvas = null;
function centreInk(el) {
  if (!el) return;
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const key = `${el.textContent}|${cs.fontFamily}`;
  if (el.dataset.ink === key) return;
  el.dataset.ink = key;
  if (!el.textContent) return;
  inkCanvas = inkCanvas || el.ownerDocument.createElement('canvas').getContext('2d');
  if (!inkCanvas) return;
  inkCanvas.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
  const m = inkCanvas.measureText(el.textContent);
  const parts = [m.fontBoundingBoxAscent, m.fontBoundingBoxDescent, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent];
  if (!parts.every(Number.isFinite)) return; // an old browser: leave it on its line
  // where the ink's middle is, below the middle of the line, in em
  const below = (parts[0] - parts[1] + parts[3] - parts[2]) / 2 / 100;
  el.style.setProperty('--ink-y', `${(-below).toFixed(3)}em`);
}

// A button drawn as a picture (the menu's square): its word is its name, not its text.
function nameOnly(el, name) {
  setText(el, '');
  setAttr(el, 'aria-label', name ?? '');
}

function setAttr(el, name, value) {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
}
