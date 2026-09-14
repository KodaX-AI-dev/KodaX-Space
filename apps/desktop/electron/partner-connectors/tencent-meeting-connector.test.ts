import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTencentMeetingConnector } from './tencent-meeting-connector.js';
import type { ProviderCliProcess } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

const profile = 'space-2dc58f91-02b9-4439-aef1-4381273c9dd8';
const identity = {
  authorityId: 'tencent-meeting',
  subjectId: 'tmeet_user_1',
  label: '测试用户',
};
const authenticated = [
  'Logged in',
  '  OpenId:  tmeet_user_1',
  '  UserName:  测试用户',
  '  AccessToken:  valid (expires at 2099-09-01 10:00:00, remaining 1d 0h 0m)',
  '  RefreshToken: valid (expires at 2099-10-01 10:00:00, remaining 30d 0h 0m)',
].join('\n');

function fixture(business: ProviderCliProcess, status = authenticated) {
  return createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile: () => async (request) => {
      if (request.args[0] === '--version')
        return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15\n' };
      if (request.args[0] === 'auth') return { exitCode: 0, stderr: '', stdout: status };
      await request.beforeSpawn?.();
      request.assertSpawn?.();
      return business(request);
    },
  });
}

test('Tencent Meeting verifies the pinned binary and online account identity in one private profile', async () => {
  const calls: string[][] = [];
  const profiles: string[] = [];
  const signal = new AbortController().signal;
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile: (selectedProfile) => {
      profiles.push(selectedProfile);
      return async (request) => {
        calls.push([...request.args]);
        assert.equal(request.signal, signal);
        return {
          exitCode: 0,
          stderr: '',
          stdout: request.args[0] === '--version' ? 'tmeet version v1.0.15\n' : authenticated,
        };
      };
    },
  });

  assert.deepEqual(await connector.inspect(profile, signal), {
    installed: true,
    version: '1.0.15',
    identity,
  });
  assert.deepEqual(calls, [['--version'], ['auth', 'status']]);
  assert.ok(profiles.every((value) => value === profile));
});

test('Tencent Meeting reads only the selected meeting, preserving guards and omitting secrets and recordings', async () => {
  const order: string[] = [];
  const reference = 'tmeet://meeting-code/806146667';
  const connector = fixture(async (request) => {
    order.push('dispatch');
    assert.deepEqual(request.args, [
      'meeting',
      'get',
      '--meeting-code',
      '806146667',
      '--format',
      'json',
    ]);
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        trace_id: 'private-trace',
        data: {
          meeting_info_list: [
            {
              meeting_id: '7567173273889276131',
              subject: '项目周会',
              meeting_code: '806146667',
              start_time: '2026-09-01T10:00:00+08:00',
              end_time: '2026-09-01T11:00:00+08:00',
              status: '会议待开始',
              password: 'never-return-password',
              host_key: 'never-return-host-key',
              participants: [{ user_name: 'unrequested-person' }],
              records: [
                {
                  record_file_id: 'not-authorized-for-minutes',
                  url: 'https://example.com/private-record',
                },
              ],
            },
          ],
        },
      }),
    };
  });
  const result = await connector.read({
    profile,
    expected: identity,
    documentUrl: reference,
    beforeRead: async () => {
      order.push('before');
    },
    assertRead: () => {
      order.push('assert');
    },
  });
  assert.deepEqual(order.slice(0, 3), ['before', 'assert', 'dispatch']);
  assert.equal(result.documentId, '806146667');
  assert.equal(result.url, reference);
  assert.equal(result.revision, 0);
  assert.equal(result.title, '项目周会');
  assert.match(result.content, /806146667/u);
  assert.match(result.content, /未向模型展示或导出录制、纪要或参会人/u);
  assert.doesNotMatch(
    result.content,
    /7567173273889276131|never-return|unrequested-person|private-record|private-trace/u,
  );
});

test('Tencent Meeting does not expose process errors from online identity verification', async () => {
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile:
      () =>
      async ({ args }) => {
        if (args[0] === '--version')
          return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
        throw new Error('secret=DO_NOT_EXPOSE');
      },
  });
  await assert.rejects(connector.inspect(profile), (error: unknown) => {
    assert.ok(error instanceof ReadConnectorError);
    assert.equal(error.code, 'authorization_failed');
    assert.doesNotMatch(error.message, /DO_NOT_EXPOSE/u);
    return true;
  });
});

