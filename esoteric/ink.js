// Convert each run of ink on the pixel grid into one unit-high rectangle.
export function stamp(left, top, drawing) {
  const rows = drawing.trimEnd().split('\n');
  let path = '';
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g)) {
      const length = run[0].length;
      path += `M${left + run.index} ${top + y}h${length}v1h-${length}z`;
    }
  });
  return path;
}

export function inkMask(size, path, transform = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="white" transform="${transform}" d="${path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
