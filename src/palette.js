// The look of a cell: which character, which ink, which ground.
// Two looks. "paper" follows the drawing: a pale map inside a black slab.
// "dark" follows Ultima V: pure black ground and a few flat inks from the EGA's sixteen.
//
// Tiles are flat: a kind of cell is one colour wherever it is. The numbers that used to
// vary it (vary, fgVary, shadeMax) are still here, at nothing, and can be turned back up.
//
// paintCell() is the only thing the renderer needs from here.

// The EGA inks the dark look draws with.
const EGA = {
  black: [0, 0, 0],
  green: [0, 170, 0],
  red: [170, 0, 0],
  brown: [170, 85, 0],
  grey: [170, 170, 170],
  darkGrey: [85, 85, 85],
  brightGreen: [85, 255, 85],
  brightRed: [255, 85, 85],
  yellow: [255, 255, 85],
  white: [255, 255, 255],
};

const LOOKS = {
  paper: {
    unknown: [14, 13, 12],
    // ground tint, ink, how much the ground and the ink vary cell to cell (0: flat)
    floor: { ch: '.', fg: [128, 120, 104], bg: [236, 231, 216], vary: 0, fgVary: 0 },
    grass: { ch: '"', fg: [74, 122, 56], bg: [225, 231, 205], vary: 0, fgVary: 0 },
    wall: { ch: '#', fg: [96, 88, 75], bg: [44, 40, 35], vary: 0, fgVary: 0 },
    door: { ch: '+', fg: [92, 46, 14], bg: [205, 172, 120], vary: 0, fgVary: 0 },
    // the golden door, locked; once open it is drawn as a door
    golddoor: { ch: '+', fg: [255, 214, 72], bg: [96, 66, 12], vary: 0, fgVary: 0, bold: true },
    opendoor: { ch: '+', fg: [92, 46, 14], bg: [205, 172, 120], vary: 0, fgVary: 0 },
    // the bust of DEE: grey stone
    statue: { ch: '&', fg: [58, 58, 62], bg: [182, 180, 174], vary: 0, fgVary: 0, bold: true },
    stairs: { ch: '>', fg: [24, 20, 14], bg: [240, 208, 96], vary: 0, fgVary: 0 },
    entrance: { ch: '<', fg: [118, 110, 95], bg: [229, 224, 208], vary: 0, fgVary: 0 },
    player: { ch: '@', fg: [0, 0, 0], bg: [252, 249, 240] },
    toad: { ch: 'T', fg: [40, 112, 22] },
    toadAsleep: { ch: 'T', fg: [78, 116, 52] },
    corpse: { ch: '%', fg: [130, 26, 26] },
    // Light with distance from you: how far toward `shade` the far end goes (0: no falloff),
    // in how many flat steps (0: smooth).
    shade: [176, 178, 184],
    shadeMax: 0,
    shadeSteps: 2,
    // Remembered cells: one flat treatment, like old ink.
    memoryTo: [150, 146, 138],
    memoryFg: 0.5,
    memoryBg: 0.26,
  },
  dark: {
    unknown: EGA.black,
    // the ground is black, with the ink saying what it is
    floor: { ch: '.', fg: EGA.brown, bg: EGA.black, vary: 0, fgVary: 0 },
    grass: { ch: '"', fg: EGA.green, bg: EGA.black, vary: 0, fgVary: 0 },
    entrance: { ch: '<', fg: EGA.grey, bg: EGA.black, vary: 0, fgVary: 0 },
    stairs: { ch: '>', fg: EGA.yellow, bg: EGA.black, vary: 0, fgVary: 0, bold: true },
    // what stands in your way is a solid tile
    wall: { ch: '#', fg: EGA.grey, bg: EGA.darkGrey, vary: 0, fgVary: 0 },
    door: { ch: '+', fg: EGA.black, bg: EGA.brown, vary: 0, fgVary: 0 },
    golddoor: { ch: '+', fg: EGA.black, bg: EGA.yellow, vary: 0, fgVary: 0, bold: true },
    opendoor: { ch: '+', fg: EGA.black, bg: EGA.brown, vary: 0, fgVary: 0 },
    statue: { ch: '&', fg: EGA.black, bg: EGA.grey, vary: 0, fgVary: 0, bold: true },
    player: { ch: '@', fg: EGA.white, bg: EGA.black },
    toad: { ch: 'T', fg: EGA.brightGreen },
    toadAsleep: { ch: 'T', fg: EGA.green },
    corpse: { ch: '%', fg: EGA.brightRed },
    shade: EGA.black,
    shadeMax: 0,
    shadeSteps: 2,
    // Remembered cells: the same inks, flatly dimmer.
    memoryTo: EGA.black,
    memoryFg: 0.55,
    memoryBg: 0.55,
  },
};

export const LOOK_NAMES = Object.keys(LOOKS);

// A steady number from 0 to 1 for a cell, so colours never flicker.
function noise(x, y, key) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(key | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a, d) => [a[0] + d, a[1] + d, a[2] + d];
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const css = (c) => `rgb(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])})`;

/**
 * @param cell  { t, state, thing } as the game's view() gives it
 * @param x,y   where the cell is in the room, 0..10
 * @param env   { look: 'paper'|'dark', px, py, key }  player's cell, and the room's noise key
 * @returns     { ch, fg, bg, bold }  fg and bg are css colours
 */
export function paintCell(cell, x, y, env) {
  const look = LOOKS[env.look] || LOOKS.paper;
  if (!cell || cell.state === 'unknown') {
    return { ch: ' ', fg: css(look.unknown), bg: css(look.unknown), bold: false };
  }

  const key = env.key | 0;
  const ground = look[cell.t] || look.floor;
  let ch = ground.ch;
  let bg = ground.vary ? add(ground.bg, (noise(x, y, key) - 0.5) * 2 * ground.vary) : ground.bg;
  let fg = ground.fgVary ? add(ground.fg, (noise(y, x, key + 7) - 0.5) * 2 * ground.fgVary) : ground.fg;
  let bold = !!ground.bold;

  // What stands on the cell: you, the toad, or a corpse.
  const thing = cell.thing;
  if (thing) {
    if (thing.kind === 'player') {
      ch = look.player.ch;
      fg = look.player.fg;
      bg = look.player.bg;
      bold = true;
    } else if (thing.kind === 'toad') {
      // bold awake or asleep: it is large
      const t = thing.asleep ? look.toadAsleep : look.toad;
      ch = t.ch;
      fg = t.fg;
      bold = true;
    } else if (thing.kind === 'corpse') {
      ch = look.corpse.ch;
      fg = look.corpse.fg;
    }
  }

  if (cell.state === 'remembered') {
    fg = mix(fg, look.memoryTo, look.memoryFg);
    bg = mix(bg, look.memoryTo, look.memoryBg);
    bold = false;
  } else if (look.shadeMax > 0 && !(thing && thing.kind === 'player')) {
    // Light falls off with distance from you, smoothly or in flat steps.
    const d = Math.hypot(x - env.px, y - env.py);
    let far = Math.min(1, Math.max(0, (d - 1.5) / 9));
    if (look.shadeSteps > 0) far = Math.ceil(far * look.shadeSteps) / look.shadeSteps;
    const t = far * look.shadeMax;
    bg = mix(bg, look.shade, t);
    fg = mix(fg, look.shade, t * 0.6);
  }

  return { ch, fg: css(fg), bg: css(bg), bold };
}
