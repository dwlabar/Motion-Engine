import { createTargetAdapter } from './targetAdapter.js';

const properties = ['position', 'scale', 'rotation', 'opacity', 'path'];

export function createObjectAdapter(targets) {
  return createTargetAdapter(targets, (target) => {
    if (!target || typeof target !== 'object' || Array.isArray(target) || 'nodeType' in target) {
      throw new TypeError('Object adapters require JavaScript objects, not DOM elements.');
    }
    const originals = new Map(properties.map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]));
    const active = new Set();
    return {
      validate(key) {
        const descriptor = originals.get(key);
        if ((descriptor && (!('value' in descriptor) || !descriptor.writable))
          || (!descriptor && !Object.isExtensible(target))) {
          throw new TypeError(`Object property ${key} must be writable.`);
        }
      },
      apply(values) {
        for (const key of active) {
          if (!values.has(key)) {
            const descriptor = originals.get(key);
            if (descriptor) Object.defineProperty(target, key, descriptor);
            else delete target[key];
            active.delete(key);
          }
        }
        for (const [key, value] of values) {
          const descriptor = originals.get(key);
          Object.defineProperty(target, key, descriptor
            ? { ...descriptor, value }
            : { value, writable: true, enumerable: true, configurable: true });
          active.add(key);
        }
      },
    };
  });
}
