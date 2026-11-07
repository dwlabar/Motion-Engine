import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimeline } from 'motion-engine';

function timeline(property, keyframes) {
  return createTimeline({
    version: 1, duration: 4,
    tracks: [{ targetId: 'shape', property, keyframes }],
  });
}

function segment(property, from, to, easeToNext = 'none') {
  return timeline(property, [
    { time: 0, value: from, easeToNext }, { time: 4, value: to },
  ]);
}

test('position coordinates interpolate independently; rotation never wraps', () => {
  const position = segment('position', { x: -20, y: 100 }, { x: 60, y: -20 });
  assert.deepEqual(position.evaluate(1)[0].value, { x: 0, y: 70 });
  assert.equal(segment('rotation', 350, 10).evaluate(2)[0].value, 180);
  assert.equal(segment('rotation', -720, 1080).evaluate(2)[0].value, 180);
  assert.equal(segment('scale', -2, 4).evaluate(2)[0].value, 1);
  assert.equal(segment('opacity', 0, 1).evaluate(2)[0].value, 0.5);
});

test('all easing presets match quarter, midpoint, and three-quarter samples', () => {
  const samples = {
    none: [0.25, 0.5, 0.75],
    'power1.in': [0.0625, 0.25, 0.5625],
    'power1.out': [0.4375, 0.75, 0.9375],
    'power1.inOut': [0.125, 0.5, 0.875],
    'power2.in': [0.015625, 0.125, 0.421875],
    'power2.out': [0.578125, 0.875, 0.984375],
    'power2.inOut': [0.0625, 0.5, 0.9375],
    'power3.in': [0.00390625, 0.0625, 0.31640625],
    'power3.out': [0.68359375, 0.9375, 0.99609375],
    'power3.inOut': [0.03125, 0.5, 0.96875],
  };
  for (const [ease, expected] of Object.entries(samples)) {
    const animation = segment('opacity', -0, 1, ease);
    assert.deepEqual([1, 2, 3].map((time) => animation.evaluate(time)[0].value), expected, ease);
    assert.equal(animation.evaluate(0)[0].value, -0);
    assert.equal(animation.evaluate(4)[0].value, 1);
  }
});

test('sorted segments select outgoing ease, then incoming ease, then default', () => {
  for (const [outgoing, incoming, expected] of [
    ['none', 'power3.in', 0.5],
    [undefined, 'power3.in', 0.0625],
    [undefined, undefined, 0.75],
  ]) {
    const animation = timeline('scale', [
      { time: 4, value: 1, ease: incoming, easeToNext: 'power2.in' },
      { time: 0, value: 0, easeToNext: outgoing, ease: 'power2.in' },
    ]);
    assert.equal(animation.evaluate(2)[0].value, expected);
  }
  const animation = timeline('rotation', [
    { time: 0, value: 0, easeToNext: 'power1.in' },
    { time: 2, value: 100, easeToNext: 'power2.out' },
    { time: 4, value: 200 },
  ]);
  for (const [time, expected] of [[3, 187.5], [1, 25], [2, 100], [3, 187.5]]) {
    assert.equal(animation.evaluate(time)[0].value, expected);
  }
});

test('position snapshots and results are independent at boundaries, holds, and eased seeks', () => {
  const start = { x: -0, y: 20 };
  const end = { x: 40, y: -20 };
  const frames = [
    { time: 1, value: start, easeToNext: 'power1.out' },
    { time: 3, value: end },
  ];
  const animation = timeline('position', frames);
  start.x = 900;
  end.y = 900;
  frames[0].easeToNext = 'none';
  frames.reverse();
  assert.deepEqual(animation.evaluate(0), []);
  for (const [time, expected] of [
    [2, { x: 30, y: -10 }], [1, { x: -0, y: 20 }],
    [4, { x: 40, y: -20 }], [3, { x: 40, y: -20 }],
  ]) {
    const previous = animation.evaluate(time);
    assert.deepEqual(previous[0].value, expected);
    previous[0].value.x = 999;
    assert.deepEqual(animation.evaluate(time)[0].value, expected);
  }
  const frozen = Object.freeze({ x: 2, y: 3 });
  assert.deepEqual(segment('position', frozen, frozen).evaluate(2)[0].value, frozen);
});

test('rejects unsupported properties, malformed coordinates, and nonnumeric scalars', () => {
  for (const property of ['x', 'y', 'path', 'unknown']) {
    assert.throws(() => timeline(property, []), TypeError);
  }
  for (const value of [null, undefined, 1, '1', [], { x: 1 }, { y: 2 },
    { x: '1', y: 2 }, { x: 1, y: NaN }, { x: Infinity, y: 2 }]) {
    assert.throws(() => segment('position', value, { x: 0, y: 0 }), TypeError);
  }
  for (const property of ['scale', 'rotation', 'opacity']) {
    for (const value of [null, undefined, '1', {}, [], NaN, Infinity, -Infinity]) {
      assert.throws(() => segment(property, 0, value), TypeError);
    }
  }
});

test('rejects invalid easing even on unused or overridden metadata', () => {
  for (const ease of ['', 'linear', 'power4.out', 'power1', 'Power1.out', null, 1, {}, []]) {
    for (const field of ['ease', 'easeToNext']) {
      assert.throws(() => timeline('scale', [{ time: 0, value: 1, [field]: ease }]), TypeError);
    }
    assert.throws(() => timeline('scale', [
      { time: 0, value: 0, easeToNext: 'none' }, { time: 4, value: 1, ease },
    ]), TypeError);
  }
});

test('extreme finite position coordinates avoid overflowing endpoint differences', () => {
  const animation = segment('position',
    { x: -Number.MAX_VALUE, y: Number.MAX_VALUE },
    { x: Number.MAX_VALUE, y: -Number.MAX_VALUE });
  assert.deepEqual(animation.evaluate(2)[0].value, { x: 0, y: 0 });
});
