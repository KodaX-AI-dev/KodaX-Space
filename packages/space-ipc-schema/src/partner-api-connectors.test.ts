import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPartnerConnectorResource,
  partnerConnectorResourceKey,
} from './channels/partner-connector.js';
import {
  partnerConnectorOnboardingSchema,
  partnerConnectorOnboardingValueSchema,
} from './channels/partner-connector-onboarding.js';
import {
  partnerConnectorSupports,
  projectPartnerConnectorResource,
} from './partner-connector-capabilities.js';

test('Slack, Zoom and GitHub use strict resource identities and shared web projections', () => {
  const cases = [
    [
      'slack-mcp',
      'https://acme.slack.com/archives/C12345678/p1234567890123456',
      'C12345678/1234567890.123456',
      'message',
    ],
    ['zoom-mcp', 'https://acme.zoom.us/j/12345678901', '12345678901', 'meeting'],
    ['github-api', 'https://github.com/octocat/hello-world', 'octocat/hello-world', 'document'],
    [
      'github-api',
      'https://github.com/octocat/hello-world/issues/12',
      'octocat/hello-world/issues/12',
      'issue',
    ],
    [
      'github-api',
      'https://github.com/octocat/hello-world/pull/12',
      'octocat/hello-world/pull/12',
      'issue',
    ],
  ] as const;
  for (const [adapter, ref, key, kind] of cases) {
    assert.equal(isPartnerConnectorResource(adapter, ref), true);
    assert.equal(partnerConnectorResourceKey(adapter, ref), key);
    assert.equal(partnerConnectorSupports(adapter, 'read'), true);
    assert.equal(partnerConnectorSupports(adapter, 'append'), false);
    assert.equal(projectPartnerConnectorResource(ref)?.webUrl, ref);
    assert.equal(projectPartnerConnectorResource(ref)?.kind, kind);
    for (const suffix of ['?token=secret', '#section', '/', '/../../other'])
      assert.equal(isPartnerConnectorResource(adapter, ref + suffix), false);
  }
  for (const ref of [
    'https://github.com/../repo',
    'https://github.com/user/..',
    'https://github.com.evil/user/repo',
    'https://github.com/u/r/issues/0',
  ])
    assert.equal(isPartnerConnectorResource('github-api', ref), false);
  assert.equal(
    isPartnerConnectorResource('zoom-mcp', 'https://zoom.us/j/123456789?pwd=secret'),
    false,
  );
  assert.equal(
    partnerConnectorResourceKey('slack-mcp', 'slack://channel/C12345678/message/1234567890.123456'),
    'C12345678/1234567890.123456',
  );
});

test('trusted credential forms accept bounded secrets but public jobs never contain credentials', () => {
  assert.equal(
    partnerConnectorOnboardingValueSchema.safeParse({ token: 'xoxb-test' }).success,
    true,
  );
  assert.equal(
    partnerConnectorOnboardingValueSchema.safeParse({
      accountId: 'account',
      clientId: 'client',
      clientSecret: 'secret',
    }).success,
    true,
  );
  for (const token of ['', 'a\nb', 'a'.repeat(8193)])
    assert.equal(partnerConnectorOnboardingValueSchema.safeParse({ token }).success, false);
  const job = {
    id: '00000000-0000-4000-8000-000000000001',
    extensionId: 'test.ext',
    connectorId: 'github',
    phase: 'waiting_input',
    canReopen: false,
    inputKind: 'github_token',
  };
  assert.equal(partnerConnectorOnboardingSchema.safeParse(job).success, true);
  assert.equal(
    partnerConnectorOnboardingSchema.safeParse({ ...job, token: 'secret' }).success,
    false,
  );
});
