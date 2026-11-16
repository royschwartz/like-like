// Keys, touches and clicks become contract Actions. Acts at once; never waits on animations.
// The one exception is a press on the map: it is a gesture, followed here from press to
// release, and main.js is told what it turns out to be:
//   press  a finger or the mouse went down on a cell. main.js answers false if the press
//          only stopped a fast move; then there is no gesture.
//   blink  still held after a short grace: the cell starts its observing blink. main.js
//          answers false if the cell can't be looked at (then nothing blinks).
//   hold   still held on it when the blink is done: observe it. Letting go then does nothing.
//   tap    let go before the blink was done, never dragged: the blink stops, go there.
//   aim    dragged: the cell now under the pointer, or null off the map.
//   drop   let go after a drag: go to the cell aimed at, if there is one.
//   cancel the gesture was taken away (the system took the touch, the page went away).
// A press that means nothing becomes an `interrupt`: it does nothing but stop a fast move.

import { CONFIG } from './config.js';

const S = CONFIG.roomSize;
// a drag starts once the pointer is in another cell and this far from where it went down
const DRAG_PX = 8;

// The four arrow keys move, and move the cursor in a list, a menu or an event. No letters.
const KEY_DIRS = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
// keys that are only held with others: pressing one alone is not a press
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'AltGraph', 'OS']);

// timing: { graceMs, lookMs }. The times are read when used, so a caller can change them later.
export function bindInput(root, dispatch, timing = {}) {
  const doc = root.ownerDocument || root;
  const held = new Map(); // pointerId -> the pressed button
  // The one gesture on the map, while a pointer is down on it:
  // { id, from, x0, y0, timer, held, drag, over, el }. from and over are cells, { x, y };
  // over is the cell last aimed at in a drag (null off the map). held: the blink ran its
  // course and the cell was observed. timer: the grace, then the blink.
  let gesture = null;

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MODIFIERS.has(e.key)) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
    const action = keyAction(e.key);
    if (!action) {
      dispatch({ type: 'interrupt' });
      return;
    }
    e.preventDefault();
    dispatch(action);
    // When tab focus is on a choice, arrow navigation must move that focus with
    // the visible cursor so the next native Enter/Space activates the same choice.
    if (action.type === 'move' && e.target.closest?.('button')) {
      root.querySelector('#event:not([hidden]) #event-links .cursor, #controls[data-menu] .opt.cursor')?.focus({ preventScroll: true });
    }
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    const el = e.target && e.target.closest ? e.target.closest('.btn, .link, [data-cell], [data-pick]') : null;
    const cell = el && root.contains(el) ? cellOf(el) : null;
    if (cell) {
      e.preventDefault(); // no focus, no emulated mouse events, no selecting
      if (gesture) return; // one gesture at a time: another finger on the map is ignored
      if (dispatch({ type: 'press', x: cell.x, y: cell.y }) === false) return;
      startGesture(e, cell, el.parentElement || el);
      return;
    }
    const action = el && root.contains(el) && !el.disabled ? elementAction(el) : null;
    if (!action) {
      dispatch({ type: 'interrupt' });
      return;
    }
    e.preventDefault(); // no focus, no emulated mouse events, no selecting on a double tap
    if (action.type === 'pick') {
      dispatch(action); // an inventory row: not a button, nothing to hold
      return;
    }
    release(e.pointerId);
    el.classList.add('down');
    held.set(e.pointerId, el);
    dispatch(action);
  }

  // --- the map gesture ---

  function startGesture(e, cell, el) {
    gesture = { id: e.pointerId, from: cell, x0: e.clientX, y0: e.clientY, held: false, drag: false, over: null, el };
    gesture.timer = setTimeout(onGrace, timing.graceMs ?? 140);
    // Keep the pointer's moves and its release coming here, wherever it goes. (A touch is
    // held by what it pressed anyway; the cell under it is found by where it is.)
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {
      // not capturable: the document still hears it
    }
  }

  // Held past the grace (so a quick tap never flashes): the blink starts, and it is the
  // rest of the hold. Done and still held, the cell is observed.
  function onGrace() {
    if (!gesture) return;
    gesture.timer = null;
    if (dispatch({ type: 'blink', x: gesture.from.x, y: gesture.from.y }) === false) return;
    gesture.timer = setTimeout(onHold, timing.lookMs ?? 280);
  }

  function onHold() {
    if (!gesture) return;
    gesture.timer = null;
    gesture.held = true;
    dispatch({ type: 'hold', x: gesture.from.x, y: gesture.from.y });
  }

  function onPointerMove(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const cell = cellUnder(e.clientX, e.clientY);
    if (!gesture.drag) {
      const far = Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > DRAG_PX;
      if (!far || sameCell(cell, gesture.from)) return;
      gesture.drag = true;
      clearTimeout(gesture.timer); // no observing now: main.js stops a blink under way
      gesture.timer = null;
    } else if (sameCell(cell, gesture.over)) {
      return;
    }
    gesture.over = cell;
    dispatch({ type: 'aim', at: cell });
  }

  function onPointerUp(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = endGesture();
    if (g.drag) dispatch({ type: 'drop' });
    else if (!g.held) dispatch({ type: 'tap', x: g.from.x, y: g.from.y });
  }

  // The gesture is dropped with nothing done.
  function cancelGesture(e) {
    if (!gesture || (e && e.pointerId != null && e.pointerId !== gesture.id)) return;
    endGesture();
    dispatch({ type: 'cancel' });
  }

  function endGesture() {
    const g = gesture;
    gesture = null;
    clearTimeout(g.timer);
    try {
      if (g.el.hasPointerCapture?.(g.id)) g.el.releasePointerCapture(g.id);
    } catch (err) {
      // already let go
    }
    return g;
  }

  // The map cell under a point, or null: off the map, or over something else.
  function cellUnder(x, y) {
    const el = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
    const c = el && el.closest ? el.closest('[data-cell]') : null;
    return c && root.contains(c) ? cellOf(c) : null;
  }

  // --- the buttons ---

  function onPointerEnd(e) {
    release(e.pointerId);
  }

  function release(id) {
    const el = held.get(id);
    if (!el) return;
    el.classList.remove('down');
    held.delete(id);
  }

  function releaseAll() {
    for (const id of [...held.keys()]) release(id);
    cancelGesture();
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerEnd);
  root.addEventListener('pointercancel', onPointerEnd);
  // Keyboard activation and assistive technologies dispatch click without pointerdown.
  // Pointer actions already run on press, so their later click must not run twice.
  root.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const el = e.target.closest?.('button');
    if (!el || !root.contains(el) || el.disabled) return;
    const action = elementAction(el);
    if (action) dispatch(action);
  });
  // A pointer leaving the button it pressed lets go of it. pointerleave does not bubble,
  // so listen in the capture phase.
  root.addEventListener('pointerleave', (e) => {
    if (held.get(e.pointerId) === e.target) release(e.pointerId);
  }, true);
  // no menu on a long press or a right click, anywhere on the slab
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  doc.addEventListener('keydown', onKey);
  if (doc !== root) {
    doc.addEventListener('pointerup', onPointerEnd);
    doc.addEventListener('pointercancel', onPointerEnd);
  }
  // the map gesture is heard on the document, so it is heard once, wherever the pointer is
  doc.addEventListener('pointermove', onPointerMove);
  doc.addEventListener('pointerup', onPointerUp);
  doc.addEventListener('pointercancel', cancelGesture);
  const win = doc.defaultView;
  if (win) win.addEventListener('blur', releaseAll);
  doc.addEventListener('visibilitychange', releaseAll);
}

