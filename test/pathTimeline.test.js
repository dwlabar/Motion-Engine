import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimeline, parsePath } from 'motion-engine';

const frame = (time, value, easeToNext = 'none') => ({ time, value, easeToNext });
const model = (keyframes, duration = 10) => ({
  version: 1, duration, tracks: [{ targetId: 'shape', property: 'path', keyframes }],
});
const result = (value) => [{ targetId: 'shape', property: 'path', value }];
const from = 'm0,0 c0,3 3,3 3,0 z M10 10L13 10';
const to = 'M6 6 C6 9 9 9 9 6 Z m10 10 l3 0';

test('interpolates every cubic coordinate across mixed open and closed subpaths', () => {
  const timeline = createTimeline(model([frame(1, from), frame(5, to)]));
  assert.deepEqual(parsePath(timeline.evaluate(3)[0].value), [
    { start: [3, 3], segments: [[3, 6, 6, 6, 6, 3], [5, 3, 4, 3, 3, 3]], closed: true },
    { start: [13, 13], segments: [[14, 13, 15, 13, 16, 13]], closed: false },
  ]);
});

test('uses outgoing, incoming legacy, and default easing with exact original strings at boundaries', () => {
  for (const [outgoing, incoming, expected] of [
    ['none', 'power3.in', 4], ['power2.in', 'power3.out', 1],
    [undefined, 'power3.in', 0.5], [undefined, undefined, 6],
  ]) {
    const timeline = createTimeline(model([
      { time: 4, value: 'M8 0L11 0', ease: incoming },
      { time: 0, value: 'm0,0h3', easeToNext: outgoing },
    ]));
    assert.equal(parsePath(timeline.evaluate(2)[0].value)[0].start[0], expected);
    assert.deepEqual(timeline.evaluate(0), result('m0,0h3'));
    assert.deepEqual(timeline.evaluate(4), result('M8 0L11 0'));
  }
});

test('preserves original d at every keyframe, repeated-value holds, final holds, and clamped times', () => {
  const last = ' M12,12 c0,3 3,3 3,0z M22 22h3 ';
  const timeline = createTimeline(model([frame(1, from), frame(4, from), frame(6, to), frame(8, last)]));
  for (const time of [-5, 0, 0.999]) assert.deepEqual(timeline.evaluate(time), []);
  for (const time of [1, 2.5, 4]) assert.deepEqual(timeline.evaluate(time), result(from));
  assert.deepEqual(timeline.evaluate(6), result(to));
  for (const time of [8, 9, 10, 100]) assert.deepEqual(timeline.evaluate(time), result(last));
  const start = createTimeline(model([frame(0, from), frame(4, to)]));
  assert.deepEqual(start.evaluate(-1), result(from));
  assert.notEqual(timeline.evaluate(4.001)[0].value, from);
  assert.notEqual(timeline.evaluate(5.999)[0].value, to);
});

test('supports empty tracks, empty path data, move-only paths, and zero-duration holds', () => {
  assert.deepEqual(createTimeline(model([])).evaluate(5), []);
  assert.deepEqual(createTimeline(model([frame(0, ' \t')], 0)).evaluate(100), result(' \t'));
  assert.deepEqual(createTimeline(model([frame(1, from)])).evaluate(5), result(from));
  assert.deepEqual(createTimeline(model([frame(0, ''), frame(4, ' ')])).evaluate(2), result(''));
  assert.deepEqual(parsePath(createTimeline(model([frame(0, 'M0 0Z'), frame(4, 'M4 8Z')])).evaluate(2)[0].value),
    parsePath('M2 4Z'));
});

test('accepts compatible geometry across different SVG command types including arcs', () => {
  const timeline = createTimeline(model([frame(0, 'M0 0L3 0'), frame(4, 'M0 0Q3 6 6 0')]));
  assert.deepEqual(parsePath(timeline.evaluate(2)[0].value)[0].segments, [[1.5, 2, 3, 2, 4.5, 0]]);
  const arcs = createTimeline(model([frame(0, 'M1 0A1 1 0 0 1 0 1'), frame(4, 'M3 0A3 3 0 0 1 0 3')]));
  const expected = parsePath('M2 0A2 2 0 0 1 0 2')[0].segments[0];
  parsePath(arcs.evaluate(2)[0].value)[0].segments[0].forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-10);
  });
});

