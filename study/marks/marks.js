// The marks study: what a finger hides on the map, drawn in the squares round it.
// A destination (a drag's aim, or a tap) and an observing hold, each in a few
// variants. Everything is plain rectangles and hard steps, nothing moves smoothly.
// Nothing here touches the page until createMarks is called.

export const DEST = ['now', 'frame', 'corners', 'sight', 'cross', 'arrows', 'lift'];
export const OBSERVE = ['now', 'close', 'round', 'fuse', 'count'];
// reach: how many cells out from the cell the lines run and the arrows sit.
// box: how many cells out the boxes are drawn. 1 is the squares beside the cell.
export const DEFAULTS = { dest: 'sight', observe: 'fuse', weight: 0.7, edge: 0.25, reach: 2, box: 1, tap: 3 };

const ARROWS = [
  // neighbour offset, and the character that points back at the cell
  { dx: -1, dy: 0, ch: '>' },
  { dx: 1, dy: 0, ch: '<' },
  { dx: 0, dy: -1, ch: 'v' },
  { dx: 0, dy: 1, ch: '^' },
];

export function createMarks(wrap, { size = 11, frameMs = 70 } = {}) {
  const doc = wrap.ownerDocument;
  const view = doc.defaultView || null;
  const now = () => (view && view.performance ? view.performance.now() : Date.now());

  const settings = { ...DEFAULTS };

  const root = doc.createElement('div');
  root.className = 'marks';
  // the overlay's own place, also inline so it holds without the stylesheet
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '4',
  });
  const destBox = layer('marks-dest');
  const lookBox = layer('marks-look');
  wrap.appendChild(root);

  function layer(name) {
    const el = doc.createElement('div');
    el.className = name;
    Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    root.appendChild(el);
    return el;
  }

  // what is showing, so a change of settings or of size can draw it again
  let dest = null; // { cell, cellEl }
  let tapTimer = null;
  let look = null; // { cell, frames, start, step }
  let lookTimer = null;

  // --- measuring, fresh each time ---

  function measure() {
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;
    if (!(W > 0) || !(H > 0)) {
      const r = wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : null;
      W = r ? r.width : 0;
      H = r ? r.height : 0;
    }
    const dpr = (view && view.devicePixelRatio) || 1;
    const px = (u) => (u > 0 ? Math.max(1, Math.round((u * W) / 100 * dpr)) / dpr : 0);
    return {
      W,
      H,
      cw: W / size,
      ch: H / size,
      dpr,
      t: px(settings.weight) || 1 / dpr,
      e: px(settings.edge),
      snap: (v) => Math.round(v * dpr) / dpr,
    };
  }

  // --- drawing: a list of line rectangles, every edge laid first, every line on top ---

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
    Object.assign(el.style, {
      position: 'absolute',
      left: x0 + 'px',
      top: y0 + 'px',
      width: Math.max(1 / m.dpr, m.snap(x + w) - x0) + 'px',
      height: Math.max(1 / m.dpr, m.snap(y + h) - y0) + 'px',
    });
    return el;
  }

  // a square outline, the line lying inside it
  function square(L, T, Sw, Sh, t) {
    return [
      [L, T, Sw, t],
      [L, T + Sh - t, Sw, t],
      [L, T, t, Sh],
      [L + Sw - t, T, t, Sh],
    ];
  }

  // the four sight lines: north, east, south, west, each `len` long in cells (or to the map's edge)
  function sight(m, cell, lenCells, toEdge) {
    const { cw, ch, t, W, H } = m;
    const cx = (cell.x + 0.5) * cw;
    const cy = (cell.y + 0.5) * ch;
    const left = cell.x * cw;
    const right = (cell.x + 1) * cw;
    const top = cell.y * ch;
    const bottom = (cell.y + 1) * ch;
    const n = toEdge ? top : lenCells * ch;
    const e = toEdge ? W - right : lenCells * cw;
    const s = toEdge ? H - bottom : lenCells * ch;
    const w = toEdge ? left : lenCells * cw;
    return [
      [cx - t / 2, top - n, t, n],
      [right, cy - t / 2, e, t],
      [cx - t / 2, bottom, t, s],
      [left - w, cy - t / 2, w, t],
    ];
  }

  // the square round the cell and `box` cells each way
  function frameRects(m, cell) {
    const r = settings.box;
    return square((cell.x - r) * m.cw, (cell.y - r) * m.ch, (2 * r + 1) * m.cw, (2 * r + 1) * m.ch, m.t);
  }

  // --- the destination ---

  function drawDest() {
    empty(destBox);
    if (!dest) return;
    const { cell, cellEl } = dest;
    const m = measure();
    const { cw, ch, t } = m;
    switch (settings.dest) {
      case 'frame':
        return lines(destBox, m, frameRects(m, cell));
      case 'corners': {
        const r = settings.box;
        const L = (cell.x - r) * cw;
        const T = (cell.y - r) * ch;
        const R = L + (2 * r + 1) * cw;
        const B = T + (2 * r + 1) * ch;
        const aw = 0.5 * cw;
        const ah = 0.5 * ch;
        return lines(destBox, m, [
          [L, T, aw, t], [L, T, t, ah],
          [R - aw, T, aw, t], [R - t, T, t, ah],
          [L, B - t, aw, t], [L, B - ah, t, ah],
          [R - aw, B - t, aw, t], [R - t, B - ah, t, ah],
        ]);
      }
      case 'sight':
        return lines(destBox, m, sight(m, cell, settings.reach, false));
      case 'cross':
        return lines(destBox, m, sight(m, cell, 0, true));
      case 'arrows':
        return drawArrows(m, cell);
      case 'lift':
        return drawLift(m, cell, cellEl);
      default:
        return;
    }
  }

  function drawArrows(m, cell) {
    for (const a of ARROWS) {
      const x = cell.x + a.dx * settings.reach;
      const y = cell.y + a.dy * settings.reach;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const el = rect(m, x * m.cw, y * m.ch, m.cw, m.ch, 'marks-arrow');
      el.textContent = a.ch;
      destBox.appendChild(el);
    }
  }

  // a copy of the tile, half as big again, a cell clear of the finger, on a stalk
  function drawLift(m, cell, cellEl) {
    const { cw, ch, t, e, W } = m;
    const sw = 1.5 * cw;
    const sh = 1.5 * ch;
    const mid = (cell.x + 0.5) * cw;
    const L = Math.min(Math.max(mid - sw / 2, 0), Math.max(0, W - sw));
    const below = cell.y < 3;
    const T = below ? (cell.y + 2) * ch : (cell.y - 1) * ch - sh;
    const stalk = below
      ? [mid - t / 2, (cell.y + 1) * ch, t, T - (cell.y + 1) * ch]
      : [mid - t / 2, T + sh, t, cell.y * ch - (T + sh)];

    // the stalk's edge, then the copy's, then the stalk, then the copy over its end
    if (e > 0) {
      destBox.appendChild(rect(m, stalk[0] - e, stalk[1] - e, stalk[2] + 2 * e, stalk[3] + 2 * e, 'marks-edge'));
      destBox.appendChild(rect(m, L - e, T - e, sw + 2 * e, sh + 2 * e, 'marks-edge'));
    }
    destBox.appendChild(rect(m, stalk[0], stalk[1], stalk[2], stalk[3], 'marks-line'));

    const copy = rect(m, L, T, sw, sh, 'marks-lift');
    copy.style.borderWidth = t + 'px';
    if (cellEl) {
      copy.textContent = cellEl.textContent || '';
      const cs = view && view.getComputedStyle ? view.getComputedStyle(cellEl) : null;
      if (cs) {
        copy.style.color = cs.color;
        copy.style.backgroundColor = cs.backgroundColor;
      }
      if (cellEl.classList && cellEl.classList.contains('b')) copy.classList.add('b');
    }
    destBox.appendChild(copy);
  }

  // --- the observing hold ---

  function drawLook() {
    empty(lookBox);
    if (!look) return;
    const { cell, frames: n, step: k } = look;
    const m = measure();
    const { cw, ch, t } = m;
    switch (settings.observe) {
      case 'close': {
        // from the frame square in to one that hugs the cell from outside
        const f = n > 1 ? k / (n - 1) : 1;
        const r = settings.box;
        const sw = (2 * r + 1) * cw - (2 * r * cw - 2 * t) * f;
        const sh = (2 * r + 1) * ch - (2 * r * ch - 2 * t) * f;
        const cx = (cell.x + 0.5) * cw;
        const cy = (cell.y + 0.5) * ch;
        return lines(lookBox, m, square(cx - sw / 2, cy - sh / 2, sw, sh, t));
      }
      case 'round':
        return lines(lookBox, m, roundRects(m, cell, (k + 1) / n));
      case 'fuse': {
        const len = (settings.reach * (n - k)) / n;
        return lines(lookBox, m, sight(m, cell, len, false));
      }
      case 'count': {
        const on = Math.min(4, Math.ceil((4 * (k + 1)) / n));
        return lines(lookBox, m, sight(m, cell, settings.reach, false).slice(0, on));
      }
      default:
        return;
    }
  }

  // the frame square, the first `part` of it, clockwise from the middle of its top
  function roundRects(m, cell, part) {
    const { cw, ch, t } = m;
    const r = settings.box;
    const L = (cell.x - r) * cw;
    const T = (cell.y - r) * ch;
    const SW = (2 * r + 1) * cw;
    const SH = (2 * r + 1) * ch;
    const R = L + SW;
    const B = T + SH;
    const legs = [SW / 2, SH, SW, SH, SW / 2];
    let left = part * (SW * 2 + SH * 2);
    const out = [];
    for (let i = 0; i < legs.length && left > 0; i++) {
      const d = Math.min(legs[i], left);
      left -= d;
      if (i === 0) out.push([L + SW / 2, T, d, t]);
      else if (i === 1) out.push([R - t, T, t, d]);
      else if (i === 2) out.push([R - d, B - t, d, t]);
      else if (i === 3) out.push([L, B - d, t, d]);
      else out.push([L, T, d, t]);
    }
    return out;
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
      const next = look.start + (step + 1) * frameMs - now();
      lookTimer = setTimeout(tickLook, Math.max(0, next));
    }
  }

  // --- the rest ---

  function empty(box) {
    while (box.firstChild) box.removeChild(box.firstChild);
  }

  function stopTap() {
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
  }

  function okCell(cell) {
    return cell && Number.isFinite(cell.x) && Number.isFinite(cell.y);
  }

  // a resize redraws what is showing
  let watcher = null;
  if (view && view.ResizeObserver) {
    watcher = new view.ResizeObserver(() => {
      drawDest();
      drawLook();
    });
    watcher.observe(wrap);
  }

  function endLook() {
    if (lookTimer) clearTimeout(lookTimer);
    lookTimer = null;
    look = null;
    empty(lookBox);
  }

  return {
    set(partial = {}) {
      for (const key of Object.keys(partial)) {
        const v = partial[key];
        if (key === 'dest' && DEST.includes(v)) settings.dest = v;
        else if (key === 'observe' && OBSERVE.includes(v)) settings.observe = v;
        else if ((key === 'weight' || key === 'edge') && Number.isFinite(+v)) settings[key] = Math.max(0, +v);
        else if ((key === 'reach' || key === 'box') && Number.isFinite(+v)) settings[key] = Math.min(10, Math.max(1, Math.round(+v)));
        else if (key === 'tap' && Number.isFinite(+v)) settings.tap = Math.max(0, Math.round(+v));
      }
      drawDest();
      drawLook();
    },

    aim(cell, cellEl) {
      stopTap();
      dest = okCell(cell) ? { cell: { x: cell.x, y: cell.y }, cellEl: cellEl || null } : null;
      drawDest();
    },

    tap(cell, cellEl) {
      stopTap();
      dest = null;
      if (okCell(cell) && settings.tap > 0 && settings.dest !== 'now') {
        dest = { cell: { x: cell.x, y: cell.y }, cellEl: cellEl || null };
        tapTimer = setTimeout(() => {
          tapTimer = null;
          dest = null;
          drawDest();
        }, settings.tap * frameMs);
      }
      drawDest();
    },

    look(cell, frames) {
      endLook();
      if (!okCell(cell)) return;
      const n = Math.max(1, Math.round(+frames) || 1);
      look = { cell: { x: cell.x, y: cell.y }, frames: n, start: now(), step: -1 };
      tickLook();
    },

    endLook,

    clear() {
      stopTap();
      dest = null;
      empty(destBox);
      endLook();
    },
  };
}
