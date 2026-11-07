export function validatePath(paths) {
  if (!Array.isArray(paths)) throw new TypeError('Expected an array of cubic subpaths.');
  const coordinates = (value, length) => Array.isArray(value) && value.length === length
    && Array.from(value).every(Number.isFinite);
  for (const path of paths) {
    if (!path || !coordinates(path.start, 2) || typeof path.closed !== 'boolean'
      || !Array.isArray(path.segments)
      || !Array.from(path.segments).every((segment) => coordinates(segment, 6))) {
      throw new TypeError('Subpaths require a finite start pair, cubic segments, and boolean closed.');
    }
    const last = path.segments.at(-1);
    if (path.closed && last && (last[4] !== path.start[0] || last[5] !== path.start[1])) {
      throw new TypeError('A closed subpath must end at its start.');
    }
  }
}

// Internal serialization also serves compiled paths, which are already validated.
export function serializeCubics(paths) {
  return paths.map(({ start, segments, closed }) => [
    `M ${start.join(' ')}`,
    ...segments.map((segment) => `C ${segment.join(' ')}`),
    ...(closed ? ['Z'] : []),
  ].join(' ')).join(' ');
}

export function serializePath(paths) {
  validatePath(paths);
  return serializeCubics(paths);
}

export function pathAnchors(paths) {
  validatePath(paths);
  const anchors = [];
  paths.forEach(({ start, segments, closed }, subpath) => {
    anchors.push({ subpath, index: 0, x: start[0], y: start[1] });
    const count = segments.length - (closed ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      anchors.push({ subpath, index: index + 1, x: segments[index][4], y: segments[index][5] });
    }
  });
  return anchors;
}

export function movePathAnchor(paths, anchor, dx, dy) {
  validatePath(paths);
  if (!anchor || !Number.isInteger(anchor.subpath) || !Number.isInteger(anchor.index)
    || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new TypeError('Anchor indices and finite numeric movement are required.');
  }
  const original = paths[anchor.subpath];
  if (!original || anchor.index < 0 || anchor.index > original.segments.length) {
    throw new RangeError('Anchor is outside the path.');
  }
  const next = paths.map(({ start, segments, closed }) => ({
    start: [...start], segments: segments.map((segment) => [...segment]), closed,
  }));
  const path = next[anchor.subpath];
  const count = path.segments.length;
  const index = path.closed && anchor.index === count ? 0 : anchor.index;
  const translate = (values, offset) => {
    values[offset] += dx;
    values[offset + 1] += dy;
  };
  if (index === 0) translate(path.start, 0);
  if (index > 0) {
    translate(path.segments[index - 1], 2);
    translate(path.segments[index - 1], 4);
  }
  if (index < count) translate(path.segments[index], 0);
  if (path.closed && index === 0 && count > 0) {
    translate(path.segments[count - 1], 2);
    translate(path.segments[count - 1], 4);
  }
  validatePath(next);
  return next;
}
