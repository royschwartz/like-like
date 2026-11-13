// Every number in the game. All of it is tuning: change one, reload, play.

export const CONFIG = {
  // A room is this many cells across and down, its ring of wall included.
  roomSize: 11,

  // How many rooms a level has: [rooms, weight]. Usually no more than 3.
  roomCounts: [[1, 40], [2, 30], [3, 25], [4, 5]],

  // Inside a room: [fewest, most].
  scatterWalls: [3, 6], // loose wall cells, in a room that has them
  grassPatches: [0, 2], // patches of grass
  grassSize: [3, 8], //    cells in one patch
  // In a level of one room, the stairs are at least this many steps from the entrance.
  stairsAway: 5,
  // Chance a level's entrance is in grass; otherwise it is on dirt (plain floor).
  entranceInGrass: 0.5,

  // Observe says more about a thing this many steps from you, or nearer.
  observeClose: 2,

  player: { hp: 3, str: 10, love: 10, will: 10 },

  // Damage is the stat times this, rounded, never less than 1.
  swordDamagePerStr: 0.2, // sword in hand: 10 str -> 2
  fistDamagePerStr: 0.1, //  bare hands:    10 str -> 1

  // Chance that your swing lands.
  playerHits: 0.85,

  // The log is this many characters wide. A status may run to two lines of it, no more.
  // (A look number the rules need: the log's width over the width of one character.)
  logWidth: 41,
  // An action says this many wrapped lines in all, across its statuses.
  saysAtMost: 2,

  // The toad: level 1 only. It sleeps in the room farthest from the entrance, near a
  // golden door; the stairs are in a small room behind that door.
  // wander: the chance, each turn, that it takes a step when awake and it can't see you.
  toad: { hp: 8, damage: 2, hits: 0.6, wander: 0.5 },
  toadLevel: 1,
  toadExtraRoom: 1, //   level 1 has this many rooms more than it would (never more than 4)
  closetSize: 3, //      the small room behind the golden door is this many cells across, inside (1 to 3)
  toadNearDoor: [2, 4], // the toad sleeps this many steps from the golden door, if it can

  // The bust of DEE, in the toad's room: never this close to the golden door or the toad
  // (steps, counting diagonals for the door).
  statueAway: { door: 2, toad: 2 },
  // Putting an item in the bust's opening. The sword: this much more damage; twice
  // as much if the item held a memory.
  enchant: { swordDamage: 1 },
  // Noise (the bust speaking or enchanting): the chance a sleeping animal in the room wakes.
  noiseWakes: 0.5,

  // Going for the toad's key: the chance it works, while it sleeps soundly and once it has stirred.
  keyChance: { calm: 2 / 3, stirred: 1 / 3 },

  // Digging for worms takes this many turns.
  digTurns: 3,
  // A memory comes back this many turns after what wakes it.
  memoryDelay: 5,

  // Resting: this many quiet turns, then this much hp back.
  restTurns: 10,
  restHeal: 1,

  // After SENSE, your own numbers stay readable for this many turns.
  senseSelfTurns: 30,
};
