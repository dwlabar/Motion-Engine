import { createDOMAdapter } from './domAdapter.js';

export function createSVGAdapter(targets) {
  return createDOMAdapter(targets, 'svg');
}
