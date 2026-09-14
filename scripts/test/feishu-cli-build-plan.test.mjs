import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFeishuCliBuildPlan } from '../feishu-cli-build-plan.mjs';

test('Feishu CLI build plan follows the selected package platform and architectures', () => {
  assert.deepEqual(resolveFeishuCliBuildPlan(['--mac', '--x64', '--arm64'], 'darwin', 'arm64'), {
    platform: 'darwin',
    targets: ['darwin-x64', 'darwin-arm64'],
  });
  assert.deepEqual(resolveFeishuCliBuildPlan(['--win'], 'darwin', 'arm64'), {
    platform: 'win32',
    targets: ['win32-x64'],
  });
  assert.deepEqual(resolveFeishuCliBuildPlan([], 'darwin', 'arm64'), {
    platform: 'darwin',
    targets: ['darwin-arm64'],
  });
});

test('Feishu CLI build plan rejects mixed platforms and unsupported release architectures', () => {
  assert.throws(
    () => resolveFeishuCliBuildPlan(['--mac', '--win'], 'darwin', 'arm64'),
    /one package platform/u,
  );
  assert.throws(
    () => resolveFeishuCliBuildPlan(['--linux', '--ia32'], 'linux', 'x64'),
    /unsupported architecture/u,
  );
  assert.throws(
    () => resolveFeishuCliBuildPlan(['--win', '--arm64'], 'win32', 'x64'),
    /unsupported win32 package architecture/u,
  );
  assert.throws(
    () => resolveFeishuCliBuildPlan(['--linux', '--arm64'], 'linux', 'x64'),
    /unsupported linux package architecture/u,
  );
});
