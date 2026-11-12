import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { makeRng } from '../src/rng.js';
import { S, DIRS, STEP, OPP, DOOR, ARRIVAL, idx, makeLevel, levelDistances, roomConnected, roomDistances } from '../src/gen.js';

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
  if (depth === CONFIG.toadLevel) checkToad(level);
  else {
    assert.equal(level.toadRoom, null);
    assert.ok(rooms.every((r) => r.toad === null && !r.t.includes('golddoor')), 'no toad, no golden door');
    assert.ok(rooms.every((r) => r.statue === null && !r.t.includes('statue')), 'no bust');
  }
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
    for (const c of room.t) assert.ok(['floor', 'grass', 'wall', 'door', 'golddoor', 'statue', 'stairs', 'entrance'].includes(c), c);
  }

  // Entrance.
  const e = level.entrance;
  assert.equal(e.room, 0);
  assert.equal(rooms[0].t[idx(e.x, e.y)], 'entrance');
  assert.ok(!isArrivalSpot(e.x, e.y));
  assert.equal(rooms.flatMap((r) => r.t).filter((c) => c === 'entrance').length, 1);
  assert.ok(['grass', 'dirt'].includes(e.ground), `ground ${e.ground}`);
  if (e.ground === 'grass') {
    const near = DIRS.some((d) => rooms[0].t[idx(e.x + STEP[d][0], e.y + STEP[d][1])] === 'grass');
    assert.ok(near, 'an entrance in grass has grass beside it');
  }

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

// Level 1: the toad's room, its golden door, the stairs behind it.
function checkToad(level) {
  const { rooms } = level;
  assert.ok(rooms.length >= 2, 'the toad has a room of its own');
  const tr = level.toadRoom;
  assert.ok(Number.isInteger(tr) && tr !== 0, 'toad room');
  assert.equal(level.stairs.room, tr, 'the stairs are in the toad room');
  rooms.forEach((r) => assert.equal(r.toad !== null, r.id === tr));
  const room = rooms[tr];
  const toad = room.toad;
  assert.deepEqual(
    { ...toad, x: 0, y: 0, home: 0 },
    { x: 0, y: 0, home: 0, hp: CONFIG.toad.hp, asleep: true, stirred: false, key: true, lastSeen: null },
  );
  assert.deepEqual(toad.home, { x: toad.x, y: toad.y });
  assert.ok(['floor', 'grass'].includes(room.t[idx(toad.x, toad.y)]), 'toad on open ground');
  assert.ok(!isArrivalSpot(toad.x, toad.y));
  assert.ok(!room.goblins.some((b) => b.x === toad.x && b.y === toad.y), 'no goblin on the toad');
  // One golden door, in that room, between the stairs and the rest.
  assert.equal(rooms.flatMap((r) => r.t).filter((c) => c === 'golddoor').length, 1);
  const gd = level.golddoor;
  assert.equal(gd.room, tr);
  assert.equal(room.t[idx(gd.x, gd.y)], 'golddoor');
  const locked = levelDistances(level, level.entrance, { locked: true });
  const open = levelDistances(level);
  const st = level.stairs;
  assert.equal(locked[tr][idx(st.x, st.y)], -1, 'no way to the stairs but the golden door');
  assert.ok(open[tr][idx(st.x, st.y)] > 0, 'the golden door leads to the stairs');
  // The stairs are in a corner of the room.
  assert.ok([1, S - 2].includes(st.x) && [1, S - 2].includes(st.y), 'stairs in a corner');
  // Everything outside the small room is reachable with the door locked, even with
  // the toad in the way: the toad itself, the golden door's step, every door.
  const blocked = { ...level, rooms: rooms.map((r) => (r.id === tr ? { ...r, t: r.t.slice() } : r)) };
  blocked.rooms[tr].t[idx(toad.x, toad.y)] = 'wall';
  const around = levelDistances(blocked, level.entrance, { locked: true });
  const toadNear = DIRS.some((d) => around[tr][idx(toad.x + STEP[d][0], toad.y + STEP[d][1])] > 0);
  assert.ok(toadNear, 'you can reach the toad');
  const doorStep = DIRS.map((d) => [gd.x + STEP[d][0], gd.y + STEP[d][1]]).filter(([x, y]) => locked[tr][idx(x, y)] >= 0);
  assert.equal(doorStep.length, 1, 'one side of the golden door is the room');
  assert.ok(around[tr][idx(...doorStep[0])] > 0, 'the golden door can be reached past the toad');
  for (const r of rooms) {
    for (let i = 0; i < S * S; i++) {
      const c = r.t[i];
      if (c === 'wall' || c === 'golddoor' || (r.id === tr && i === idx(toad.x, toad.y))) continue;
      if (open[r.id][i] < 0) continue; // inside nothing; checked by roomConnected
      const behind = r.id === tr && locked[tr][i] < 0;
      if (!behind) assert.ok(around[r.id][i] >= 0, `cell ${i % S},${Math.floor(i / S)} in room ${r.id} cut off by the toad`);
    }
  }
  // No goblin behind the golden door.
  for (const b of room.goblins) assert.ok(locked[tr][idx(b.x, b.y)] >= 0, 'goblin behind the golden door');
  // The bust of DEE: one, in this room, not by the door or the toad, reachable from beside it.
  assert.equal(rooms.flatMap((r) => r.t).filter((c) => c === 'statue').length, 1);
  rooms.forEach((r) => assert.equal(r.statue !== null, r.id === tr));
  const bust = room.statue;
  assert.equal(room.t[idx(bust.x, bust.y)], 'statue');
  assert.equal(bust.spoke, false);
  assert.ok(!isArrivalSpot(bust.x, bust.y), 'bust not on an arrival cell');
  assert.ok(Math.max(Math.abs(bust.x - gd.x), Math.abs(bust.y - gd.y)) >= CONFIG.statueAway.door, 'bust not by the golden door');
  assert.ok(Math.abs(bust.x - toad.x) + Math.abs(bust.y - toad.y) >= CONFIG.statueAway.toad, 'bust not by the toad');
  const beside = DIRS.map((d) => [bust.x + STEP[d][0], bust.y + STEP[d][1]]).filter(([x, y]) => around[tr][idx(x, y)] > 0);
  assert.ok(beside.length > 0, 'you can stand beside the bust');
}

