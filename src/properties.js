export function validateProperty(property) {
  if (!['position', 'scale', 'rotation', 'opacity'].includes(property)) {
    throw new TypeError(`Unsupported property: ${property}.`);
  }
}

export function snapshotValue(property, value) {
  if (property === 'position') {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      throw new TypeError('Position requires finite numeric x and y coordinates.');
    }
    return { x: value.x, y: value.y };
  }
  if (!Number.isFinite(value)) {
    throw new TypeError(`${property} requires a finite numeric value.`);
  }
  return value;
}

function interpolateNumber(from, to, progress) {
  // Weighted terms avoid overflow when finite endpoints have opposite signs.
  return from * (1 - progress) + to * progress;
}

export function interpolateValue(property, from, to, progress) {
  if (property === 'position') {
    return {
      x: interpolateNumber(from.x, to.x, progress),
      y: interpolateNumber(from.y, to.y, progress),
    };
  }
  return interpolateNumber(from, to, progress);
}
