// Making a level: rooms on a coarse grid, doors between neighbours,
// obstacles, grass, the entrance, the stairs. On level 1, the
// toad's room: a small room in its far corner, behind a golden door, holds the stairs.

import { CONFIG } from './config.js';
import { roomGrid, terrainGrid } from './grid.js';
import { int, chance, pick, weighted, shuffle } from './rng.js';

// Public helpers for the original eleven-wide rooms.
const standardGrid = roomGrid(CONFIG.roomSize);
export const { size: S, idx, inside, doors: DOOR, arrivals: ARRIVAL } = standardGrid;

export const DIRS = ['n', 'e', 's', 'w'];
export const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPP = { n: 's', e: 'w', s: 'n', w: 'e' };
// Nothing walks onto a wall or the bust.
// Stairs up in the wall (esoteric) are drawn with it, and nothing goes up them yet.
export const walkable = (t) => t !== 'wall' && t !== 'statue' && t !== 'upstairs' && t !== 'void';

const isArrivalSpot = (x, y, grid) => DIRS.some((d) => grid.arrivals[d][0] === x && grid.arrivals[d][1] === y);

// The arrival cells of the doors this room actually has.
export function arrivalCells(room) {
  const { arrivals } = terrainGrid(room.t);
  return DIRS.filter((d) => room.nb[d] !== null).map((d) => arrivals[d]);
}

export function isArrival(room, x, y) {
  return arrivalCells(room).some(([ax, ay]) => ax === x && ay === y);
}

// ---- the grid of rooms -------------------------------------------------

const ROOM_MAX = Math.max(...CONFIG.roomCounts.map(([n]) => n));

function placeRooms(rng, extra = 0) {
  const count = Math.min(weighted(rng, CONFIG.roomCounts) + extra, ROOM_MAX);
  const spots = [[0, 0]];
  const taken = new Set(['0,0']);
  while (spots.length < count) {
    const free = [];
    for (const [gx, gy] of spots) {
      for (const d of DIRS) {
        const nx = gx + STEP[d][0];
        const ny = gy + STEP[d][1];
        if (!taken.has(`${nx},${ny}`)) free.push([nx, ny]);
      }
    }
    const [nx, ny] = pick(rng, free);
    taken.add(`${nx},${ny}`);
    spots.push([nx, ny]);
  }
  return spots;
}

// ---- one room ----------------------------------------------------------

function emptyRoom(nb, grid) {
  const { size, idx, inside, doors } = grid;
  const t = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) t[idx(x, y)] = inside(x, y) ? 'floor' : 'wall';
  }
  for (const d of DIRS) if (nb[d] !== null) t[idx(...doors[d])] = 'door';
  return t;
}

function interiorCells(t, ok) {
  const grid = terrainGrid(t);
  const { size, idx } = grid;
  const out = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) if (ok(t[idx(x, y)], x, y, grid)) out.push([x, y]);
  }
  return out;
}

function addObstacles(rng, t) {
  const grid = terrainGrid(t);
  const { size, mid, idx } = grid;
  const kind = int(rng, 0, 3);
  if (kind === 1) {
    const near = Math.floor(size / 3);
    const pillars = [near, size - 1 - near];
    for (const x of pillars) for (const y of pillars) t[idx(x, y)] = 'wall';
  }
  if (kind === 2) t[idx(mid, mid)] = 'wall';
  if (kind === 3) {
    const n = int(rng, CONFIG.scatterWalls[0], CONFIG.scatterWalls[1]);
    const spots = shuffle(rng, interiorCells(t, (c, x, y) => c === 'floor' && !isArrivalSpot(x, y, grid)));
    for (const [x, y] of spots.slice(0, n)) t[idx(x, y)] = 'wall';
  }
}

function addGrass(rng, t) {
  const patches = int(rng, CONFIG.grassPatches[0], CONFIG.grassPatches[1]);
  for (let p = 0; p < patches; p++) {
    const start = pick(rng, interiorCells(t, (c) => c === 'floor'));
    if (!start) return;
    growGrass(rng, t, start);
  }
}

