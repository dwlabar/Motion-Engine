import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePath, serializePath, pathAnchors, movePathAnchor } from 'motion-engine';

function close(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance,
    `${value} should be close to ${expected[index]}`));
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('normalizes lines, implicit moveto pairs, repeated parameters, and relative subpaths', () => {
  const paths = parsePath('m1 2 3 0 0 3 h3 3 v3 -3 l-3 0 z m20 0 L30 10 H33 V13');
  assert.deepEqual(paths.map(({ start, closed }) => ({ start, closed })), [
    { start: [1, 2], closed: true }, { start: [21, 2], closed: false },
  ]);
  assert.deepEqual(paths[0].segments.map((segment) => segment.slice(4)), [
    [4, 2], [4, 5], [7, 5], [10, 5], [10, 8], [10, 5], [7, 5], [1, 2],
  ]);
  close(paths[0].segments[0], [2, 2, 3, 2, 4, 2]);
  assert.deepEqual(paths[1].segments.map((segment) => segment.slice(4)), [[30, 10], [33, 10], [33, 13]]);
});

test('reads compact signed decimals, exponent notation, commas, and SVG whitespace', () => {
  const path = parsePath('\tM.5-.5\nL1e1,+2E+1\r3.4.5\f6. -2z')[0];
  assert.deepEqual(path.start, [0.5, -0.5]);
  assert.deepEqual(path.segments.map((segment) => segment.slice(4)), [
    [10, 20], [3.4, 0.5], [6, -2], [0.5, -0.5],
  ]);
});

