import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHTMLAdapter, createSVGAdapter, createObjectAdapter,
  createTimeline, createPlaybackController,
} from 'motion-engine';

// Small host doubles exercise the DOM API boundary without a DOM dependency.
function element(kind = 'html', localName = 'div', declarations = {}, attributes = {}, computed = {}) {
  const styles = new Map(Object.entries(declarations).map(([key, value]) => [key, [value, '']]));
  const attrs = new Map(Object.entries(attributes));
  const target = {
    nodeType: 1,
    namespaceURI: kind === 'svg' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    localName,
    style: {
      getPropertyValue: (key) => styles.get(key)?.[0] ?? '',
      getPropertyPriority: (key) => styles.get(key)?.[1] ?? '',
      setProperty: (key, value, priority = '') => styles.set(key, [value, priority]),
      removeProperty: (key) => styles.delete(key),
    },
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
    getBBox: () => ({ x: 10, y: 20, width: 40, height: 60 }),
    ownerSVGElement: { viewBox: { baseVal: { x: 0, y: 0, width: 200, height: 100 } } },
    ownerDocument: { defaultView: { getComputedStyle: () => ({
      transform: declarations.transform ?? 'none', transformOrigin: '0px 0px',
      transformBox: 'view-box', ...computed,
    }) } },
  };
  return target;
}

const result = (property, value, targetId = 'box') => ({ targetId, property, value });
const read = (target, property) => target.style.getPropertyValue(property);

test('HTML composes transforms, preserves styles and priorities, and never accumulates', () => {
  const box = element('html', 'div', { transform: 'skewX(12deg)', color: 'red', opacity: '.3', 'transform-origin': '20% 30%' });
  box.style.setProperty('transform', 'skewX(12deg)', 'important');
  const adapter = createHTMLAdapter({ box });
  const values = [result('position', { x: 12, y: -8 }), result('rotation', 90), result('scale', 2), result('opacity', .7)];
  adapter.apply(values);
  const expected = 'translate(12px, -8px) rotate(90deg) scale(2) skewX(12deg)';
  assert.equal(read(box, 'transform'), expected);
  adapter.apply(values);
  assert.equal(read(box, 'transform'), expected);
  assert.equal(read(box, 'color'), 'red');
  assert.equal(read(box, 'transform-origin'), '20% 30%');
  assert.equal(read(box, 'opacity'), '0.7');
  adapter.apply([result('scale', -1)]);
  assert.equal(read(box, 'transform'), 'translate(0px, 0px) rotate(0deg) scale(-1) skewX(12deg)');
  assert.equal(read(box, 'opacity'), '.3');
  adapter.reset();
  adapter.reset();
  assert.equal(read(box, 'transform'), 'skewX(12deg)');
  assert.equal(box.style.getPropertyPriority('transform'), 'important');
});

test('stylesheet transforms are composed and original absent inline declarations are restored', () => {
  const box = element('html', 'div', {}, {}, { transform: 'matrix(1, 0, 0, 1, 8, 9)' });
  const adapter = createHTMLAdapter(new Map([['box', box]]));
  adapter.apply([result('rotation', 45), result('opacity', 0)]);
  assert.ok(read(box, 'transform').endsWith('matrix(1, 0, 0, 1, 8, 9)'));
  adapter.apply([]);
  assert.equal(read(box, 'transform'), '');
  assert.equal(read(box, 'opacity'), '');
});

test('SVG preserves attribute transforms and composes rotation/scale around the captured center', () => {
  const path = element('svg', 'path', { fill: 'blue' }, { transform: 'translate(5 6)', d: 'M0 0L2 2' }, {
    transform: 'matrix(1, 0, 0, 1, 5, 6)',
  });
  const adapter = createSVGAdapter({ box: path });
  const values = [result('position', { x: 4, y: 7 }), result('rotation', 90), result('scale', 2), result('path', 'M1 1L3 3'), result('opacity', .5)];
  adapter.apply(values);
  const transform = read(path, 'transform');
  assert.equal(transform, 'translate(4px, 7px) translate(0px, 0px) matrix(1, 0, 0, 1, 5, 6) translate(0px, 0px) translate(30px, 50px) rotate(90deg) scale(2) translate(-30px, -50px)');
  assert.equal(path.getAttribute('transform'), 'translate(5 6)');
  assert.equal(path.getAttribute('d'), 'M1 1L3 3');
  assert.equal(read(path, 'fill'), 'blue');
  path.getBBox = () => { throw new Error('Bounds must not be measured again after path changes.'); };
  adapter.apply(values);
  assert.equal(read(path, 'transform'), transform);
  adapter.reset();
  assert.equal(path.getAttribute('d'), 'M0 0L2 2');
  for (const key of ['transform', 'transform-origin', 'transform-box', 'opacity']) assert.equal(read(path, key), '');
});

