// Keychain wrapper tests — FEATURE_004
//
// 测试环境通常没有 OS keychain 可用（CI 无 libsecret），keychain 模块走 in-memory fallback。
// 这里验证 fallback 路径的 get/set/delete/list 语义。
// 真实 keychain 路径需要在装了 keytar + 跑在带 keychain 的 OS 上的 e2e 阶段验证。

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  setKey,
  getKey,
  deleteKey,
  listAccounts,
  listConfiguredAccounts,
  getBackendStatus,
  _resetMemoryStoreForTesting,
} from '../providers/keychain.js';

beforeEach(() => {
  _resetMemoryStoreForTesting();
});

test('set then get returns the value', async () => {
  await setKey('anthropic', 'sk-test-123');
  assert.equal(await getKey('anthropic'), 'sk-test-123');
});

test('get missing account returns undefined', async () => {
  assert.equal(await getKey('not-there'), undefined);
});

test('set then delete then get returns undefined', async () => {
  await setKey('openai', 'sk-1');
  assert.equal(await deleteKey('openai'), true);
  assert.equal(await getKey('openai'), undefined);
});

test('delete missing returns false', async () => {
  assert.equal(await deleteKey('never-set'), false);
});

test('listAccounts returns all set accounts', async () => {
  await setKey('a', 'k1');
  await setKey('b', 'k2');
  await setKey('c', 'k3');
  const accounts = await listAccounts();
  assert.deepEqual([...accounts].sort(), ['a', 'b', 'c']);
});

test('candidate account discovery respects the isolated memory backend', async () => {
  const selected = `space-memory-test-${randomUUID()}`;
  const absent = `space-memory-test-${randomUUID()}`;
  await setKey(selected, 'fixture-only-secret');
  assert.deepEqual(await listConfiguredAccounts([absent, selected, selected]), [selected]);
  await deleteKey(selected);
  assert.deepEqual(await listConfiguredAccounts([selected]), []);
});

test('overwrite: second set replaces value', async () => {
  await setKey('x', 'first');
  await setKey('x', 'second');
  assert.equal(await getKey('x'), 'second');
});

test('backend status is "memory" in test env (no keytar / no keychain)', async () => {
  const status = await getBackendStatus();
  // CI / dev 环境通常 fallback 到 memory；如装了 keytar 应为 keychain
  assert.ok(status === 'memory' || status === 'keychain');
});
