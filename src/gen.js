// Making a level: rooms on a coarse grid, doors between neighbours,
// obstacles, grass, the entrance, the stairs, the goblins.

import { CONFIG } from './config.js';
import { int, chance, pick, weighted, shuffle } from './rng.js';

export const S = CONFIG.roomSize;
const M = (S - 1) >> 1; // the middle of a wall: 5

export const DIRS = ['n', 'e', 's', 'w'];
export const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPP = { n: 's', e: 'w', s: 'n', w: 'e' };
export const DOOR = { n: [M, 0], e: [S - 1, M], s: [M, S - 1], w: [0, M] };
export const ARRIVAL = { n: [M, 1], e: [S - 2, M], s: [M, S - 2], w: [1, M] };

// Pillar positions from the build contract (a shape, not tuning).
const PILLARS4 = [[3, 3], [7, 3], [3, 7], [7, 7]];

export const idx = (x, y) => y * S + x;
export const inside = (x, y) => x > 0 && y > 0 && x < S - 1 && y < S - 1;
export const walkable = (t) => t !== 'wall';

const isArrivalSpot = (x, y) => DIRS.some((d) => ARRIVAL[d][0] === x && ARRIVAL[d][1] === y);

// The arrival cells of the doors this room actually has.
export function arrivalCells(room) {
  return DIRS.filter((d) => room.nb[d] !== null).map((d) => ARRIVAL[d]);
}

export function isArrival(room, x, y) {
  return arrivalCells(room).some(([ax, ay]) => ax === x && ay === y);
}

// ---- the grid of rooms -------------------------------------------------

function placeRooms(rng) {
  const count = weighted(rng, CONFIG.roomCounts);
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

function emptyRoom(nb) {
  const t = new Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) t[idx(x, y)] = inside(x, y) ? 'floor' : 'wall';
  }
  for (const d of DIRS) if (nb[d] !== null) t[idx(...DOOR[d])] = 'door';
  return t;
}

function interiorCells(t, ok) {
  const out = [];
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) if (ok(t[idx(x, y)], x, y)) out.push([x, y]);
  }
  return out;
}

function addObstacles(rng, t) {
  const kind = int(rng, 0, 3);
  if (kind === 1) for (const [x, y] of PILLARS4) t[idx(x, y)] = 'wall';
  if (kind === 2) t[idx(M, M)] = 'wall';
  if (kind === 3) {
    const n = int(rng, CONFIG.scatterWalls[0], CONFIG.scatterWalls[1]);
    const spots = shuffle(rng, interiorCells(t, (c, x, y) => c === 'floor' && !isArrivalSpot(x, y)));
    for (const [x, y] of spots.slice(0, n)) t[idx(x, y)] = 'wall';
  }
}

