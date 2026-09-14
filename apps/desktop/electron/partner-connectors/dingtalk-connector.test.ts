import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDingtalkConnector } from './dingtalk-connector.js';
import type { ProviderCliProcessOptions, ProviderCliRequest } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

const profile = 'space-11111111-1111-4111-8111-111111111111';
const identity = { authorityId: 'dingCorp', subjectId: 'user1', label: '测试 · 组织' };
const authUrl =
  'https://login.dingtalk.com/oauth2/auth?client_id=official-cli&redirect_uri=http%3A%2F%2F127.0.0.1%3A43123%2Fcallback&response_type=code&scope=openid+corpid&prompt=consent';
const online = {
  success: true,
  result: [
    {
      orgEmployeeModel: {
        corpId: 'dingCorp',
        userId: 'user1',
        orgUserName: '测试',
        orgName: '组织',
      },
    },
  ],
};
const login = { success: true, token_valid: true, corp_id: 'dingCorp', user_id: 'user1' };

test('DingTalk never executes a preplaced or replaced native file even when it can claim the pinned version', async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-dingtalk-native-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'dingtalk', 'cli', '1.0.61', 'darwin-arm64', 'dws');
  await mkdir(path.dirname(executable), { recursive: true, mode: 0o700 });
  let dispatches = 0;
  const connector = createDingtalkConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    processFactory: () => async () => {
      dispatches++;
      return { stdout: 'dws version v1.0.61\n', stderr: '', exitCode: 0 };
    },
  });
  for (const bytes of [Buffer.from('untrusted native'), Buffer.alloc(32432720)]) {
    await writeFile(executable, bytes, { mode: 0o700 });
    const status = await connector.inspect(profile);
    assert.equal(dispatches, 0, 'native bytes must be authenticated before even --version');
    assert.equal(status.identity, undefined);
    assert.equal(status.reason, 'installation_failed');
  }
});

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-dingtalk-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'dws-fixture');
  const calls: ProviderCliRequest[] = [];
  const settings: ProviderCliProcessOptions[] = [];
  let response: (request: ProviderCliRequest) => unknown = () => online;
  const connector = createDingtalkConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: {
      executable,
      install: async () => {
        await writeFile(executable, 'fixture');
        return executable;
      },
    },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture',
    processFactory: (options) => {
      settings.push(options);
      return async (request) => {
        await request.beforeSpawn?.();
        request.assertSpawn?.();
        calls.push(request);
        if (request.args.includes('--version'))
          return {
            stdout: 'dws version v1.0.61 (abc123, 2026-08-31T00:00:00Z)\n',
            stderr: '',
            exitCode: 0,
          };
        if (request.args.includes('login')) {
          request.onOutput?.('stderr', '\n请访问:\n  ' + authUrl.slice(0, 80));
          request.onOutput?.('stderr', authUrl.slice(80) + '\n');
          return { stdout: JSON.stringify(login), stderr: authUrl, exitCode: 0 };
        }
        return { stdout: JSON.stringify(response(request)), stderr: '', exitCode: 0 };
      };
    },
  });
  return {
    connector,
    root,
    executable,
    calls,
    settings,
    respond: (value: typeof response) => {
      response = value;
    },
  };
}

test('DingTalk accepts only explicit document references and canonical official document URLs', () => {
  const connector = createDingtalkConnector({ root: '/tmp/space-dingtalk-test' });
  for (const value of ['dingtalk://document/Abc123', 'https://alidocs.dingtalk.com/i/nodes/Abc123'])
    assert.equal(connector.acceptsResource(value), true, value);
  for (const value of [
    'Abc123',
    'dingtalk://document/12345',
    'dingtalk://document/../../secret',
    'https://alidocs.dingtalk.com.evil.test/i/nodes/Abc123',
    'https://alidocs.dingtalk.com/i/nodes/Abc123?token=secret',
    'https://user@alidocs.dingtalk.com/i/nodes/Abc123',
    'https://alidocs.dingtalk.com/i/nodes/%41bc123',
    'dingtalk://document/Abc123#x',
  ])
    assert.equal(connector.acceptsResource(value), false, value);
});

