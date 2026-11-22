# LIKE LIKE

A small roguelike, shaped for a phone.

**Play it: [royschwartz.github.io/like-like](https://royschwartz.github.io/like-like/)**

Each room is seven squares across, walls included, drawn in wavering white strokes. You are the horned eye. The toad is the hooked lowercase `t` from Crooked Hand, the game's pixel-cut monospace inspired by 1980s computer lettering. [Download the font](https://royschwartz.github.io/like-like/esoteric/font/crooked-hand.ttf?v=6) or see its [source and license](esoteric/font/).

```
your mission is to retrieve the amulet

it’s at the bottom of this dungeon probably
```

The first game, with eleven-square rooms and sense, is archived at [royschwartz.github.io/like-like/original](https://royschwartz.github.io/like-like/original/). It is no longer being worked on. The old `/esoteric/` address now leads to the main game.

## Play

It is plain files, with nothing to install or build. To run it on your own machine, serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then go to `http://localhost:5173`. Add `?seed=7` to the address to play the same dungeon again.

| | Phone | Keyboard |
|---|---|---|
| Go there, a step at a time, or hit or walk into what's there | tap it | click it, or the arrow keys |
| Observe something: hold it until its box closes in. This takes a turn | hold it | hold the button down on it |
| See the way somewhere, and let go to go there. Let go on a wall, on yourself or off the map to go nowhere | drag | drag |
| Stop going | tap anywhere | any key |
| The actions for where you stand, tinted (inspect in grass, corpse, rest, dig for worms), and wait | tap | |
| `*` every action you can take here | tap | `*` |
| The stat row: psyche, with str, will, love and hp | tap | |
| Three dots: the menu (restart, the look, outlines, text brightness) | tap | |
| The book: memories you have recovered | tap | |
| The pot: what you carry | tap | |
| In an event or a list: take a link | tap it | arrows and Enter; Esc for `back` |

## How it works

- A level is a few rooms. Rooms come in many shapes: the whole seven by seven, narrow as a single column, with corners cut away, or with walls partitioning them. A gap in the wall leads to the next room.
- Stairs are always in the outer wall. Their treads narrow toward the edge going down and widen going up. Walk into them. Going down, you arrive just inside the stairs up, on the same square of the screen; going up takes you back to the floor above as you left it.
- The log at the top says what happens. The newest entry is brightest. One action adds at most two lines.
- As you go about, things come to you: a smell, a feeling, a detail of something in sight. In grass you can inspect the ground.
- In the room east of the entrance, a toad sleeps in the dirt near purplish grass. Hold on it up close to see its necklace. Walk into it to talk, try for the golden key, or attack it. The key opens the way downstairs.
- The statue stands in the same room. Walk into it and put something in its arms to learn who it is. You have time for one question. Afterward, open `*` to imbue an item.
- When you die you begin again at the floor's entrance, and the floor is as you left it.
- Nothing blinks. Browsing pages takes no turn.

## The files

| File | What it holds |
|---|---|
| `index.html` | the game |
| `src/text.js` | every word the player reads |
| `src/config.js` | every number: hp, damage, chances, how many turns things take |
| `src/game.js`, `src/gen.js`, `src/fov.js`, `src/path.js`, `src/rng.js` | the simulation: rules, level making, line of sight, ways, seeded chance. No screen code. |
| `src/render.js`, `src/input.js`, `src/main.js` | drawing, keys and touches, start-up. No rules. |
| `esoteric/` | the look: its signs, walls, icons, type and layout, and the Crooked Hand font |
| `style.css`, `src/palette.js` | the base layout and colours, shared with the archived original |
| `original/` | the archived first game |
| `study/marks/` | an old study for the original's marks. [Play it](https://royschwartz.github.io/like-like/study/marks/) |
| `study/stairs/` | a study of ways to go up and down stairs. [Play it](https://royschwartz.github.io/like-like/study/stairs/) |
| `study/log/` | a study of how new lines in the log show: lit, blinking, spaced. [Play it](https://royschwartz.github.io/like-like/study/log/) |
| `test/` | tests for the simulation |

The same seed and the same presses always give the same game.

```bash
node --test test/*.test.mjs
```