test('level 1: the toad room, the golden door and the stairs, over many seeds', () => {
  let near = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const level = makeLevel(makeRng(seed), CONFIG.toadLevel);
    checkLevel(level, CONFIG.toadLevel);
    const toad = level.rooms[level.toadRoom].toad;
    const d = roomDistances(level.rooms[level.toadRoom].t, toad.x, toad.y);
    const gd = level.golddoor;
    if (d[idx(gd.x, gd.y)] - 1 <= CONFIG.toadNearDoor[1]) near++;
  }
  assert.ok(near > 400, `the toad sleeps near the golden door (${near})`);
});

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

test('the entrance is in grass or on dirt, by CONFIG.entranceInGrass', () => {
  const grounds = { grass: 0, dirt: 0 };
  for (let seed = 1; seed <= 300; seed++) grounds[makeLevel(makeRng(seed), 1).entrance.ground]++;
  assert.ok(grounds.grass > 0 && grounds.dirt > 0, JSON.stringify(grounds));
  const keep = CONFIG.entranceInGrass;
  try {
    for (const [p, want] of [[1, 'grass'], [0, 'dirt']]) {
      CONFIG.entranceInGrass = p;
      for (let seed = 1; seed <= 200; seed++) {
        const level = makeLevel(makeRng(seed), 1 + (seed % 5));
        assert.equal(level.entrance.ground, want);
        checkLevel(level, 1 + (seed % 5));
      }
    }
  } finally {
    CONFIG.entranceInGrass = keep;
  }
});