// One patch of grass, grown over floor from start.
function growGrass(rng, t, start) {
  const { idx, inside } = terrainGrid(t);
  const size = int(rng, CONFIG.grassSize[0], CONFIG.grassSize[1]);
  const patch = [start];
  t[idx(...start)] = 'grass';
  while (patch.length < size) {
    const edge = [];
    for (const [x, y] of patch) {
      for (const d of DIRS) {
        const nx = x + STEP[d][0];
        const ny = y + STEP[d][1];
        if (inside(nx, ny) && t[idx(nx, ny)] === 'floor') edge.push([nx, ny]);
      }
    }
    if (edge.length === 0) break;
    const next = pick(rng, edge);
    t[idx(...next)] = 'grass';
    patch.push(next);
  }
}

// Steps from (x, y) to every walkable cell in the room; -1 where unreachable.
export function roomDistances(t, x, y, pass = walkable) {
  const { size, idx } = terrainGrid(t);
  const dist = new Array(size * size).fill(-1);
  dist[idx(x, y)] = 0;
  const queue = [[x, y]];
  for (let q = 0; q < queue.length; q++) {
    const [cx, cy] = queue[q];
    for (const d of DIRS) {
      const nx = cx + STEP[d][0];
      const ny = cy + STEP[d][1];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const i = idx(nx, ny);
      if (dist[i] >= 0 || !pass(t[i], nx, ny)) continue;
      dist[i] = dist[idx(cx, cy)] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

export function roomConnected(t) {
  const { size } = terrainGrid(t);
  const cells = [];
  for (let i = 0; i < size * size; i++) if (walkable(t[i])) cells.push(i);
  if (cells.length === 0) return true;
  const dist = roomDistances(t, cells[0] % size, Math.floor(cells[0] / size));
  return cells.every((i) => dist[i] >= 0);
}

// shaped: an esoteric room, cut to a shape of its own (decision 256).
// keep: stairs up to put in it, { x, y, side }: the cell inside them is kept open and they and
// the cells either side of them stay wall (decision 340).
function makeRoom(rng, nb, grid, shaped = false, keep = null) {
  for (let tries = 0; ; tries++) {
    const t = emptyRoom(nb, grid);
    const whole = !shaped || carveShape(rng, t, nb, grid, keep, tries > 40);
    const parted = shaped && tries <= 40 && addPartitions(rng, t, grid, keep);
    if (whole && !parted) addObstacles(rng, t);
    addGrass(rng, t);
    if (roomConnected(t) && keepsStairs(t, keep, grid)) return t;
  }
}

// ---- esoteric room shapes (decision 256) -----------------------------------
// The open ground of a room is a rectangle of its five by five, from the whole of it down
// to a single row or column, sometimes with corners cut away, and a straight way from each
// gap to the middle. What isn't open is void, and walls grow round what is open: every
// cell beside open ground, the eight ways, that isn't a gap.

const SPAN_WEIGHTS = [[5, 5], [4, 2], [3, 2], [2, 1], [1, 1]];
const CUT_CHANCE = 0.3;

const perpendicular = (side) => (side === 'n' || side === 's' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]]);

// The one cell stairs in the wall at { x, y, side } are reached from: just inside them.
const insideStairs = (s) => [s.x - STEP[s.side][0], s.y - STEP[s.side][1]];

// The cells stairs kept for at keep must leave closed: the stairs and the walls either side.
function keptClosed(keep) {
  if (!keep) return [];
  return [[keep.x, keep.y], ...perpendicular(keep.side).map(([dx, dy]) => [keep.x + dx, keep.y + dy])];
}

// Does t leave room for the stairs up at keep: open ground inside, and wall at them and
// either side of them, so the cell inside is their one way in?
function keepsStairs(t, keep, grid) {
  if (!keep) return true;
  const { idx } = grid;
  const [ix, iy] = insideStairs(keep);
  if (!['floor', 'grass'].includes(t[idx(ix, iy)])) return false;
  return keptClosed(keep).every(([x, y]) => t[idx(x, y)] === 'wall');
}

// Does the way from the gap on side d to the middle pass any of these cells?
function crossesWay(d, cells, grid) {
  const { mid, arrivals, doors } = grid;
  const way = [doors[d]];
  let [x, y] = arrivals[d];
  for (;;) {
    way.push([x, y]);
    if (x === mid && y === mid) break;
    x += Math.sign(mid - x);
    y += Math.sign(mid - y);
  }
  return cells.some(([cx, cy]) => way.some(([wx, wy]) => wx === cx && wy === cy));
}

// Cut t to a shape. whole: the full five by five. Returns true if nothing was cut away.
function carveShape(rng, t, nb, grid, keep, whole) {
  const { size, mid, idx, arrivals } = grid;
  const lo = 1;
  const hi = size - 2;
  const n = hi - lo + 1;
  const open = new Set();
  const add = (x, y) => x >= lo && y >= lo && x <= hi && y <= hi && open.add(idx(x, y));
  const w = whole ? n : weighted(rng, SPAN_WEIGHTS);
  const h = whole ? n : weighted(rng, SPAN_WEIGHTS);
  const x0 = int(rng, Math.max(lo, mid - w + 1), Math.min(mid, hi - w + 1));
  const y0 = int(rng, Math.max(lo, mid - h + 1), Math.min(mid, hi - h + 1));
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) add(x, y);
  let cut = false;
  if (!whole && w >= 3 && h >= 3) {
    for (const [cx, sx] of [[x0, 1], [x0 + w - 1, -1]]) {
      for (const [cy, sy] of [[y0, 1], [y0 + h - 1, -1]]) {
        if (!chance(rng, CUT_CHANCE)) continue;
        const k = w >= 4 && h >= 4 && chance(rng, 0.5) ? 2 : 1;
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) open.delete(idx(cx + sx * a, cy + sy * b));
        cut = true;
      }
    }
  }
  // a straight way from each gap to the middle
  const toMiddle = (x, y) => {
    for (; x !== mid; x += Math.sign(mid - x)) add(x, y);
    for (; y !== mid; y += Math.sign(mid - y)) add(x, y);
    add(x, y);
  };
  for (const d of DIRS) if (nb[d] !== null) toMiddle(...arrivals[d]);
  if (keep) {
    // a way from the cell inside the stairs to the middle; the stairs and either side stay wall
    toMiddle(...insideStairs(keep));
    for (const [cx, cy] of keptClosed(keep)) open.delete(idx(cx, cy));
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, y);
      if (open.has(i)) {
        t[i] = 'floor';
        continue;
      }
      if (t[i] === 'door') continue;
      let beside = false;
      for (const [ex, ey] of NEIGHBOURS8) if (open.has(idx(x + ex, y + ey)) && x + ex >= 0 && y + ey >= 0 && x + ex < size && y + ey < size) beside = true;
      t[i] = beside ? 'wall' : 'void';
    }
  }
  return w === n && h === n && !cut;
}

