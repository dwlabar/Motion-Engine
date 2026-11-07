import { snapshotValue, validateProperty } from './properties.js';
import { parsePath } from './parsePath.js';

// Every application is a complete evaluation snapshot, including omitted tracks.
export function createTargetAdapter(targets, capture) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new TypeError('Targets must be a Map or an object keyed by targetId.');
  }
  const entries = targets instanceof Map ? [...targets] : Object.entries(targets);
  const states = new Map();
  const seen = new Set();
  for (const [id, target] of entries) {
    if (typeof id !== 'string' || !id.trim() || seen.has(target)) {
      throw new TypeError('Target IDs must be nonempty strings with distinct targets.');
    }
    seen.add(target);
    states.set(id, capture(target));
  }

  function apply(results) {
    if (!Array.isArray(results)) throw new TypeError('Expected timeline evaluation results.');
    const grouped = new Map();
    for (const result of results) {
      if (!result || typeof result !== 'object') throw new TypeError('Expected an evaluation record.');
      if (!states.has(result.targetId)) continue;
      const { targetId, property, value } = result;
      validateProperty(property);
      states.get(targetId).validate(property);
      const values = grouped.get(targetId) ?? new Map();
      if (values.has(property)) throw new TypeError('Duplicate target property.');
      const copy = snapshotValue(property, value);
      if (property === 'path') parsePath(copy);
      values.set(property, copy);
      grouped.set(targetId, values);
    }
    // Validate the entire batch before changing any target.
    for (const [id, state] of states) state.apply(grouped.get(id) ?? new Map());
  }

  function reset() {
    for (const state of states.values()) state.apply(new Map());
  }

  return Object.freeze({ apply, reset });
}
