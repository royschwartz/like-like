// Convert each run of ink on the pixel grid into one rectangle, a pixel high. A pixel is
// one unit of the square, or `k` units for a drawing set larger or smaller, every pixel kept.
export function stamp(left, top, drawing, k = 1) {
  const rows = drawing.trimEnd().split('\n');
  const n = (v) => +v.toFixed(3);
  let path = '';
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g)) {
      const length = n(run[0].length * k);
      path += `M${n(left + run.index * k)} ${n(top + y * k)}h${length}v${n(k)}h-${length}z`;
    }
  });
  return path;
}

export function inkMask(size, path, transform = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="white" transform="${transform}" d="${path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
