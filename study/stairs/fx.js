// The stairs study's animations. Each turns going down or up into a few hard frames, as
// the game's own effects are ("Nothing here moves smoothly", style.css). They play over
// the map, on copies of the floor you left and the floor you came to, and when the last
// frame is done the copies go and the real map is there.

import { paintEsoteric } from '../../esoteric/edition.js';
import { stairsDownMask } from '../../esoteric/symbols.js';

const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// Each animation: its name, where it comes from, and its numbers. `black`: frames of black
// at the cut (null: it has none). `n`: its own number, with the panel's name and range.
export const ANIMS = [
  {
    key: 'blink', name: 'blink', black: 2,
    source: 'what the game does now: the map is black, then it is the new floor',
  },
  {
    key: 'behind', name: 'behind the tread', black: 1,
    n: { name: 'steps', min: 2, max: 12, value: 6 },
    source: 'The Legend of Zelda (1986): at a cave mouth Link sinks out of sight behind its edge, a pixel at a time, and rises out of it on the way back',
  },
  {
    key: 'shrink', name: 'shrink', black: 1,
    n: { name: 'steps', min: 2, max: 8, value: 4 },
    source: 'Gauntlet (1985) has exit animations; as remembered, the hero shrinks into the exit (not checked). Here the spiral shrinks into the stairs and grows out of the other ones',
  },
  {
    key: 'fold', name: 'folding stairs', black: 1, blackName: 'black, no roll',
    n: { name: 'frames a tread', min: 1, max: 6, value: 2 },
    more: [
      { key: 'gone', name: 'gone first', min: 0, max: 8, step: 1, value: 2 },
      { key: 'roll', name: 'roll, frames a tile', min: 0, max: 3, step: 0.5, value: 0.5 },
      { key: 'wait', name: 'wait to appear', min: 0, max: 10, step: 1, value: 3 },
    ],
    source: 'The Tower of Druaga (1985): the door turns into a stair tile and Gil walks onto it. Here you vanish, the treads go one at a time from your side to the edge, the screen rolls over the way you went (0: black instead), the treads come back from the edge, and then you appear',
  },
  {
    key: 'closeup', name: 'close-up', black: 0,
    n: { name: 'steps', min: 2, max: 16, value: 8 },
    source: 'Ultima IV (1985) draws its ladders head-on; Dungeon Master (1987) shows stairs going down a corridor. Here a cut to big treads on black, passing under you going down, coming at you going up',
  },
  {
    key: 'rows', name: 'row by row', black: null,
    n: { name: 'rows a frame', min: 1, max: 3, value: 1 },
    source: 'Final Fantasy (1987): the map closes to a strip on the way into a castle. Here the new floor replaces the old a row at a time, from the bottom going down, from the top going up',
  },
  {
    key: 'torch', name: 'torch', black: 1,
    n: { name: 'rings a frame', min: 1, max: 3, value: 1 },
    source: 'Ultima V (1988): at night you see only a short way. Dragon Quest (1986): a torch lights only the squares beside you. Here the dark closes in on you, then opens out from you',
  },
  {
    key: 'invert', name: 'inverted', black: 0,
    n: { name: 'inverted frames', min: 1, max: 6, value: 2 },
    source: 'Ultima IV (1985): casting a spell inverts the colours of the screen',
  },
  {
    key: 'terminal', name: 'terminal', black: 1,
    n: { name: 'squares a frame', min: 1, max: 14, value: 7 },
    source: 'Rogue (1980) on a slow line: the screen clears, then the new level is typed out from the top. At 7 squares a frame, a row a frame',
  },
  {
    key: 'curtain', name: 'curtain', black: 1,
    n: { name: 'columns a frame', min: 1, max: 2, value: 1 },
    source: 'The Legend of Zelda (1986): a dungeon opens like curtains from the middle (as remembered, not checked). Here they close on the old floor first',
  },
  {
    key: 'shaft', name: 'lift shaft', black: 2,
    n: { name: 'rows a frame', min: 1, max: 3, value: 1 },
    source: 'Impossible Mission (1984): you ride a lift through a shaft and the screen goes with you (as remembered). Going down the floor rises away; black here is the shaft between floors, in rows',
  },
  {
    key: 'layers', name: 'drawn in layers', black: 1,
    n: { name: 'frames a layer', min: 1, max: 6, value: 2 },
    source: 'Sierra’s first adventures (1980): you watched each picture draw itself, outlines first (as remembered). Here the walls, then the floor, then things, then you',
  },
  {
    key: 'dissolve', name: 'dissolve', black: 0,
    n: { name: 'squares a frame', min: 2, max: 25, value: 6 },
    source: 'no 80s game found for this one: the squares change in a random order. With black above 0 it goes through black',
  },
];