test('normalizes cubic and smooth cubic commands with relative and repeated groups', () => {
  const paths = parsePath('M1 2 c1 2 3 4 5 6 s3 4 5 6 3 4 5 6 S22 23 24 25');
  assert.deepEqual(paths[0].segments, [
    [2, 4, 4, 6, 6, 8], [8, 10, 9, 12, 11, 14],
    [13, 16, 14, 18, 16, 20], [18, 22, 22, 23, 24, 25],
  ]);
  assert.deepEqual(parsePath('M0 0 C1 2 3 4 5 6 7 8 9 10 11 12')[0].segments,
    [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
});

test('converts quadratics and reflected quadratic controls to cubics', () => {
  const path = parsePath('M0 0 Q3 6 6 0 T12 0 q3 6 6 0 t6 0')[0];
  assert.deepEqual(path.segments, [
    [2, 4, 4, 4, 6, 0], [8, -4, 10, -4, 12, 0],
    [14, 4, 16, 4, 18, 0], [20, -4, 22, -4, 24, 0],
  ]);
});

test('smooth controls reflect only the preceding matching command family', () => {
  close(parsePath('M0 0 Q3 6 6 0 S9 3 12 0')[0].segments[1], [6, 0, 9, 3, 12, 0]);
  close(parsePath('M0 0 C2 4 4 4 6 0 T12 0')[0].segments[1], [6, 0, 8, 0, 12, 0]);
  for (const reset of ['L6 0', 'H6', 'V0', 'A0 1 0 0 1 6 0', 'A1 1 0 0 1 6 0']) {
    const segments = parsePath(`M0 0 C2 4 4 4 6 0 ${reset} S9 3 12 0`)[0].segments;
    close(segments.at(-1).slice(0, 2), [6, 0]);
  }
  close(parsePath('M0 0 Q3 6 6 0 M10 10 T16 10')[1].segments[0], [10, 10, 12, 10, 16, 10]);
});

test('arcs normalize quarter circles, direction flags, relative endpoints, and compact flags', () => {
  const k = 4 / 3 * Math.tan(Math.PI / 8);
  const clockwise = parsePath('M1 0 A1 1 0 0 1 0 1')[0];
  assert.equal(clockwise.segments.length, 1);
  close(clockwise.segments[0], [1, k, k, 1, 0, 1]);
  close(parsePath('M1 0 a1 1 0 01-1 1')[0].segments[0], clockwise.segments[0]);
  close(parsePath('M1 0 A1 1 0 0 0 0 -1')[0].segments[0], [1, -k, k, -1, 0, -1]);
  for (const sweep of [0, 1]) {
    const large = parsePath(`M1 0 A1 1 0 1 ${sweep} 0 ${sweep ? -1 : 1}`)[0];
    assert.equal(large.segments.length, 3);
    assert.deepEqual(large.segments.at(-1).slice(4), [0, sweep ? -1 : 1]);
  }
  const repeated = parsePath('M1 0 A1 1 0 010 1 1 1 0 01-1 0')[0];
  assert.equal(repeated.segments.length, 2);
  assert.deepEqual(repeated.segments.at(-1).slice(4), [-1, 0]);
});

test('arcs account for rotation, unequal radii, radii correction, and degeneracy', () => {
  const k = 4 / 3 * Math.tan(Math.PI / 8);
  close(parsePath('M0 2 A2 1 90 0 1 -1 0')[0].segments[0], [-k, 2, -1, 2 * k, -1, 0]);
  const corrected = parsePath('M0 0 A1 1 0 0 1 4 0')[0];
  assert.equal(corrected.segments.length, 2);
  close(corrected.segments[0], [0, -2 * k, 2 - 2 * k, -2, 2, -2]);
  assert.deepEqual(parsePath('M0 0 A-1 -1 0 0 1 4 0'), [corrected]);
  assert.deepEqual(parsePath('M0 0 A0 3 0 0 1 3 0'), parsePath('M0 0 L3 0'));
  assert.deepEqual(parsePath('M0 0 A3 0 0 0 1 3 0'), parsePath('M0 0 L3 0'));
  assert.deepEqual(parsePath('M1 2 A3 4 45 1 0 1 2'), parsePath('M1 2'));
});

test('preserves empty, move-only, zero-length, and closed subpaths without invented anchors', () => {
  assert.deepEqual(parsePath(' \n\t'), []);
  assert.equal(serializePath([]), '');
  const paths = parsePath('M1 2 M3 4z M5 6L5 6z M7 8L7 8');
  assert.deepEqual(paths.map((path) => [path.segments.length, path.closed]),
    [[0, false], [0, true], [1, true], [1, false]]);
  assert.deepEqual(pathAnchors(paths).map(({ subpath, index }) => [subpath, index]),
    [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
});

test('corrected rotated arcs have stable half-turn topology regardless of large-arc flag', () => {
  for (const rotation of [-359, -90, 0, 17, 37, 90, 139, 360]) {
    for (const sweep of [0, 1]) {
      const small = parsePath(`M0 0A1 2 ${rotation} 0 ${sweep} 7 11`);
      const large = parsePath(`M0 0A1 2 ${rotation} 1 ${sweep} 7 11`);
      assert.equal(small[0].segments.length, 2);
      assert.deepEqual(small, large);
      assert.deepEqual(small[0].segments.at(-1).slice(4), [7, 11]);
    }
  }
});

test('closepath adds a seam only when needed and subsequent drawing begins a new subpath', () => {
  const closed = parsePath('M0 0 L3 0 L0 0 Z')[0];
  assert.equal(closed.segments.length, 2);
  assert.equal(parsePath('M0 0 L3 0Z')[0].segments.length, 2);
  assert.deepEqual(parsePath('M1 2L4 2z l6 0z m10 10 s1 2 3 4').map((path) => path.start),
    [[1, 2], [1, 2], [11, 12]]);
  assert.deepEqual(parsePath('M0 0 L3 0 Z Z'), parsePath('M0 0 L3 0 Z'));
  assert.equal(parsePath('M0 0 L3 0 L0 0')[0].closed, false);
});

test('serialization round-trips all normalized geometry and retains full numeric precision', () => {
  const paths = freeze(parsePath('M.123456789012345 2q3 4 5 6t7 8z M9 10a5 7 35 1 0 15 20'));
  const serialized = serializePath(paths);
  assert.match(serialized, /^M 0.123456789012345 2 C /);
  assert.deepEqual(parsePath(serialized), paths);
  assert.equal(serializePath(parsePath(serialized)), serialized);
  const anchors = pathAnchors(paths);
  anchors[0].x = 999;
  assert.equal(pathAnchors(paths)[0].x, 0.123456789012345);
});

test('moves an interior anchor with its incoming and outgoing controls, preserving all other points', () => {
  const paths = freeze(parsePath('M0 0 C1 2 3 4 5 6 C7 8 9 10 11 12 M20 20 L23 20'));
  const moved = movePathAnchor(paths, { subpath: 0, index: 1 }, 10, -2);
  assert.deepEqual(moved[0], {
    start: [0, 0], closed: false,
    segments: [[1, 2, 13, 2, 15, 4], [17, 6, 9, 10, 11, 12]],
  });
  assert.deepEqual(moved[1], paths[1]);
  moved[1].segments[0][0] = 999;
  moved[0].start[0] = 999;
  assert.equal(paths[1].segments[0][0], 21);
  assert.equal(paths[0].start[0], 0);
});

test('open endpoints move independently even when their coordinates coincide', () => {
  const paths = parsePath('M0 0 C1 2 3 4 0 0');
  assert.equal(pathAnchors(paths).length, 2);
  assert.deepEqual(movePathAnchor(paths, { subpath: 0, index: 0 }, 2, 3)[0], {
    start: [2, 3], segments: [[3, 5, 3, 4, 0, 0]], closed: false,
  });
  assert.deepEqual(movePathAnchor(paths, { subpath: 0, index: 1 }, 2, 3)[0], {
    start: [0, 0], segments: [[1, 2, 5, 7, 2, 3]], closed: false,
  });
});

test('moving a closed seam updates both endpoints and adjacent controls exactly once', () => {
  const paths = freeze(parsePath('M0 0 C1 2 3 4 5 6 C7 8 9 10 0 0Z M30 30'));
  const moved = movePathAnchor(paths, { subpath: 0, index: 0 }, 10, -2);
  assert.deepEqual(moved[0], {
    start: [10, -2], closed: true,
    segments: [[11, 0, 3, 4, 5, 6], [7, 8, 19, 8, 10, -2]],
  });
  assert.deepEqual(movePathAnchor(paths, { subpath: 0, index: 2 }, 10, -2), moved);
  assert.deepEqual(parsePath(serializePath(moved)), moved);
  const loop = parsePath('M0 0C1 2 3 4 0 0Z');
  assert.deepEqual(movePathAnchor(loop, { subpath: 0, index: 0 }, 1, 1)[0], {
    start: [1, 1], segments: [[2, 3, 4, 5, 1, 1]], closed: true,
  });
  assert.deepEqual(movePathAnchor(parsePath('M1 2Z'), { subpath: 0, index: 0 }, 3, 4), parsePath('M4 6Z'));
});

test('rejects malformed path syntax, incomplete groups, bad flags, and nonfinite coordinates', () => {
  for (const value of [null, undefined, 42, {}, [], 'L0 0', 'Z', 'M', 'M0', 'M0 0L1',
    'M0 0C1 2 3 4 5', 'M0 0Q1 2 3', 'M0 0S1 2 3', 'M0 0T1', 'M0 0H', 'M0 0V',
    'M0 0A1 2 3 0 1 4', 'M0 0A1 2 3 2 0 4 5', 'M0 0A1 2 3 0 -1 4 5',
    'M0 0A1 2 3 0.0 1 4 5', 'M0 0A1 2 3+0 1 4 5', 'M0 0R1 2', 'MNaN 0', 'MInfinity 0',
    'M1e999 0', 'M1e 0', 'M0 0z1 2', 'M,0 0', 'M0,,0', 'M0 0,', 'M0 0,L1 2',
    'M0 0L,1 2', 'M0 0;', 'M0 0\u00a0L1 2', 'M1e308 0l1e308 0']) {
    assert.throws(() => parsePath(value), TypeError, String(value));
  }
});

test('geometry utilities reject invalid structures, seams, indices, and overflowing movements', () => {
  for (const paths of [null, {}, [null], [{}], [{ start: [0, 0], segments: [], closed: 1 }],
    [{ start: [0, Infinity], segments: [], closed: false }],
    [{ start: [0, 0], segments: [[1, 2]], closed: false }],
    [{ start: [0, 0], segments: [[1, 2, 3, 4, 5, 6]], closed: true }],
    [{ start: Array(2), segments: [], closed: false }],
    [{ start: [0, 0], segments: Array(1), closed: false }]]) {
    assert.throws(() => serializePath(paths), TypeError);
    assert.throws(() => pathAnchors(paths), TypeError);
    assert.throws(() => movePathAnchor(paths, { subpath: 0, index: 0 }, 1, 2), TypeError);
  }
  const paths = freeze(parsePath('M0 0L3 0'));
  for (const anchor of [null, {}, { subpath: 0, index: 0.5 }, { subpath: '0', index: 0 }]) {
    assert.throws(() => movePathAnchor(paths, anchor, 1, 2), TypeError);
  }
  for (const anchor of [{ subpath: -1, index: 0 }, { subpath: 1, index: 0 },
    { subpath: 0, index: -1 }, { subpath: 0, index: 2 }]) {
    assert.throws(() => movePathAnchor(paths, anchor, 1, 2), RangeError);
  }
  for (const delta of [Infinity, NaN, '1', undefined]) {
    assert.throws(() => movePathAnchor(paths, { subpath: 0, index: 0 }, delta, 1), TypeError);
    assert.throws(() => movePathAnchor(paths, { subpath: 0, index: 0 }, 1, delta), TypeError);
  }
  assert.throws(() => movePathAnchor(parsePath('M1e308 0'), { subpath: 0, index: 0 }, 1e308, 0), TypeError);
});
