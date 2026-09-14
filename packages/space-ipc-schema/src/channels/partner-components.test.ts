import assert from 'node:assert/strict';
import test from 'node:test';
import { partnerComponentInvokeChannels as channels } from './partner-components.js';

test('component installation accepts only fixed host components, never commands or account details', () => {
  const input = channels['partner.components.install'].input;
  assert.deepEqual(input.parse({ id: 'feishu-cli' }), { id: 'feishu-cli' });
  for (const value of [
    { id: 'unknown-cli' },
    { id: 'feishu-cli', url: 'https://attacker.test/cli' },
    { id: 'feishu-cli', executable: '/tmp/cli' },
    { id: 'feishu-cli', profile: 'account' },
  ])
    assert.equal(input.safeParse(value).success, false);
});