test('Tencent Meeting installs only with consent, uses no-browser authorization, then verifies online identity', async () => {
  let installed = false;
  let authorized = false;
  const calls: string[][] = [];
  const progress: { phase: string; authorizationUrl?: string; expiresAt?: string }[] = [];
  const signal = new AbortController().signal;
  const authorizationUrl =
    'https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?code=official-code';
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    installer: {
      executable: '/private/space-connectors/tmeet',
      install: async (actualSignal) => {
        assert.equal(actualSignal, signal);
        calls.push(['install']);
        installed = true;
        return '/private/space-connectors/tmeet';
      },
    },
    processForProfile: () => async (request) => {
      calls.push([...request.args]);
      assert.equal(request.signal, signal);
      if (!installed) throw new ReadConnectorError('needs_install');
      if (request.args[0] === '--version')
        return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
      if (request.args[1] === 'status')
        return { exitCode: 0, stderr: '', stdout: authorized ? authenticated : 'Not logged in.' };
      assert.deepEqual(request.args, ['auth', 'login', '--no-browser']);
      assert.equal(request.timeoutMs, 330000);
      assert.equal(request.stdin, undefined);
      request.onOutput?.(
        'stdout',
        '\nPlease open the following URL in your browser to authorize\n\nauthorize url: https://meeting.tencent.com/marketplace/',
      );
      request.onOutput?.(
        'stdout',
        'tencentmeeting-cli-auth.html?code=official-code\n\nwaiting for authorization...\n\n',
      );
      request.onOutput?.('stdout', 'Login successful. Start managing your meetings using tmeet.\n');
      authorized = true;
      return { exitCode: 0, stderr: '', stdout: '' };
    },
  });
  await connector.run({
    profile,
    installCli: true,
    signal,
    onProgress: (event) => progress.push(event),
  });
  assert.deepEqual(calls, [
    ['--version'],
    ['install'],
    ['--version'],
    ['auth', 'login', '--no-browser'],
    ['--version'],
    ['auth', 'status'],
  ]);
  assert.deepEqual(
    progress.map((event) => event.phase),
    ['preparing', 'installing', 'waiting_authorization', 'verifying'],
  );
  assert.equal(progress[2].authorizationUrl, authorizationUrl);
  assert.ok(Date.parse(progress[2].expiresAt ?? '') > Date.now());
  assert.ok(connector.isAuthorizationUrl(authorizationUrl));
});

test('Tencent Meeting maps the official authorization timeout to expiry without exposing stderr', async () => {
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile:
      () =>
      async ({ args }) =>
        args[0] === '--version'
          ? { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' }
          : {
              exitCode: 1,
              stderr: "Error: authorization timeout, please try 'tmeet auth login' again\n",
              stdout: '',
            },
  });
  await assert.rejects(
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'expired' },
  );
});

test('Tencent Meeting checks session revocation after asynchronous process preparation, before business dispatch', async () => {
  let revoked = false;
  let dispatches = 0;
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile: () => async (request) => {
      if (request.args[0] === '--version')
        return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
      if (request.args[0] === 'auth') return { exitCode: 0, stderr: '', stdout: authenticated };
      await Promise.resolve();
      revoked = true;
      await request.beforeSpawn?.();
      request.assertSpawn?.();
      dispatches++;
      return { exitCode: 0, stderr: '', stdout: '{}' };
    },
  });
  await assert.rejects(
    connector.read({
      profile,
      expected: identity,
      documentUrl: 'tmeet://meeting-code/123456',
      beforeRead: async () => {},
      assertRead: () => {
        if (revoked) throw new ReadConnectorError('cancelled');
      },
    }),
    { code: 'cancelled' },
  );
  assert.equal(dispatches, 0);
});

