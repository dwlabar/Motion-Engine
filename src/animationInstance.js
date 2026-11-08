import { createTimeline } from './timeline.js';
import { createPlaybackController } from './playbackController.js';
import { createDOMAdapter } from './domAdapter.js';

// This composition is also embedded in exports; animation math stays in the engine.
export function createAnimationInstance(model, root, options = {}) {
  const htmlNamespace = 'http://www.w3.org/1999/xhtml';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  if (!root || root.nodeType !== 1 || ![htmlNamespace, svgNamespace].includes(root.namespaceURI)
    || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('An SVG or HTML root element is required.');
  }
  const { onUpdate = () => {}, ...playbackOptions } = options;
  if (typeof onUpdate !== 'function') throw new TypeError('The update callback must be a function.');
  const timeline = createTimeline(model);
  const ids = new Set(model.tracks.map((track) => track.targetId));
  const targets = new Map();
  // A fixed selector avoids interpreting model IDs as CSS or searching outside root.
  for (const target of [root, ...root.querySelectorAll('[id]')]) {
    const id = target.getAttribute('id');
    if (!ids.has(id)) continue;
    if (targets.has(id)) throw new TypeError(`Ambiguous target ID: ${id}.`);
    targets.set(id, target);
  }
  const html = new Map();
  const svg = new Map();
  for (const id of ids) {
    const target = targets.get(id);
    if (!target) throw new TypeError(`Missing target ID: ${id}.`);
    if (target.namespaceURI === svgNamespace) svg.set(id, target);
    else if (target.namespaceURI === htmlNamespace) html.set(id, target);
    else throw new TypeError(`Target must be SVG or HTML: ${id}.`);
  }
  for (const { targetId, property } of model.tracks) {
    if (property === 'path' && (!svg.has(targetId) || svg.get(targetId).localName !== 'path')) {
      throw new TypeError('Path data requires an SVG path element.');
    }
  }
  const adapters = [createDOMAdapter(html, 'html'), createDOMAdapter(svg, 'svg')];
  let resetting = false;
  const playback = createPlaybackController(timeline, {
    ...playbackOptions,
    onUpdate(time, values) {
      if (resetting) return;
      for (const adapter of adapters) adapter.apply(values);
      onUpdate(time, values);
    },
  });

  function reset() {
    resetting = true;
    try {
      playback.pause();
      for (const adapter of adapters) adapter.reset();
    } finally {
      resetting = false;
    }
  }

  return Object.freeze({
    play: playback.play, pause: playback.pause, seek: playback.seek,
    reverse: playback.reverse, restart: playback.restart, setLoop: playback.setLoop,
    reset,
    get state() { return playback.state; },
  });
}
