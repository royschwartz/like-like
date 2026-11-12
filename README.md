# LIKE LIKE

A small ASCII roguelike, shaped for a phone. A first, simple build: goblins, a sword, stairs down, and on level 1 a toad and a bust.

**Play it: [royschwartz.github.io/like-like](https://royschwartz.github.io/like-like/)**

```
you have been asked to retrieve the amulet of yendor. it is at the bottom of this dungeon, probably
```

## Play

It is plain files, with nothing to install or build. To run it on your own machine, serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then go to `http://localhost:5173`. Add `?seed=7` to the address to play the same dungeon again.

| | Phone | Keyboard |
|---|---|---|
| Move, or hit what's in the way | d-pad (hold to keep going) | arrow keys |
| The wide button: `sense`, or `corpse` on a corpse, or `stairs` on the stairs | tap | Enter or Space |
| Observe a thing on the map | tap it | click it |
| `inv` what you carry: the inventory screen | tap | `i` |
| In the inventory: `inspect` an item, `use` it, `back` | wide button, `use`, `back` | Enter, `u`, Esc |
| `*` rest, or dig for worms once you know of them | tap | `a` |
| `psy` what you know of your mind | tap | `p` |
| `wait` a turn | tap | `.` or `z` |
| `menu` restart, and the paper or dark look | tap | `m` |
| Pick an option | tap | `1` to `4`, or arrows and Enter |
| Back | `back` | Esc |
| In an event: pick an option | tap it | arrows and Enter, or `1` to `4`; Esc for `back` |

## How it works

- A level is one to four rooms. A room is 11 by 11 characters, walls included, and fills the screen. Walk through a door (`+`) and the next room slides in.
- The log at the top says what happens. Its newest lines are bright; they dim when something newer is said.
- Tap or click a thing on the map to observe it. It takes no time. Come closer and you may notice more.
- `inv` replaces the map with what you carry. Move up and down to choose an item.
- You see what's in your line of sight. `sense` takes a turn: it shows you your own numbers for a while, shows the whole room, and tells you what is past each door.
- Goblins (`g`) sleep or wander. Awake ones come for you. They stay in their room.
- A dead goblin leaves a corpse (`%`). Stand on it and the wide button says `corpse`.
- Stand on the stairs (`>`) and the wide button says `stairs`. Each level has one more goblin.
- When you die you begin again at the level's entrance (`<`), and the level is as you left it.
- On level 1 a toad (`T`) sleeps in the room farthest from the entrance. The stairs are behind a golden door (`+`) in a corner of its room, and only its key opens it.
- Observe the sleeping toad from close by and an event opens: the screen goes but for its options. Nothing in an event takes time.
- `sense` in the toad's room tells you of worms; then `*` can dig for them, on grass or dirt. Inspecting them brings a memory back a few turns later. Memories you have are under `psy`.
- The toad's room also holds a bust (`&`). You can't walk onto it; move into it and its event opens, taking no turn. The first time, it speaks. After that its options are what you carry: choose one to put it in the opening, which enchants it once (an enchanted sword does 1 more damage). An item holding a memory gives it up at once. The bust's speaking and enchanting are noise, and may wake what sleeps in the room.

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