test('Tencent Meeting rechecks the expected online identity after the asynchronous host gate', async () => {
  let status = authenticated;
  let dispatches = 0;
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    processForProfile: () => async (request) => {
      if (request.args[0] === '--version')
        return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
      if (request.args[0] === 'auth') return { exitCode: 0, stderr: '', stdout: status };
      await request.beforeSpawn?.();
      request.assertSpawn?.();
      dispatches++;
      return { exitCode: 0, stderr: '', stdout: '{}' };
    },
  });
  await assert.rejects(
    connector.read({
      profile,
      expected: identity,
      documentUrl: 'tmeet://meeting-code/123456',
      beforeRead: async () => {
        status = authenticated.replace('tmeet_user_1', 'another_user');
      },
      assertRead: () => {},
    }),
    { code: 'identity_changed' },
  );
  assert.equal(dispatches, 0);
});

test('Tencent Meeting does not install without consent and allows the still-unused profile to retry with consent', async () => {
  let installed = false;
  let installs = 0;
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    installer: {
      executable: '/private/tmeet',
      install: async () => {
        installed = true;
        installs++;
        return '/private/tmeet';
      },
    },
    processForProfile:
      () =>
      async ({ args }) => {
        if (!installed) throw new ReadConnectorError('needs_install');
        if (args[0] === '--version')
          return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
        if (args[1] === 'status') return { exitCode: 0, stderr: '', stdout: authenticated };
        return {
          exitCode: 0,
          stderr: '',
          stdout:
            'authorize url: https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?code=test\nLogin successful. Start managing your meetings using tmeet.',
        };
      },
  });
  const input = {
    profile,
    installCli: false,
    signal: new AbortController().signal,
    onProgress: () => {},
  };
  await assert.rejects(connector.run(input), { code: 'needs_install' });
  assert.equal(installs, 0);
  await connector.run({ ...input, installCli: true });
  assert.equal(installs, 1);
  await assert.rejects(connector.run({ ...input, installCli: true }), { code: 'invalid_response' });
});

