// Keys, touches and clicks become contract Actions. Acts at once; never waits on animations.
// The one exception is a tap on the map: it becomes a `tap`, and main.js decides what that
// is (a look, then an observation when the blink is done, or a fast move if tapped again).
// A press that means nothing becomes an `interrupt`: it does nothing but stop a fast move.

import { CONFIG } from './config.js';

const S = CONFIG.roomSize;

// The four arrow keys move, and move the cursor in a list, a menu or an event. No letters.
const KEY_DIRS = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
// keys that are only held with others: pressing one alone is not a press
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'AltGraph', 'OS']);

export function bindInput(root, dispatch) {
  const doc = root.ownerDocument || root;
  const held = new Map(); // pointerId -> the pressed button

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
    const action = el && root.contains(el) && !el.disabled ? elementAction(el) : null;
    if (!action) {
      dispatch({ type: 'interrupt' });
      return;
    }
    e.preventDefault(); // no focus, no emulated mouse events, no selecting on a double tap
    if (action.type === 'tap' || action.type === 'pick') {
      dispatch(action); // a map cell or an inventory row: not a button, nothing to hold
      return;
    }
    release(e.pointerId);
    el.classList.add('down');
    held.set(e.pointerId, el);
    dispatch(action);
  }

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
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  doc.addEventListener('keydown', onKey);
  if (doc !== root) {
    doc.addEventListener('pointerup', onPointerEnd);
    doc.addEventListener('pointercancel', onPointerEnd);
  }
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

function elementAction(el) {
  const d = el.dataset || {};
  if (d.action === 'context') return { type: 'context' };
  if (d.action === 'wait') return { type: 'wait' };
  if (d.action === 'use') return { type: 'use' };
  if (d.cell != null && d.cell !== '') {
    const i = Number(d.cell);
    return { type: 'tap', x: i % S, y: Math.floor(i / S) };
  }
  if (d.pick != null && d.pick !== '') return { type: 'pick', index: Number(d.pick) };
  if (d.choose != null && d.choose !== '') return { type: 'choose', index: Number(d.choose) };
  if (d.menu) return { type: 'menu', id: d.menu };
  return null;
}
