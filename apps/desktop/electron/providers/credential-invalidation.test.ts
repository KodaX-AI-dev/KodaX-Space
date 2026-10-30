import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invalidateProviderCredential, onProviderCredentialInvalidation, providerCredentialEpoch } from './credential-invalidation.js';

test('a failed Host cleanup fences pending replies and still attempts every subscriber', async () => {
  const provider = 'invalidation-fixture';
  let second = false;
  const old = providerCredentialEpoch(provider);
  const first = onProviderCredentialInvalidation(() => { throw new Error('cleanup unavailable'); });
  const last = onProviderCredentialInvalidation(async current => {
    assert.equal(current, provider); assert.equal(providerCredentialEpoch(provider), old + 1); second = true;
  });
  try {
    await assert.rejects(invalidateProviderCredential(provider), /fenced locally/);
    assert.equal(second, true);
  } finally { first(); last(); }
  await invalidateProviderCredential(provider);
  assert.equal(providerCredentialEpoch(provider), old + 2);
});