export const byKey = Object.fromEntries(ANIMS.map((a) => [a.key, a]));

// An animation's numbers, as the panel shows them: { key, name, min, max, step, value }.
export function paramsOf(a) {
  const list = [];
  if (a.n) list.push({ key: 'n', step: 1, ...a.n });
  list.push(...(a.more || []));
  if (a.black !== null) list.push({ key: 'black', name: a.blackName || 'black', min: 0, max: 8, step: 1, value: a.black });
  return list;
}

// ---- the stair drawing, taken apart into its three treads -------------------------------

// A mask's svg: its transform and its little rectangles, as [x, y, w, h].
function readMask(url) {
  const svg = decodeURIComponent(String(url).replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));
  const transform = (svg.match(/transform="([^"]*)"/) || [])[1] || '';
  const d = (svg.match(/ d="([^"]+)"/) || [])[1] || '';
  const rects = [...d.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g)].map((m) => m.slice(1, 5).map(Number));
  return { transform, rects };
}

const rectPath = (rects) => rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');

function maskUrl(viewBox, transform, rects) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="white" transform="${transform}" d="${rectPath(rects)}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
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

// One tread on its own, filling its mask: for the close-up's big treads.
const TREAD_MASKS = (() => {
  const treads = treadsOf(readMask(stairsDownMask('n')).rects);
  return treads.map((t) => {
    const x0 = Math.min(...t.map((r) => r[0]));
    const y0 = Math.min(...t.map((r) => r[1]));
    const x1 = Math.max(...t.map((r) => r[0] + r[2]));
    const y1 = Math.max(...t.map((r) => r[1] + r[3]));
    return maskUrl(`${x0} ${y0} ${x1 - x0} ${y1 - y0}`, '', t);
  });
})();

// ---- the frames ----------------------------------------------------------------------

// A frame: `cells(i)` says what each square shows: 'o' the old floor, 'n' the new one,
// 'b' black. `both`: both floors whole, moved by `shift` squares ([[x, y] old, [x, y] new]).
// `invert`: 'o' or 'n'. `patch`: 'o', 'n' or 'on', the floors whose spiral has left its
// square. `actor`: the spiral drawn on its own, { on, at, t, scale }: at the stairs `at`, gone
// `t` of a square toward the edge, at `scale`. `fold`: { o, n }: which treads of each floor's
// stairs are drawn. `bars`: the close-up's treads, [{ z }]. `ms`: how many frames it lasts.
const showAll = (s) => () => s;

