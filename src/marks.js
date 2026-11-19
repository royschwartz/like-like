// The marks round the square under a finger, which the finger hides: corners round a
// drag's destination (a tap flashes them), and a box that closes in on a square while it
// is held to observe. Drawn on a layer over the map, in the squares round the square,
// as plain rectangles that change in hard steps. Chosen in the marks study on November 19.
// Screen code only: render.js says where and when.

// wrap: #map-wrap. num(name, fallback): a number from the slab's style (style.css sets them).
export function createMarks(wrap, { size, frameMs, num }) {
  const doc = wrap.ownerDocument;
  const win = doc.defaultView || null;
  const now = () => (win && win.performance ? win.performance.now() : Date.now());

  const root = doc.createElement('div');
  root.className = 'marks';
  const destBox = layer('marks-dest');
  const lookBox = layer('marks-look');
  wrap.appendChild(root);

  function layer(name) {
    const el = doc.createElement('div');
    el.className = name;
    root.appendChild(el);
    return el;
  }

  // what is showing, so a change of size can draw it again
  let dest = null; // { x, y }
  let flashTimer = null;
  let look = null; // { x, y, frames, start, step }
  let lookTimer = null;

  // Measured fresh each time. Thicknesses are in hundredths of the map's width, rounded to
  // whole device pixels so the lines stay crisp, and never thinner than one.
  function measure() {
    const r = wrap.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    const dpr = (win && win.devicePixelRatio) || 1;
    const px = (u) => (u > 0 ? Math.max(1, Math.round(((u * W) / 100) * dpr)) / dpr : 0);
    return {
      cw: W / size,
      ch: H / size,
      dpr,
      box: Math.max(1, Math.round(num('--mark-box', 1))),
      t: px(num('--mark-line', 0.7)) || 1 / dpr,
      e: px(num('--mark-edge', 0.25)),
      snap: (v) => Math.round(v * dpr) / dpr,
    };
  }

  // Each line goes down twice: its edge, a little bigger all round, and the line on it.
  // All the edges first, so an edge never covers a line where two lines meet.
  function lines(box, m, rects) {
    const edges = [];
    const inks = [];
    for (const [x, y, w, h] of rects) {
      if (!(w > 0) || !(h > 0)) continue;
      if (m.e > 0) edges.push(rect(m, x - m.e, y - m.e, w + 2 * m.e, h + 2 * m.e, 'marks-edge'));
      inks.push(rect(m, x, y, w, h, 'marks-line'));
    }
    for (const el of edges) box.appendChild(el);
    for (const el of inks) box.appendChild(el);
  }

  function rect(m, x, y, w, h, cls) {
    const x0 = m.snap(x);
    const y0 = m.snap(y);
    const el = doc.createElement('div');
    el.className = cls;
    el.style.left = x0 + 'px';
    el.style.top = y0 + 'px';
    el.style.width = Math.max(1 / m.dpr, m.snap(x + w) - x0) + 'px';
    el.style.height = Math.max(1 / m.dpr, m.snap(y + h) - y0) + 'px';
    return el;
  }

  // a square outline, the line lying inside it
  function square(L, T, W, H, t) {
    return [
      [L, T, W, t],
      [L, T + H - t, W, t],
      [L, T, t, H],
      [L + W - t, T, t, H],
    ];
  }

  // The destination: the four corners of a box round it and the squares beside it, each
  // an L with arms half a square long. Off the map's edge it is cut off.
  function drawDest() {
    empty(destBox);
    if (!dest) return;
    const m = measure();
    const { cw, ch, t, box } = m;
    const L = (dest.x - box) * cw;
    const T = (dest.y - box) * ch;
    const R = L + (2 * box + 1) * cw;
    const B = T + (2 * box + 1) * ch;
    const aw = 0.5 * cw;
    const ah = 0.5 * ch;
    lines(destBox, m, [
      [L, T, aw, t], [L, T, t, ah],
      [R - aw, T, aw, t], [R - t, T, t, ah],
      [L, B - t, aw, t], [L, B - ah, t, ah],
      [R - aw, B - t, aw, t], [R - t, B - ah, t, ah],
    ]);
  }

  // Observing: a box round the squares beside it on the first frame, smaller by the same
  // amount each frame, and on the last just outside the square itself.
  function drawLook() {
    empty(lookBox);
    if (!look) return;
    const m = measure();
    const { cw, ch, t, box } = m;
    const n = look.frames;
    const f = n > 1 ? look.step / (n - 1) : 1;
    const w = (2 * box + 1) * cw - (2 * box * cw - 2 * t) * f;
    const h = (2 * box + 1) * ch - (2 * box * ch - 2 * t) * f;
    const cx = (look.x + 0.5) * cw;
    const cy = (look.y + 0.5) * ch;
    lines(lookBox, m, square(cx - w / 2, cy - h / 2, w, h, t));
  }

  function tickLook() {
    lookTimer = null;
    if (!look) return;
    const step = Math.min(look.frames - 1, Math.floor((now() - look.start) / frameMs));
    if (step !== look.step) {
      look.step = step;
      drawLook();
    }
    if (step < look.frames - 1) {
      lookTimer = setTimeout(tickLook, Math.max(0, look.start + (step + 1) * frameMs - now()));
    }
  }

  function empty(box) {
    while (box.firstChild) box.removeChild(box.firstChild);
  }

  function stopFlash() {
    clearTimeout(flashTimer);
    flashTimer = null;
  }

  const ok = (x, y) => Number.isInteger(x) && Number.isInteger(y);

  // a new size draws what is showing again
  let watcher = null;
  if (win && win.ResizeObserver) {
    watcher = new win.ResizeObserver(() => {
      drawDest();
      drawLook();
    });
    watcher.observe(wrap);
  }

  // The destination mark, steady, round (x, y); with no place, it goes.
  function aim(x, y) {
    stopFlash();
    dest = ok(x, y) ? { x, y } : null;
    drawDest();
  }

  // The destination mark round (x, y) for --mark-tap frames, then gone.
  function flash(x, y) {
    stopFlash();
    const frames = Math.max(0, Math.round(num('--mark-tap', 3)));
    dest = ok(x, y) && frames > 0 ? { x, y } : null;
    drawDest();
    if (!dest) return;
    flashTimer = setTimeout(() => {
      flashTimer = null;
      dest = null;
      drawDest();
    }, frames * frameMs);
  }

  // The observing mark round (x, y), a step a frame for `frames` frames. It stays on its
  // last step until endLook.
  function startLook(x, y, frames) {
    endLook();
    if (!ok(x, y)) return;
    look = { x, y, frames: Math.max(1, Math.round(frames) || 1), start: now(), step: -1 };
    tickLook();
  }

  function endLook() {
    clearTimeout(lookTimer);
    lookTimer = null;
    look = null;
    empty(lookBox);
  }

  function clear() {
    aim(null, null);
    endLook();
  }

  function destroy() {
    clear();
    if (watcher) watcher.disconnect();
    root.remove();
  }

  return { aim, flash, look: startLook, endLook, clear, destroy };
}
