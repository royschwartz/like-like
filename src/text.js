// Every word the player reads is in this file, and nowhere else.
// Everything is lower case: his decision ("all lower case should be used for everything").
//
// Three kinds:
//   HIS    Roy's own words, kept as he wrote them.
//   PLAIN  a plain stand-in so the game can be played. Not writing. Waiting for his words.
//   slot() an empty slot, his to write. Shown without brackets ("all the brackets should be
//          removed"), in the slot's grey, so the gap is still visible.

// The empty slots, so isSlot() knows them without brackets.
const SLOTS = new Set();
function slot(text) {
  SLOTS.add(text);
  return text;
}

export const TEXT = {
  // HIS. The first line in the log. He asked for the two lines joined with a period.
  opening: ['you have been asked to retrieve the amulet of yendor. it is at the bottom of this dungeon, probably'],

  // HIS, from his drawing of the screen.
  stat: { str: 'str', love: 'love', hp: 'hp', will: 'will', unknown: '??' },
  // HIS: inv, psy, *, use, and "..." for wait ("change wait to ..."). PLAIN: menu, a neutral
  // control (restart, the look). The menu button shows a square, not this word ("put in a
  // menu style icon, like a square or something instead of saying menu"); the word is only
  // its name for a screen reader.
  button: { inv: 'inv', psy: 'psy', act: '*', wait: '...', use: 'use', sys: 'menu' },

  // HIS. What the wide button says, by where you stand; inspect in the inventory.
  context: { sense: 'sense', corpse: 'corpse', stairs: 'stairs', inspect: 'inspect' },

  // HIS: sword, corpse. slot(): the golden key and the worms, his to name.
  thing: { sword: 'sword', corpse: 'corpse', key: slot('golden key'), worms: slot('worms') },

  // What inspect says about an item. slot(): his to write. HIS: the worms.
  slot: {
    sword: slot('sword'),
    key: slot('golden key, description'),
    worms: 'the worms look normal, but you cannot help but imagine them as limbless people',
  },

  // What observe says about a thing you click on. slot(): his to write.
  // One click, one line. A list is what further clicks say, in order.
  // None may run past two lines of the log (see test/log.test.mjs).
  observe: {
    you: slot('you'),
    corpse: slot('corpse'),
    grass: slot('grass'),
    dirt: slot('dirt'),
    wall: slot('wall'),
    door: slot('door'),
    stairs: slot('stairs'),
    entrance: slot('entrance'),
    // HIS.
    toadAsleep: ['a large sleeping toad', 'it seems stronger than you'],
    toad: slot('toad, awake'),
    // HIS.
    golddoor: 'the door at the far corner of the room is golden',
    // The bust. "statue description is short": before it has spoken, slot(), his to write.
    statue: slot('bust'),
    // HIS. After it has spoken. It is also the text of its event from then on.
    statueLifeless: 'the lifeless bust of DEE.',
  },
  // What further clicks say once you are close. HIS: the toad's chain.
  // (Close to the sleeping toad, the click after this one is TEXT.toad.singing, and its event.)
  observeClose: {
    toadAsleep: 'it wears a chain with a golden key around its neck',
  },

  // HIS. The toad's event. "singing" is both an observation and the event's first line
  // (his "O,E"): it is what a click on the sleeping toad says, up close, once the rest is said.
  // Song lines keep his capital I and Irish.
  toad: {
    singing: 'it is singing in its sleep, in an Irish style',
    verses: [
      ['when I was small', 'a mischievous girl did I love', 'who I let open my mouth', 'and she pulled out my tongue'],
      ["and she didn't care", 'so she never knew', 'that my tongue grew back'],
      ['I changed for a long time', "I'm coming back different"],
    ],
    stirs: 'the toad stirs momentarily, interrupting the song',
    wakes: 'the toad wakes up',
    success: 'success!',
    failure: 'failure! the toad wakes up',
    // HIS, from "(listen more)", "(go for the key)", "(attack!)", "(back)".
    options: { listen: 'listen more', key: 'go for the key', attack: 'attack!', back: 'back' },
  },

  // HIS. The bust's event, opened by moving into it the first time. Each line is a paragraph.
  dee: {
    // what you see as you walk into it; too long for the log, so it is only here
    bust: 'on a pedestal, the granite bust of a man of young or middle age, bushy hair sprouting at the sides, with a ravenous expression. underneath the bust is an opening where items might be placed',
    speaks: 'suddenly the empty eyes begin to glow and the statue speaks',
    lines: [
      '"long time no see, compadre."',
      'you: "do we know each other?"',
      '"are you on one? it\'s your old friend DEE. we used to stack boxes together"',
      'he winks at you. "now we\'re doing other things"',
    ],
    lifeless: 'the statue goes lifeless',
    back: 'back', // from "[back]"; also the last option of its opening
    // slot(). What the event says when an item goes in the opening, his to write.
    enchants: slot('the statue enchants it'),
    nothingMore: slot('nothing more happens'),
  },

  // HIS. What sense says in the toad's room: one line each time you sense, in this order.
  // The last is what tells you about the worms.
  senseToad: [
    'there is the smell of cinnamon in the air',
    'you have a feeling you have been here before',
    'the ground struggles gently beneath your feet',
    'worms are down there you think',
  ],

  // HIS. Memories, by what wakes them. Each line is a paragraph of the event.
  memories: {
    worms: [
      'memory! you are standing amongst people wearing full bodied suits, all white. you are in a suit yourself. the figure next to you extends his hand, upon which rests a single, normal looking worm',
      '"we have programmed these worms to consume harmful substances that are in the ground, or just about any substance"',
    ],
  },

  // PLAIN. Words on the option buttons.
  menu: {
    back: 'back',
    more: 'more',
    rest: 'rest',
    restart: 'restart',
    inHand: 'in hand', // beside an item in the inventory
    nothing: 'nothing',
    lookDark: 'dark',
    lookPaper: 'paper',
    // PLAIN. The menu's setting for the lines round the buttons: none, or a step of grey.
    outlines: (n) => (n ? `outlines ${n}` : 'outlines off'),
    dig: 'dig for worms', // HIS
    memory: slot('memory'), //  a memory you have, under psy: his to name
    enchanted: slot('enchanted'), // beside an enchanted item in the inventory: his to write
  },

  // Lines in the log. PLAIN unless marked. An action adds at most two wrapped lines
  // in total (see test/log.test.mjs).
  log: {
    // What you arrive in, by what the entrance stands in. HIS: grass. slot(): dirt, his to write.
    descend: { grass: 'you descend and find yourself in low, soft grass', dirt: slot('you descend, dirt') },
    // said in place of the blow that kills you
    youDie: 'you die',
    youRest: 'you rest',
    restBetter: 'you feel better',
    restStopped: 'you stop resting',
    inHand: (name) => `${name}, in hand`,
    putAway: (name) => `${name}, put away`,
    take: (name) => `you take the ${name}`,
    corpseEmpty: 'the corpse has nothing',
    // PLAIN, on the pattern of his line "you strike the goblin for x damage".
    // (The goblins are gone: "remove the goblins too".)
    youHitToad: (n) => `you strike the toad for ${n} damage`,
    youMissToad: 'you miss the toad',
    toadHits: (n) => `the toad strikes you for ${n} damage`,
    toadMisses: 'the toad misses you',
    toadDies: 'the toad dies',
    // slot(). The golden door, his to write.
    golddoorOpens: slot('the golden door opens'),
    golddoorLocked: slot('the golden door is locked'),
    // slot(). Digging, his to write.
    dig: slot('you dig'),
    digFound: slot('you find worms'),
    digStopped: slot('you stop digging'),
    // HIS: "you have a memory".
    memory: 'you have a memory',
    // slot(). Sounds from the bust's opening, his to write.
    sounds: slot('sounds from the opening, dee'),
    // slot(). The toad woken by noise, his to write.
    toadWakes: slot('the toad wakes'),
    // slot(). Sensing where there is nothing to sense, his to write.
    senseNothing: slot('you sense nothing'),
  },
};

// True for a string that is an empty slot, like slot('sword').
export function isSlot(text) {
  return typeof text === 'string' && SLOTS.has(text);
}
