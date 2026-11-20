# LIKE LIKE

A small ASCII roguelike, shaped for a phone. A first, simple build: a sword, stairs down, and on level 1 a toad, a golden door and a bust.

**Play it: [royschwartz.github.io/like-like](https://royschwartz.github.io/like-like/)**

The [esoteric edition](https://royschwartz.github.io/like-like/esoteric/) has five-by-five rooms inside a ring of wavering wall. In the opening, one patch of grass spans four squares, DEE stands on the right, and the stairs just below you lead to the toad’s floor. You are the horned eye. The toad is the hooked lowercase `t` from Crooked Hand, the edition’s typeface. [Download the font](https://royschwartz.github.io/like-like/esoteric/font/crooked-hand.ttf?v=2) or see its [source and license](esoteric/font/).

```
you have been asked to retrieve the amulet of yendor. it is at the bottom of this dungeon, probably
```

In the esoteric edition, open the square menu to set text brightness from 40% to 100%. The browser remembers your setting. The outer walls sit halfway offscreen until a hit briefly brings the whole room into view.

## Play

It is plain files, with nothing to install or build. To run it on your own machine, serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then go to `http://localhost:5173`. Add `?seed=7` to the address to play the same dungeon again.

| | Phone | Keyboard |
|---|---|---|
| Go there, step by step (or hit what's there, if it's beside you; your own square waits a turn) | tap it | click it |
| Observe a thing on the map: hold it while it blinks, and when the blink is done you observe it. Let go before and you go there instead. Takes no time | hold it | hold the button down on it |
| See the way somewhere: drag from the map; the way lights up and the square under your finger is marked. Let go to go there. Drag back onto yourself or off the map, and let go, to go nowhere | drag | drag |
| Stop going | tap anywhere | any key |
| Move a step, or hit what's in the way | | arrow keys |
| The wide button: `sense`, or `corpse` on a corpse, or `stairs` on the stairs | tap | Enter or Space |
| `inv` what you carry: the inventory screen | tap | |
| In the inventory: `inspect` an item, `use` it, `back` | wide button, `use`, `back` | Enter, Esc |
| `*` rest, or dig for worms once you know of them | tap | `*` |
| `psy` what you know of your mind | tap | |
| `...` wait a turn | tap | `.` |
| The menu (a square): restart, the paper or dark look, and the outlines round the buttons (off, or 1 to 8, grey up to white) | tap | |
| Pick an option | tap | `1` to `4`, or arrows and Enter |
| Back | `back` | Esc |
| In an event: take a link | tap it | arrows and Enter, or `1` to `9`; Esc for `back` |

## How it works

- A level is one to four rooms. A room is 11 by 11 characters, walls included, and fills the screen. Walk through a door (`+`) and the next room slides in.
- The log at the top says what happens. Its newest lines are bright; older ones are dimmer. One action adds at most two wrapped lines of text. The opening is kept in full above the arrival status.
- Tap or click a square on the map to go there, a step at a time; the way still ahead stays lit, and any press stops you. Tap a thing beside you to hit it or use it. Hold a thing instead and it blinks; held through the blink, you observe it. It takes no time and gives one observation. Hold it again and it goes round what there is to see: for a creature, what it is doing and on what ground, then what sensing has found about it, wherever you are. Drag across the map to see the way to a square, and let go to go there. A finger hides the square it's on, so the squares round it are marked: corners round where a drag would go (a tap flashes them), and a box that closes in on a square while you hold it, reaching it as the hold ends. Nothing blinks for being there to look at. Once you've noticed a thing, by sensing or now and then without trying (the nearer, the likelier), it blinks white while it has something you haven't observed. In the inventory, an item you haven't inspected blinks.
- `inv` replaces the map with what you carry. Move up and down to choose an item.
- You see what's in your line of sight. `sense` takes a turn: it spreads out from you through everywhere you could walk, and the walls take it in; it shows you your own numbers for a while, shows the whole room, and finds one new thing: first about the creatures it reaches, nearest first (some only from close by), then the room's own secrets. When there's nothing new it says so. Combat messages take priority; a find that cannot fit waits for a later sensing. Now and then a secret of the room comes to you without sensing, but never the worms.
- Stand on the stairs (`>`) and the wide button says `stairs`.
- When you die you begin again at the level's entrance (`<`), and the level is as you left it.
- On level 1 a toad (`T`) sleeps in the room farthest from the entrance. The stairs are behind a golden door (`+`) in a corner of its room, and only its key opens it. Nothing else lives in the dungeon yet.
- Walk into the toad while it sleeps and its event opens, taking no turn. Awake, walking into it strikes it, and it comes for you. Dead, it leaves a corpse (`%`): stand on it and the wide button says `corpse`.
- An event is a screen of its own: text and links to choose from, with the menu still at the bottom. Reading and choosing take no time; `attack!` returns to the map and takes a combat turn.
- Sensing in the toad's room, a line at a time, comes to the worms; then `*` can dig for them, on grass or dirt. Inspecting them brings a memory back a few turns later. Memories you have are under `psy`.
- The toad's room also holds a bust (`&`). You can't walk onto it; move into it and its event opens, taking no turn. The first time, it speaks, and ends at a question; its one link is what you say back, and then it answers. After that its links are what you carry: choose one to put it in the opening, which enchants it once (an enchanted sword does 1 more damage). An item holding a memory gives it up at once. The bust's speaking and enchanting are noise, and may wake the toad.

## The files

| File | What it holds |
|---|---|
| `src/text.js` | every word the player reads |
| `src/config.js` | every number: hp, damage, chances, how many turns things take |
| `src/palette.js` | the characters and colours, for both looks |
| `style.css` | the layout, the buttons, the effects (a few hard frames each) |
| `src/game.js`, `src/gen.js`, `src/fov.js`, `src/rng.js` | the simulation: rules, level making, line of sight, seeded chance. No screen code. |
| `src/render.js`, `src/input.js`, `src/main.js` | drawing, keys and touches, start-up. No rules. |
| `test/` | tests for the simulation |
| `src/marks.js` | the marks round the square under your finger |
| `study/marks/` | a study, not the game: the ways of marking the squares beside the one under your finger that the game's marks were chosen from. [Play it](https://royschwartz.github.io/like-like/study/marks/) |

The same seed and the same presses always give the same game.

```bash
node --test test/*.test.mjs
```

The font is Monaco where the device has it (Macs), and the nearest monospace elsewhere.
