import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimeline, createPlaybackController } from 'motion-engine';

function setup(options = {}, duration = 2) {
  let milliseconds = 0;
  let nextId = 0;
  const frames = new Map();
  const canceled = [];
  const updates = [];
  const timeline = createTimeline({
    version: 1, duration,
    tracks: [{ targetId: 'box', property: 'opacity', keyframes: duration === 0
      ? [{ time: 0, value: 1 }]
      : [{ time: 0, value: 0, easeToNext: 'none' }, { time: duration, value: 1 }] }],
  });
  const controller = createPlaybackController(timeline, {
    now: () => milliseconds,
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => { canceled.push(id); frames.delete(id); },
    onUpdate: (time, values) => updates.push({ time, values }),
    ...options,
  });
  return {
    controller, timeline, frames, canceled, updates,
    elapse(delta) { milliseconds += delta; },
    tick(delta) {
      milliseconds += delta;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(milliseconds));
    },
  };
}

test('play emits evaluated values and advances by elapsed seconds with one frame loop', () => {
  const { controller, timeline, updates, frames, tick } = setup();
  assert.deepEqual(controller.state, { time: 0, duration: 2, playing: false, direction: 1, loop: false });
  assert.equal(updates.length, 0);
  controller.play();
  controller.play();
  assert.equal(updates.length, 1);
  assert.equal(frames.size, 1);
  tick(125);
  tick(375);
  assert.equal(controller.state.time, 0.5);
  assert.deepEqual(updates.at(-1), { time: 0.5, values: timeline.evaluate(0.5) });
  assert.equal(frames.size, 1);
  assert.ok(Object.isFrozen(controller.state));
});

test('pause samples between frames, cancels even frame id zero, and resume excludes paused time', () => {
  const { controller, frames, canceled, elapse, tick } = setup();
  controller.play();
  const stale = [...frames.values()][0];
  elapse(250);
  controller.pause();
  assert.equal(controller.state.time, 0.25);
  assert.deepEqual(canceled, [0]);
  assert.equal(frames.size, 0);
  elapse(5000);
  controller.pause();
  controller.play();
  stale();
  assert.equal(frames.size, 1);
  tick(250);
  assert.equal(controller.state.time, 0.5);
});

test('seek emits immediately, clamps, preserves paused state, and resets running timing', () => {
  const { controller, frames, updates, elapse, tick } = setup();
  controller.seek(1);
  assert.equal(controller.state.playing, false);
  assert.equal(updates.at(-1).time, 1);
  controller.seek(-5);
  assert.equal(controller.state.time, 0);
  controller.play();
  elapse(500);
  controller.seek(1);
  tick(250);
  assert.equal(controller.state.time, 1.25);
  controller.seek(10);
  assert.equal(controller.state.time, 2);
  assert.equal(controller.state.playing, false);
  assert.equal(frames.size, 0);
});

test('reverse samples the old direction and preserves position and playback status', () => {
  const { controller, elapse, tick, frames } = setup();
  controller.seek(1);
  controller.reverse();
  assert.equal(controller.state.time, 1);
  assert.equal(controller.state.playing, false);
  controller.play();
  elapse(250);
  controller.reverse();
  assert.equal(controller.state.time, 0.75);
  assert.equal(controller.state.direction, 1);
  assert.equal(frames.size, 1);
  tick(500);
  assert.equal(controller.state.time, 1.25);
});

test('reverse at a boundary cancels the pending frame and ignores stale delivery', () => {
  for (const direction of [1, -1]) {
    const { controller, frames, canceled, updates } = setup({ direction });
    controller.play();
    const [[id, stale]] = [...frames.entries()];
    controller.reverse();
    assert.equal(controller.state.playing, false);
    assert.equal(controller.state.time, direction === 1 ? 0 : 2);
    assert.equal(controller.state.direction, -direction);
    assert.deepEqual(canceled, [id]);
    assert.equal(frames.size, 0);
    const count = updates.length;
    stale();
    assert.equal(updates.length, count);
    assert.equal(frames.size, 0);
  }
});

test('nonlooping playback clamps and stops at both boundaries; play does not rewind', () => {
  for (const direction of [1, -1]) {
    const { controller, frames, updates, tick } = setup({ direction });
    controller.play();
    tick(5000);
    const end = direction === 1 ? 2 : 0;
    assert.equal(controller.state.time, end);
    assert.equal(controller.state.playing, false);
    assert.equal(updates.at(-1).time, end);
    controller.play();
    assert.equal(frames.size, 0);
    controller.reverse();
    controller.play();
    tick(250);
    assert.equal(controller.state.time, direction === 1 ? 1.75 : 0.25);
  }
});

