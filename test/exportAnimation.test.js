import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportAnimation, createTimeline, createPlaybackController, createHTMLAdapter, createSVGAdapter,
} from 'motion-engine';
import { element } from './helpers/element.js';

const track = (targetId, property, values) => ({ targetId, property, keyframes: values });
const key = (time, value, easeToNext) => ({ time, value, easeToNext });
const model = { version: 1, duration: 4, tracks: [
  track('shape', 'position', [key(3, { x: 22.123456789012345, y: -8 }), key(.25, { x: -3, y: 4 }, 'power2.inOut')]),
  track('shape', 'rotation', [key(.5, 350, 'none'), key(2, -720)]),
  track('shape', 'scale', [key(0, -.5), key(3, 2.125)]),
  track('shape', 'opacity', [key(1, .1234567890123456, 'power3.in'), key(2, .9)]),
  track('shape', 'path', [key(.5, 'm10 20 a20 30 0 0 1 40 0z', 'power1.inOut'), key(3, 'M20 30A30 40 0 0 1 80 30Z')]),
  track('label', 'position', [key(.75, { x: 9, y: 11 })]),
  track('label', 'opacity', [key(0, .2), { time: 2, value: .8, ease: 'power3.out' }]),
  track('unused', 'opacity', []),
] };

async function load(input = model) {
  const source = exportAnimation(input);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.deepEqual(Object.keys(module), ['createAnimation']);
  return module.createAnimation;
}

function rootWith(targets, root = element()) {
  root.querySelectorAll = (selector) => {
    assert.equal(selector, '[id]');
    return targets;
  };
  return root;
}

function scene() {
  const shape = element('svg', 'path', { opacity: '.35', fill: 'blue' }, {
    id: 'shape', d: 'M10 20H50V80H10Z', transform: 'translate(5 6)',
  }, { transform: 'matrix(1, 0, 0, 1, 5, 6)' });
  shape.style.setProperty('opacity', '.35', 'important');
  const label = element('html', 'div', { transform: 'skewX(12deg)', opacity: '.6' }, { id: 'label' });
  return { shape, label, root: rootWith([shape, label]) };
}

function snapshot({ shape, label }) {
  return [shape, label].map((target) => ({
    styles: ['transform', 'opacity', 'transform-origin', 'transform-box', 'fill'].map((name) => [
      target.style.getPropertyValue(name), target.style.getPropertyPriority(name),
    ]),
    path: target.getAttribute('d'), transform: target.getAttribute('transform'),
  }));
}

