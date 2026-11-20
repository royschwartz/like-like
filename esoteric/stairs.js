// Going up and down stairs (decision 346): the folding stairs from the stairs study.
// You vanish as the first tread of the stairs you take goes; the treads go one at a time,
// from your side to the edge; the screen rolls over the way you went, a tile at a time, as
// it does between rooms; on the new floor the treads you arrive by come back one at a time
// from the edge, and you appear as the last one does. It plays over the map, on copies of
// the floor you left and the floor you came to; when it is done the copies go and the map
// is there. Screen code: it gets the two views and the two maps, never the game.
// Its times are --stairs-* in edition.css, in frames of --f.

const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// host: the box the map is in. num(name, fallback): a number from #screen's style.
// paint: the edition's cell painter, for your square with you gone from it.
export function createStairs({ host, size, num, paint }) {
  let run = null;

  function stop() {
    if (!run) return;
    clearTimeout(run.timer);
    run.sheet.remove();
    run = null;
  }

  // oldMap, newMap: copies of the map before and after. before, after: the views. way:
  // 'down' or 'up'. Returns false, playing nothing, if the stairs aren't both to be found
  // beside you; then the screen does what it did before.
  function play({ oldMap, newMap, before, after, way }) {
    stop();
    if (!before || before.event || before.inv || after.event || after.inv) return false;
    const old = side(oldMap, before, way === 'down' ? 'stairs' : 'upstairs', size, paint);
    const neu = side(newMap, after, way === 'down' ? 'upstairs' : 'stairs', size, paint);
    if (!old || !neu) return false;
    const frameMs = num('--f', 70);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = {
      tread: num('--stairs-tread', 1),
      gone: num('--stairs-gone', 0),
      wait: num('--stairs-wait', 0),
      roll: still ? 0 : num('--stairs-roll', 0.5),
      black: num('--stairs-black', 1),
    };
    const frames = framesFor(old, neu, size, t);
    if (frames.length === 0) return false;
    const sheet = document.createElement('div');
    sheet.className = 'stairway';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.append(neu.el, old.el);
    host.appendChild(sheet);
    run = { sheet, timer: null };
    let k = 0;
    const tick = () => {
      if (!run) return;
      clearTimeout(run.timer);
      if (k >= frames.length) return stop();
      const f = frames[k++];
      apply(old, neu, size, f);
      run.timer = setTimeout(tick, frameMs * (f.ms ?? 1));
    };
    run.tick = tick;
    tick();
    return true;
  }

  // For checking by hand: the next frame now.
  function step() {
    if (run) run.tick();
  }

  return { play, stop, step, playing: () => !!run };
}

// A frame: `show` 'o' the old floor, 'n' the new, 'both' (rolling, each moved by `shift`
// squares, [[x, y] old, [x, y] new]) or 'none' (black). `patch`: 'o', 'n' or 'on', the floors
// whose spiral has left its square. `fold`: { o, n }, which treads of each floor's stairs are
// drawn. `ms`: how many frames it lasts.
function framesFor(old, neu, size, t) {
  const out = [];
  const hold = (k, f) => {
    for (let h = 0; h < k; h++) out.push(f);
  };
  // you and the first tread go together, then the rest of them, from your side to the edge
  for (let j = 0; j <= 3; j++) hold(j === 0 ? t.gone : t.tread, { show: 'o', patch: 'o', fold: { o: old.roomFirst.slice(j) } });
  if (t.roll > 0) {
    // the screen rolls over the way you went, as between rooms
    const [sx, sy] = STEP[old.stairs.side];
    for (let k = 1; k < size; k++) {
      out.push({ show: 'both', shift: [[-sx * k, -sy * k], [sx * (size - k), sy * (size - k)]], patch: 'on', fold: { o: [], n: [] }, ms: t.roll });
    }
  } else hold(t.black, { show: 'none' });
  // the treads come back from the edge, and you come with the last of them
  const edgeFirst = [...neu.roomFirst].reverse();
  for (let j = 0; j <= 3; j++) hold(j === 3 ? t.wait : t.tread, { show: 'n', patch: 'n', fold: { n: edgeFirst.slice(0, j) } });
  return out;
}

// One floor's copy and what the frames need of it, or null if its stairs aren't beside you.
function side(map, view, stairsKind, size, paint) {
  const me = view.player;
  const stairs = findStairs(view, me, stairsKind, size);
  if (!stairs) return null;
  const el = copy(map);
  const cells = [...el.children];
  const meAt = me.y * size + me.x;
  const at = stairs.y * size + stairs.x;
  const mask = cells[at].style.getPropertyValue('--drawing');
  const m = readMask(mask);
  return {
    el,
    cells,
    stairs,
    meAt,
    at,
    mask,
    transform: m.transform,
    treads: treadsOf(m.rects),
    // The stairs down narrow toward the edge, so their widest tread, the last drawn, is by
    // the room; the stairs up are the other way round.
    roomFirst: stairsKind === 'stairs' ? [2, 1, 0] : [0, 1, 2],
    floor: floorOnly(cells[meAt], view, meAt, size, paint),
    original: null,
    patched: false,
    folded: null,
  };
}

