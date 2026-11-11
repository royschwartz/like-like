// The look of a cell: which character, which ink, which ground.
// Two looks. "paper" follows the drawing: a pale map inside a black slab.
// "dark" follows Brogue: coloured characters on dark, tinted ground.
//
// paintCell() is the only thing the renderer needs from here.

const LOOKS = {
  paper: {
    unknown: [14, 13, 12],
    // ground tint, ink, how much the ground varies cell to cell
    floor: { ch: '.', fg: [128, 120, 104], bg: [236, 231, 216], vary: 5, fgVary: 34 },
    grass: { ch: '"', fg: [74, 122, 56], bg: [225, 231, 205], vary: 6, fgVary: 22 },
    wall: { ch: '#', fg: [96, 88, 75], bg: [44, 40, 35], vary: 7, fgVary: 12 },
    door: { ch: '+', fg: [92, 46, 14], bg: [205, 172, 120], vary: 4, fgVary: 0 },
    stairs: { ch: '>', fg: [24, 20, 14], bg: [240, 208, 96], vary: 3, fgVary: 0 },
    entrance: { ch: '<', fg: [118, 110, 95], bg: [229, 224, 208], vary: 4, fgVary: 0 },
    player: { ch: '@', fg: [0, 0, 0], bg: [252, 249, 240] },
    goblin: { ch: 'g', fg: [176, 48, 18] },
    goblinAsleep: { ch: 'g', fg: [176, 132, 112] },
    corpse: { ch: '%', fg: [130, 26, 26] },
    // Far cells go a little grey and cool; remembered cells fade like old ink.
    shade: [176, 178, 184],
    shadeMax: 0.2,
    memoryTo: [150, 146, 138],
    memoryFg: 0.5,
    memoryBg: 0.26,
  },
  dark: {
    unknown: [0, 0, 0],
    floor: { ch: '.', fg: [112, 112, 146], bg: [11, 11, 24], vary: 3, fgVary: 20 },
    grass: { ch: '"', fg: [84, 168, 70], bg: [9, 20, 13], vary: 3, fgVary: 26 },
    wall: { ch: '#', fg: [30, 26, 24], bg: [98, 86, 78], vary: 11, fgVary: 6 },
    door: { ch: '+', fg: [214, 122, 44], bg: [74, 30, 13], vary: 4, fgVary: 0 },
    stairs: { ch: '>', fg: [255, 236, 124], bg: [56, 50, 14], vary: 3, fgVary: 0 },
    entrance: { ch: '<', fg: [128, 128, 162], bg: [14, 14, 30], vary: 3, fgVary: 0 },
    player: { ch: '@', fg: [255, 255, 255], bg: [30, 28, 34] },
    goblin: { ch: 'g', fg: [226, 146, 58] },
    goblinAsleep: { ch: 'g', fg: [126, 92, 58] },
    corpse: { ch: '%', fg: [168, 44, 44] },
    shade: [0, 0, 8],
    shadeMax: 0.5,
    memoryTo: [6, 8, 22],
    memoryFg: 0.6,
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
  let bg = add(ground.bg, (noise(x, y, key) - 0.5) * 2 * ground.vary);
  let fg = add(ground.fg, (noise(y, x, key + 7) - 0.5) * 2 * ground.fgVary);
  let bold = false;

  const thing = cell.thing;
  if (thing) {
    if (thing.kind === 'player') {
      ch = look.player.ch;
      fg = look.player.fg;
      bg = look.player.bg;
      bold = true;
    } else if (thing.kind === 'goblin') {
      const g = thing.asleep ? look.goblinAsleep : look.goblin;
      ch = g.ch;
      fg = g.fg;
      bold = !thing.asleep;
    } else if (thing.kind === 'corpse') {
      ch = look.corpse.ch;
      fg = look.corpse.fg;
    }
  }

  if (cell.state === 'remembered') {
    fg = mix(fg, look.memoryTo, look.memoryFg);
    bg = mix(bg, look.memoryTo, look.memoryBg);
    bold = false;
  } else if (!(thing && thing.kind === 'player')) {
    // Light falls off with distance from you.
    const d = Math.hypot(x - env.px, y - env.py);
    const t = Math.min(1, Math.max(0, (d - 1.5) / 9)) * look.shadeMax;
    bg = mix(bg, look.shade, t);
    fg = mix(fg, look.shade, t * 0.6);
  }

  return { ch, fg: css(fg), bg: css(bg), bold };
}