// Walls partitioning a room (decision 259): up to two straight lengths of wall across its
// open ground, each with open ground on both sides and a way round one end. Returns
// whether any went in. Never on where you come in.
const PARTITION_CHANCES = [0.5, 0.3];
function addPartitions(rng, t, grid, keep) {
  const { size, idx } = grid;
  const isOpen = (x, y) => x >= 0 && y >= 0 && x < size && y < size && t[idx(x, y)] === 'floor';
  const spare = DIRS.map((d) => grid.arrivals[d]);
  if (keep) spare.push(insideStairs(keep));
  const spared = (x, y) => spare.some(([sx, sy]) => sx === x && sy === y);
  let added = false;
  for (const p of PARTITION_CHANCES) {
    if (!chance(rng, p)) break;
    const runs = [];
    for (const across of [true, false]) {
      for (let k = 2; k <= size - 3; k++) {
        let run = [];
        for (let j = 1; j <= size - 1; j++) {
          const [x, y] = across ? [j, k] : [k, j];
          const [ax, ay, bx, by] = across ? [x, y - 1, x, y + 1] : [x - 1, y, x + 1, y];
          const fits = j < size - 1 && isOpen(x, y) && isOpen(ax, ay) && isOpen(bx, by) && !spared(x, y);
          if (fits) run.push([x, y]);
          else {
            if (run.length >= 3) runs.push(run);
            run = [];
          }
        }
      }
    }
    if (runs.length === 0) break;
    const run = pick(rng, runs);
    const len = int(rng, 2, run.length - 1);
    const part = chance(rng, 0.5) ? run.slice(0, len) : run.slice(run.length - len);
    for (const [x, y] of part) t[idx(x, y)] = 'wall';
    added = true;
  }
  return added;
}

const NEIGHBOURS8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

// ---- the level as a whole ----------------------------------------------

