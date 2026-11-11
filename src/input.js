// Keys, touches and clicks become contract Actions. Acts at once; never waits on animations.

const REPEAT_FIRST_MS = 260;
const REPEAT_EVERY_MS = 110;

const KEY_DIRS = { ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w' };
const KEY_MENUS = { i: 'inv', a: 'act', p: 'psy', s: 'sys' };

export function bindInput(root, dispatch) {
  const doc = root.ownerDocument || root;
  const held = new Map(); // pointerId -> { el: pressed element or null, pad, timer }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    const el = e.target && e.target.closest ? e.target.closest('.btn, .pad') : null;
    if (!el || !root.contains(el)) return;
    const action = elementAction(el);
    if (!action) return;
    e.preventDefault(); // no focus, no emulated mouse events
    release(e.pointerId);
    // Touch pointers are captured to the first element; free them so a thumb can slide.
    try {
      if (el.releasePointerCapture) el.releasePointerCapture(e.pointerId);
    } catch (err) {
      // not captured: nothing to release
    }
    const hold = { el: null, pad: action.type === 'move', timer: null };
    held.set(e.pointerId, hold);
    if (hold.pad) return pressPad(hold, el);
    el.classList.add('down');
    hold.el = el;
    dispatch(action);
  }

  // Press a d-pad arm: move at once, then repeat until it is let go.
  function pressPad(hold, el) {
    unpress(hold);
    const dir = el.dataset.dir;
    el.classList.add('down');
    hold.el = el;
    hold.timer = setTimeout(function repeat() {
      dispatch({ type: 'move', dir });
      hold.timer = setTimeout(repeat, REPEAT_EVERY_MS);
    }, REPEAT_FIRST_MS);
    dispatch({ type: 'move', dir });
  }

  function unpress(hold) {
    clearTimeout(hold.timer);
    hold.timer = null;
    if (hold.el) hold.el.classList.remove('down');
    hold.el = null;
  }

  // A pointer that went down on the d-pad follows the thumb from arm to arm.
  function onPointerMove(e) {
    const hold = held.get(e.pointerId);
    if (!hold || !hold.pad || !doc.elementFromPoint) return;
    const under = doc.elementFromPoint(e.clientX, e.clientY);
    const pad = under && under.closest ? under.closest('.pad') : null;
    const arm = pad && root.contains(pad) && pad.dataset.dir ? pad : null;
    if (arm === hold.el) return;
    if (arm) pressPad(hold, arm);
    else unpress(hold);
  }

  function onPointerEnd(e) {
    release(e.pointerId);
  }

  function release(id) {
    const hold = held.get(id);
    if (!hold) return;
    unpress(hold);
    held.delete(id);
  }

  function releaseAll() {
    for (const id of [...held.keys()]) release(id);
  }

  // pointerleave does not bubble, so listen in the capture phase.
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerEnd);
  root.addEventListener('pointercancel', onPointerEnd);
  // A d-pad pointer leaving its arm lets go of it but is still followed.
  root.addEventListener('pointerleave', (e) => {
    const hold = held.get(e.pointerId);
    if (!hold || e.target !== hold.el) return;
    if (hold.pad) unpress(hold);
    else release(e.pointerId);
  }, true);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('pointermove', onPointerMove);
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
  if (key === '.' || key === 'z' || key === 'Z') return { type: 'wait' };
  if (key && key.length === 1) {
    const k = key.toLowerCase();
    if (KEY_MENUS[k]) return { type: 'menu', id: KEY_MENUS[k] };
    if (k >= '1' && k <= '4') return { type: 'choose', index: Number(k) - 1 };
  }
  return null;
}

function elementAction(el) {
  const d = el.dataset || {};
  if (d.dir) return { type: 'move', dir: d.dir };
  if (d.action === 'context') return { type: 'context' };
  if (d.choose != null && d.choose !== '') return { type: 'choose', index: Number(d.choose) };
  if (d.menu) return { type: 'menu', id: d.menu };
  return null;
}