function keyAction(key) {
  if (KEY_DIRS[key]) return { type: 'move', dir: KEY_DIRS[key] };
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') return { type: 'context' };
  if (key === 'Escape' || key === 'Backspace') return { type: 'back' };
  if (key === '.') return { type: 'wait' };
  if (key === '*') return { type: 'menu', id: 'act' };
  if (key && key.length === 1 && key >= '1' && key <= '9') return { type: 'choose', index: Number(key) - 1 };
  return null;
}

// A map cell's place, { x, y }, or null if el is not a map cell.
function cellOf(el) {
  const d = el.dataset || {};
  if (d.cell == null || d.cell === '') return null;
  const i = Number(d.cell);
  if (!Number.isInteger(i) || i < 0 || i >= S * S) return null;
  return { x: i % S, y: Math.floor(i / S) };
}

function sameCell(a, b) {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
}

function elementAction(el) {
  const d = el.dataset || {};
  if (d.action === 'context') return { type: 'context' };
  if (d.action === 'wait') return { type: 'wait' };
  if (d.action === 'use') return { type: 'use' };
  if (d.pick != null && d.pick !== '') return { type: 'pick', index: Number(d.pick) };
  if (d.choose != null && d.choose !== '') return { type: 'choose', index: Number(d.choose) };
  if (d.menu) return { type: 'menu', id: d.menu };
  return null;
}
