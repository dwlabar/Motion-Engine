import { createTimeline, createSVGAdapter, exportAnimation, parsePath, pathAnchors, movePathAnchor, serializePath } from '../../src/index.js';
import { gsap } from 'gsap';
import { buildGsapTimeline } from '/reference/src/utility/buildGsapTimeline.js';
import * as editorGeometry from '/reference/src/utility/pathGeometry.js';

const namespace = 'http://www.w3.org/2000/svg';
const original = 'M20 20C30 10 50 10 60 20C70 30 70 50 60 60C50 70 30 70 20 60C10 50 10 30 20 20Z';
const times = [0, .25, .499, .5, .5001, .73, 1, 1.5, 2, 2.4999, 2.5, 2.8, 3, 99, -1, 2.125, .5, 0];

export function scene(nested = false, base = '') {
  const root = document.createElementNS(namespace, 'svg');
  root.setAttribute('viewBox', '0 0 360 180');
  const group = document.createElementNS(namespace, 'g');
  if (nested) group.setAttribute('transform', 'translate(30 20) rotate(17) scale(1.2 .8)');
  const shape = document.createElementNS(namespace, 'path');
  shape.id = 'shape';
  shape.setAttribute('d', original);
  if (base) shape.setAttribute('transform', base);
  group.append(shape);
  root.append(group);
  document.querySelector('#stage').append(root);
  return { root, shape };
}

function coordinates(d) {
  return parsePath(d).flatMap((part) => [...part.start, ...part.segments.flat()]);
}

function difference(a, b) {
  if (a.length !== b.length) return Infinity;
  return Math.max(0, ...a.map((value, index) => Math.abs(value - b[index])));
}

function matrix(shape) {
  const value = shape.getCTM();
  return ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => value[key]);
}

function track(property, from, to, easeToNext = 'none') {
  return { targetId: 'shape', property, keyframes: [
    { time: .5, value: from, easeToNext }, { time: 1.5, value: to },
    { time: 2.5, value: to },
  ] };
}