// Steps from the entrance to every cell of every room, walking as the player
// does: stepping onto a door puts you on the arrival cell next door. The golden
// door is walked through (as with the key) unless locked is true.
// Returns an array of rooms, each an array of distances (-1: unreachable).
export function levelDistances(level, from = level.entrance, { locked = false } = {}) {
  const { size, idx, arrivals } = terrainGrid(level.rooms[from.room].t);
  const dist = level.rooms.map(() => new Array(size * size).fill(-1));
  dist[from.room][idx(from.x, from.y)] = 0;
  const queue = [[from.room, from.x, from.y]];
  for (let q = 0; q < queue.length; q++) {
    const [r, x, y] = queue[q];
    const here = dist[r][idx(x, y)];
    const room = level.rooms[r];
    for (const d of DIRS) {
      let nr = r;
      let nx = x + STEP[d][0];
      let ny = y + STEP[d][1];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const c = room.t[idx(nx, ny)];
      if (!walkable(c) || (locked && c === 'golddoor')) continue;
      if (c === 'door') {
        if (room.nb[d] === null) continue; // a way on not made yet
        nr = room.nb[d];
        [nx, ny] = arrivals[OPP[d]];
      }
      if (dist[nr][idx(nx, ny)] >= 0) continue;
      dist[nr][idx(nx, ny)] = here + 1;
      queue.push([nr, nx, ny]);
    }
  }
  return dist;
}

// Rooms apart from room 0, counting doors.
function roomHops(rooms) {
  const hops = rooms.map(() => -1);
  hops[0] = 0;
  const queue = [0];
  for (let q = 0; q < queue.length; q++) {
    const r = queue[q];
    for (const d of DIRS) {
      const n = rooms[r].nb[d];
      if (n !== null && hops[n] < 0) {
        hops[n] = hops[r] + 1;
        queue.push(n);
      }
    }
  }
  return hops;
}

// A cell where the entrance, the stairs, the toad or the bust may go.
const openSpot = (c, x, y, grid) => (c === 'floor' || c === 'grass') && !isArrivalSpot(x, y, grid);

// Where the entrance goes, and what it stands in: [x, y, 'grass' | 'dirt'].
function placeEntrance(rng, t) {
  const grid = terrainGrid(t);
  const { idx } = grid;
  const grassNear = (x, y) => DIRS.some((d) => t[idx(x + STEP[d][0], y + STEP[d][1])] === 'grass');
  if (chance(rng, CONFIG.entranceInGrass)) {
    // On grass with grass beside it; else anywhere, with a patch grown around it.
    const spots = interiorCells(t, (c, x, y) => c === 'grass' && openSpot(c, x, y, grid) && grassNear(x, y));
    if (spots.length) return [...pick(rng, spots), 'grass'];
    let open = interiorCells(t, (c, x, y) => c === 'floor' && openSpot(c, x, y, grid));
    if (open.length === 0) open = interiorCells(t, openSpot);
    const at = pick(rng, open);
    growGrass(rng, t, at);
    return [...at, 'grass'];
  }
  let spots = interiorCells(t, (c, x, y) => c === 'floor' && openSpot(c, x, y, grid));
  if (spots.length === 0) spots = interiorCells(t, openSpot);
  const [x, y] = pick(rng, spots);
  return [x, y, t[idx(x, y)] === 'grass' ? 'grass' : 'dirt'];
}

function roomState(id, gx, gy, key, nb, t) {
  return {
    id, gx, gy, key, nb, t,
    corpses: [], toad: null, statue: null,
    loose: [], // items lying on the floor, thrown there (esoteric): [{ key, x, y, ... }]
    seen: new Array(t.length).fill(false),
    memCorpse: new Array(t.length).fill(false),
  };
}

// The esoteric edition's first floor (November 20): his drawn room, with only its grass and
// the entrance ("in the first room the only special thing is the grass and the entrance"),
// no stairs and two ways out ("there are no stairs but two exits out"). One goes to the
// mother's room, where she stands in the way on ("a room with a mother figure ... blocking
// the way out"); the other to the toad's room, with the bust, and the stairs behind the
// golden door. The mother to the west, the toad and the bust to the east, where the bust
// stood in the drawing. What lies past the mother isn't made yet: her gap leads nowhere.
export const FIRST_FLOOR = { mother: 'w', toad: 'e' };