test('DingTalk explicitly installs, uses private credentials, and verifies the exact online identity', async (t) => {
  const f = await fixture(t);
  const signal = new AbortController().signal;
  const events: unknown[] = [];
  assert.deepEqual(await f.connector.inspect(profile), {
    installed: false,
    reason: 'needs_install',
  });
  await assert.rejects(f.connector.run({ profile, signal, installCli: false, onProgress() {} }), {
    code: 'needs_install',
  });
  await f.connector.run({
    profile,
    signal,
    installCli: true,
    onProgress: (event) => events.push(event),
  });
  assert.deepEqual((await f.connector.inspect(profile, signal)).identity, identity);
  assert.ok(
    events.some((event) => (event as { authorizationUrl?: string }).authorizationUrl === authUrl),
  );
  assert.ok(
    f.calls.some((call) => call.args.join(' ') === 'auth login --no-browser --format json'),
  );
  assert.ok(
    f.calls.some(
      (call) =>
        call.args.join(' ') === '--profile dingCorp:user1 contact user get-self --format json',
    ),
  );
  assert.ok(
    f.calls.every((call) => !call.args.includes('status') && !call.args.includes('--recommend')),
  );
  const overrides = f.settings.at(-1)?.overrides;
  assert.equal(
    overrides?.DWS_CONFIG_DIR,
    path.join(f.root, 'dingtalk', 'profiles', profile, 'config'),
  );
  assert.equal(
    overrides?.DWS_KEYCHAIN_DIR,
    path.join(f.root, 'dingtalk', 'profiles', profile, 'keychain'),
  );
  f.respond(() => ({ authenticated: true, corp_id: 'dingCorp', user_id: 'user1' }));
  const cached = await f.connector.inspect(profile);
  assert.equal(cached.identity, undefined);
  assert.equal(cached.reason, 'invalid_response');
  assert.equal(
    new ReadConnectorError(cached.reason as 'invalid_response').message.includes('dingCorp'),
    false,
  );
});

test('DingTalk reads only an approved adoc, checking identity again after approval', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  f.calls.length = 0;
  let approved = false;
  let guarded = 0;
  f.respond((request) => {
    if (request.args.includes('info')) {
      assert.equal(approved, true);
      return { nodeId: 'Abc123', title: '周报', contentType: 'ALIDOC', extension: 'adoc' };
    }
    if (request.args.includes('read')) {
      assert.equal(approved, true);
      return { markdown: '# 本周工作\n正文' };
    }
    return online;
  });
  const result = await f.connector.read({
    profile,
    expected: identity,
    documentUrl: 'dingtalk://document/Abc123',
    beforeRead: async () => {
      approved = true;
    },
    assertRead: () => {
      guarded++;
    },
  });
  assert.deepEqual(result, {
    documentId: 'Abc123',
    url: 'dingtalk://document/Abc123',
    title: '周报',
    revision: 0,
    content: '# 本周工作\n正文',
  });
  assert.ok(guarded >= 3);
  assert.deepEqual(
    f.calls.filter((call) => !call.args.includes('--version')).map((call) => call.args),
    [
      ['--profile', 'dingCorp:user1', 'contact', 'user', 'get-self', '--format', 'json'],
      ['--profile', 'dingCorp:user1', 'contact', 'user', 'get-self', '--format', 'json'],
      ['--profile', 'dingCorp:user1', 'doc', 'info', '--node', 'Abc123', '--format', 'json'],
      ['--profile', 'dingCorp:user1', 'contact', 'user', 'get-self', '--format', 'json'],
      ['--profile', 'dingCorp:user1', 'doc', 'read', '--node', 'Abc123', '--format', 'json'],
    ],
  );
  const webUrl = 'https://alidocs.dingtalk.com/i/nodes/Abc123';
  assert.equal(
    (
      await f.connector.read({
        profile,
        expected: identity,
        documentUrl: webUrl,
        beforeRead: async () => {},
        assertRead() {},
      })
    ).url,
    webUrl,
  );
});

test('DingTalk reauthenticates native bytes after an asynchronous host permission gate', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  f.respond((request) =>
    request.args.includes('info')
      ? { nodeId: 'Abc123', title: '周报', contentType: 'ALIDOC', extension: 'adoc' }
      : request.args.includes('read')
        ? { markdown: '正文' }
        : online,
  );
  let callsAtReplacement = -1;
  await assert.rejects(
    f.connector.read({
      profile,
      expected: identity,
      documentUrl: 'dingtalk://document/Abc123',
      beforeRead: async () => {
        await writeFile(f.executable, 'replaced');
        callsAtReplacement = f.calls.length;
      },
      assertRead() {},
    }),
    { code: 'installation_failed' },
  );
  assert.ok(callsAtReplacement > 0);
  assert.equal(f.calls.length, callsAtReplacement, 'no command may use the replaced file');
});

