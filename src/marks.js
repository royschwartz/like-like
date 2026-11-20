// The marks round the square under a finger, which the finger hides: corners round a
// drag's destination (a tap flashes them), and a box that closes in on a square while it
// is held to observe. Drawn on a layer over the map, in the squares round the square,
// as plain rectangles that change in hard steps. Chosen in the marks study on November 19.
// Screen code only: render.js says where and when.

// wrap is the grid's containing block. num reads a number from the slab's CSS.
export function createMarks(wrap, { size, frameMs, num, dragCorners = true }) {
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
    const rim = num('--wall-fraction', 1);
    // Map a grid line (or a fraction of a cell) to its displayed position.
    // Outside the grid the nearest track continues so edge marks clip naturally.
    function axis(length) {
      const tile = length / (size - 2 + 2 * rim);
      return (gridLine) => {
        if (gridLine <= 1) return gridLine * rim * tile;
        if (gridLine >= size - 1) return length + (gridLine - size) * rim * tile;
        return (rim + gridLine - 1) * tile;
      };
    }
    return {
      xAt: axis(W),
      yAt: axis(H),
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
    const { xAt, yAt, t, box } = m;
    const leftColumn = dest.x - box;
    const rightColumn = dest.x + box + 1;
    const topRow = dest.y - box;
    const bottomRow = dest.y + box + 1;
    const left = xAt(leftColumn), right = xAt(rightColumn);
    const top = yAt(topRow), bottom = yAt(bottomRow);
    // Each arm is half of its own track, including a narrow outside wall.
    const leftArm = xAt(leftColumn + 0.5) - left;
    const rightArm = right - xAt(rightColumn - 0.5);
    const topArm = yAt(topRow + 0.5) - top;
    const bottomArm = bottom - yAt(bottomRow - 0.5);
    lines(destBox, m, [
      [left, top, leftArm, t], [left, top, t, topArm],
      [right - rightArm, top, rightArm, t], [right - t, top, t, topArm],
      [left, bottom - t, leftArm, t], [left, bottom - bottomArm, t, bottomArm],
      [right - rightArm, bottom - t, rightArm, t], [right - t, bottom - bottomArm, t, bottomArm],
    ]);
  }

  // Observing: a box round the squares beside it on the first frame, smaller by the same
  // amount each frame, and on the last just outside the square itself.
  function drawLook() {
    empty(lookBox);
    if (!look) return;
    const m = measure();
    const { xAt, yAt, t, box } = m;
    const progress = look.frames > 1 ? look.step / (look.frames - 1) : 1;
    const between = (first, last) => first + (last - first) * progress;
    const left = between(xAt(look.x - box), xAt(look.x) - t);
    const right = between(xAt(look.x + box + 1), xAt(look.x + 1) + t);
    const top = between(yAt(look.y - box), yAt(look.y) - t);
    const bottom = between(yAt(look.y + box + 1), yAt(look.y + 1) + t);
    lines(lookBox, m, square(left, top, right - left, bottom - top, t));
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
    dest = dragCorners && ok(x, y) ? { x, y } : null;
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