function firstFloor(rng, grid) {
  const { idx, mid, size } = grid;
  const farEdge = size - 2;
  const none = { n: null, e: null, s: null, w: null };
  const ids = { [FIRST_FLOOR.mother]: 1, [FIRST_FLOOR.toad]: 2 };
  const salt = int(rng, 1, 1 << 20);

  // the drawing: its grass in the corner, the entrance below the middle, a gap either way
  const nb = { ...none, ...ids };
  const t = emptyRoom(nb, grid);
  for (const y of [1, 2]) for (const x of [1, 2]) t[idx(x, y)] = 'grass';
  const entrance = { room: 0, x: mid, y: farEdge - 1, ground: 'dirt' };
  t[idx(entrance.x, entrance.y)] = 'entrance';
  const first = roomState(0, 0, 0, 0, nb, t);
  first.grass = 'glowing'; // "it looks like regular grass, except it is glowing"

  // the mother's room: shaped, its gap to the drawing and, across from it, the way out,
  // where she stands
  const md = FIRST_FLOOR.mother;
  const back = OPP[md];
  const motherNb = { ...none, [back]: 0 };
  const motherT = makeRoom(rng, { ...motherNb, [md]: -1 }, grid, true);
  // nothing in it but her, for now: no grass
  for (let i = 0; i < motherT.length; i++) if (motherT[i] === 'grass') motherT[i] = 'floor';
  const mother = roomState(1, STEP[md][0], STEP[md][1], salt * 8 + 1, motherNb, motherT);
  const [wx, wy] = grid.doors[md];
  mother.mother = { x: wx, y: wy };

  // the toad's room: whole, for its small room in the corner, and its grass purple-green
  const td = FIRST_FLOOR.toad;
  const toadNb = { ...none, [OPP[td]]: 0 };
  const toad = roomState(2, STEP[td][0], STEP[td][1], salt * 8 + 2, toadNb, makeRoom(rng, toadNb, grid));
  toad.grass = 'purple'; // "the grass here is different, purple-green"
  const level = { depth: 1, rooms: [first, mother, toad], entrance, stairs: null, toadRoom: null };
  makeToadRoom(rng, toad, level, true);
  ensureGrass(rng, toad);
  return level;
}

// A room with no grass gets a patch, on open ground you can reach from where you come in
// without the golden door ("purple green grass will have worms underneath").
function ensureGrass(rng, room) {
  if (room.t.includes('grass')) return;
  const { idx } = terrainGrid(room.t);
  const [ax, ay] = arrivalCells(room)[0];
  const reach = roomDistances(room.t, ax, ay, (c) => walkable(c) && c !== 'golddoor');
  const spots = interiorCells(room.t, (c, x, y) => c === 'floor' && reach[idx(x, y)] > 0);
  if (spots.length) growGrass(rng, room.t, pick(rng, spots));
}

