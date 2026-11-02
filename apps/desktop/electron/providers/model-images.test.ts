import assert from 'node:assert/strict';
import test from 'node:test';
import { modelImageSupport, readModelImageSupport } from './model-images.js';
test('switching to a text-only model overrides provider vision without changing history', () => {
  const provider = { multimodalSupport: 'image-input' as const };
  assert.equal(modelImageSupport({ multimodalSupport: 'none' }, provider), 'none');
  assert.equal(modelImageSupport({ multimodalSupport: 'full' }, provider), 'full');
  assert.equal(modelImageSupport({}, provider), 'image-input');
  assert.equal(modelImageSupport(undefined, undefined), undefined);
});

test('image capability lookup resolves a configured custom provider and its text-only model', async (t) => {
  const sdk = await import('@kodax-ai/kodax/llm');
  sdk.registerCustomProviders([{
    name: 'custom-image-fixture', protocol: 'openai', baseUrl: 'https://image-fixture.invalid/v1',
    model: 'vision', apiKeyEnv: 'SPACE_IMAGE_FIXTURE_KEY', imageInput: true,
    models: [{ id: 'text', multimodalSupport: 'none' }],
  }]);
  t.after(() => sdk.registerCustomProviders([]));
  assert.equal(await readModelImageSupport('custom-image-fixture', 'vision'), 'image-input');
  assert.equal(await readModelImageSupport('custom-image-fixture', 'text'), 'none');
  await assert.rejects(readModelImageSupport('unknown-image-fixture'), /Unknown provider/);
  assert.equal(await readModelImageSupport('mock'), undefined);
});
