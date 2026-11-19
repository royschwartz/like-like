// Every word the player reads is in this file, and nowhere else.
// Everything is lower case: his decision ("all lower case should be used for everything").
//
// Three kinds:
//   HIS    Roy's own words, kept as he wrote them.
//   PLAIN  a plain stand-in so the game can be played. Not writing. Waiting for his words.
//   [...]  an empty slot. Shown in the game as it is, in square brackets, so the gap is visible.

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

  // HIS: sword, corpse. [...]: the golden key and the worms, his to name.
  thing: { sword: 'sword', corpse: 'corpse', key: '[golden key]', worms: '[worms]' },

  // What inspect says about an item. [...]: his to write. HIS: the worms.
  slot: {
    sword: '[sword]',
    key: '[golden key, description]',
    worms: 'the worms look normal, but you cannot help but imagine them as limbless people',
  },

  // What observe says about a thing you click on. [...]: his to write.
  // One click, one line. A list is what further clicks say, going round.
  // A unit (the toad) says its plain line instead (TEXT.unit), and what sensing found.
  // None may run past two lines of the log (see test/log.test.mjs).
  observe: {
    you: '[you]',
    corpse: '[corpse]',
    grass: '[grass]',
    dirt: '[dirt]',
    wall: '[wall]',
    door: '[door]',
    stairs: '[stairs]',
    entrance: '[entrance]',
    // The awake toad's plain line, his to write: what it is doing.
    toad: '[toad, awake]',
    // HIS.
    golddoor: 'the door at the far corner of the room is golden',
    // The bust. "statue description is short": before it has spoken, [...], his to write.
    statue: '[bust]',
    // HIS. After it has spoken. It is also the text of its event from then on.
    // No period at the end: "as a rule we should limit periods".
    statueLifeless: 'the lifeless bust of DEE',
  },

  // The plain line of a unit, as Brogue's (decision 152): who, doing what, on what ground.
  // HIS: "a toad sleeping on grass" ("unit type / activity / what terrain they're on").
  // "dirt" is his word for the bare ground (decision 52). Ground with no word here, or a
  // toad awake, says the whole-line slot instead.
  unit: {
    line: (who, doing, ground) => `${who} ${doing} on ${ground}`,
    who: { toad: 'a toad' },
    doing: { asleep: 'sleeping' },
    ground: { grass: 'grass', floor: 'dirt' },
    elsewhere: { toad: '[toad, asleep]' },
  },

  // HIS. What observing the toad says after its plain line, never sensing (decision 180:
  // sense is ambient, what is about a thing is observed). "stronger" at any distance, asleep
  // or awake (172); the chain only within 2 steps, while it has the key ("when you come
  // closer you can get additional observations"). The song, TEXT.toad.singing, comes after
  // them, within 2 steps, while it sleeps. Once had, each stays in the round at any distance
  // while it holds. "a large sleeping toad" is gone (173).
  toadSeen: {
    stronger: 'it seems stronger than you',
    chain: 'it wears a chain with a golden key around its neck',
  },

  // HIS. The toad's event, opened by moving into it while it sleeps (decision 155).
  // "singing" is the event's first line, and the last thing observing it tells, up close.
  // "necklace" is the first line instead while you have not been told of its key (decision
  // 176). All lower case ("lower case everything remember", decision 177).
  toad: {
    singing: 'it is singing in its sleep, in an irish style',
    necklace: 'the toad wears a necklace with a golden key around its neck and is singing softly in its sleep, in an irish style',
    verses: [
      ['when i was small', 'a mischievous girl did i love', 'who i let open my mouth', 'and she pulled out my tongue'],
      ["and she didn't care", 'so she never knew', 'that my tongue grew back'],
      ['i changed for a long time', "i'm coming back different"],
    ],
    stirs: 'the toad stirs momentarily, interrupting the song',
    wakes: 'the toad wakes up',
    success: 'success!',
    failure: 'failure! the toad wakes up',
    // HIS, from "(listen more)", "(go for the key)", "(attack!)", "(back)".
    options: { listen: 'listen more', key: 'go for the key', attack: 'attack!', back: 'back' },
  },

  // HIS. Stock writing for statues: "you may not encounter DEE first so this is stock
  // writing that can be used for other statues" (decision 163). DEE's is the only one yet.
  statue: {
    opens: 'the statue shudders and the face folds back, revealing a flat area. somehow you know this to be an altar where an item might be placed',
  },

  // HIS. The bust's event, opened by moving into it the first time. Each line is a paragraph.
  // Two pages: "it should end at the question", and then "do we know each other" is
  // "something you say", the only option for now (decision 157).
  dee: {
    // what you see as you walk into it; too long for the log, so it is only here.
    // His November 19 version.
    bust: 'on a pedestal, the granite bust of a man of young or middle age, bushy hair sprouting at the sides, wearing a ravenous expression',
    speaks: 'suddenly the empty eyes begin to glow and the statue speaks',
    greets: '"long time no see, compadre"',
    // what you say: the first page's one option
    ask: 'do we know each other?',
    // the second page
    lines: [
      '"are you on one? it\'s your old friend DEE. we used to stack boxes together"',
      'he winks at you. "now we\'re doing other things"',
    ],
    // after the stock line of a statue opening (TEXT.statue.opens), the last of the page.
    // In place of "the statue goes lifeless": "instead of the statue going lifeless" (decision 162).
    still: 'then all is still',
    back: 'back', // from "[back]"; also the last option of its opening
    // [...]. What the event says when an item goes in the opening, his to write.
    enchants: '[the statue enchants it]',
    nothingMore: '[nothing more happens]',
  },

  // HIS. What sense says in the toad's room: one line each time you sense, in this order,
  // after what it finds about the toad. The last is what tells you about the worms, and only
  // sensing tells it ("no worms are down there only happen when you sense").
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
    memory: '[memory]', //  a memory you have, under psy: his to name
    enchanted: '[enchanted]', // beside an enchanted item in the inventory: his to write
  },

  // Lines in the log. PLAIN unless marked. An action adds at most two wrapped lines
  // in total (see test/log.test.mjs).
  log: {
    // What you arrive in, by what the entrance stands in. HIS: grass. [...]: dirt, his to write.
    descend: { grass: 'you descend and find yourself in low, soft grass', dirt: '[you descend, dirt]' },
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
    // [...]. The golden door, his to write.
    golddoorOpens: '[the golden door opens]',
    golddoorLocked: '[the golden door is locked]',
    // [...]. Digging, his to write.
    dig: '[you dig]',
    digFound: '[you find worms]',
    digStopped: '[you stop digging]',
    // HIS: "you have a memory".
    memory: 'you have a memory',
    // [...]. Sounds from the bust's opening, his to write.
    sounds: '[sounds from the opening, DEE]',
    // [...]. The toad woken by noise, his to write.
    toadWakes: '[the toad wakes]',
    // HIS. Sensing when there is nothing new to find: "it should always say you sense nothing new".
    senseNothing: 'you sense nothing new',
  },
};

// True for a string that is wholly an empty slot, like '[sword]'.
export function isSlot(text) {
  return typeof text === 'string' && /^\[[^\]]*\]$/.test(text);
}