// In the esoteric edition the stairs down are anywhere on the edge of the map that has one way
// in (decision 323). `up`: where the stairs up go, { x, y, side }: on the other side of the
// screen from the stairs down above, in the same row or column and facing the same way, so you
// keep going the way you went (decision 340). If the first room can't have them there, they go
// anywhere stairs may.
export function makeLevel(rng, depth, edition, up = null) {
  const drawn = edition === 'esoteric';
  const grid = drawn ? roomGrid(CONFIG.esotericInteriorSize + 2) : standardGrid;
  const { idx } = grid;
  if (drawn && depth === 1) return firstFloor(rng, grid);
  // the esoteric edition's toad is on its first floor
  const toadLevel = !drawn && depth === CONFIG.toadLevel;
  // The stairs up must not stand on the way from a gap of the first room to its middle, so
  // the first room has no neighbour on such a side. If no layout will do, they go elsewhere.
  if (up && !up.side) up = null;
  const blocks = up ? DIRS.filter((d) => crossesWay(d, keptClosed(up), grid)) : [];
  let spots;
  for (let tries = 0; ; tries++) {
    spots = placeRooms(rng, toadLevel ? CONFIG.toadExtraRoom : 0);
    const clash = blocks.some((d) => spots.some(([gx, gy]) => gx === STEP[d][0] && gy === STEP[d][1]));
    if (!clash) break;
    if (tries > 60) {
      up = null;
      break;
    }
  }
  const salt = int(rng, 1, 1 << 20);
  const at = new Map(spots.map(([gx, gy], i) => [`${gx},${gy}`, i]));
  const rooms = spots.map(([gx, gy], i) => {
    const nb = {};
    for (const d of DIRS) {
      const n = at.get(`${gx + STEP[d][0]},${gy + STEP[d][1]}`);
      nb[d] = n === undefined ? null : n;
    }
    return roomState(i, gx, gy, salt * 8 + i, nb, makeRoom(rng, nb, grid, drawn, i === 0 ? up : null));
  });

  // The entrance, in the first room, in grass or on dirt. In the esoteric edition, the
  // stairs up in the wall, and you arrive just inside them.
  const first = rooms[0];
  const [ex, ey, ground] = drawn ? placeUpstairs(rng, first, grid, up) : placeEntrance(rng, first.t);
  if (!drawn) first.t[idx(ex, ey)] = 'entrance';
  const level = { depth, rooms, entrance: { room: 0, x: ex, y: ey, ground }, stairs: null, toadRoom: null };

  // The stairs, in the room farthest from the first.
  const hops = roomHops(rooms);
  const far = Math.max(...hops);
  const room = pick(rng, rooms.filter((r) => hops[r.id] === far));
  if (toadLevel && room.id !== 0) {
    // the toad's room keeps the whole five by five, for its small room in the corner
    if (drawn) room.t = makeRoom(rng, room.nb, grid);
    makeToadRoom(rng, room, level, drawn);
    return level;
  }
  if (drawn) {
    // The esoteric stairs are always in the wall (decision 251).
    const from = rooms.length === 1 ? [ex, ey] : arrivalCells(room)[0];
    const find = () => edgeStairSpots(room, from).filter((s) => rooms.length > 1 || s.steps >= CONFIG.stairsAway);
    let spots = find();
    // a room whose shape doesn't reach the edge of the map is shaped again (never the first,
    // which has the stairs up), and at last made whole
    for (let tries = 0; spots.length === 0 && room.id !== 0 && tries < 40; tries++) {
      room.t = makeRoom(rng, room.nb, grid, tries < 30);
      spots = find();
    }
    if (spots.length === 0) return makeLevel(rng, depth, edition, up); // try again
    const { x: sx, y: sy, side } = pick(rng, spots);
    room.t[idx(sx, sy)] = 'stairs';
    level.stairs = { room: room.id, x: sx, y: sy, side };
    return level;
  }
  let stairSpots = interiorCells(room.t, openSpot);
  if (rooms.length === 1) {
    const dist = roomDistances(room.t, ex, ey);
    stairSpots = stairSpots.filter(([x, y]) => dist[idx(x, y)] >= CONFIG.stairsAway);
  }
  if (stairSpots.length === 0) return makeLevel(rng, depth, edition); // very unlikely; try again
  const [sx, sy] = pick(rng, stairSpots);
  room.t[idx(sx, sy)] = 'stairs';
  level.stairs = { room: room.id, x: sx, y: sy };
  return level;
}

// ---- the toad's room -----------------------------------------------------

// The small room n cells across in the corner (cx, cy): its inside, the wall
// that closes it off, and where the golden door may go (the middle of either
// side), each with the cell inside and the cell outside it.
export function closetShape(cx, cy, n) {
  const sx = cx === 1 ? 1 : -1; // from the corner into the room
  const sy = cy === 1 ? 1 : -1;
  const px = cx + sx * n; // the closing wall's column
  const py = cy + sy * n; // and row
  const inner = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) inner.push([cx + sx * a, cy + sy * b]);
  const wall = [];
  for (let k = 0; k <= n; k++) wall.push([px, cy + sy * k]);
  for (let k = 0; k < n; k++) wall.push([cx + sx * k, py]);
  const m = n >> 1;
  const doors = [
    { at: [px, cy + sy * m], inside: [px - sx, cy + sy * m], outside: [px + sx, cy + sy * m] },
    { at: [cx + sx * m, py], inside: [cx + sx * m, py - sy], outside: [cx + sx * m, py + sy] },
  ];
  return { inner, wall, doors, corner: [cx, cy] };
}

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// Is every walkable cell outside the small room reachable from `from` without
// the golden door and without stepping on `block`?
function mainConnected(t, inner, from, block) {
  const { idx } = terrainGrid(t);
  const isInner = new Set(inner.map(([x, y]) => idx(x, y)));
  const b = block ? idx(block[0], block[1]) : -1;
  const pass = (c, x, y) => walkable(c) && c !== 'golddoor' && idx(x, y) !== b;
  const dist = roomDistances(t, from[0], from[1], pass);
  for (let i = 0; i < t.length; i++) {
    if (isInner.has(i) || i === b || !walkable(t[i]) || t[i] === 'golddoor') continue;
    if (dist[i] < 0) return false;
  }
  return true;
}