test('SVG preserves a preexisting fill-box origin in baseline composition and restores its styles', () => {
  const box = element('svg', 'rect', { 'transform-origin': '25% 50%', 'transform-box': 'fill-box' }, {}, {
    transform: 'matrix(2, 0, 0, 2, 0, 0)', transformOrigin: '25% 50%', transformBox: 'fill-box',
  });
  const adapter = createSVGAdapter({ box });
  adapter.apply([result('scale', 1)]);
  assert.ok(read(box, 'transform').includes('translate(20px, 50px) matrix(2, 0, 0, 2, 0, 0) translate(-20px, -50px)'));
  assert.equal(read(box, 'transform-origin'), '0px 0px');
  assert.equal(read(box, 'transform-box'), 'view-box');
  adapter.reset();
  assert.equal(read(box, 'transform-origin'), '25% 50%');
  assert.equal(read(box, 'transform-box'), 'fill-box');
});

test('object values are copied, omitted properties restore descriptors and inherited values', () => {
  const originalPosition = { x: 100, y: 200 };
  const box = Object.create({ scale: 9 });
  Object.defineProperty(box, 'position', { value: originalPosition, writable: true, configurable: true });
  box.label = 'keep';
  const adapter = createObjectAdapter({ box });
  const position = { x: 1, y: 2 };
  adapter.apply([result('position', position), result('scale', 2), result('rotation', 12), result('opacity', .1), result('path', 'M0 0')]);
  position.x = 999;
  assert.deepEqual(box.position, { x: 1, y: 2 });
  assert.equal(box.path, 'M0 0');
  adapter.apply([result('opacity', .8)]);
  assert.equal(box.position, originalPosition);
  assert.equal(Object.getOwnPropertyDescriptor(box, 'position').enumerable, false);
  assert.equal(box.scale, 9);
  assert.equal(Object.hasOwn(box, 'scale'), false);
  adapter.reset();
  assert.equal(Object.hasOwn(box, 'opacity'), false);
  assert.equal(Object.hasOwn(box, 'path'), false);
  assert.equal(box.label, 'keep');
});

test('invalid batches are rejected before mutation', () => {
  const box = element();
  const adapter = createHTMLAdapter({ box });
  for (const invalid of [result('path', 'M0 0'), result('scale', NaN), result('position', { x: 1 }),
    result('unknown', 1), result('opacity', .2)]) {
    assert.throws(() => adapter.apply([result('opacity', .5), invalid]), TypeError);
    assert.equal(read(box, 'opacity'), '');
  }
  assert.throws(() => adapter.apply(null), TypeError);
  const rect = element('svg', 'rect');
  assert.throws(() => createSVGAdapter({ box: rect }).apply([result('path', '')]), TypeError);
  const path = element('svg', 'path');
  assert.throws(() => createSVGAdapter({ box: path }).apply([result('path', 'nonsense')]), TypeError);
  assert.throws(() => createHTMLAdapter({ box: rect }), TypeError);
  assert.throws(() => createSVGAdapter({ box }), TypeError);
  assert.throws(() => createObjectAdapter({ box }), TypeError);
  const shared = {};
  assert.throws(() => createObjectAdapter({ box: shared, alias: shared }), TypeError);
  assert.throws(() => createObjectAdapter({ box: Object.freeze({ scale: 1 }) }).apply([result('scale', 2)]), TypeError);
  assert.throws(() => createObjectAdapter({ box: Object.preventExtensions({}) }).apply([result('scale', 2)]), TypeError);
  assert.throws(() => createObjectAdapter({ box: { get scale() { return 1; } } }).apply([result('scale', 2)]), TypeError);
});

test('absent SVG path attributes are removed by reset', () => {
  const box = element('svg', 'path');
  const adapter = createSVGAdapter({ box });
  adapter.apply([result('path', 'M0 0')]);
  adapter.reset();
  assert.equal(box.getAttribute('d'), null);
});