test('DingTalk checks native replacement again at the final synchronous dispatch guard', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  f.respond((request) =>
    request.args.includes('info')
      ? { nodeId: 'Abc123', title: '周报', contentType: 'ALIDOC', extension: 'adoc' }
      : request.args.includes('read')
        ? { markdown: '正文' }
        : online,
  );
  let callsAtReplacement = -1;
  await assert.rejects(
    f.connector.read({
      profile,
      expected: identity,
      documentUrl: 'dingtalk://document/Abc123',
      beforeRead: async () => {},
      assertRead() {
        if (callsAtReplacement < 0) {
          writeFileSync(f.executable, 'changed');
          callsAtReplacement = f.calls.length;
        }
      },
    }),
    { code: 'installation_failed' },
  );
  assert.ok(callsAtReplacement > 0);
  assert.equal(f.calls.length, callsAtReplacement, 'no dispatch after the verified file changes');
});

test('DingTalk suppresses untrusted PAT browser jumps in its own isolated configuration', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  const policy = path.join(f.root, 'dingtalk', 'profiles', profile, 'config', 'pat_policy.json');
  assert.deepEqual(JSON.parse(await readFile(policy, 'utf8')), { default: { openBrowser: false } });
  await writeFile(policy, JSON.stringify({ default: { openBrowser: true } }));
  f.calls.length = 0;
  assert.equal((await f.connector.inspect(profile)).reason, 'invalid_response');
  assert.equal(
    f.calls.some((call) => call.args.includes('get-self')),
    false,
  );
});

test('DingTalk cannot reuse an onboarding profile or follow a replaced credential directory', async (t) => {
  const f = await fixture(t);
  const input = {
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  };
  await f.connector.run(input);
  f.calls.length = 0;
  await assert.rejects(f.connector.run(input), { code: 'invalid_response' });
  assert.equal(
    f.calls.some((call) => call.args.includes('login')),
    false,
  );
  const credentialDir = path.join(f.root, 'dingtalk', 'profiles', profile, 'keychain');
  await rm(credentialDir, { recursive: true });
  await symlink(f.root, credentialDir);
  assert.equal((await f.connector.inspect(profile)).reason, 'invalid_response');
});

test('DingTalk authorization URL validation pins the official origin, scope and loopback callback', () => {
  const connector = createDingtalkConnector({ root: '/tmp/space-dingtalk-test' });
  assert.equal(connector.isAuthorizationUrl(authUrl), true);
  for (const value of [
    undefined,
    {},
    '',
    authUrl.replace('login.dingtalk.com', 'login.dingtalk.com.evil.test'),
    authUrl.replace('127.0.0.1', 'example.com'),
    authUrl.replace('43123', '80'),
    authUrl.replace('%2Fcallback', '%2Fother'),
    authUrl.replace('openid+corpid', 'all'),
    authUrl + '&scope=all',
    authUrl + '&token=secret',
    authUrl + '#fragment',
    authUrl.replace('https://', 'http://'),
    authUrl.replace('https://', 'https://user@'),
    authUrl + '\n',
    'https://login.dingtalk.com/oauth2/auth',
  ])
    assert.equal(connector.isAuthorizationUrl(value), false, String(value));
});

test('DingTalk blocks unsupported platforms, unsafe profiles, and pre-cancelled onboarding before commands', async (t) => {
  const unsupported = createDingtalkConnector({
    root: '/tmp/space-dingtalk-test',
    platform: 'win32',
    arch: 'arm64',
  });
  assert.equal((await unsupported.inspect(profile)).reason, 'unsupported_platform');
  await assert.rejects(
    unsupported.run({
      profile,
      signal: new AbortController().signal,
      installCli: true,
      onProgress() {},
    }),
    { code: 'unsupported_platform' },
  );
  const f = await fixture(t);
  assert.equal((await f.connector.inspect('../../other')).reason, 'invalid_response');
  const aborted = AbortSignal.abort();
  await assert.rejects(
    f.connector.run({ profile, signal: aborted, installCli: true, onProgress() {} }),
    { code: 'cancelled' },
  );
  await assert.rejects(f.connector.inspect(profile, aborted), { code: 'cancelled' });
  assert.equal(f.calls.length, 0);
});

