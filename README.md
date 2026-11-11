# LIKE LIKE

A small ASCII roguelike, shaped for a phone. A first, simple build: goblins, a sword, stairs down.

```
you have been asked to retrieve the amulet of yendor
it is at the bottom of this dungeon, probably
```

## Play

It is plain files, with nothing to install or build. Serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then go to `http://localhost:5173`. Add `?seed=7` to the address to play the same dungeon again.

| | Phone | Keyboard |
|---|---|---|
| Move, or hit what's in the way | d-pad (hold to keep going) | arrow keys |
| The wide button: `SENSE`, or `corpse` on a corpse, or `stairs` on the stairs | tap | Enter or Space |
| `INV` what you carry | tap | `i` |
| `*` wait, rest | tap | `a` |
| `PSY` what you know of your mind | tap | `p` |
| `SE` restart, and the paper or dark look | tap | `s` |
| Pick an option | tap | `1` to `4`, or arrows and Enter |
| Back | `back` | Esc |
| Wait a turn | under `*` | `.` |

## How it works

- A level is one to four rooms. A room is 11 by 11 characters, walls included, and fills the screen. Walk through a door (`+`) and the next room slides in.
- You see what's in your line of sight. `SENSE` takes a turn: it shows you your own numbers for a while, shows the whole room, and tells you what is past each door.
- Goblins (`g`) sleep or wander. Awake ones come for you. They stay in their room.
- A dead goblin leaves a corpse (`%`). Stand on it and the wide button says `corpse`.
- Stand on the stairs (`>`) and the wide button says `stairs`. Each level has one more goblin.
- When you die you begin again at the level's entrance (`<`), and the level is as you left it.

## The files

| File | What it holds |
|---|---|
| `src/text.js` | every word the player reads |
| `src/config.js` | every number: hp, damage, chances, how many goblins |
| `src/palette.js` | the characters and colours, for both looks |
| `style.css` | the layout, the buttons, the animations |
| `src/game.js`, `src/gen.js`, `src/fov.js`, `src/rng.js` | the simulation: rules, level making, line of sight, seeded chance. No screen code. |
| `src/render.js`, `src/input.js`, `src/main.js` | drawing, keys and touches, start-up. No rules. |
| `test/` | tests for the simulation |

The same seed and the same presses always give the same game.

```bash
node --test test/*.test.mjs
```

The font is Monaco where the device has it (Macs), and the nearest monospace elsewhere.
