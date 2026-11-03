import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderInfo } from '@kodax-space/space-ipc-schema';
import { describeProviderList } from './credential-presentation.js';
import type { SpaceCredentialState } from './file-credentials.js';

test('one damaged credential binding stays visible and does not hide healthy providers or leak its error', async () => {
  const list: ProviderInfo[] = ['damaged', 'healthy'].map((id) => ({
    id,
    displayName: id,
    apiKeyEnv: 'TEST_KEY',
    defaultModel: 'model',
    configured: false,
    configuredSource: 'none',
    isDefault: false,
    isCustom: true,
    protocol: 'openai',
  }));
  const result = await describeProviderList(list, async (id) => {
    if (id === 'damaged') throw new Error('secret credential record');
    return {
      scope: 'shared',
      configured: true,
      revision: 'revision',
      binding: { profile: 'default', provider: id, connectionFingerprint: 'binding' },
      migration: 'none',
    };
  });
  assert.equal(result.length, 2);
  assert.equal(result[0]?.credentialError, 'unavailable');
  assert.equal(result[1]?.configured, true);
  assert.doesNotMatch(JSON.stringify(result), /secret credential/);
});

const credentialCases: readonly [
  Partial<SpaceCredentialState>,
  ProviderInfo['configuredSource'],
  boolean,
][] = [
  [{ migration: 'source-required' }, 'none', false],
  [{ migration: 'unavailable' }, 'none', false],
  [{ migration: 'connection-changed' }, 'none', false],
  [{ migration: 'pending', environmentAvailable: true }, 'both', true],
  [{ migration: 'pending' }, 'file', true],
  [{ origin: 'env', environmentAvailable: true }, 'env', true],
  [{ origin: 'file', environmentAvailable: true }, 'none', false],
  [{ environmentAvailable: true }, 'env', true],
  [{ authentication: 'oauth', authenticationConfigured: false }, 'oauth', false],
  [{ authentication: 'cloud', authenticationConfigured: true }, 'cloud', true],
  [{ authentication: 'external', authenticationConfigured: true }, 'external', true],
  [{ origin: 'file' }, 'none', false],
  [{}, 'runtime', true],
];
test('credential status retains environment, pending migration, external auth and runtime distinctions', async () => {
  for (const [state, source, configured] of credentialCases) {
    const provider: ProviderInfo = {
      id: 'test',
      displayName: 'Test',
      apiKeyEnv: 'TEST_KEY',
      defaultModel: 'model',
      configured: true,
      configuredSource: 'runtime',
      isDefault: false,
      isCustom: true,
      protocol: 'openai',
    };
    const [actual] = await describeProviderList([provider], async () => ({
      binding: { profile: 'default', provider: 'test', connectionFingerprint: 'test' },
      revision: null,
      configured: false,
      migration: 'none',
      ...state,
    }));
    assert.equal(actual?.configuredSource, source, JSON.stringify(state));
    assert.equal(actual?.configured, configured, JSON.stringify(state));
  }
});