// Where the bust of DEE stands: open ground outside the small room, not by the
// golden door, not by the toad, with open ground beside it, and the room still
// whole around it and the toad. Null if nowhere will do.
function placeStatue(rng, t, shape, door, toad, from) {
  const { idx } = terrainGrid(t);
  const isInner = new Set(shape.inner.map(([x, y]) => idx(x, y)));
  const away = CONFIG.statueAway;
  const spots = interiorCells(t, openSpot).filter(([x, y]) => {
    if (isInner.has(idx(x, y))) return false;
    if (Math.max(Math.abs(x - door.at[0]), Math.abs(y - door.at[1])) < away.door) return false;
    if (manhattan([x, y], toad) < away.toad) return false;
    return DIRS.some((d) => ['floor', 'grass'].includes(t[idx(x + STEP[d][0], y + STEP[d][1])]));
  });
  for (const [x, y] of shuffle(rng, spots)) {
    const u = t.slice();
    u[idx(x, y)] = 'statue';
    if (mainConnected(u, shape.inner, from, toad)) return [x, y];
  }
  return null;
}

// Is (x, y) in the wall's ring of a room `size` across?
export const onRing = (x, y, size) => x === 0 || y === 0 || x === size - 1 || y === size - 1;

// Which side of the ring (x, y) is on: 'n', 'e', 's' or 'w'; null inside or at a corner.
export function ringSide(x, y, size) {
  const edge = size - 1;
  if ((x === 0 || x === edge) && (y === 0 || y === edge)) return null;
  if (y === 0) return 'n';
  if (y === edge) return 's';
  if (x === 0) return 'w';
  if (x === edge) return 'e';
  return null;
}

// The stairs up in the first room's wall: at `up` if the room was made for them (decision 340),
// else anywhere stairs may go there (323). Returns where you arrive, just inside them:
// [x, y, 'grass' | 'dirt'].
function placeUpstairs(rng, room, grid, up) {
  const { idx } = grid;
  let at = up && keepsStairs(room.t, up, grid) ? up : null;
  while (!at) {
    const open = interiorCells(room.t, (c) => c === 'floor' || c === 'grass');
    const from = arrivalCells(room)[0] ?? open[0];
    const spots = from ? edgeStairSpots(room, from) : [];
    if (spots.length) at = pick(rng, spots);
    else room.t = makeRoom(rng, room.nb, grid, true); // this room will not do: make it again
  }
  room.t[idx(at.x, at.y)] = 'upstairs';
  const [ix, iy] = insideStairs(at);
  return [ix, iy, room.t[idx(ix, iy)] === 'grass' ? 'grass' : 'dirt'];
}

// Where stairs may go in a room's wall: [{ x, y, side, steps }]. A wall cell at the edge of
// the map with open ground inside it (`side` is the way from there into the stairs),
// walls either side of it, so that is their one way in (decisions 267, 323), not where a
// gap to the next room is or could be, nor beside one, and not beside where you come in.
// `steps`: from `from` to them.
function edgeStairSpots(room, from) {
  const { t, nb } = room;
  const grid = terrainGrid(t);
  const { size, idx, mid, arrivals } = grid;
  const dist = roomDistances(t, from[0], from[1]);
  const inGrid = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const gapSpots = DIRS.map((d) => grid.doors[d]);
  const comeIn = arrivalCells(room);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (t[idx(x, y)] !== 'wall' || gapSpots.some((g) => same(g, [x, y]))) continue;
      // only at the edge of the map, facing out of it, so you know which way they go
      // (decision 260)
      for (const side of DIRS.filter((d) => d === ringSide(x, y, size))) {
        const [dx, dy] = STEP[side];
        const [ix, iy] = [x - dx, y - dy];
        const [bx, by] = [x + dx, y + dy];
        if (!inGrid(ix, iy) || !['floor', 'grass'].includes(t[idx(ix, iy)])) continue;
        if (inGrid(bx, by) && t[idx(bx, by)] !== 'void') continue;
        const flanks = perpendicular(side).map(([px, py]) => [x + px, y + py]);
        if (!flanks.every(([fx, fy]) => inGrid(fx, fy) && t[idx(fx, fy)] === 'wall')) continue;
        if (flanks.some((f) => DIRS.some((d) => nb[d] !== null && same(f, grid.doors[d])))) continue;
        if (comeIn.some((c) => same(c, [ix, iy]))) continue;
        const steps = dist[idx(ix, iy)];
        if (steps >= 0) out.push({ x, y, side, steps: steps + 1 });
      }
    }
  }
  return out;
}

