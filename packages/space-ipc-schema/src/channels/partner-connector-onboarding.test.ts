import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectorOnboardingInvokeChannels,
  partnerConnectorOnboardingSchema,
} from './partner-connector-onboarding.js';

const owner = { extensionId: 'kodax.partner-library', connectorId: 'feishu-docs' };
const id = '27e90c5a-ad5b-4295-9478-9d525da54990';

test('onboarding starts without implicit install or caller-controlled commands, scopes or profiles', () => {
  const input = connectorOnboardingInvokeChannels['partner.connectors.onboarding.start'].input;
  assert.deepEqual(input.parse(owner), { ...owner, installCli: false });
  assert.equal(input.parse({ ...owner, installCli: true }).installCli, true);
  for (const extra of [
    { command: 'bash' },
    { profile: 'default' },
    { scopes: ['all'] },
    { authorizationUrl: 'https://other.test' },
    { token: 'fixture-only' },
  ]) {
    assert.equal(input.safeParse({ ...owner, ...extra }).success, false);
  }
});

test('job status is safe presentation data, never a credential or browser URL transport', () => {
  const job = { ...owner, id, phase: 'waiting_authorization', canReopen: true };
  assert.equal(partnerConnectorOnboardingSchema.parse(job).phase, 'waiting_authorization');
  for (const extra of [
    { authorizationUrl: 'https://accounts.feishu.cn/oauth/v1/device/verify?code=fixture' },
    { deviceCode: 'fixture-only' },
    { appSecret: 'fixture-only' },
    { stdout: 'raw output' },
  ]) {
    assert.equal(partnerConnectorOnboardingSchema.safeParse({ ...job, ...extra }).success, false);
  }
  for (const phase of ['needs_install', 'cancelled', 'expired', 'failed']) {
    assert.equal(partnerConnectorOnboardingSchema.safeParse({ ...job, phase }).success, true);
  }
});

test('get, cancel and reopen are bound to both connector identity and a validated job id', () => {
  for (const action of ['get', 'cancel', 'reopen'] as const) {
    const input =
      connectorOnboardingInvokeChannels[`partner.connectors.onboarding.${action}`].input;
    assert.deepEqual(input.parse({ ...owner, id }), { ...owner, id });
    assert.equal(input.safeParse({ id }).success, false);
    assert.equal(input.safeParse({ ...owner, id: '../other' }).success, false);
    assert.equal(input.safeParse({ ...owner, id, url: 'https://other.test' }).success, false);
  }
});
