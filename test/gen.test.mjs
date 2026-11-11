import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { makeRng } from '../src/rng.js';
import { S, DIRS, STEP, OPP, DOOR, ARRIVAL, idx, makeLevel, levelDistances, roomConnected } from '../src/gen.js';

const isArrivalSpot = (x, y) => DIRS.some((d) => ARRIVAL[d][0] === x && ARRIVAL[d][1] === y);

function roomHops(level) {
  const hops = level.rooms.map(() => -1);
  hops[0] = 0;
  const q = [0];
  for (let i = 0; i < q.length; i++) {
    for (const d of DIRS) {
      const n = level.rooms[q[i]].nb[d];
      if (n !== null && hops[n] < 0) {
        hops[n] = hops[q[i]] + 1;
        q.push(n);
      }
    }
  }
  return hops;
}

function checkLevel(level, depth) {
  const { rooms } = level;
  assert.ok(rooms.length >= 1 && rooms.length <= 4, 'room count');
  assert.deepEqual([rooms[0].gx, rooms[0].gy], [0, 0]);
  const keys = new Set(rooms.map((r) => r.key));
  assert.equal(keys.size, rooms.length, 'room keys differ');

  for (const room of rooms) {
    assert.equal(room.t.length, S * S);
    // Grid neighbours are exactly the rooms joined by doors, and doors match.
    for (const d of DIRS) {
      const gx = room.gx + STEP[d][0];
      const gy = room.gy + STEP[d][1];
      const other = rooms.find((r) => r.gx === gx && r.gy === gy);
      assert.equal(room.nb[d], other ? other.id : null);
      if (other) assert.equal(other.nb[OPP[d]], room.id);
    }
    // The ring is wall, except a door in the middle of each wall that has a neighbour.
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        if (!edge) {
          assert.notEqual(room.t[idx(x, y)], 'door');
          continue;
        }
        const d = DIRS.find((k) => DOOR[k][0] === x && DOOR[k][1] === y);
        const want = d && room.nb[d] !== null ? 'door' : 'wall';
        assert.equal(room.t[idx(x, y)], want, `ring at ${x},${y}`);
      }
    }
    // No obstacle on arrival cells.
    for (const d of DIRS) assert.notEqual(room.t[idx(...ARRIVAL[d])], 'wall');
    assert.ok(roomConnected(room.t), 'room connected');
    for (const c of room.t) assert.ok(['floor', 'grass', 'wall', 'door', 'stairs', 'entrance'].includes(c));
  }

  // Entrance.
  const e = level.entrance;
  assert.equal(e.room, 0);
  assert.equal(rooms[0].t[idx(e.x, e.y)], 'entrance');
  assert.ok(!isArrivalSpot(e.x, e.y));
  assert.equal(rooms.flatMap((r) => r.t).filter((c) => c === 'entrance').length, 1);

  // Stairs.
  const st = level.stairs;
  assert.equal(rooms[st.room].t[idx(st.x, st.y)], 'stairs');
  assert.equal(rooms.flatMap((r) => r.t).filter((c) => c === 'stairs').length, 1);
  const dist = levelDistances(level);
  assert.ok(dist[st.room][idx(st.x, st.y)] > 0, 'stairs reachable');
  const hops = roomHops(level);
  assert.equal(hops[st.room], Math.max(...hops), 'stairs in the farthest room');
  if (rooms.length === 1) assert.ok(dist[0][idx(st.x, st.y)] >= 5, 'stairs far enough');

  // Goblins.
  const all = rooms.flatMap((r) => r.goblins.map((b) => [r, b]));
  const cap = rooms.length * CONFIG.goblin.perRoom;
  assert.ok(all.length <= depth + CONFIG.goblinsExtraMax);
  assert.ok(all.length >= Math.min(depth, cap));
  const ids = new Set();
  for (const [room, b] of all) {
    assert.ok(room.goblins.length <= CONFIG.goblin.perRoom);
    const c = room.t[idx(b.x, b.y)];
    assert.ok(c === 'floor' || c === 'grass', `goblin on ${c}`);
    assert.ok(!isArrivalSpot(b.x, b.y));
    assert.ok(dist[room.id][idx(b.x, b.y)] >= CONFIG.goblin.awayFromEntrance, 'goblin too near the entrance');
    assert.equal(room.goblins.filter((o) => o.x === b.x && o.y === b.y).length, 1);
    assert.equal(b.hp, CONFIG.goblin.hp);
    assert.equal(typeof b.asleep, 'boolean');
    ids.add(b.id);
  }
  assert.equal(ids.size, all.length, 'goblin ids unique');
  return rooms.length;
}

test('levels follow the rules over many seeds and depths', () => {
  const counts = [0, 0, 0, 0, 0];
  for (let seed = 1; seed <= 300; seed++) {
    for (let depth = 1; depth <= 8; depth++) {
      const level = makeLevel(makeRng(seed * 1000 + depth), depth);
      counts[checkLevel(level, depth)]++;
    }
  }
  // Every room count turns up.
  for (let n = 1; n <= 4; n++) assert.ok(counts[n] > 0, `${n} rooms never made`);
});
