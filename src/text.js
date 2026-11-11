// Every word the player reads is in this file, and nowhere else.
//
// Three kinds:
//   HIS    Roy's own words, kept as he wrote them.
//   PLAIN  a plain stand-in so the game can be played. Not writing. Waiting for his words.
//   [CAPS] an empty slot. Shown in the game as it is, so the gap is visible.

export const TEXT = {
  // HIS. The first lines in the log.
  opening: [
    'you have been asked to retrieve the amulet of yendor',
    'it is at the bottom of this dungeon, probably',
  ],

  // HIS, from his drawing of the screen.
  stat: { str: 'STR', love: 'LOVE', hp: 'HP', will: 'WILL', unknown: '??' },
  button: { inv: 'INV', psy: 'PSY', act: '*', sys: 'SE' },

  // HIS. What the wide button says, by where you stand.
  context: { sense: 'SENSE', corpse: 'corpse', stairs: 'stairs' },

  // HIS. The names of things.
  thing: { goblin: 'goblin', sword: 'sword', corpse: 'corpse' },

  // [CAPS]. Descriptions, his to write.
  slot: { sword: '[SWORD]', goblin: '[GOBLIN]' },

  // PLAIN. Words on the option buttons.
  menu: {
    back: 'back',
    more: 'more',
    wait: 'wait',
    rest: 'rest',
    restart: 'restart',
    hold: 'hold',
    putAway: 'put away',
    nothing: 'nothing',
    lookDark: 'dark',
    lookPaper: 'paper',
  },

  // PLAIN. Directions, used by SENSE.
  dir: { n: 'north', e: 'east', s: 'south', w: 'west' },

  // PLAIN. Lines in the log.
  log: {
    level: (n) => `level ${n}`,
    youHit: 'you hit the goblin',
    youMiss: 'you miss the goblin',
    goblinHits: 'the goblin hits you',
    goblinMisses: 'the goblin misses you',
    goblinDies: 'the goblin dies',
    goblinWakes: 'a goblin wakes up',
    youDie: 'you die',
    youRest: 'you rest',
    restBetter: 'you feel better',
    restStopped: 'you stop resting',
    inHand: (name) => `${name}, in hand`,
    putAway: (name) => `${name}, put away`,
    take: (name) => `you take the ${name}`,
    corpseEmpty: 'the corpse has nothing',
    // SENSE: what is in this room, then what is past each door.
    senseHere: (goblins, asleep) =>
      goblins === 0
        ? 'no goblins here'
        : `${count(goblins, 'goblin')} here` + (asleep > 0 ? `, ${asleep} asleep` : ''),
    senseDoor: (dir, goblins, stairs) => {
      const parts = [];
      if (goblins > 0) parts.push(count(goblins, 'goblin'));
      if (stairs) parts.push('stairs');
      return `${dir}: ${parts.length ? parts.join(', ') : 'nothing'}`;
    },
  },
};

function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
