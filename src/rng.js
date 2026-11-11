// The one source of chance. Its state is a plain object kept inside the game,
// so the same seed and the same actions always give the same game.

export function makeRng(seed) {
  return { s: seed >>> 0 };
}

// mulberry32: a float in [0, 1).
export function float(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// A whole number from lo to hi, both included.
export function int(r, lo, hi) {
  return lo + Math.floor(float(r) * (hi - lo + 1));
}

export function chance(r, p) {
  return float(r) < p;
}

export function pick(r, arr) {
  return arr[Math.floor(float(r) * arr.length)];
}

// pairs: [[value, weight], ...]
export function weighted(r, pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let roll = float(r) * total;
  for (const [v, w] of pairs) {
    roll -= w;
    if (roll < 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

// Shuffles in place and returns the same array.
export function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(float(r) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A new seed from an old one (for restart).
export function deriveSeed(seed) {
  const r = makeRng((seed >>> 0) ^ 0x9e3779b9);
  return Math.floor(float(r) * 2147483647);
}
