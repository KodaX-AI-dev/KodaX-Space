import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createWecomConnector, isWecomAuthorizationUrl } from './wecom-cli.js';
import type { ProviderCliRequest, ProviderCliResponse } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

const profile = 'space-11111111-1111-4111-8111-111111111111';
const identity = { authorityId: 'wecom-bot', subjectId: 'aib-test-bot', label: '企业微信机器人' };

async function createFixtureExecutable(root: string): Promise<string> {
  const executable = path.join(root, 'fixture-native');
  await writeFile(executable, 'fixture', { mode: 0o700 });
  return executable;
}

test('WeCom authenticates bounded official native bytes before even a version check', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-native-default-')));
  const executable = path.join(root, 'wecom-cli', 'cli', '1.2.0', 'darwin-arm64', 'wecom-cli');
  await mkdir(path.dirname(executable), { recursive: true, mode: 0o700 });
  let dispatches = 0;
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    processFactory: () => async () => {
      dispatches++;
      return ok(version);
    },
  });
  try {
    for (const bytes of [Buffer.from('claims to be wecom-cli 1.2.0'), Buffer.alloc(7221312)]) {
      await writeFile(executable, bytes, { mode: 0o700 });
      assert.equal((await connector.inspect(profile)).identity, undefined);
      assert.equal(dispatches, 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeCom rejects native replacement during asynchronous permission checks before any further command spawns', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-native-race-')));
  const executable = path.join(root, 'fixture-native');
  await writeFile(executable, 'fixture', { mode: 0o700 });
  const calls: string[] = [];
  let afterReplacement = 0;
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: { executable, install: async () => executable },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture',
    processFactory: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      calls.push(input.args[0]);
      if (input.args[0] === '--version') return ok(version);
      if (input.args[0] === 'auth') return auth();
      if (input.args[0] === 'identity') return ok('{"opaque":true}');
      return ok(
        JSON.stringify({
          url: 'https://doc.weixin.qq.com/doc/w3_doc',
          name: 'title',
          content: 'body',
          version: 1,
        }),
      );
    },
  });
  try {
    await assert.rejects(
      connector.read({
        profile,
        expected: identity,
        documentUrl: 'wecom://document/w3_doc',
        beforeRead: async () => {
          await writeFile(executable, 'replaced');
          afterReplacement = calls.length;
        },
        assertRead: () => {},
      }),
      errorCode('installation_failed'),
    );
    assert.equal(
      calls.length,
      afterReplacement,
      'replacement must prevent even subsequent identity commands',
    );
    assert.equal(calls.includes('doc'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeCom rejects native replacement inside the final synchronous session guard before business dispatch', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-final-native-')));
  const executable = path.join(root, 'fixture-native');
  await writeFile(executable, 'fixture', { mode: 0o700 });
  let businessDispatches = 0;
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: { executable, install: async () => executable },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture',
    processFactory: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      if (input.args[0] === '--version') return ok(version);
      if (input.args[0] === 'auth') return auth();
      if (input.args[0] === 'identity') return ok('{"opaque":true}');
      businessDispatches++;
      return ok(
        JSON.stringify({
          url: 'https://doc.weixin.qq.com/doc/w3_doc',
          name: 'title',
          content: 'body',
          version: 1,
        }),
      );
    },
  });
  try {
    await assert.rejects(
      connector.read({
        profile,
        expected: identity,
        documentUrl: 'wecom://document/w3_doc',
        beforeRead: async () => {},
        assertRead: () => {
          writeFileSync(executable, 'replaced');
        },
      }),
      errorCode('installation_failed'),
    );
    assert.equal(
      businessDispatches,
      0,
      'the final synchronous stamp must reject changes made after hashing',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeCom verifies the same private bot around a protected whoami and reads only its explicit document', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-test-')));
  const executable = await createFixtureExecutable(root);
  const calls: string[][] = [];
  let guardCalls = 0;
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: { executable, install: async () => executable },
    verifyBinary: async () => true,
    processFactory: () => async (input: ProviderCliRequest) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      calls.push([...input.args]);
      let stdout = '';
      if (input.args[0] === '--version')
        stdout = 'wecom-cli 1.2.0 (npm 2026-08-25T10:15:28Z 78c514b)\n';
      else if (input.args[0] === 'auth') stdout = 'Status: authorized\nBot ID: aib-test-bot\n';
      else if (input.args[0] === 'identity') stdout = '{"opaqueIdentity":{"serverOwned":true}}';
      else
        stdout = JSON.stringify({
          url: 'https://doc.weixin.qq.com/doc/w3_sample',
          name: '文档',
          content: '正文',
          version: 7,
        });
      return { exitCode: 0, stdout, stderr: '' };
    },
  });
  try {
    assert.deepEqual((await connector.inspect(profile)).identity, identity);
    const document = await connector.read({
      profile,
      expected: identity,
      documentUrl: 'wecom://document/w3_sample',
      beforeRead: async () => {
        guardCalls++;
      },
      assertRead: () => {
        guardCalls++;
      },
    });
    assert.deepEqual(document, {
      documentId: 'w3_sample',
      url: 'wecom://document/w3_sample',
      title: '文档',
      content: '正文',
      revision: 7,
    });
    assert.ok(guardCalls >= 2);
    assert.deepEqual(
      calls.find((args) => args[0] === 'doc'),
      ['doc', 'contents', 'get', '--json', '{"docid":"w3_sample","content_type":"markdown"}'],
    );
    assert.equal(
      connector.acceptsResource('https://doc.weixin.qq.com/doc/w3_sample?scode=sample'),
      true,
    );
    assert.equal(
      connector.acceptsResource('https://doc.weixin.qq.com.evil.test/doc/w3_sample'),
      false,
    );
    assert.equal(connector.acceptsResource('wecom://document/../other'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeCom runs beforeRead before assertRead and preserves an accepted official URL', async () => {
  let checked = false;
  let reads = 0;
  const url = 'https://doc.weixin.qq.com/doc/w3_doc';
  const setup = await fixture(async (input) => {
    if (input.args[0] === 'auth') return auth();
    if (input.args[0] === 'identity') return ok('{"opaque":true}');
    reads++;
    return ok(JSON.stringify({ url, name: 'title', content: 'body', version: 3 }));
  });
  try {
    const result = await setup.connector.read({
      profile,
      expected: identity,
      documentUrl: url,
      beforeRead: async () => {
        checked = true;
      },
      assertRead: () => {
        assert.equal(checked, true, 'async permission check must precede sync guard');
      },
    });
    assert.equal(result.url, url);
    assert.equal(reads, 1);
  } finally {
    await setup.close();
  }
});

const authUrl = 'https://work.weixin.qq.com/ai/qc/gen?source=wecom_cli_external&scode=fixture';
const version = 'wecom-cli 1.2.0 (unknown 2026-08-25T10:23:42Z 78c514b)\n';
const ok = (stdout: string): ProviderCliResponse => ({ exitCode: 0, stdout, stderr: '' });
const auth = (id = 'aib-test-bot') => ok(`Status: authorized\nBot ID: ${id}\n`);
const errorCode = (code: string) => (error: unknown) =>
  error instanceof ReadConnectorError && error.code === code;

async function fixture(
  run: (input: ProviderCliRequest, root: string) => Promise<ProviderCliResponse>,
) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-cases-')));
  const executable = await createFixtureExecutable(root);
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: { executable, install: async () => executable },
    verifyBinary: async () => true,
    processFactory: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      return input.args[0] === '--version' ? ok(version) : run(input, root);
    },
  });
  return { root, connector, close: () => rm(root, { recursive: true, force: true }) };
}