export async function compatibility() {
  const results = [];
  const presets = ['none', ...[1, 2, 3].flatMap((power) => ['in', 'out', 'inOut'].map((mode) => `power${power}.${mode}`))];
  let easeError = 0;
  for (const ease of presets) {
    const timeline = createTimeline({ version: 1, duration: 1, tracks: [{
      targetId: 'shape', property: 'opacity', keyframes: [{ time: 0, value: 0, easeToNext: ease }, { time: 1, value: 1 }],
    }] });
    for (let index = 0; index <= 100; index += 1) {
      const time = index / 100;
      easeError = Math.max(easeError, Math.abs(timeline.evaluate(time)[0].value - gsap.parseEase(ease)(time)));
    }
  }
  results.push({ name: 'All 10 easing functions, 101 samples each', maxError: easeError, tolerance: 1e-12, pass: easeError <= 1e-12 });

  const geometry = parsePath(original);
  const changed = serializePath(movePathAnchor(geometry, { subpath: 0, index: 1 }, 12, -6));
  const editorChanged = editorGeometry.movePathAnchor(editorGeometry.pathToRawPath(original), { subpath: 0, index: 6 }, 12, -6);
  const vertexError = difference(coordinates(changed), coordinates(editorChanged));
  results.push({ name: 'Interior vertex and adjacent controls', maxError: vertexError, tolerance: 1e-9, pass: vertexError <= 1e-9 });
  const engineSeam = serializePath(movePathAnchor(geometry, { subpath: 0, index: 0 }, 5, 3));
  const editorSeam = editorGeometry.movePathAnchor(editorGeometry.pathToRawPath(original), { subpath: 0, index: 0 }, 5, 3);
  const seamError = difference(coordinates(engineSeam), coordinates(editorSeam));
  results.push({ name: 'Closed seam vertex and adjacent controls', maxError: seamError, tolerance: 1e-9, pass: seamError <= 1e-9 });

  const transforms = [track('position', { x: 0, y: 0 }, { x: 60, y: -12 }),
    track('rotation', 0, 135), track('scale', 1, 1.7), track('opacity', 1, .3)];
  const cases = [
    ...presets.map((ease) => ({ name: `opacity ${ease}`, tracks: [track('opacity', 1, .2, ease)] })),
    { name: 'outgoing ease overrides legacy', tracks: [{ ...track('opacity', 1, .2), keyframes: [
      { time: .5, value: 1, easeToNext: 'none' }, { time: 1.5, value: .2, ease: 'power3.in' },
    ] }] },
    { name: 'legacy incoming ease', tracks: [{ ...track('opacity', 1, .2), keyframes: [
      { time: .5, value: 1 }, { time: 1.5, value: .2, ease: 'power2.in' },
    ] }] },
    { name: 'default ease', tracks: [{ targetId: 'shape', property: 'opacity', keyframes: [
      { time: .5, value: 1 }, { time: 1.5, value: .2 },
    ] }] },
    { name: 'combined transforms', tracks: transforms },
    { name: 'nested parent transforms', tracks: transforms, nested: true },
    { name: 'rotation crosses 360 without wrapping', tracks: [track('rotation', 350, 10)] },
    { name: 'negative uniform scale', tracks: [track('scale', 1, -.5)] },
    { name: 'independent overlapping property timing', tracks: [transforms[0],
      { targetId: 'shape', property: 'rotation', keyframes: [{ time: 1, value: 0 }, { time: 2.5, value: 210 }] },
      { targetId: 'shape', property: 'opacity', keyframes: [{ time: 0, value: 1 }, { time: 2, value: .2 }] },
    ] },
    { name: 'single keyframe hold', tracks: [{ targetId: 'shape', property: 'opacity', keyframes: [{ time: 1, value: .4 }] }] },
    { name: 'compatible cubic vertex morph', tracks: [track('path', original, changed, 'power2.inOut')] },
    { name: 'nested transforms with path morph', tracks: [...transforms, track('path', original, changed)], nested: true },
    { name: 'target baseline transform composition', tracks: transforms, nested: true, base: 'translate(8 6) rotate(20) scale(1.3)', observation: true },
  ];
  for (const sample of cases) {
    const engine = scene(sample.nested, sample.base);
    const editor = scene(sample.nested, sample.base);
    const model = { version: 1, duration: 3, tracks: sample.tracks };
    const timeline = createTimeline(model);
    const adapter = createSVGAdapter({ shape: engine.shape });
    const reference = buildGsapTimeline(model, { current: editor.root });
    const max = { matrix: 0, opacity: 0, path: 0, time: 0 };
    let rawPathError = 0;
    for (const time of times) {
      adapter.apply(timeline.evaluate(time));
      reference.seek(Math.max(0, Math.min(3, time)), true);
      max.matrix = Math.max(max.matrix, difference(matrix(engine.shape), matrix(editor.shape)));
      max.opacity = Math.max(max.opacity, Math.abs(Number(getComputedStyle(engine.shape).opacity) - Number(getComputedStyle(editor.shape).opacity)));
      max.path = Math.max(max.path, difference(coordinates(engine.shape.getAttribute('d')), coordinates(editor.shape.getAttribute('d'))));
      if (sample.tracks.some((entry) => entry.property === 'path') && editor.shape._gsRawPath) {
        rawPathError = Math.max(rawPathError, difference(coordinates(engine.shape.getAttribute('d')), editor.shape._gsRawPath.flatMap((part) => [...part])));
      }
      max.time = Math.max(max.time, Math.abs(reference.time() - Math.max(0, Math.min(3, time))));
    }
    // MorphSVG 3.13 defaults to precision 2 and truncates intermediate d values.
    // Compare its unrounded raw coordinates separately to distinguish math errors.
    // CSSPlugin rounds channels to four decimals before composing SVG matrices;
    // scale rounding is amplified by the 40-unit center and parent transforms.
    const tolerance = { matrix: .005, opacity: .0001, path: .010001, time: 1e-7 };
    results.push({ name: sample.name, samples: times.length, max, tolerance,
      rawPathError, rawPathTolerance: 1e-7,
      pass: Object.keys(max).every((key) => max[key] <= tolerance[key]) && rawPathError <= 1e-7, observation: sample.observation ?? false });
    reference.kill();
    adapter.reset();
    engine.root.remove();
    editor.root.remove();
  }
  const coincident = 'M0 0C10 0 10 10 0 0';
  results.push({ name: 'Intentional coincident open endpoint difference',
    engineAnchors: pathAnchors(parsePath(coincident)).length,
    editorAnchors: editorGeometry.pathAnchors(editorGeometry.pathToRawPath(coincident)).length,
    observation: true });
  gsap.ticker.sleep();
  // Exercise exported playback inside an active segment, then reset while running.
  const exported = scene(true);
  const baseline = matrix(exported.shape);
  const url = URL.createObjectURL(new Blob([exportAnimation({ version: 1, duration: 3,
    tracks: [...transforms, track('path', original, changed)],
  })], { type: 'text/javascript' }));
  let animation;
  try {
    const { createAnimation } = await import(url);
    animation = createAnimation(exported.root);
    animation.seek(.75);
    const before = exported.shape.getAttribute('d');
    animation.play();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const advanced = animation.state.time > .75 && exported.shape.getAttribute('d') !== before;
    animation.reset();
    const resetTime = animation.state.time;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const restored = difference(matrix(exported.shape), baseline) < 1e-9
      && exported.shape.getAttribute('d') === original && !exported.shape.style.transform;
    results.push({ name: 'Exported active-segment playback and running reset', advanced, restored,
      pass: advanced && restored && !animation.state.playing && animation.state.time === resetTime });
  } finally {
    animation?.reset();
    URL.revokeObjectURL(url);
    exported.root.remove();
  }
  return { gsapVersion: gsap.version, results };
}