function framesFor(key, ctx, o) {
  const { size, way } = ctx;
  const N = size * size;
  const B = Math.max(0, o.black ?? 0);
  const n = o.n;
  const black = () => Array.from({ length: B }, () => ({ cells: showAll('b') }));
  const xy = (i) => [i % size, Math.floor(i / size)];
  const os = ctx.old.stairs;
  const ns = ctx.neu.stairs;
  switch (key) {
    case 'blink':
      return black();

    case 'behind': {
      if (!os || !ns) return black();
      const out = [];
      for (let k = 0; k <= n; k++) out.push({ cells: showAll('o'), patch: 'o', actor: { on: 'o', at: os, t: k / n, scale: 1 } });
      out.push(...black());
      for (let k = n - 1; k >= 0; k--) out.push({ cells: showAll('n'), patch: 'n', actor: { on: 'n', at: ns, t: k / n, scale: 1 } });
      return out;
    }

    case 'shrink': {
      if (!os || !ns) return black();
      const out = [];
      for (let k = 0; k <= n; k++) out.push({ cells: showAll('o'), patch: 'o', actor: k < n ? { on: 'o', at: os, t: 0, scale: 1 - k / n } : null });
      out.push(...black());
      for (let k = 1; k <= n; k++) out.push({ cells: showAll('n'), patch: 'n', actor: { on: 'n', at: ns, t: 0, scale: k / n } });
      return out;
    }

    case 'fold': {
      // You vanish first; then the treads go one at a time, in the order you would walk
      // them, from your side to the edge. The screen rolls over the way you went, a tile at a
      // time, as it does between rooms (or, with no roll, goes black). On the other floor the
      // treads come back one at a time from the edge, and then, after a wait, you appear.
      if (!os || !ns) return black();
      const out = [];
      const hold = (k, f) => { for (let h = 0; h < k; h++) out.push(f); };
      const leaving = ctx.old.roomFirst;
      const coming = [...ctx.neu.roomFirst].reverse();
      for (let j = 0; j <= 3; j++) hold(j === 0 ? o.gone : n, { cells: showAll('o'), patch: 'o', fold: { o: leaving.slice(j) } });
      if (o.roll > 0) {
        const [sx, sy] = STEP[os.side];
        for (let k = 1; k < size; k++) {
          out.push({ both: true, shift: [[-sx * k, -sy * k], [sx * (size - k), sy * (size - k)]], patch: 'on', fold: { o: [], n: [] }, ms: o.roll });
        }
      } else out.push(...black());
      for (let j = 0; j <= 3; j++) hold(j === 3 ? o.wait : n, { cells: showAll('n'), patch: 'n', fold: { n: coming.slice(0, j) } });
      return out;
    }

    case 'closeup': {
      // Treads at distances z; each step they come a third of a tread nearer (going down)
      // or go a third further (going up). Three at the start, more come into view as they go.
      const dz = 1 / 3;
      const out = [...black()];
      let zs = [1.2, 2.2, 3.2];
      for (let k = 0; k <= n; k++) {
        out.push({ cells: showAll('b'), bars: zs.map((z) => ({ z })) });
        if (way === 'down') {
          zs = zs.map((z) => z - dz).filter((z) => z > 0.45);
          const far = Math.max(...zs, 0);
          if (far < 3.6) zs.push(far + 1);
        } else {
          zs = zs.map((z) => z + dz).filter((z) => z < 5.5);
          const near = Math.min(...zs, 9);
          if (near > 1.1) zs.push(near - 1);
        }
      }
      return out;
    }

    case 'rows': {
      const out = [];
      for (let k = 1; k * n < size + n; k++) {
        const reach = Math.min(size, k * n);
        out.push({ cells: (i) => {
          const y = xy(i)[1];
          return (way === 'down' ? y >= size - reach : y < reach) ? 'n' : 'o';
        } });
      }
      out.pop(); // the last is the new floor whole, which the end shows
      return out;
    }

    case 'torch': {
      const far = (me) => Math.max(...Array.from({ length: N }, (_, i) => Math.hypot(xy(i)[0] - me.x, xy(i)[1] - me.y)));
      const lit = (me, r) => (i) => Math.hypot(xy(i)[0] - me.x, xy(i)[1] - me.y) <= r + 0.5;
      const out = [];
      const oldMe = ctx.old.me;
      const newMe = ctx.neu.me;
      for (let r = Math.ceil(far(oldMe)) - n; r >= -1; r -= n) {
        const on = lit(oldMe, r);
        out.push({ cells: (i) => (on(i) ? 'o' : 'b') });
      }
      if (out.length === 0 || out.at(-1).cells(oldMe.y * size + oldMe.x) !== 'b') out.push({ cells: showAll('b') });
      out.push(...black());
      const reach = Math.ceil(far(newMe));
      for (let r = 0; r < reach; r += n) {
        const on = lit(newMe, r);
        out.push({ cells: (i) => (on(i) ? 'n' : 'b') });
      }
      return out;
    }

    case 'invert': {
      const out = [];
      for (let k = 0; k < n; k++) out.push({ cells: showAll('o'), invert: 'o' });
      out.push(...black());
      for (let k = 0; k < n; k++) out.push({ cells: showAll('n'), invert: 'n' });
      return out;
    }

    case 'terminal': {
      const out = [...black()];
      for (let k = 0; k * n < N; k++) {
        const typed = k * n;
        out.push({ cells: (i) => (i < typed ? 'n' : 'b') });
      }
      return out;
    }

    case 'curtain': {
      const mid = (size - 1) / 2;
      const out = [];
      // closing on the old floor, from both sides to the middle
      for (let k = 1; mid - k * n >= -0.5; k++) {
        const open = mid - k * n;
        out.push({ cells: (i) => (Math.abs(xy(i)[0] - mid) <= open ? 'o' : 'b') });
      }
      out.push(...black());
      // opening on the new floor, from the middle out
      for (let k = 0; k * n < mid; k++) {
        const open = k * n;
        out.push({ cells: (i) => (Math.abs(xy(i)[0] - mid) <= open ? 'n' : 'b') });
      }
      return out;
    }

    case 'shaft': {
      const total = size + B;
      const out = [];
      for (let k = 1; ; k++) {
        const s = Math.min(total, k * n);
        if (s >= total) break; // the last is the new floor in place, which the end shows
        out.push({ both: true, shift: way === 'down' ? [[0, -s], [0, total - s]] : [[0, s], [0, -(total - s)]] });
      }
      return out;
    }

    case 'layers': {
      const layer = (c) => {
        if (!c || c.state === 'unknown') return 1;
        if (c.thing?.kind === 'player') return 4;
        if (c.thing || c.t === 'statue') return 3;
        if (['wall', 'void', 'door', 'golddoor', 'opendoor', 'stairs', 'upstairs'].includes(c.t)) return 1;
        return 2;
      };
      const cells = ctx.neu.view.cells || [];
      const out = [...black()];
      for (let l = 1; l <= 3; l++) {
        for (let h = 0; h < n; h++) out.push({ cells: (i) => (layer(cells[i]) <= l ? 'n' : 'b') });
      }
      return out;
    }

    case 'dissolve': {
      const shuffled = () => {
        const a = Array.from({ length: N }, (_, i) => i);
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const out = [];
      const pass = (from, to) => {
        const rank = new Array(N);
        shuffled().forEach((i, r) => { rank[i] = r; });
        for (let k = 1; k * n < N; k++) {
          const done = k * n;
          out.push({ cells: (i) => (rank[i] < done ? to : from) });
        }
      };
      if (B === 0) pass('o', 'n');
      else {
        pass('o', 'b');
        out.push(...black());
        pass('b', 'n');
      }
      return out;
    }
  }
  return black();
}

// ---- playing them --------------------------------------------------------------------

// host: the box the map is in. The copies, the spiral on its own and the close-up's treads
// are drawn in a sheet over the map, as big as it.
export function createStairsFx(host, size) {
  let run = null;

  function stop() {
    if (!run) return;
    clearTimeout(run.timer);
    run.sheet.remove();
    const done = run.done;
    run = null;
    if (done) done();
  }

  // oldMap, newMap: copies of the map before and after. before, after: the views. way: 'down'
  // or 'up'. Returns how many frames it will play and how long they take, { frames, ms }.
  function play({ oldMap, newMap, before, after, way, key, opts, frameMs, done }) {
    stop();
    const ctx = setup({ oldMap, newMap, before, after, way });
    const frames = framesFor(key, ctx, opts);
    run = { sheet: ctx.sheet, timer: null, done };
    const ms = Math.round(frames.reduce((sum, f) => sum + frameMs * (f.ms ?? 1), 0));
    if (frames.length === 0) {
      stop();
      return { frames: 0, ms: 0 };
    }
    let k = 0;
    const tick = () => {
      if (!run) return;
      clearTimeout(run.timer);
      if (k >= frames.length) return stop();
      const f = frames[k++];
      apply(ctx, f);
      run.timer = setTimeout(tick, frameMs * (f.ms ?? 1));
    };
    run.tick = tick;
    host.appendChild(ctx.sheet);
    tick();
    return { frames: frames.length, ms };
  }

  // For checking by hand: the next frame now.
  function step() {
    if (run) run.tick();
  }

  function setup({ oldMap, newMap, before, after, way }) {
    const sheet = document.createElement('div');
    sheet.className = 'stairs-fx';
    sheet.setAttribute('aria-hidden', 'true');
    const side = (map, view, stairsKind) => {
      const el = copy(map);
      const cells = [...el.children];
      const me = view.player;
      const stairs = findStairs(view, me, stairsKind, size);
      const meAt = me ? me.y * size + me.x : -1;
      // the spiral alone, and its square with the spiral gone
      const actor = meAt >= 0 ? cells[meAt].cloneNode(true) : null;
      const floor = meAt >= 0 ? floorOnly(cells[meAt], view, meAt, size) : null;
      let mask = null;
      let treads = null;
      let roomFirst = [2, 1, 0];
      if (stairs) {
        mask = cells[stairs.y * size + stairs.x].style.getPropertyValue('--drawing');
        const m = readMask(mask);
        treads = { transform: m.transform, list: treadsOf(m.rects) };
        // the stairs down narrow toward the edge, so their widest tread is by the room; the
        // stairs up are the other way round
        roomFirst = stairsKind === 'stairs' ? [2, 1, 0] : [0, 1, 2];
      }
      return { el, cells, view, me, stairs, meAt, actor, floor, patched: false, mask, treads, roomFirst, folded: null };
    };
    const old = side(oldMap, before, way === 'down' ? 'stairs' : 'upstairs');
    const neu = side(newMap, after, way === 'down' ? 'upstairs' : 'stairs');
    const actors = document.createElement('div');
    actors.className = 'map stairs-fx-actors';
    const box = document.createElement('div');
    box.className = 'stairs-fx-box';
    actors.appendChild(box);
    const bars = document.createElement('div');
    bars.className = 'stairs-fx-bars';
    sheet.append(neu.el, old.el, actors, bars);
    return { sheet, size, way, old, neu, box, actorOn: null, bars, barEls: [] };
  }

  return { play, stop, step, playing: () => !!run };
}

// A copy of the map to draw frames on: no ids, no state classes.
function copy(map) {
  const el = map.cloneNode(true);
  el.removeAttribute('id');
  el.className = 'map stairs-fx-floor';
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

// Your square drawn as if you had left it.
function floorOnly(cellEl, view, i, size) {
  const cells = view.cells.map((c, k) => (k === i ? { ...c, thing: null } : c));
  const x = i % size;
  const y = Math.floor(i / size);
  const env = { look: view.look, px: -99, py: -99, key: view.room ? view.room.key : 0, cells, size, turn: view.turn ?? 0 };
  const paint = paintEsoteric(cells[i], x, y, env);
  const el = cellEl.cloneNode(false);
  el.textContent = paint.ch || '';
  el.style.setProperty('--fg', paint.fg);
  el.style.setProperty('--bg', paint.bg);
  if (paint.mask) el.style.setProperty('--drawing', paint.mask);
  else el.style.removeProperty('--drawing');
  el.toggleAttribute('data-drawing', !!paint.mask);
  if (paint.glints) {
    el.style.setProperty('--glints', paint.glints);
    el.style.setProperty('--glint-ink', paint.glintInk);
  } else {
    el.style.removeProperty('--glints');
  }
  el.toggleAttribute('data-glints', !!paint.glints);
  if (paint.fill) el.style.setProperty('--fill', paint.fill);
  else el.style.removeProperty('--fill');
  return el;
}

function setPatched(side, on) {
  if (!side.floor || side.patched === on) return;
  const [out, inn] = on ? [side.cells[side.meAt], side.floor] : [side.floor, side.original];
  if (on) side.original = out;
  out.replaceWith(inn);
  side.cells[side.meAt] = inn;
  side.patched = on;
}

function setFold(side, keep) {
  if (!side.stairs || !side.treads) return;
  const key = keep ? keep.join() : null;
  if (side.folded === key) return;
  const size = Math.round(Math.sqrt(side.cells.length));
  const el = side.cells[side.stairs.y * size + side.stairs.x];
  if (keep === null) el.style.setProperty('--drawing', side.mask);
  else {
    const rects = keep.flatMap((t) => side.treads.list[t] || []);
    el.style.setProperty('--drawing', maskUrl('0 0 36 36', side.treads.transform, rects));
  }
  side.folded = key;
}

function apply(ctx, f) {
  const { size, old, neu } = ctx;
  setPatched(old, f.patch === 'o' || f.patch === 'on');
  setPatched(neu, f.patch === 'n' || f.patch === 'on');
  setFold(old, f.fold?.o ?? null);
  setFold(neu, f.fold?.n ?? null);
  for (let i = 0; i < size * size; i++) {
    const s = f.both ? null : f.cells(i);
    old.cells[i].style.visibility = f.both || s === 'o' ? '' : 'hidden';
    neu.cells[i].style.visibility = f.both || s === 'n' ? '' : 'hidden';
  }
  const move = ([x, y]) => `translate(${(x * 100) / size}%, ${(y * 100) / size}%)`;
  old.el.style.transform = f.shift ? move(f.shift[0]) : '';
  neu.el.style.transform = f.shift ? move(f.shift[1]) : '';
  old.el.style.filter = f.invert === 'o' ? 'invert(1)' : '';
  neu.el.style.filter = f.invert === 'n' ? 'invert(1)' : '';

  // the spiral on its own
  const a = f.actor;
  if (!a) ctx.box.style.display = 'none';
  else {
    const side = a.on === 'o' ? old : neu;
    if (ctx.actorOn !== a.on) {
      ctx.box.replaceChildren(side.actor);
      side.actor.className = 'c stairs-fx-actor';
      ctx.actorOn = a.on;
    }
    const cell = 100 / size;
    Object.assign(ctx.box.style, { display: '', left: `${a.at.x * cell}%`, top: `${a.at.y * cell}%`, width: `${cell}%`, height: `${cell}%` });
    const [dx, dy] = STEP[a.at.side];
    side.actor.style.transform = `translate(${dx * a.t * 100}%, ${dy * a.t * 100}%) scale(${a.scale})`;
  }

  // the close-up's treads
  const bars = f.bars || [];
  while (ctx.barEls.length < bars.length) {
    const el = document.createElement('div');
    el.className = 'stairs-fx-bar';
    ctx.bars.appendChild(el);
    ctx.barEls.push(el);
  }
  ctx.barEls.forEach((el, k) => {
    const b = bars[k];
    if (!b) {
      el.style.display = 'none';
      return;
    }
    // a simple perspective: the vanishing point above the middle
    const y = 30 + 50 / b.z;
    const w = 72 / b.z;
    const h = 6 / b.z;
    const tread = b.z > 2.6 ? 0 : b.z > 1.6 ? 1 : 2;
    Object.assign(el.style, {
      display: '',
      left: `${50 - w / 2}%`,
      top: `${y - h / 2}%`,
      width: `${w}%`,
      height: `${h}%`,
    });
    el.style.setProperty('--tread', TREAD_MASKS[tread] || TREAD_MASKS[0]);
  });
}
