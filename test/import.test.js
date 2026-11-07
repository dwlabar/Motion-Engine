import assert from 'node:assert/strict';
import test from 'node:test';

test('the package entry point imports as an ES module', async () => {
  const entry = await import('motion-engine');

  assert.equal(entry[Symbol.toStringTag], 'Module');
});
