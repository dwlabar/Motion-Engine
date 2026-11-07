import { createDOMAdapter } from './domAdapter.js';

export function createHTMLAdapter(targets) {
  return createDOMAdapter(targets, 'html');
}