// The toad's room: the small room in the corner farthest from where you come in,
// its golden door, the stairs in it, the toad asleep near the door, and the bust of DEE.
function makeToadRoom(rng, room, level, drawn = false) {
  const grid = terrainGrid(room.t);
  const { size, idx } = grid;
  const farEdge = size - 2;
  const corners = [[1, 1], [farEdge, 1], [1, farEdge], [farEdge, farEdge]];
  // Keep the closet clear of the approach from the middle of each wall.
  const n = Math.max(1, Math.min(grid.mid - 2, CONFIG.closetSize));
  const ins = arrivalCells(room);
  const far = (c) => Math.min(...ins.map((a) => manhattan(a, c)));
  const best = Math.max(...corners.map(far));
  const shape = closetShape(...pick(rng, corners.filter((c) => far(c) === best)), n);
  const [near, farthest] = CONFIG.toadNearDoor;
  for (;;) {
    const t = room.t.slice();
    for (const [x, y] of shape.inner) t[idx(x, y)] = 'floor';
    for (const [x, y] of shape.wall) t[idx(x, y)] = 'wall';
    const door = pick(rng, shape.doors);
    t[idx(...door.at)] = 'golddoor';
    if (t[idx(...door.outside)] === 'wall') t[idx(...door.outside)] = 'floor';
    t[idx(...shape.corner)] = 'stairs';
    if (mainConnected(t, shape.inner, ins[0], null)) {
      // Where the toad sleeps: near the door if it can, never on the step before it.
      const isInner = new Set(shape.inner.map(([x, y]) => idx(x, y)));
      const fromDoor = roomDistances(t, ...door.outside, (c) => c !== 'wall' && c !== 'golddoor');
      const open = interiorCells(t, openSpot).filter(
        ([x, y]) => !isInner.has(idx(x, y)) && !(x === door.outside[0] && y === door.outside[1]),
      );
      const nearDoor = open.filter(([x, y]) => {
        const d = fromDoor[idx(x, y)];
        return d >= near && d <= farthest;
      });
      const spot = [...shuffle(rng, nearDoor), ...shuffle(rng, open)].find((c) =>
        mainConnected(t, shape.inner, ins[0], c),
      );
      const statue = spot ? placeStatue(rng, t, shape, door, spot, ins[0]) : null;
      if (spot && statue) {
        t[idx(...statue)] = 'statue';
        room.t = t;
        room.statue = { x: statue[0], y: statue[1], spoke: false };
        const [x, y] = spot;
        room.toad = { x, y, home: { x, y }, hp: CONFIG.toad.hp, asleep: true, stirred: false, key: true, lastSeen: null };
        level.toadRoom = room.id;
        level.stairs = { room: room.id, x: shape.corner[0], y: shape.corner[1] };
        if (drawn) {
          // In the esoteric edition the stairs are in the wall beside the small room
          // (decision 251): its corner is open ground, and the way down is just beyond it.
          const [cx, cy] = shape.corner;
          const sy = cy === 1 ? 0 : size - 1;
          t[idx(cx, cy)] = 'floor';
          t[idx(cx, sy)] = 'stairs';
          level.stairs = { room: room.id, x: cx, y: sy, side: sy === 0 ? 'n' : 's' };
        }
        level.golddoor = { room: room.id, x: door.at[0], y: door.at[1] };
        return;
      }
    }
    room.t = makeRoom(rng, room.nb, grid); // this room will not do: make it again
  }
}