test('WeCom accepts only the exact official generated authorization page', () => {
  assert.equal(isWecomAuthorizationUrl(authUrl), true);
  for (const value of [
    null,
    authUrl + '#fragment',
    authUrl + '&source=wecom_cli_external',
    authUrl.replace('https:', 'http:'),
    authUrl.replace('work.weixin.qq.com', 'work.weixin.qq.com.evil.test'),
    authUrl.replace('fixture', '%0a'),
    authUrl + '&next=https://evil.test',
    'https://work.weixin.qq.com:443/ai/qc/gen?source=wecom_cli_external&scode=x',
  ])
    assert.equal(isWecomAuthorizationUrl(value), false, String(value));
});

test('WeCom confines its native logging fallback and applies host identity/resource length bounds', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-env-')));
  const executable = await createFixtureExecutable(root);
  let verifiedSettings = false;
  const connector = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    installer: { executable, install: async () => executable },
    verifyBinary: async () => true,
    processFactory: (options) => {
      assert.equal(options.overrides?.WECOM_CLI_LOG_DIR, path.join(options.cwd, '.env'));
      assert.equal(options.overrides?.WECOM_CLI_LOG_LEVEL, 'off');
      verifiedSettings = true;
      return async (input) =>
        input.args[0] === '--version'
          ? ok(version)
          : input.args[0] === 'auth'
            ? auth('x'.repeat(161))
            : ok('{"opaque":true}');
    },
  });
  try {
    assert.equal(connector.acceptsResource('wecom://document/' + 'x'.repeat(129)), false);
    assert.equal((await connector.inspect(profile)).identity, undefined);
    assert.equal(verifiedSettings, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeCom authorization parses split stdout URL then performs protected verification', async () => {
  const phases: string[] = [];
  const calls: string[][] = [];
  const setup = await fixture(async (input) => {
    calls.push([...input.args]);
    if (input.args[1] === 'init') {
      input.onOutput?.('stdout', '请打开二维码链接扫码: \n' + authUrl.slice(0, 30));
      input.onOutput?.('stdout', authUrl.slice(30) + '\n等待扫码中...\n');
      return ok('✔ 扫码成功！Bot ID 和 Secret 已自动获取。\n');
    }
    return input.args[0] === 'auth' ? auth() : ok('{"opaque":true}');
  });
  try {
    await setup.connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: (event) => {
        phases.push(event.phase);
        if (event.authorizationUrl) assert.equal(event.authorizationUrl, authUrl);
      },
    });
    assert.deepEqual(phases, ['preparing', 'waiting_authorization', 'verifying']);
    assert.deepEqual(calls[0], ['auth', 'init', '--noninteractive', '--no-browser']);
    assert.deepEqual(calls.slice(1), [
      ['auth', 'show'],
      ['identity', 'whoami'],
      ['auth', 'show'],
    ]);
  } finally {
    await setup.close();
  }
});

