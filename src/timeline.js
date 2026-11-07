import { compileTimeline } from './compileTimeline.js';
import { interpolateValue, snapshotValue } from './properties.js';
import { interpolatePath } from './pathInterpolation.js';

export function createTimeline(model) {
  const { duration, tracks } = compileTimeline(model);

  function evaluate(time) {
    if (!Number.isFinite(time)) {
      throw new TypeError('Evaluation time must be a finite number.');
    }
    const clampedTime = Math.max(0, Math.min(time, duration));
    const results = [];

    for (const { targetId, property, keyframes } of tracks) {
      if (clampedTime < keyframes[0].time) continue;

      // Find the last keyframe at or before time without a seek-history cache.
      let low = 0;
      let high = keyframes.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (keyframes[middle].time <= clampedTime) low = middle + 1;
        else high = middle;
      }

      const from = keyframes[low - 1];
      const to = keyframes[low];
      let value;
      if (to && clampedTime !== from.time) {
        const progress = (clampedTime - from.time) / (to.time - from.time);
        const eased = from.easing(progress);
        value = property === 'path'
          ? from.value === to.value ? from.value : interpolatePath(from.geometry, to.geometry, eased)
          : interpolateValue(property, from.value, to.value, eased);
      } else {
        value = snapshotValue(property, from.value);
      }
      results.push({ targetId, property, value });
    }
    return results;
  }

  return Object.freeze({ duration, evaluate });
}