test('separate adapters accept the same mixed-target evaluation and validate matched records', () => {
  const html = element();
  const svg = element('svg', 'path');
  const object = {};
  const adapters = [createHTMLAdapter({ html }), createSVGAdapter({ svg }), createObjectAdapter({ object })];
  const timeline = createTimeline({ version: 1, duration: 1, tracks: [
    { targetId: 'html', property: 'opacity', keyframes: [{ time: 0, value: .5 }] },
    { targetId: 'svg', property: 'path', keyframes: [{ time: 0, value: 'M0 0L1 1' }] },
    { targetId: 'object', property: 'scale', keyframes: [{ time: 0, value: 2 }] },
  ] });
  const values = timeline.evaluate(0);
  for (const adapter of adapters) adapter.apply(values);
  assert.equal(read(html, 'opacity'), '0.5');
  assert.equal(svg.getAttribute('d'), 'M0 0L1 1');
  assert.equal(object.scale, 2);
  const invalid = [...values, result('path', 'invalid', 'html')];
  assert.throws(() => adapters[0].apply(invalid), TypeError);
  adapters[1].apply(invalid);
  adapters[2].apply(invalid);
  for (const adapter of adapters) adapter.apply([result('unsupported', null, 'unrelated')]);
  assert.equal(read(html, 'opacity'), '');
  assert.equal(svg.getAttribute('d'), null);
  assert.equal(Object.hasOwn(object, 'scale'), false);
});

test('multiple target mappings validate before writes and restore omitted targets', () => {
  const a = {};
  const b = { opacity: .2 };
  const adapter = createObjectAdapter(new Map([['a', a], ['b', b]]));
  adapter.apply([result('opacity', .5, 'a'), result('opacity', .7, 'b')]);
  assert.equal(a.opacity, .5);
  assert.equal(b.opacity, .7);
  assert.throws(() => adapter.apply([result('opacity', 1, 'a'), result('scale', Infinity, 'b')]), TypeError);
  assert.equal(a.opacity, .5);
  adapter.apply([result('opacity', 1, 'a')]);
  assert.equal(b.opacity, .2);
});

test('SVG path evaluation supports seeking back through interpolation and before its first key', () => {
  const box = element('svg', 'path', {}, { d: 'M0 0L1 1' });
  const adapter = createSVGAdapter({ box });
  const timeline = createTimeline({ version: 1, duration: 3, tracks: [{
    targetId: 'box', property: 'path', keyframes: [
      { time: 1, value: 'M10 10L20 20', easeToNext: 'none' },
      { time: 3, value: 'M30 30L40 40' },
    ],
  }] });
  for (const time of [3, 2, 1, 2]) {
    const values = timeline.evaluate(time);
    adapter.apply(values);
    assert.equal(box.getAttribute('d'), values[0].value);
  }
  adapter.apply(timeline.evaluate(0));
  assert.equal(box.getAttribute('d'), 'M0 0L1 1');
});

for (const [name, factory, makeTarget, value] of [
  ['HTML', createHTMLAdapter, () => element(), (box) => read(box, 'opacity')],
  ['SVG', createSVGAdapter, () => element('svg', 'path'), (box) => read(box, 'opacity')],
  ['object', createObjectAdapter, () => ({}), (box) => box.opacity],
]) {
  test(`${name} supports playback frames, seeks before first keys, and repeated seeking`, () => {
    const box = makeTarget();
    const adapter = factory({ box });
    const timeline = createTimeline({ version: 1, duration: 2, tracks: [
      { targetId: 'box', property: 'opacity', keyframes: [{ time: 1, value: 0, easeToNext: 'none' }, { time: 2, value: 1 }] },
      { targetId: 'box', property: 'scale', keyframes: [{ time: 1, value: 1 }, { time: 2, value: 2 }] },
    ] });
    let time = 0;
    let frame;
    const playback = createPlaybackController(timeline, {
      now: () => time, requestFrame: (callback) => { frame = callback; return 1; },
      cancelFrame: () => { frame = null; }, onUpdate: (_, values) => adapter.apply(values),
    });
    playback.play();
    time = 1500;
    frame();
    assert.equal(Number(value(box)), .5);
    playback.seek(2);
    assert.equal(Number(value(box)), 1);
    playback.seek(0);
    assert.equal(value(box), name === 'object' ? undefined : '');
    if (name !== 'object') assert.equal(read(box, 'transform'), '');
    for (let i = 0; i < 3; i += 1) {
      playback.seek(1.5);
      assert.equal(Number(value(box)), .5);
    }
    adapter.reset();
    assert.equal(value(box), name === 'object' ? undefined : '');
  });
}