test('rejects incompatible subpath counts, per-subpath segment counts, and closure during creation', () => {
  for (const [a, b, reason] of [
    ['M0 0', 'M0 0 M1 1', /subpath counts/],
    ['', 'M0 0', /subpath counts/],
    ['M0 0L1 1', 'M0 0L1 1L2 2', /segment counts/],
    ['M0 0L1 1M2 2', 'M0 0M2 2L3 3', /segment counts/],
    ['M0 0L1 1L0 0', 'M0 0L1 1Z', /closure/],
    ['M0 0', 'M0 0Z', /closure/],
    ['M1 0A1 1 0 0 1 0 1', 'M1 0A1 1 0 1 0 0 1', /segment counts/],
  ]) {
    assert.throws(() => createTimeline(model([frame(4, b), frame(0, a)])), reason);
    assert.throws(() => createTimeline(model([frame(0, a), frame(2, a), frame(4, b)])), TypeError);
  }
});

test('validates path values and existing timeline metadata even for single-frame tracks', () => {
  for (const value of [null, undefined, 1, {}, [], 'M0', 'M0 0 garbage', 'M0 0A1 1 0 2 1 3 4']) {
    assert.throws(() => createTimeline(model([frame(0, value)])), TypeError);
  }
  assert.throws(() => createTimeline(model([frame(0, from, 'invalid')])), TypeError);
  assert.throws(() => createTimeline(model([frame(0, from), frame(0, to)])), /Duplicate keyframe/);
  assert.throws(() => createTimeline(model([frame(11, from)])), RangeError);
});

test('frozen inputs remain unchanged and compiled geometry never reads later caller edits', () => {
  const input = model([frame(4, to), frame(0, from)]);
  const original = structuredClone(input);
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(input);
  const timeline = createTimeline(input);
  const expected = timeline.evaluate(2);
  assert.deepEqual(input, original);
  const mutable = structuredClone(input);
  const snapshot = createTimeline(mutable);
  mutable.tracks[0].keyframes[0].value = 'invalid';
  mutable.tracks[0].keyframes[1].value = 'M100 100';
  mutable.tracks[0].keyframes[1].easeToNext = 'power3.in';
  mutable.tracks[0].keyframes.reverse();
  mutable.tracks[0].property = 'opacity';
  mutable.duration = 1;
  assert.deepEqual(snapshot.evaluate(2), expected);
  assert.deepEqual(snapshot.evaluate(4), result(to));
  for (const time of [2, 0, 4, 1, 10, 3, 2]) {
    assert.deepEqual(snapshot.evaluate(time), timeline.evaluate(time));
    const previous = snapshot.evaluate(time);
    snapshot.evaluate(9);
    assert.deepEqual(previous, timeline.evaluate(time));
    previous[0].value = 'changed';
    previous.push({});
    assert.deepEqual(snapshot.evaluate(time), timeline.evaluate(time));
  }
});

test('path and transform tracks coexist in model order with independent timing', () => {
  const input = model([frame(1, from), frame(5, to)]);
  input.tracks.unshift({ targetId: 'shape', property: 'position', keyframes: [
    frame(0, { x: 0, y: 0 }), frame(4, { x: 8, y: 12 }),
  ] });
  input.tracks.push({ targetId: 'other', property: 'path', keyframes: [frame(3, 'M1 1')] });
  const timeline = createTimeline(input);
  assert.deepEqual(timeline.evaluate(0), [{ targetId: 'shape', property: 'position', value: { x: 0, y: 0 } }]);
  const evaluated = timeline.evaluate(3);
  assert.deepEqual(evaluated.map(({ targetId, property }) => [targetId, property]),
    [['shape', 'position'], ['shape', 'path'], ['other', 'path']]);
  assert.deepEqual(evaluated[0].value, { x: 6, y: 9 });
  assert.equal(evaluated[2].value, 'M1 1');
});

test('interpolates extreme finite cubic coordinates without overflowing endpoint differences', () => {
  const magnitude = Number.MAX_VALUE;
  const a = `M${-magnitude} 0C${-magnitude} 0 ${-magnitude} 0 ${-magnitude} 0Z`;
  const b = `M${magnitude} 0C${magnitude} 0 ${magnitude} 0 ${magnitude} 0Z`;
  const timeline = createTimeline(model([frame(0, a), frame(4, b)]));
  assert.deepEqual(parsePath(timeline.evaluate(2)[0].value), parsePath('M0 0C0 0 0 0 0 0Z'));
});