test('Tencent Meeting sanitizes installer failures as installation failures', async () => {
  const connector = createTencentMeetingConnector({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
    installer: {
      executable: '/private/tmeet',
      install: async () => {
        throw new Error('private-token');
      },
    },
    processForProfile: () => async () => {
      throw new ReadConnectorError('needs_install');
    },
  });
  await assert.rejects(
    connector.run({
      profile,
      installCli: true,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'installation_failed' },
  );
});

test('Tencent Meeting rejects cached-only, malformed, duplicated, and expired status without reading', async () => {
  const statuses = [
    'Not logged in. Please use auth login.',
    'Logged in',
    authenticated.replace('  UserName:  测试用户\n', ''),
    authenticated.replace('测试用户', '  '),
    authenticated.replace('测试用户', 'x'.repeat(161)),
    authenticated.replace('tmeet_user_1', 'master.key'),
    authenticated.replace('AccessToken:  valid', 'AccessToken:  expired'),
    authenticated.replace('RefreshToken: valid', 'RefreshToken: expired'),
    `${authenticated}\n  OpenId:  another_user`,
  ];
  for (const status of statuses) {
    const connector = fixture(async () => {
      assert.fail('unverified business read');
    }, status);
    const inspected = await connector.inspect(profile);
    assert.equal(inspected.installed, true);
    assert.equal(inspected.identity, undefined);
    await assert.rejects(
      connector.read({
        profile,
        expected: identity,
        documentUrl: 'tmeet://meeting-code/123456',
        beforeRead: async () => {
          assert.fail('unverified host gate');
        },
        assertRead: () => {},
      }),
      { code: 'authorization_failed' },
    );
  }
});

test('Tencent Meeting rejects other accounts and authority namespaces before a host gate or business call', async () => {
  for (const expected of [
    { ...identity, subjectId: 'other_user' },
    { ...identity, authorityId: 'other-provider' },
  ]) {
    await assert.rejects(
      fixture(async () => {
        assert.fail('identity mismatch business');
      }).read({
        profile,
        expected,
        documentUrl: 'tmeet://meeting-code/123456',
        beforeRead: async () => {
          assert.fail('identity mismatch gate');
        },
        assertRead: () => {},
      }),
      { code: 'identity_changed' },
    );
  }
});

test('Tencent Meeting accepts only canonical 6-15 digit meeting-code references, never links or CLI arguments', async () => {
  const connector = fixture(async () => {
    assert.fail('invalid resource business');
  });
  for (const reference of [
    '',
    'https://meeting.tencent.com/dm/123',
    'tmeet://meeting/123456',
    'tmeet://meeting-code/12345',
    'tmeet://meeting-code/1234567890123456',
    'tmeet://meeting-code/123456?code=456',
    'tmeet://meeting-code/123456#fragment',
    'tmeet://meeting-code/%31%32%33%34%35%36',
    'tmeet://meeting-code/../123456',
    'tmeet://meeting-code/123456/',
    'tmeet://meeting-code/--debug',
    'tmeet://meeting-code/123456\n',
    'TMEET://meeting-code/123456',
  ]) {
    assert.equal(connector.acceptsResource(reference), false);
    await assert.rejects(
      connector.read({
        profile,
        expected: identity,
        documentUrl: reference,
        beforeRead: async () => {},
        assertRead: () => {},
      }),
      { code: 'invalid_resource' },
    );
  }
  assert.equal(connector.acceptsResource('tmeet://meeting-code/806146667'), true);
});

test('Tencent Meeting rejects unbounded, mismatched and malformed business data', async () => {
  const meeting = { meeting_id: 'internal-secret-id', meeting_code: '123456', subject: '会议' };
  const outputs = [
    'not-json',
    'null',
    '[]',
    '{}',
    'x'.repeat(2 * 1024 * 1024 + 1),
    JSON.stringify({ data: 'string-data' }),
    JSON.stringify({ data: { meeting_info_list: [] } }),
    JSON.stringify({ data: { meeting_info_list: [meeting, meeting] } }),
    JSON.stringify({ error: {}, data: { meeting_info_list: [meeting] } }),
    ...[
      null,
      { ...meeting, meeting_code: '654321' },
      { ...meeting, meeting_code: 123456 },
      { ...meeting, meeting_code: undefined },
      { ...meeting, subject: '' },
      { ...meeting, subject: 'x'.repeat(301) },
      { ...meeting, subject: 'line\nbreak' },
      { ...meeting, status: 1 },
      { ...meeting, meeting_code: null },
      { ...meeting, start_time: 'x'.repeat(101) },
    ].map((value) => JSON.stringify({ data: { meeting_info_list: [value] } })),
  ];
  for (const stdout of outputs) {
    await assert.rejects(
      fixture(async () => ({ stdout, stderr: 'private-stderr', exitCode: 0 })).read({
        profile,
        expected: identity,
        documentUrl: 'tmeet://meeting-code/123456',
        beforeRead: async () => {},
        assertRead: () => {},
      }),
      { code: 'invalid_response' },
    );
  }
});

test('Tencent Meeting returns only fixed errors for failed business processes', async () => {
  for (const business of [
    async () => ({ stdout: 'token=private', stderr: 'credential=private', exitCode: 1 }),
    async () => {
      throw new Error('token=private');
    },
  ]) {
    await assert.rejects(
      fixture(business).read({
        profile,
        expected: identity,
        documentUrl: 'tmeet://meeting-code/123456',
        beforeRead: async () => {},
        assertRead: () => {},
      }),
      (error: unknown) => {
        assert.ok(error instanceof ReadConnectorError);
        assert.equal(error.code, 'read_failed');
        assert.doesNotMatch(error.message, /private/u);
        return true;
      },
    );
  }
});

test('Tencent Meeting refuses unsupported platforms and non-generated profiles before spawning', async () => {
  const base = {
    root: '/private/space-connectors',
    processForProfile: () => async () => {
      assert.fail('must not spawn');
    },
  };
  for (const [platform, arch] of [
    ['win32', 'x64'],
    ['linux', 'arm64'],
    ['darwin', 'x64'],
  ] as const) {
    const connector = createTencentMeetingConnector({ ...base, platform, arch });
    await assert.rejects(connector.inspect(profile), { code: 'unsupported_platform' });
    await assert.rejects(
      connector.run({
        profile,
        installCli: true,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      { code: 'unsupported_platform' },
    );
  }
  const connector = createTencentMeetingConnector({ ...base, platform: 'darwin', arch: 'arm64' });
  for (const value of ['default', '../../unsafe', 'space-2dc58f91-02b9-1439-aef1-4381273c9dd8'])
    await assert.rejects(connector.inspect(value), { code: 'invalid_response' });
});

test('Tencent Meeting rejects version drift and never interprets incompatible output as authorization', async () => {
  for (const response of [
    { exitCode: 1, stdout: 'tmeet version v1.0.15', stderr: '' },
    { exitCode: 0, stdout: 'tmeet version v1.0.16', stderr: '' },
  ]) {
    const connector = createTencentMeetingConnector({
      root: '/private/space-connectors',
      platform: 'darwin',
      arch: 'arm64',
      processForProfile: () => async (request) => {
        assert.deepEqual(request.args, ['--version']);
        return response;
      },
    });
    assert.deepEqual(await connector.inspect(profile), {
      installed: true,
      reason: '连接组件版本无法验证，请重新安装。',
    });
    await assert.rejects(
      connector.run({
        profile,
        installCli: false,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      { code: 'needs_install' },
    );
  }
});

test('Tencent Meeting ignores late success after cancellation, never emits verifying, and propagates process expiry', async () => {
  for (const mode of ['pre-cancelled', 'late-cancelled', 'expired'] as const) {
    const controller = new AbortController();
    const phases: string[] = [];
    if (mode === 'pre-cancelled') controller.abort();
    const connector = createTencentMeetingConnector({
      root: '/private/space-connectors',
      platform: 'darwin',
      arch: 'arm64',
      processForProfile:
        () =>
        async ({ args }) => {
          if (mode === 'pre-cancelled') assert.fail('pre-cancelled process');
          if (args[0] === '--version')
            return { exitCode: 0, stderr: '', stdout: 'tmeet version v1.0.15' };
          if (mode === 'expired') throw new ReadConnectorError('expired');
          controller.abort();
          return {
            exitCode: 0,
            stderr: '',
            stdout:
              'authorize url: https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?code=test\nLogin successful. Start managing your meetings using tmeet.',
          };
        },
    });
    await assert.rejects(
      connector.run({
        profile,
        installCli: false,
        signal: controller.signal,
        onProgress: (event) => phases.push(event.phase),
      }),
      { code: mode === 'expired' ? 'expired' : 'cancelled' },
    );
    assert.ok(!phases.includes('verifying'));
  }
});

test('Tencent Meeting only opens exact official authorization URLs and requires a complete login handshake', async () => {
  const good = 'https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?code=test';
  const connector = fixture(async () => {
    assert.fail('not a business operation');
  });
  for (const candidate of [
    undefined,
    123,
    '',
    `${good}&redirect_uri=https://evil.example`,
    `${good}&code=other`,
    `${good}#fragment`,
    good.replace('https:', 'http:'),
    good.replace('meeting.tencent.com', 'meeting.tencent.com.evil.example'),
    good.replace('meeting.tencent.com/', 'meeting.tencent.com@evil.example/'),
    good.replace('?code=test', '?code='),
    good.replace('?code=test', '?code=%0a'),
    good.replace('marketplace/', 'marketplace/../marketplace/'),
    good.replace('test', 'x'.repeat(2048)),
  ])
    assert.equal(connector.isAuthorizationUrl(candidate), false);
  for (const stdout of [
    'Login successful. Start managing your meetings using tmeet.',
    `authorize url: ${good}`,
    `authorize url: ${good}\nauthorize url: ${good}`,
    `authorize url: ${good.replace('https:', 'http:')}\nLogin successful. Start managing your meetings using tmeet.`,
    `authorize url: ${good}\nLogin successful. Start managing your meetings using tmeet.\nLogin successful. Start managing your meetings using tmeet.`,
    'x'.repeat(16385),
  ]) {
    const invalid = createTencentMeetingConnector({
      root: '/private/space-connectors',
      platform: 'darwin',
      arch: 'arm64',
      processForProfile:
        () =>
        async ({ args }) => ({
          exitCode: 0,
          stderr: '',
          stdout: args[0] === '--version' ? 'tmeet version v1.0.15' : stdout,
        }),
    });
    await assert.rejects(
      invalid.run({
        profile,
        installCli: false,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      { code: 'invalid_response' },
    );
  }
});
