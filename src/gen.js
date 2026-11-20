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
export const walkable = (t) => t !== 'wall' && t !== 'statue';

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

function makeRoom(rng, nb, grid) {
  for (;;) {
    const t = emptyRoom(nb, grid);
    addObstacles(rng, t);
    addGrass(rng, t);
    if (roomConnected(t)) return t;
  }
}

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
    seen: new Array(t.length).fill(false),
    memCorpse: new Array(t.length).fill(false),
  };
}

// The esoteric edition opens inside the drawing. Its stair is the only way out.
function drawnLevel(grid) {
  const { idx, mid, size } = grid;
  const farEdge = size - 2;
  const nb = { n: null, e: null, s: null, w: null };
  const t = emptyRoom(nb, grid);
  const room = roomState(0, 0, 0, 0, nb, t);
  const entrance = { room: 0, x: mid, y: farEdge - 1, ground: 'dirt' };
  const stairs = { room: 0, x: mid, y: farEdge };
  for (const y of [1, 2]) for (const x of [1, 2]) t[idx(x, y)] = 'grass';
  t[idx(entrance.x, entrance.y)] = 'entrance';
  t[idx(stairs.x, stairs.y)] = 'stairs';
  room.statue = { x: farEdge, y: mid, spoke: false };
  t[idx(room.statue.x, room.statue.y)] = 'statue';
  return { depth: 1, rooms: [room], entrance, stairs, toadRoom: null };
}

export function makeLevel(rng, depth, edition) {
  const drawn = edition === 'esoteric';
  const grid = drawn ? roomGrid(CONFIG.esotericInteriorSize + 2) : standardGrid;
  const { idx } = grid;
  if (drawn && depth === 1) return drawnLevel(grid);
  const toadLevel = depth === CONFIG.toadLevel + (drawn ? 1 : 0);
  const spots = placeRooms(rng, toadLevel ? CONFIG.toadExtraRoom : 0);
  const salt = int(rng, 1, 1 << 20);
  const at = new Map(spots.map(([gx, gy], i) => [`${gx},${gy}`, i]));
  const rooms = spots.map(([gx, gy], i) => {
    const nb = {};
    for (const d of DIRS) {
      const n = at.get(`${gx + STEP[d][0]},${gy + STEP[d][1]}`);
      nb[d] = n === undefined ? null : n;
    }
    return roomState(i, gx, gy, salt * 8 + i, nb, makeRoom(rng, nb, grid));
  });

  // The entrance, in the first room, in grass or on dirt.
  const first = rooms[0];
  const [ex, ey, ground] = placeEntrance(rng, first.t);
  first.t[idx(ex, ey)] = 'entrance';
  const level = { depth, rooms, entrance: { room: 0, x: ex, y: ey, ground }, stairs: null, toadRoom: null };

  // The stairs, in the room farthest from the first.
  const hops = roomHops(rooms);
  const far = Math.max(...hops);
  const room = pick(rng, rooms.filter((r) => hops[r.id] === far));
  if (toadLevel && room.id !== 0) {
    makeToadRoom(rng, room, level);
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

// The toad's room: the small room in the corner farthest from where you come in,
// its golden door, the stairs in it, the toad asleep near the door, and the bust of DEE.
function makeToadRoom(rng, room, level) {
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
        level.golddoor = { room: room.id, x: door.at[0], y: door.at[1] };
        return;
      }
    }
    room.t = makeRoom(rng, room.nb, grid); // this room will not do: make it again
  }
}