function clock() {
  let time = 0;
  let id = 0;
  const frames = new Map();
  return {
    frames,
    options: {
      now: () => time,
      requestFrame: (callback) => { frames.set(id, callback); return id++; },
      cancelFrame: (frameId) => frames.delete(frameId),
    },
    elapse(delta) { time += delta; },
    tick(delta) {
      time += delta;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test('generated module is standalone, deterministic, paused, and independent per instance', async () => {
  const source = exportAnimation(model);
  assert.equal(source, exportAnimation(model));
  assert.doesNotMatch(source, /\bimport\s*(?:\(|[{'"*])|\beval\s*\(|new\s+Function\s*\(/);
  const createAnimation = await load();
  const a = scene();
  const b = scene();
  const before = snapshot(a);
  const timer = clock();
  let calls = 0;
  const first = createAnimation(a.root, { ...timer.options, onUpdate: () => { calls += 1; } });
  const second = createAnimation(b.root, { direction: -1 });
  assert.deepEqual(first.state, { time: 0, duration: 4, playing: false, direction: 1, loop: false });
  assert.equal(second.state.time, 4);
  assert.equal(second.state.playing, false);
  assert.equal(calls, 0);
  assert.equal(timer.frames.size, 0);
  assert.deepEqual(snapshot(a), before);
  first.seek(2);
  assert.deepEqual(snapshot(b), before);
  assert.equal(second.state.time, 4);
  assert.ok(Object.isFrozen(first.state));
});

test('generated values and DOM match the engine across arbitrary seeks, transforms, paths, and holds', async () => {
  const createAnimation = await load();
  const exported = scene();
  const reference = scene();
  const baseline = snapshot(exported);
  const adapters = [createSVGAdapter({ shape: reference.shape }), createHTMLAdapter({ label: reference.label })];
  const timeline = createTimeline(model);
  let update;
  const animation = createAnimation(exported.root, { onUpdate: (time, values) => { update = { time, values }; } });
  for (const time of [4, 2.125, 0, .1, .25, .5, .75, 1, 1.23456789012345, 2, 3, 3.9, -1, 99, 0]) {
    animation.seek(time);
    const expected = timeline.evaluate(time);
    adapters.forEach((adapter) => adapter.apply(expected));
    assert.deepEqual(update, { time: Math.max(0, Math.min(time, 4)), values: expected });
    assert.deepEqual(snapshot(exported), snapshot(reference));
  }
  animation.reset();
  animation.reset();
  assert.deepEqual(snapshot(exported), baseline);
});

test('all easing presets, legacy precedence, and identical path holds retain parity', async () => {
  const presets = ['none', ...[1, 2, 3].flatMap((power) => ['in', 'out', 'inOut'].map((mode) => `power${power}.${mode}`))];
  for (const ease of presets) {
    const input = { version: 1, duration: 3, tracks: [
      track('shape', 'rotation', [key(0, -360, ease), { time: 2, value: 720, ease: 'none' }]),
      track('shape', 'path', [key(0, 'm0 0 l10 20 z', ease), key(2, 'm0 0 l10 20 z')]),
      track('label', 'opacity', [key(0, 0), { time: 2, value: 1, ease }]),
    ] };
    const factory = await load(input);
    let actual;
    const animation = factory(scene().root, { onUpdate: (_, values) => { actual = values; } });
    const timeline = createTimeline(input);
    for (const time of [0, .2, .8, 1, 1.2, 1.8, 2, 3]) {
      animation.seek(time);
      assert.deepEqual(actual, timeline.evaluate(time));
    }
  }
});

test('playback controls, scheduling, looping and reverse match the existing controller', async () => {
  const factory = await load();
  for (const direction of [1, -1]) {
    const actualClock = clock();
    const expectedClock = clock();
    const actualUpdates = [];
    const expectedUpdates = [];
    const actual = factory(scene().root, { ...actualClock.options, direction, onUpdate: (...args) => actualUpdates.push(args) });
    const expected = createPlaybackController(createTimeline(model), {
      ...expectedClock.options, direction, onUpdate: (...args) => expectedUpdates.push(args),
    });
    const check = () => {
      assert.deepEqual(actual.state, expected.state);
      assert.deepEqual(actualUpdates, expectedUpdates);
      assert.equal(actualClock.frames.size, expectedClock.frames.size);
    };
    const control = (name, ...args) => { actual[name](...args); expected[name](...args); check(); };
    const tick = (delta) => { actualClock.tick(delta); expectedClock.tick(delta); check(); };
    control('play');
    control('play');
    tick(375);
    actualClock.elapse(125);
    expectedClock.elapse(125);
    control('pause');
    tick(5000);
    control('seek', 2.25);
    control('reverse');
    control('play');
    tick(250);
    control('setLoop', true);
    tick(13750);
    control('reverse');
    tick(8000);
    control('seek', 3);
    control('setLoop', false);
    tick(9000);
    control('restart');
    control('pause');
  }
});

test('reset cancels active playback, restores baselines, and preserves sampled time without callbacks', async () => {
  const factory = await load();
  const targets = scene();
  const before = snapshot(targets);
  const timer = clock();
  let calls = 0;
  const animation = factory(targets.root, { ...timer.options, loop: true, onUpdate: () => { calls += 1; } });
  animation.play();
  timer.tick(1500);
  const stale = [...timer.frames.values()][0];
  timer.elapse(250);
  const count = calls;
  animation.reset();
  assert.equal(calls, count);
  assert.deepEqual(animation.state, { time: 1.75, duration: 4, playing: false, direction: 1, loop: true });
  assert.equal(timer.frames.size, 0);
  stale();
  assert.deepEqual(snapshot(targets), before);
  animation.play();
  assert.equal(animation.state.time, 1.75);
  assert.notDeepEqual(snapshot(targets), before);
  animation.reset();
});

test('serialization preserves finite precision, negative zero, hostile IDs, and snapshots without toJSON', async () => {
  const ids = ['__proto__', 'constructor', 'a"\\\n\t</script><script>globalThis.injected=true</script>&\u2028\u2029${throw 1}`', '\ud800'];
  const numbers = [-0, Number.MIN_VALUE, Number.MAX_VALUE, 1.2345678901234567];
  const input = { version: 1, duration: -0, tracks: ids.map((id, index) => track(id, 'position', [
    key(-0, { x: numbers[index], y: -numbers[index], toJSON() { throw new Error('Unexpected toJSON'); } }),
  ])), toJSON() { throw new Error('Unexpected toJSON'); } };
  input.extra = input;
  const source = exportAnimation(input);
  assert.doesNotMatch(source, /<\/script>|\u2028|\u2029/);
  const expected = createTimeline(input).evaluate(0);
  input.tracks[0].keyframes[0].value.x = 42;
  const { createAnimation } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const targets = ids.map((id) => element('html', 'div', {}, { id }));
  let actual;
  const animation = createAnimation(rootWith(targets), { onUpdate: (_, values) => { actual = values; } });
  animation.seek(0);
  assert.deepEqual(actual, expected);
  assert.ok(Object.is(animation.state.duration, -0));
  assert.equal(globalThis.injected, undefined);
});

test('ID resolution is scoped, includes root, and rejects missing or ambiguous targets before writes', async () => {
  const factory = await load({ version: 1, duration: 1, tracks: [track('a:b[0]', 'opacity', [key(0, .5)])] });
  const root = element('svg', 'svg', {}, { id: 'a:b[0]' });
  const animation = factory(rootWith([], root));
  animation.seek(0);
  assert.equal(root.style.getPropertyValue('opacity'), '0.5');
  animation.reset();
  const unrelated = element('html', 'div', {}, { id: 'other' });
  assert.throws(() => factory(rootWith([unrelated])), /Missing target ID/);
  const duplicate = element('html', 'div', {}, { id: 'a:b[0]' });
  assert.throws(() => factory(rootWith([duplicate], root)), /Ambiguous target ID/);
  assert.equal(root.style.getPropertyValue('opacity'), '');
  for (const invalid of [null, {}, { nodeType: 9 }, { nodeType: 11 }]) {
    assert.throws(() => factory(invalid), TypeError);
  }
  const pathFactory = await load({ version: 1, duration: 1, tracks: [track('bad', 'path', [key(1, 'M0 0')])] });
  for (const target of [element('html', 'div', {}, { id: 'bad' }), element('svg', 'rect', {}, { id: 'bad' })]) {
    assert.throws(() => pathFactory(rootWith([target])), /SVG path element/);
  }
});

test('export rejects invalid models using existing validation', () => {
  for (const input of [null, {}, { ...model, duration: Infinity },
    { ...model, tracks: [track('shape', 'opacity', [key(0, NaN)])] },
    { ...model, tracks: [track('shape', 'opacity', [key(0, .5, 'bad')])] },
    { ...model, tracks: [track('shape', 'path', [key(0, 'M0 0'), key(1, 'M0 0L1 1')])] },
    { ...model, tracks: [track('shape', 'path', [key(0, 'M0 0</script>')])] },
  ]) {
    assert.throws(() => exportAnimation(input));
  }
});

test('empty and zero-duration exports run without scheduling; invalid options and callback errors propagate', async () => {
  for (const tracks of [[], [track('label', 'opacity', [key(0, .5)])]]) {
    const factory = await load({ version: 1, duration: 0, tracks });
    const timer = clock();
    const animation = factory(scene().root, { ...timer.options, loop: true });
    animation.play();
    animation.reverse();
    animation.restart();
    animation.seek(9);
    assert.equal(animation.state.time, 0);
    assert.equal(animation.state.playing, false);
    assert.equal(timer.frames.size, 0);
  }
  const factory = await load();
  for (const options of [{ onUpdate: null }, { loop: 1 }, { direction: 0 }, { now: null }]) {
    assert.throws(() => factory(scene().root, options), TypeError);
  }
  const timer = clock();
  let fail = false;
  const animation = factory(scene().root, { ...timer.options, onUpdate: () => { if (fail) throw new Error('callback failed'); } });
  animation.play();
  fail = true;
  assert.throws(() => timer.tick(100), /callback failed/);
  assert.equal(animation.state.playing, false);
  assert.equal(timer.frames.size, 0);
  animation.reset();
});
