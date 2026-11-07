import { serializeCubics } from './pathGeometry.js';

export function validatePathCompatibility(from, to) {
  if (from.length !== to.length) throw new TypeError('Incompatible path subpath counts.');
  from.forEach((path, index) => {
    if (path.closed !== to[index].closed) throw new TypeError('Incompatible path closure.');
    if (path.segments.length !== to[index].segments.length) {
      throw new TypeError('Incompatible path cubic segment counts.');
    }
  });
}

export function interpolatePath(from, to, progress) {
  const mix = (a, b) => a.map((value, index) => value * (1 - progress) + b[index] * progress);
  return serializeCubics(from.map((path, index) => ({
    start: mix(path.start, to[index].start),
    segments: path.segments.map((segment, segmentIndex) => mix(segment, to[index].segments[segmentIndex])),
    closed: path.closed,
  })));
}
