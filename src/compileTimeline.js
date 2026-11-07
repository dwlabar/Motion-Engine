import { transitionEase, validateEase } from './easing.js';
import { snapshotValue, validateProperty } from './properties.js';
import { parsePath } from './parsePath.js';
import { validatePathCompatibility } from './pathInterpolation.js';

// Validate and snapshot once so evaluation never sorts or reads caller-owned data.
export function compileTimeline(model) {
  if (!model || model.version !== 1 || !Array.isArray(model.tracks)) {
    throw new TypeError('Expected a schema-1 model with a tracks array.');
  }
  const { duration } = model;
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError('Model duration must be a finite, nonnegative number.');
  }

  const identities = new Map();
  const tracks = model.tracks.map((track) => {
    if (!track || typeof track.targetId !== 'string' || !track.targetId.trim()
      || typeof track.property !== 'string' || !track.property.trim()
      || !Array.isArray(track.keyframes)) {
      throw new TypeError('Tracks require nonempty targetId/property strings and a keyframes array.');
    }
    const { targetId, property } = track;
    validateProperty(property);
    let properties = identities.get(targetId);
    if (!properties) {
      properties = new Set();
      identities.set(targetId, properties);
    }
    if (properties.has(property)) {
      throw new RangeError(`Duplicate track: ${targetId}/${property}.`);
    }
    properties.add(property);

    const keyframes = track.keyframes.map((keyframe) => {
      if (!keyframe || !Number.isFinite(keyframe.time)
        || keyframe.time < 0 || keyframe.time > duration) {
        throw new RangeError('Keyframe time must be finite and within the model duration.');
      }
      validateEase(keyframe.easeToNext);
      validateEase(keyframe.ease);
      const value = snapshotValue(property, keyframe.value);
      return {
        time: keyframe.time,
        value,
        ...(property === 'path' ? { geometry: parsePath(value) } : {}),
        easeToNext: keyframe.easeToNext,
        ease: keyframe.ease,
      };
    }).sort((a, b) => a.time - b.time);

    for (let index = 1; index < keyframes.length; index += 1) {
      if (keyframes[index - 1].time === keyframes[index].time) {
        throw new RangeError(`Duplicate keyframe time in ${targetId}/${property}.`);
      }
    }
    for (let index = 0; index < keyframes.length - 1; index += 1) {
      if (property === 'path') {
        validatePathCompatibility(keyframes[index].geometry, keyframes[index + 1].geometry);
      }
      keyframes[index].easing = transitionEase(keyframes[index], keyframes[index + 1]);
    }
    return { targetId, property, keyframes };
  });

  return { duration, tracks: tracks.filter((track) => track.keyframes.length > 0) };
}