// A copy of the map to draw frames on: no ids, no state classes.
function copy(map) {
  const el = map.cloneNode(true);
  el.removeAttribute('id');
  el.className = 'map';
  for (const c of el.children) {
    c.className = c.classList.contains('b') ? 'c b' : 'c';
    c.removeAttribute('data-cell');
    c.removeAttribute('role');
    c.removeAttribute('aria-label');
  }
  return el;
}

// The stairs of this kind beside you: { x, y, side }, side the way from you into them.
function findStairs(view, me, kind, size) {
  if (!me || !Array.isArray(view.cells)) return null;
  for (const [side, [dx, dy]] of Object.entries(STEP)) {
    const x = me.x + dx;
    const y = me.y + dy;
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    if (view.cells[y * size + x]?.t === kind) return { x, y, side };
  }
  return null;
}

// Your square drawn as if you had left it, as render.js would draw it.
function floorOnly(cellEl, view, i, size, paint) {
  const cells = view.cells.map((c, k) => (k === i ? { ...c, thing: null } : c));
  const env = { look: view.look, px: -99, py: -99, key: view.room ? view.room.key : 0, cells, size, turn: view.turn ?? 0 };
  const p = paint(cells[i], i % size, Math.floor(i / size), env);
  const el = cellEl.cloneNode(false);
  el.textContent = p.ch || '';
  el.style.setProperty('--fg', p.fg);
  el.style.setProperty('--bg', p.bg);
  for (const [prop, value] of [['--drawing', p.mask], ['--glints', p.glints], ['--glint-ink', p.glintInk], ['--fill', p.fill]]) {
    if (value) el.style.setProperty(prop, value);
    else el.style.removeProperty(prop);
  }
  el.toggleAttribute('data-drawing', !!p.mask);
  el.toggleAttribute('data-glints', !!p.glints);
  if (p.passage) el.dataset.passage = p.passage;
  else delete el.dataset.passage;
  el.classList.toggle('b', !!p.bold);
  return el;
}

// ---- the stair drawing, taken apart into its three treads ------------------------------

// A mask's svg: its transform and its little rectangles, as [x, y, w, h].
function readMask(url) {
  const svg = decodeURIComponent(String(url).replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));
  const transform = (svg.match(/transform="([^"]*)"/) || [])[1] || '';
  const d = (svg.match(/ d="([^"]+)"/) || [])[1] || '';
  const rects = [...d.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g)].map((m) => m.slice(1, 5).map(Number));
  return { transform, rects };
}

// The rectangles of each tread, from the top of the drawing as it is before it is turned:
// the first is the narrowest.
function treadsOf(rects) {
  const ys = [...new Set(rects.map((r) => r[1]))].sort((a, b) => a - b);
  const groups = [];
  let last = null;
  for (const y of ys) {
    if (last === null || y - last > 1.2) groups.push([]);
    groups.at(-1).push(y);
    last = y;
  }
  return groups.map((g) => rects.filter((r) => g.includes(r[1])));
}

function maskOf(transform, rects) {
  const d = rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="white" transform="${transform}" d="${d}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---- drawing a frame -------------------------------------------------------------------

function setPatched(f, on) {
  if (f.patched === on) return;
  const [out, inn] = on ? [f.cells[f.meAt], f.floor] : [f.floor, f.original];
  if (on) f.original = out;
  out.replaceWith(inn);
  f.cells[f.meAt] = inn;
  f.patched = on;
}

function setFold(f, keep) {
  const key = keep ? keep.join() : null;
  if (f.folded === key) return;
  const el = f.cells[f.at];
  if (keep === null) el.style.setProperty('--drawing', f.mask);
  else el.style.setProperty('--drawing', maskOf(f.transform, keep.flatMap((t) => f.treads[t] || [])));
  f.folded = key;
}

function apply(old, neu, size, f) {
  setPatched(old, f.patch === 'o' || f.patch === 'on');
  setPatched(neu, f.patch === 'n' || f.patch === 'on');
  setFold(old, f.fold?.o ?? null);
  setFold(neu, f.fold?.n ?? null);
  old.el.style.visibility = f.show === 'o' || f.show === 'both' ? '' : 'hidden';
  neu.el.style.visibility = f.show === 'n' || f.show === 'both' ? '' : 'hidden';
  const move = ([x, y]) => `translate(${(x * 100) / size}%, ${(y * 100) / size}%)`;
  old.el.style.transform = f.shift ? move(f.shift[0]) : '';
  neu.el.style.transform = f.shift ? move(f.shift[1]) : '';
}