test('WeCom checks private config before every command, including after whoami', async () => {
  const setup = await fixture(async (input, root) => {
    if (input.args[0] === 'identity') {
      await writeFile(
        path.join(root, 'wecom-cli', 'profiles', profile, 'config', 'config.json'),
        '{"headers":{"Authorization":"untrusted"}}',
      );
      return ok('{"opaque":true}');
    }
    return auth();
  });
  try {
    assert.equal((await setup.connector.inspect(profile)).identity, undefined);
  } finally {
    await setup.close();
  }
});

test('WeCom rejects a failed protected whoami, malformed JSON, or changed bot', async () => {
  for (const mode of ['failure', 'malformed', 'changed']) {
    let shows = 0;
    const setup = await fixture(async (input) => {
      if (input.args[0] === 'auth')
        return auth(mode === 'changed' && shows++ > 0 ? 'other-bot' : 'aib-test-bot');
      return mode === 'failure'
        ? { ...ok('{"message":"SECRET"}'), exitCode: 1 }
        : ok(mode === 'malformed' ? 'SECRET' : '{"opaque":true}');
    });
    try {
      const status = await setup.connector.inspect(profile);
      assert.equal(status.identity, undefined);
      assert.ok(!status.reason?.includes('SECRET'));
    } finally {
      await setup.close();
    }
  }
});

test('WeCom returns no document after identity mismatch or a revoked local read guard', async () => {
  let reads = 0;
  const setup = await fixture(async (input) => {
    if (input.args[0] === 'doc') reads++;
    return input.args[0] === 'auth' ? auth() : ok('{"opaque":true}');
  });
  try {
    const request = {
      profile,
      expected: { ...identity, subjectId: 'other' },
      documentUrl: 'wecom://document/w3_doc',
      beforeRead: async () => {},
      assertRead: () => {},
    };
    await assert.rejects(setup.connector.read(request), errorCode('identity_changed'));
    await assert.rejects(
      setup.connector.read({
        ...request,
        expected: identity,
        beforeRead: async () => {
          throw new Error('SECRET');
        },
      }),
      errorCode('read_failed'),
    );
    assert.equal(reads, 0);
  } finally {
    await setup.close();
  }
});

test('WeCom reads large returned text only from its own private tmp and rejects symlinks', async () => {
  let unsafe = false;
  const setup = await fixture(async (input, root) => {
    if (input.args[0] === 'auth') return auth();
    if (input.args[0] === 'identity') return ok('{"opaque":true}');
    const directory = path.join(root, 'wecom-cli', 'profiles', profile, 'tmp');
    const file = path.join(directory, unsafe ? 'link' : 'content.md');
    if (unsafe) await symlink(path.join(root, 'outside.md'), file);
    else await writeFile(file, 'large text');
    return ok(
      JSON.stringify({
        url: 'https://doc.weixin.qq.com/doc/w3_doc',
        name: 'title',
        file_path: file,
        version: 0,
      }),
    );
  });
  try {
    await writeFile(path.join(setup.root, 'outside.md'), 'SECRET');
    const request = {
      profile,
      expected: identity,
      documentUrl: 'wecom://document/w3_doc',
      beforeRead: async () => {},
      assertRead: () => {},
    };
    assert.equal((await setup.connector.read(request)).content, 'large text');
    unsafe = true;
    await assert.rejects(setup.connector.read(request), errorCode('invalid_response'));
  } finally {
    await setup.close();
  }
});

test('WeCom fails closed for unsupported platforms, missing installation consent, reused profiles, and cancellation', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-wecom-lifecycle-')));
  const input = {
    profile,
    installCli: false,
    signal: new AbortController().signal,
    onProgress: () => {},
  };
  try {
    const unsupported = createWecomConnector({ root, platform: 'win32', arch: 'x64' });
    await assert.rejects(unsupported.run(input), errorCode('unsupported_platform'));
    assert.equal((await unsupported.inspect(profile)).installed, false);
    const missing = createWecomConnector({ root, platform: 'darwin', arch: 'arm64' });
    await assert.rejects(missing.run(input), errorCode('needs_install'));
    await assert.rejects(missing.inspect('../escape'), errorCode('invalid_response'));
    const aborted = AbortSignal.abort();
    await assert.rejects(missing.run({ ...input, signal: aborted }), errorCode('cancelled'));
    const reused = await fixture(async () => {
      throw new Error('must not authorize');
    });
    try {
      const config = path.join(reused.root, 'wecom-cli', 'profiles', profile, 'config');
      await mkdir(config, { recursive: true, mode: 0o700 });
      await writeFile(path.join(config, 'credentials.enc'), 'existing');
      await assert.rejects(reused.connector.run(input), errorCode('authorization_failed'));
    } finally {
      await reused.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
