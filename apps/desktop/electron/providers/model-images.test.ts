import assert from 'node:assert/strict';
import test from 'node:test';
import { modelImageSupport } from './model-images.js';
test('switching to a text-only model overrides provider vision without changing history', () => {
  const provider = { multimodalSupport: 'image-input' as const };
  assert.equal(modelImageSupport({ multimodalSupport: 'none' }, provider), 'none');
  assert.equal(modelImageSupport({ multimodalSupport: 'full' }, provider), 'full');
  assert.equal(modelImageSupport({}, provider), 'image-input');
  assert.equal(modelImageSupport(undefined, undefined), undefined);
});