function addGrass(rng, t) {
  const patches = int(rng, CONFIG.grassPatches[0], CONFIG.grassPatches[1]);
  for (let p = 0; p < patches; p++) {
    const size = int(rng, CONFIG.grassSize[0], CONFIG.grassSize[1]);
    const start = pick(rng, interiorCells(t, (c) => c === 'floor'));
    if (!start) return;
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
}

// Steps from (x, y) to every walkable cell in the room; -1 where unreachable.
export function roomDistances(t, x, y, pass = walkable) {
  const dist = new Array(S * S).fill(-1);
  dist[idx(x, y)] = 0;
  const queue = [[x, y]];
  for (let q = 0; q < queue.length; q++) {
    const [cx, cy] = queue[q];
    for (const d of DIRS) {
      const nx = cx + STEP[d][0];
      const ny = cy + STEP[d][1];
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const i = idx(nx, ny);
      if (dist[i] >= 0 || !pass(t[i], nx, ny)) continue;
      dist[i] = dist[idx(cx, cy)] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

export function roomConnected(t) {
  const cells = [];
  for (let i = 0; i < S * S; i++) if (walkable(t[i])) cells.push(i);
  if (cells.length === 0) return true;
  const dist = roomDistances(t, cells[0] % S, Math.floor(cells[0] / S));
  return cells.every((i) => dist[i] >= 0);
}

function makeRoom(rng, nb) {
  for (;;) {
    const t = emptyRoom(nb);
    addObstacles(rng, t);
    addGrass(rng, t);
    if (roomConnected(t)) return t;
  }
}

// ---- the level as a whole ----------------------------------------------

// Steps from the entrance to every cell of every room, walking as the player
// does: stepping onto a door puts you on the arrival cell next door.
// Returns an array of rooms, each an array of 121 distances (-1: unreachable).
export function levelDistances(level, from = level.entrance) {
  const dist = level.rooms.map(() => new Array(S * S).fill(-1));
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
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const c = room.t[idx(nx, ny)];
      if (c === 'wall') continue;
      if (c === 'door') {
        nr = room.nb[d];
        [nx, ny] = ARRIVAL[OPP[d]];
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

// A cell where the entrance, the stairs or a goblin may go.
const openSpot = (c, x, y) => (c === 'floor' || c === 'grass') && !isArrivalSpot(x, y);

function placeGoblins(rng, level, depth) {
  const want = depth + int(rng, 0, CONFIG.goblinsExtraMax);
  const dist = levelDistances(level);
  const free = level.rooms.map((room, r) =>
    interiorCells(room.t, openSpot).filter(([x, y]) => dist[r][idx(x, y)] >= CONFIG.goblin.awayFromEntrance),
  );
  let id = 1;
  for (let k = 0; k < want; k++) {
    const rooms = level.rooms.filter((room, r) => room.goblins.length < CONFIG.goblin.perRoom && free[r].length > 0);
    if (rooms.length === 0) break; // the level is full
    const room = pick(rng, rooms);
    const cells = free[room.id];
    const at = int(rng, 0, cells.length - 1);
    const [x, y] = cells.splice(at, 1)[0];
    room.goblins.push({
      id: id++,
      x,
      y,
      hp: CONFIG.goblin.hp,
      asleep: chance(rng, CONFIG.goblin.asleepChance),
      lastSeen: null,
    });
  }
}

export function makeLevel(rng, depth) {
  const spots = placeRooms(rng);
  const salt = int(rng, 1, 1 << 20);
  const at = new Map(spots.map(([gx, gy], i) => [`${gx},${gy}`, i]));
  const rooms = spots.map(([gx, gy], i) => {
    const nb = {};
    for (const d of DIRS) {
      const n = at.get(`${gx + STEP[d][0]},${gy + STEP[d][1]}`);
      nb[d] = n === undefined ? null : n;
    }
    return {
      id: i,
      gx,
      gy,
      key: salt * 8 + i,
      nb,
      t: makeRoom(rng, nb),
      goblins: [],
      corpses: [],
      seen: new Array(S * S).fill(false),
      memCorpse: new Array(S * S).fill(false),
    };
  });

  // The entrance, in the first room.
  const first = rooms[0];
  const [ex, ey] = pick(rng, interiorCells(first.t, openSpot));
  first.t[idx(ex, ey)] = 'entrance';
  const level = { depth, rooms, entrance: { room: 0, x: ex, y: ey }, stairs: null };

  // The stairs, in the room farthest from the first.
  const hops = roomHops(rooms);
  const far = Math.max(...hops);
  const room = pick(rng, rooms.filter((r) => hops[r.id] === far));
  let stairSpots = interiorCells(room.t, openSpot);
  if (rooms.length === 1) {
    const dist = roomDistances(room.t, ex, ey);
    stairSpots = stairSpots.filter(([x, y]) => dist[idx(x, y)] >= CONFIG.stairsAway);
  }
  if (stairSpots.length === 0) return makeLevel(rng, depth); // very unlikely; try again
  const [sx, sy] = pick(rng, stairSpots);
  room.t[idx(sx, sy)] = 'stairs';
  level.stairs = { room: room.id, x: sx, y: sy };

  placeGoblins(rng, level, depth);
  return level;
}