test('looping retains overshoot across multiple cycles in either direction', () => {
  for (const direction of [1, -1]) {
    const { controller, frames, tick } = setup({ loop: true, direction });
    controller.play();
    tick(5250);
    assert.equal(controller.state.time, direction === 1 ? 1.25 : 0.75);
    tick(750);
    assert.equal(controller.state.time, 0);
    assert.equal(controller.state.playing, true);
    assert.equal(frames.size, 1);
  }
});

test('setLoop changes running playback without changing position, clock, or pending frame', () => {
  for (const direction of [1, -1]) {
    const { controller, frames, updates, canceled, elapse, tick } = setup({ direction });
    controller.play();
    tick(500);
    const before = controller.state;
    const pending = [...frames.entries()];
    const count = updates.length;
    elapse(250);
    controller.setLoop(true);
    controller.setLoop(true);
    assert.deepEqual(controller.state, { ...before, loop: true });
    assert.deepEqual([...frames.entries()], pending);
    assert.equal(updates.length, count);
    assert.deepEqual(canceled, []);
    tick(1500);
    assert.equal(controller.state.time, direction === 1 ? 0.25 : 1.75);
    const wrapped = controller.state;
    const nextFrame = [...frames.entries()];
    controller.setLoop(false);
    assert.deepEqual(controller.state, { ...wrapped, loop: false });
    assert.deepEqual([...frames.entries()], nextFrame);
    tick(500);
    assert.equal(controller.state.playing, true);
    tick(2000);
    assert.equal(controller.state.time, direction === 1 ? 2 : 0);
    assert.equal(controller.state.playing, false);
    assert.equal(frames.size, 0);
  }
});

test('setLoop preserves paused and zero-duration state and rejects nonboolean input', () => {
  for (const duration of [0, 2]) {
    const { controller, frames, updates } = setup({}, duration);
    controller.seek(duration);
    const before = controller.state;
    const count = updates.length;
    controller.setLoop(true);
    assert.deepEqual(controller.state, { ...before, loop: true });
    for (const value of [undefined, null, 0, 1, 'true', {}, NaN]) {
      assert.throws(() => controller.setLoop(value), TypeError);
      assert.deepEqual(controller.state, { ...before, loop: true });
    }
    controller.setLoop(false);
    assert.deepEqual(controller.state, before);
    assert.equal(frames.size, 0);
    assert.equal(updates.length, count);
  }
});

test('restart starts at the current direction origin and replaces the pending frame', () => {
  for (const direction of [1, -1]) {
    const { controller, frames, tick } = setup({ direction });
    controller.play();
    tick(500);
    controller.restart();
    assert.equal(controller.state.time, direction === 1 ? 0 : 2);
    assert.equal(controller.state.playing, true);
    assert.equal(frames.size, 1);
    controller.pause();
    controller.restart();
    assert.equal(frames.size, 1);
  }
});

test('zero-duration timelines emit without scheduling, including when looping', () => {
  for (const loop of [false, true]) {
    const { controller, frames, updates } = setup({ loop }, 0);
    controller.play();
    controller.reverse();
    controller.seek(5);
    controller.restart();
    assert.equal(controller.state.time, 0);
    assert.equal(controller.state.playing, false);
    assert.equal(frames.size, 0);
    assert.equal(updates.at(-1).values[0].value, 1);
  }
});

test('callbacks may pause or seek/restart without leaving duplicate frame loops', () => {
  let controller;
  let action;
  const harness = setup({ onUpdate: () => {
    const next = action;
    action = undefined;
    next?.();
  } });
  controller = harness.controller;
  controller.play();
  action = () => { controller.seek(1); controller.restart(); };
  harness.tick(250);
  assert.equal(harness.frames.size, 1);
  action = () => controller.pause();
  harness.tick(250);
  assert.equal(harness.frames.size, 0);
  assert.equal(controller.state.playing, false);
});

test('rejects invalid input and stops on update callback failure', () => {
  const { timeline, controller } = setup();
  for (const value of [null, {}, { duration: -1, evaluate() {} }]) {
    assert.throws(() => createPlaybackController(value), TypeError);
  }
  for (const options of [{ loop: 1 }, { direction: 0 }, { onUpdate: null },
    { now: null }, { requestFrame: null }, { cancelFrame: null }]) {
    assert.throws(() => createPlaybackController(timeline, options), TypeError);
  }
  for (const value of [NaN, Infinity, '1', null]) {
    assert.throws(() => controller.seek(value), TypeError);
  }
  let fail = false;
  const harness = setup({ onUpdate: () => { if (fail) throw new Error('callback failed'); } });
  harness.controller.play();
  fail = true;
  assert.throws(() => harness.tick(250), /callback failed/);
  assert.equal(harness.controller.state.playing, false);
  assert.equal(harness.frames.size, 0);
});
