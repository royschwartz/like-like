import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXT } from '../src/text.js';
import { newGame, act, view, currentRoom } from '../src/game.js';
import { clearGoblins, makeGoblin, findSpot, plainFloor } from './helpers.mjs';

function tough(g) {
  g.hp = g.maxHp = 100000;
}

test('a new game: the opening, then the descend line for the ground; again on each descend', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame({ seed });
    tough(g);
    let v = view(g);
    assert.deepEqual(v.log.map((l) => l.text), [TEXT.opening[0], TEXT.log.descend[g.level.entrance.ground]]);
    assert.equal(v.fresh, v.log[0].id);
    for (let k = 0; k < 3; k++) {
      seen.add(g.level.entrance.ground);
      const st = g.level.stairs;
      g.room = st.room;
      [g.x, g.y] = [st.x, st.y];
      const from = g.nextLogId;
      act(g, { type: 'context' });
      v = view(g);
      assert.deepEqual(v.log.slice(-2).map((l) => l.text), [TEXT.log.level(g.depth), TEXT.log.descend[g.level.entrance.ground]]);
      assert.equal(v.fresh, from);
    }
  }
  assert.deepEqual([...seen].sort(), ['dirt', 'grass']);
});

test('fresh moves only when something is said', () => {
  const g = newGame({ seed: 41 });
  clearGoblins(g);
  const start = view(g).fresh;
  act(g, { type: 'wait' }); //           time passes, nothing said
  act(g, { type: 'menu', id: 'psy' }); // nothing said
  act(g, { type: 'menu', id: 'psy' });
  assert.equal(view(g).fresh, start);
  const from = g.nextLogId;
  act(g, { type: 'menu', id: 'act' });
  act(g, { type: 'choose', index: 0 }); // rest: says lines
  assert.equal(view(g).fresh, from);
  assert.ok(g.log.some((l) => l.id === from && l.text === TEXT.log.youRest));
});

test('a fight: your strike, then the goblin answer, in order, with damage numbers', () => {
  const g = newGame({ seed: 42 });
  tough(g);
  clearGoblins(g);
  const at = findSpot(g, (x, y, r) => plainFloor(r, x, y) && plainFloor(r, x + 1, y));
  [g.x, g.y] = at;
  const gob = makeGoblin(at[0] + 1, at[1], true);
  gob.hp = 1000;
  currentRoom(g).goblins.push(gob);
  const from = g.nextLogId;
  act(g, { type: 'move', dir: 'e' }); // asleep: a sure hit
  const texts = g.log.filter((l) => l.id >= from).map((l) => l.text);
  assert.equal(texts.length, 2);
  assert.equal(texts[0], `you strike the goblin for ${1000 - gob.hp} damage`);
  assert.ok(['the goblin strikes you for 1 damage', TEXT.log.goblinMisses].includes(texts[1]), texts[1]);
  assert.equal(view(g).fresh, from);

  // Then a kill: the strike and the death.
  gob.hp = 1;
  gob.asleep = true;
  const k = g.nextLogId;
  const ev = act(g, { type: 'move', dir: 'e' });
  const dmg = ev.find((e) => e.type === 'attack').dmg;
  assert.deepEqual(g.log.filter((l) => l.id >= k).map((l) => l.text), [TEXT.log.youHit(dmg), TEXT.log.goblinDies]);
  assert.equal(currentRoom(g).corpses.length, 1);
});
