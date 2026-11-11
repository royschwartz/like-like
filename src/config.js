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

  player: { hp: 3, str: 10, love: 10, will: 10 },

  // Damage is the stat times this, rounded, never less than 1.
  swordDamagePerStr: 0.2, // sword in hand: 10 str -> 2
  fistDamagePerStr: 0.1, //  bare hands:    10 str -> 1

  // Chance that a swing lands.
  playerHits: 0.85,
  goblinHits: 0.5,

  goblin: {
    hp: 3,
    damage: 1,
    asleepChance: 0.4, // chance a goblin starts the level asleep
    wakeRange: 2, //      a sleeping goblin may wake when you are this many steps away
    wakeChance: 0.5, //   and this is the chance, each turn you are that close
    wanderChance: 0.5, // chance an awake goblin that can't see you takes a step
    perRoom: 5, //        never more than this many in one room
    awayFromEntrance: 4, // none start closer than this to where you arrive
  },

  // Goblins on a level: its depth, plus 0 or 1.
  goblinsExtraMax: 1,

  // Resting: this many quiet turns, then this much hp back.
  restTurns: 10,
  restHeal: 1,

  // After SENSE, your own numbers stay readable for this many turns.
  senseSelfTurns: 30,
};
