import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimeline } from 'motion-engine';

const frame = (time, value) => ({ time, value, easeToNext: 'none' });
const track = (keyframes, targetId = 'box', property = 'opacity') => ({
  targetId, property, keyframes,
});
const model = (tracks = [], duration = 10) => ({ version: 1, duration, tracks });
const result = (value, targetId = 'box', property = 'opacity') => ({ targetId, property, value });

test('interpolates numeric values and preserves every exact boundary', () => {
  const timeline = createTimeline(model([track([
    frame(1, -0), frame(3, 10), frame(5, -10),
  ])]));
  assert.equal(timeline.duration, 10);
  assert.deepEqual(timeline.evaluate(1), [result(-0)]);
  assert.deepEqual(timeline.evaluate(2), [result(5)]);
  assert.deepEqual(timeline.evaluate(3), [result(10)]);
  assert.deepEqual(timeline.evaluate(4), [result(0)]);
  assert.deepEqual(timeline.evaluate(5), [result(-10)]);
});

test('independent overlapping tracks retain model order and absolute timing', () => {
  const timeline = createTimeline(model([
    track([frame(0, 0), frame(4, 8)], 'a', 'scale'),
    track([frame(1, 10), frame(3, 30)], 'a', 'rotation'),
    track([frame(2, 100), frame(4, 200)], 'b', 'scale'),
  ]));
  assert.deepEqual(timeline.evaluate(2), [
    result(4, 'a', 'scale'), result(20, 'a', 'rotation'), result(100, 'b', 'scale'),
  ]);
  assert.deepEqual(timeline.evaluate(0), [result(0, 'a', 'scale')]);
});

test('empty models/tracks and single keyframes omit then hold', () => {
  assert.deepEqual(createTimeline(model()).evaluate(5), []);
  const timeline = createTimeline(model([track([]), track([frame(2, 7)], 'other')]));
  assert.deepEqual(timeline.evaluate(1), []);
  assert.deepEqual(timeline.evaluate(2), [result(7, 'other')]);
  assert.deepEqual(timeline.evaluate(9), [result(7, 'other')]);
  assert.deepEqual(createTimeline(model([track([frame(0, 4)])], 0)).evaluate(10), [result(4)]);
});

test('omits before first keyframe, holds after last, and clamps time', () => {
  const timeline = createTimeline(model([track([frame(2, 4), frame(8, 16)])]));
  assert.deepEqual(timeline.evaluate(-100), []);
  assert.deepEqual(timeline.evaluate(1.999), []);
  assert.deepEqual(timeline.evaluate(9), [result(16)]);
  assert.deepEqual(timeline.evaluate(100), timeline.evaluate(10));
  const atZero = createTimeline(model([track([frame(0, 2), frame(10, 12)])]));
  assert.deepEqual(atZero.evaluate(-1), [result(2)]);
  assert.deepEqual(atZero.evaluate(11), [result(12)]);
});

test('unsorted input and out-of-order seeks are deterministic; results are independent', () => {
  const timeline = createTimeline(model([track([frame(8, 16), frame(0, 0), frame(4, 8)])]));
  for (const time of [8, 1, 7, 0, 4, 2, 8, 1]) {
    assert.deepEqual(timeline.evaluate(time), [result(time * 2)]);
  }
  const previous = timeline.evaluate(2);
  timeline.evaluate(7);
  assert.deepEqual(previous, [result(4)]);
  previous[0].value = 999;
  previous.push(result(100));
  assert.deepEqual(timeline.evaluate(2), [result(4)]);
});

test('never mutates frozen input, applies easing, and snapshots caller data', () => {
  const input = model([track([
    { time: 4, value: 8, ease: 'power1.out' },
    { time: 0, value: 0, easeToNext: 'power2.in' },
  ])]);
  const original = structuredClone(input);
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(input);
  const timeline = createTimeline(input);
  assert.deepEqual(timeline.evaluate(2), [result(1)]);
  assert.deepEqual(input, original);
  const mutable = structuredClone(input);
  const snapshot = createTimeline(mutable);
  mutable.duration = 1;
  mutable.tracks[0].targetId = 'changed';
  mutable.tracks[0].keyframes[0].value = 500;
  mutable.tracks.reverse();
  assert.equal(snapshot.duration, 10);
  assert.deepEqual(snapshot.evaluate(2), [result(1)]);
});

test('rejects invalid model shapes, identifiers, and unsupported values', () => {
  for (const input of [null, {}, { version: 2, duration: 1, tracks: [] },
    { version: 1, duration: 1, tracks: {} }]) {
    assert.throws(() => createTimeline(input), TypeError);
  }
  for (const invalid of [null, {}, track([], '', 'x'), track([], 'a', ' '),
    track([], 1), track(null)]) {
    assert.throws(() => createTimeline(model([invalid])), TypeError);
  }
  for (const value of [NaN, Infinity, -Infinity, '1', null, undefined, { x: 1 }]) {
    assert.throws(() => createTimeline(model([track([frame(0, value)])])), TypeError);
  }
});

test('rejects invalid timing and duplicate identities or timestamps', () => {
  for (const duration of [-1, NaN, Infinity, -Infinity, '10', null]) {
    assert.throws(() => createTimeline(model([], duration)), RangeError);
  }
  for (const time of [-1, 11, NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.throws(() => createTimeline(model([track([frame(time, 0)])])), RangeError);
  }
  assert.throws(() => createTimeline(model([track([]), track([])])), /Duplicate track/);
  assert.throws(() => createTimeline(model([track([
    frame(2, 1), frame(0, 0), frame(2, 3),
  ])])), /Duplicate keyframe/);
  const timeline = createTimeline(model());
  for (const time of [NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.throws(() => timeline.evaluate(time), TypeError);
  }
});

test('finite extreme values interpolate without overflowing endpoint differences', () => {
  const timeline = createTimeline(model([track([
    frame(0, -Number.MAX_VALUE), frame(10, Number.MAX_VALUE),
  ])]));
  assert.deepEqual(timeline.evaluate(5), [result(0)]);
});
