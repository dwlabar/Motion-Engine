import { createTimeline, createSVGAdapter } from '../../src/index.js';

const namespace = 'http://www.w3.org/2000/svg';
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const summarize = (values) => ({ median: percentile(values, .5), p95: percentile(values, .95) });

// Eight cubic segments, following Motion Lab's fixed-topology workload category.
// Generated independently; no benchmark or editor implementation is copied.
function path(offset) {
  return `M0 ${offset}` + Array.from({ length: 8 }, (_, index) => {
    const x = index * 4;
    return `C${x + 1} ${offset + 4} ${x + 3} ${offset - 4} ${x + 4} ${offset}`;
  }).join('');
}

export async function performanceChecks() {
  const results = [];
  for (const kind of ['transforms', 'paths']) {
    const count = kind === 'transforms' ? 100 : 40;
    const root = document.createElementNS(namespace, 'svg');
    root.setAttribute('viewBox', '0 0 360 180');
    const targets = new Map();
    const tracks = [];
    for (let index = 0; index < count; index += 1) {
      const targetId = `target-${index}`;
      const element = document.createElementNS(namespace, 'path');
      element.setAttribute('d', path(0));
      element.setAttribute('transform', `translate(${index % 10 * 35} ${Math.floor(index / 10) * 16})`);
      element.setAttribute('fill', 'none');
      element.setAttribute('stroke', 'royalblue');
      targets.set(targetId, element);
      root.append(element);
      const properties = kind === 'paths' ? [['path', path(0), path(8)]] : [
        ['position', { x: 0, y: 0 }, { x: 8, y: 4 }], ['rotation', 0, 25], ['scale', 1, .7], ['opacity', 1, .4],
      ];
      for (const [property, from, to] of properties) tracks.push({ targetId, property,
        keyframes: [{ time: 0, value: from, easeToNext: 'none' }, { time: 2, value: to }],
      });
    }
    document.querySelector('#stage').append(root);
    const timeline = createTimeline({ version: 1, duration: 2, tracks });
    const adapter = createSVGAdapter(targets);
    const snapshots = Array.from({ length: 60 }, (_, index) => timeline.evaluate((index + .5) / 30));
    const measure = (operation) => {
      for (let index = 0; index < 100; index += 1) operation(index);
      const batches = [];
      for (let batch = 0; batch < 25; batch += 1) {
        const start = performance.now();
        for (let index = 0; index < 40; index += 1) operation(index + batch * 40);
        batches.push((performance.now() - start) / 40);
      }
      return summarize(batches);
    };
    let sink;
    const evaluation = measure((index) => { sink = timeline.evaluate((index % 60 + .5) / 30); });
    const application = measure((index) => adapter.apply(snapshots[index % 60]));
    const frames = async (update) => {
      const intervals = [];
      const costs = [];
      let previous;
      for (let index = 0; index < 140; index += 1) {
        const time = await new Promise(requestAnimationFrame);
        const start = performance.now();
        if (update) adapter.apply(timeline.evaluate((index % 120 + .5) / 60));
        if (index >= 20) {
          intervals.push(time - previous);
          costs.push(performance.now() - start);
        }
        previous = time;
      }
      return { interval: summarize(intervals), js: summarize(costs), over33msPercent: intervals.filter((value) => value > 33).length / intervals.length * 100 };
    };
    const staticFrames = await frames(false);
    const animatedFrames = await frames(true);
    results.push({ kind, targets: count, tracks: tracks.length, cubicSegmentsPerPath: 8,
      unit: 'milliseconds', evaluation, application, staticFrames, animatedFrames, consumedRecords: sink.length });
    adapter.reset();
    root.remove();
  }
  return results;
}
