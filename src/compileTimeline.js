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
      if (!Number.isFinite(keyframe.value)) {
        throw new TypeError('T02 keyframe values must be finite numbers.');
      }
      return { time: keyframe.time, value: keyframe.value };
    }).sort((a, b) => a.time - b.time);

    for (let index = 1; index < keyframes.length; index += 1) {
      if (keyframes[index - 1].time === keyframes[index].time) {
        throw new RangeError(`Duplicate keyframe time in ${targetId}/${property}.`);
      }
    }
    return { targetId, property, keyframes };
  });

  return { duration, tracks: tracks.filter((track) => track.keyframes.length > 0) };
}