test('DingTalk rejects changed identity and never dispatches document reads after revoked approval', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  f.calls.length = 0;
  const input = {
    profile,
    expected: identity,
    documentUrl: 'dingtalk://document/Abc123',
    beforeRead: async () => {},
    assertRead() {},
  };
  await assert.rejects(
    f.connector.read({ ...input, expected: { ...identity, subjectId: 'other' } }),
    { code: 'identity_changed' },
  );
  await assert.rejects(
    f.connector.read({
      ...input,
      beforeRead: async () => {
        f.respond(() => ({
          result: [{ orgEmployeeModel: { corpId: 'dingCorp', userId: 'other' } }],
        }));
      },
    }),
    { code: 'identity_changed' },
  );
  assert.equal(
    f.calls.some((call) => call.args.includes('doc')),
    false,
  );
  f.respond(() => online);
  await assert.rejects(
    f.connector.read({
      ...input,
      assertRead: () => {
        throw new ReadConnectorError('cancelled');
      },
    }),
    { code: 'cancelled' },
  );
  assert.equal(
    f.calls.some((call) => call.args.includes('doc')),
    false,
  );
});

test('DingTalk rejects ambiguous or incomplete online identity instead of selecting an arbitrary organization', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  for (const payload of [
    { result: [] },
    { result: online.result.concat(online.result) },
    { result: [{ orgEmployeeModel: { userId: 'user1' } }] },
    {
      result: [
        { orgEmployeeModel: { corpId: 'dingCorp', userId: 'user1', orgUserName: 'bad\nlabel' } },
      ],
    },
    { success: false, result: online.result },
    { code: 'PAT_SCOPE_AUTH_REQUIRED', result: online.result },
    { result: [{ orgEmployeeModel: { corpId: 'dingCorp', userId: 'bad:id' } }] },
  ]) {
    f.respond(() => payload);
    assert.equal((await f.connector.inspect(profile)).identity, undefined);
  }
});

test('DingTalk refuses wrong document types, wrong identities and business-error envelopes', async (t) => {
  const f = await fixture(t);
  await f.connector.run({
    profile,
    signal: new AbortController().signal,
    installCli: true,
    onProgress() {},
  });
  const info = { nodeId: 'Abc123', title: '周报', contentType: 'ALIDOC', extension: 'adoc' };
  const input = {
    profile,
    expected: identity,
    documentUrl: 'https://alidocs.dingtalk.com/i/nodes/Abc123',
    beforeRead: async () => {},
    assertRead() {},
  };
  for (const invalid of [
    { ...info, extension: 'axls' },
    { ...info, nodeId: 'OtherId' },
    { ...info, title: '' },
    { ...info, success: false },
    { ...info, contentType: 'FILE' },
  ]) {
    f.calls.length = 0;
    f.respond((request) => (request.args.includes('info') ? invalid : online));
    await assert.rejects(f.connector.read(input), { code: 'invalid_response' });
    assert.equal(
      f.calls.some((call) => call.args.includes('read')),
      false,
    );
  }
  for (const invalid of [
    {},
    { markdown: 123 },
    { markdown: 'x', success: false },
    { markdown: 'x', code: 'PAT_SCOPE_AUTH_REQUIRED' },
    { markdown: 'x'.repeat(1024 * 1024 + 1) },
  ]) {
    f.respond((request) =>
      request.args.includes('info') ? info : request.args.includes('read') ? invalid : online,
    );
    await assert.rejects(f.connector.read(input), { code: 'invalid_response' });
  }
});

test('DingTalk cancellation after OAuth completion cannot publish a verified connection', async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  await assert.rejects(
    f.connector.run({
      profile,
      signal: controller.signal,
      installCli: true,
      onProgress: (event) => {
        if (event.phase === 'verifying') controller.abort();
      },
    }),
    { code: 'cancelled' },
  );
  assert.equal((await f.connector.inspect(profile)).identity, undefined);
});
