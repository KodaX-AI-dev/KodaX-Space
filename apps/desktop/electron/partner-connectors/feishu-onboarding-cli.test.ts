import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFeishuOnboardingCli,
  FeishuOnboardingError,
  isFeishuOnboardingAuthorizationUrl,
} from './feishu-onboarding-cli.js';
import { FeishuCliError } from './feishu-cli-runner.js';
import type { FeishuAuthProcessInput } from './feishu-auth-process.js';

const profile = 'space-12345678-1234-4234-8234-123456789abc';
const registrationUrl =
  'https://open.feishu.cn/page/cli?user_code=CODE&lpv=1.0.92&ocv=1.0.92&from=cli';
const authorizationUrl =
  'https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=FLOW&user_code=CODE';
const granted = [
  'docx:document:readonly',
  'docx:document:create',
  'docx:document:write_only',
  'base:app:create',
  'base:table:read',
  'base:table:create',
  'base:table:update',
  'base:table:delete',
  'offline_access',
];

test('public onboarding runs app creation then exact document and Base authorization and emits only safe progress', async () => {
  const calls: readonly string[][] = [];
  const commands: string[][] = [...calls];
  const events: unknown[] = [];
  let configured = false;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-onboarding-test',
    env: {},
    runnerFactory:
      () =>
      async ({ args }) => ({
        stdout: args.includes('--version')
          ? 'lark-cli version 1.0.92'
          : JSON.stringify(
              configured ? [{ name: profile, appId: 'cli_fixture', brand: 'feishu' }] : [],
            ),
        stderr: '',
        exitCode: 0,
      }),
    authProcessFactory: () => async (input: FeishuAuthProcessInput) => {
      commands.push([...input.args]);
      if (input.args.includes('init')) {
        configured = true;
        input.onOutput('stderr', `QR and private diagnostic SECRET\n  ${registrationUrl}\n`);
        input.onOutput(
          'stdout',
          JSON.stringify({ appId: 'cli_fixture', appSecret: '****', brand: 'feishu' }) + '\n',
        );
      } else {
        input.onOutput(
          'stdout',
          JSON.stringify({
            event: 'device_authorization',
            verification_uri_complete: authorizationUrl,
            expires_in: 600,
          }) + '\n',
        );
        input.onOutput(
          'stdout',
          JSON.stringify({
            event: 'authorization_complete',
            user_open_id: 'ou_private',
            granted,
            missing: [],
          }) + '\n',
        );
      }
      return { exitCode: 0 };
    },
  });
  await adapter.run({
    profile,
    installCli: false,
    signal: new AbortController().signal,
    onProgress: (event) => events.push(event),
  });
  assert.deepEqual(commands, [
    ['config', 'init', '--new', '--brand', 'feishu', '--name', profile],
    [
      `--profile=${profile}`,
      'auth',
      'login',
      '--json',
      '--scope',
      'docx:document:readonly docx:document:create docx:document:write_only base:app:create base:table:read base:table:create base:table:update base:table:delete',
    ],
  ]);
  assert.deepEqual(
    events.map((value) => (value as { phase: string }).phase),
    ['preparing', 'waiting_app', 'waiting_authorization', 'verifying'],
  );
  assert.doesNotMatch(JSON.stringify(events), /SECRET|ou_private|cli_fixture|appSecret/u);
});

test('a missing or incompatible CLI, existing profile and invalid profile never dispatch account changes', async () => {
  for (const reason of ['missing', 'version', 'collision', 'invalid'] as const) {
    let mutations = 0;
    const adapter = createFeishuOnboardingCli({
      root: '/tmp/space-onboarding-test',
      env: {},
      runnerFactory:
        () =>
        async ({ args }) => {
          if (reason === 'missing') throw new Error('SECRET path');
          return {
            exitCode: 0,
            stderr: '',
            stdout: args.includes('--version')
              ? `lark-cli version ${reason === 'version' ? '1.0.91' : '1.0.92'}`
              : JSON.stringify(reason === 'collision' ? [{ name: profile, brand: 'lark' }] : []),
          };
        },
      authProcessFactory: () => async () => {
        mutations++;
        return { exitCode: 1 };
      },
    });
    await assert.rejects(
      adapter.run({
        profile: reason === 'invalid' ? 'default' : profile,
        installCli: false,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      (error: unknown) =>
        error instanceof FeishuOnboardingError &&
        error.code ===
          (reason === 'missing' || reason === 'version' ? 'needs_install' : 'invalid_response'),
    );
    assert.equal(mutations, 0);
  }
});

test('explicit installation consent selects the private CLI; an incompatible trusted override is never silently bypassed', async () => {
  for (const override of [false, true]) {
    let installs = 0;
    let authCalls = 0;
    const privatePath = '/tmp/space-private-cli/lark-cli';
    const adapter = createFeishuOnboardingCli({
      root: '/tmp/space-private-cli',
      env: override ? { KODAX_SPACE_FEISHU_CLI: '/trusted/old-cli' } : {},
      installer: {
        executable: privatePath,
        install: async () => {
          installs++;
          return privatePath;
        },
      },
      runnerFactory:
        (executable) =>
        async ({ args }) => ({
          exitCode: 0,
          stderr: '',
          stdout: args.includes('--version')
            ? `lark-cli version ${executable === privatePath ? '1.0.92' : '1.0.91'}`
            : '[]',
        }),
      authProcessFactory: () => async () => {
        authCalls++;
        return { exitCode: 1 };
      },
    });
    await assert.rejects(
      adapter.run({
        profile,
        installCli: true,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      (error: unknown) =>
        error instanceof FeishuOnboardingError && error.code === 'authorization_failed',
    );
    assert.equal(installs, override ? 0 : 1);
    assert.equal(authCalls, override ? 0 : 1);
  }
});

test('a host-bundled archive ignores PATH and environment overrides and prepares only the private CLI', async () => {
  const bundledArchive = '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz';
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  const executables: string[] = [];
  let networkInstalls = 0;
  let bundledInstalls = 0;
  let privateReady = false;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive,
    env: { KODAX_SPACE_FEISHU_CLI: '/trusted-but-external/lark-cli' },
    installer: {
      executable: privateExecutable,
      install: async () => {
        networkInstalls++;
        return privateExecutable;
      },
      installBundled: async (archive) => {
        assert.equal(archive, bundledArchive);
        bundledInstalls++;
        privateReady = true;
        return privateExecutable;
      },
    },
    runnerFactory:
      (executable) =>
      async ({ args }) => {
        executables.push(executable);
        return {
          exitCode: 0,
          stderr: '',
          stdout: args.includes('--version')
            ? executable === privateExecutable && privateReady
              ? 'lark-cli version 1.0.92'
              : executable === privateExecutable
                ? 'lark-cli version 0.0.0'
                : 'lark-cli version 1.0.92'
            : '[]',
        };
      },
    authProcessFactory: (executable) => async () => {
      executables.push(executable);
      return { exitCode: 1 };
    },
  });
  await assert.rejects(
    adapter.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'authorization_failed' },
  );
  assert.equal(networkInstalls, 0);
  assert.equal(bundledInstalls, 1);
  assert.ok(executables.length > 0);
  assert.ok(executables.every((executable) => executable === privateExecutable));
});

test('a bundled runner prepares the managed component before inspecting an existing profile', async () => {
  const bundledArchive = '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz';
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  const executables: string[] = [];
  let bundledInstalls = 0;
  let privateReady = false;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive,
    env: { PATH: '/untrusted/bin' },
    installer: {
      executable: privateExecutable,
      install: async () => {
        throw new Error('network install must remain unused');
      },
      installBundled: async (archive) => {
        assert.equal(archive, bundledArchive);
        bundledInstalls++;
        privateReady = true;
        return privateExecutable;
      },
    },
    runnerFactory:
      (executable) =>
      async ({ args }) => {
        executables.push(executable);
        if (!privateReady) throw new FeishuCliError('cli_missing', false);
        return {
          exitCode: 0,
          stderr: '',
          stdout: args.includes('--version') ? 'lark-cli version 1.0.92' : '[]',
        };
      },
  });
  const request = { args: ['profile', 'list'], signal: new AbortController().signal };
  assert.equal((await adapter.runner(request)).stdout, '[]');
  privateReady = false;
  assert.equal((await adapter.runner(request)).stdout, '[]');
  assert.equal(bundledInstalls, 2);
  assert.deepEqual(executables, [privateExecutable, privateExecutable, privateExecutable]);
});

test('an incompatible managed version probe repairs locally and retries only that safe probe', async () => {
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  let bundledInstalls = 0;
  let version = '0.0.0';
  let commands = 0;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive: '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz',
    env: {},
    installer: {
      executable: privateExecutable,
      install: async () => privateExecutable,
      installBundled: async () => {
        bundledInstalls++;
        version = '1.0.92';
        return privateExecutable;
      },
    },
    runnerFactory:
      () =>
      async ({ args }) => {
        commands++;
        return {
          exitCode: 0,
          stderr: '',
          stdout: args.includes('--version') ? `lark-cli version ${version}` : '[]',
        };
      },
  });
  const request = { args: ['--version'], signal: new AbortController().signal };
  assert.equal((await adapter.runner(request)).stdout, 'lark-cli version 1.0.92');
  version = '0.0.0';
  assert.equal((await adapter.runner(request)).stdout, 'lark-cli version 1.0.92');
  assert.equal(bundledInstalls, 2);
  assert.equal(commands, 3);
});

test('a later onboarding run repairs an incompatible cached managed component before auth', async () => {
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  let bundledInstalls = 0;
  let version = '0.0.0';
  let authCalls = 0;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive: '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz',
    env: {},
    installer: {
      executable: privateExecutable,
      install: async () => privateExecutable,
      installBundled: async () => {
        bundledInstalls++;
        version = '1.0.92';
        return privateExecutable;
      },
    },
    runnerFactory:
      () =>
      async ({ args }) => ({
        exitCode: 0,
        stderr: '',
        stdout: args.includes('--version') ? `lark-cli version ${version}` : '[]',
      }),
    authProcessFactory: () => async () => {
      authCalls++;
      return { exitCode: 1 };
    },
  });
  assert.equal(
    (
      await adapter.runner({
        args: ['--version'],
        signal: new AbortController().signal,
      })
    ).stdout,
    'lark-cli version 1.0.92',
  );
  version = '0.0.0';
  await assert.rejects(
    adapter.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'authorization_failed' },
  );
  assert.equal(bundledInstalls, 2);
  assert.equal(authCalls, 1);
});

test('cancelling bundled preparation aborts that batch and the next runner retries cleanly', async () => {
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  let attempts = 0;
  let privateReady = false;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive: '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz',
    env: {},
    installer: {
      executable: privateExecutable,
      install: async () => privateExecutable,
      installBundled: async (_archive, signal) => {
        attempts++;
        if (attempts > 1) {
          privateReady = true;
          return privateExecutable;
        }
        return new Promise<string>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new FeishuOnboardingError('cancelled')), {
            once: true,
          }),
        );
      },
    },
    runnerFactory: () => async () => {
      if (!privateReady) throw new Error('managed component was not prepared');
      return { exitCode: 0, stderr: '', stdout: '[]' };
    },
  });
  const controller = new AbortController();
  const cancelled = adapter.runner({ args: ['profile', 'list'], signal: controller.signal });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(cancelled, { code: 'cancelled' });
  assert.equal(
    (
      await adapter.runner({
        args: ['profile', 'list'],
        signal: new AbortController().signal,
      })
    ).stdout,
    '[]',
  );
  assert.equal(attempts, 2);
});

test('one cancelled waiter does not abort bundled preparation still needed by another runner', async () => {
  const privateExecutable = '/tmp/space-private-cli/lark-cli';
  let attempts = 0;
  let installSignal: AbortSignal | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-private-cli',
    bundledArchive: '/Applications/KodaX Space/resources/managed-components/lark-cli.tar.gz',
    env: {},
    installer: {
      executable: privateExecutable,
      install: async () => privateExecutable,
      installBundled: async (_archive, signal) => {
        attempts++;
        installSignal = signal;
        await held;
        if (signal.aborted) throw new FeishuOnboardingError('cancelled');
        return privateExecutable;
      },
    },
    runnerFactory: () => async () => ({ exitCode: 0, stderr: '', stdout: '[]' }),
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = adapter.runner({ args: ['profile', 'list'], signal: firstController.signal });
  const second = adapter.runner({ args: ['profile', 'list'], signal: secondController.signal });
  await new Promise<void>((resolve) => setImmediate(resolve));
  firstController.abort();
  await assert.rejects(first, { code: 'cancelled' });
  assert.equal(installSignal?.aborted, false);
  release();
  assert.equal((await second).stdout, '[]');
  assert.equal(attempts, 1);
});

test('only canonical official onboarding links without redirect injection may be opened', () => {
  assert.ok(isFeishuOnboardingAuthorizationUrl(registrationUrl));
  assert.ok(isFeishuOnboardingAuthorizationUrl(authorizationUrl));
  for (const value of [
    'https://accounts.feishu.cn.evil.example/oauth/v1/device/verify?user_code=X',
    'https://user:SECRET@accounts.feishu.cn/oauth/v1/device/verify?user_code=X',
    'http://accounts.feishu.cn/oauth/v1/device/verify?user_code=X',
    'https://accounts.feishu.cn:444/oauth/v1/device/verify?user_code=X',
    `${authorizationUrl}&redirect_uri=https://evil.example`,
    `${authorizationUrl}&flow_id=SECOND`,
    `${authorizationUrl}#fragment`,
    'https://accounts.feishu.cn/oauth/v1/device/verify?user_code=%0aSECRET',
    'https://accounts.feishu.cn/unrelated?user_code=X',
  ])
    assert.equal(isFeishuOnboardingAuthorizationUrl(value), false, value);
});

test('missing permissions, rejected/expired auth, malformed links and cancellation never reach verification', async () => {
  for (const scenario of ['permissions', 'denied', 'expired', 'bad_link', 'cancel'] as const) {
    const phases: string[] = [];
    const controller = new AbortController();
    let configured = false;
    const adapter = createFeishuOnboardingCli({
      root: '/tmp/space-onboarding-test',
      env: {},
      runnerFactory:
        () =>
        async ({ args }) => ({
          stdout: args.includes('--version')
            ? 'lark-cli version 1.0.92'
            : JSON.stringify(
                configured ? [{ name: profile, appId: 'cli_fixture', brand: 'feishu' }] : [],
              ),
          stderr: '',
          exitCode: 0,
        }),
      authProcessFactory: () => async (input) => {
        if (input.args.includes('init')) {
          configured = true;
          input.onOutput('stderr', registrationUrl + '\n');
          input.onOutput(
            'stdout',
            JSON.stringify({ appId: 'cli_fixture', appSecret: '****', brand: 'feishu' }),
          );
        } else {
          const url = scenario === 'bad_link' ? 'https://evil.example/SECRET' : authorizationUrl;
          const first = JSON.stringify({
            event: 'device_authorization',
            verification_uri_complete: url,
            expires_in: 600,
          });
          input.onOutput('stdout', first.slice(0, 25));
          input.onOutput('stdout', first.slice(25) + '\n');
          if (scenario === 'cancel') controller.abort();
          const last =
            scenario === 'denied' || scenario === 'expired'
              ? {
                  event: 'authorization_failed',
                  error:
                    scenario === 'expired'
                      ? 'Authorization timed out, please try again'
                      : 'SECRET denied details',
                }
              : {
                  event: 'authorization_complete',
                  granted: scenario === 'permissions' ? [] : granted,
                  missing: scenario === 'permissions' ? ['docx:document:create'] : [],
                };
          input.onOutput('stdout', JSON.stringify(last));
        }
        return { exitCode: 0 };
      },
    });
    const code = (
      {
        permissions: 'missing_permissions',
        denied: 'authorization_failed',
        expired: 'expired',
        bad_link: 'invalid_response',
        cancel: 'cancelled',
      } as const
    )[scenario];
    await assert.rejects(
      adapter.run({
        profile,
        installCli: false,
        signal: controller.signal,
        onProgress: (event) => phases.push(event.phase),
      }),
      (error: unknown) =>
        error instanceof FeishuOnboardingError &&
        error.code === code &&
        !String(error).includes('SECRET'),
    );
    assert.ok(!phases.includes('verifying'));
  }
});

test('a profile changed by an external CLI after app creation cannot be silently authorized', async () => {
  let configured = false;
  let userLogins = 0;
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-onboarding-test',
    env: {},
    runnerFactory:
      () =>
      async ({ args }) => ({
        exitCode: 0,
        stderr: '',
        stdout: args.includes('--version')
          ? 'lark-cli version 1.0.92'
          : JSON.stringify(
              configured ? [{ name: profile, appId: 'cli_other', brand: 'feishu' }] : [],
            ),
      }),
    authProcessFactory: () => async (input) => {
      if (input.args.includes('init')) {
        input.onOutput('stderr', registrationUrl + '\n');
        input.onOutput(
          'stdout',
          JSON.stringify({ appId: 'cli_fixture', appSecret: '****', brand: 'feishu' }),
        );
        configured = true;
      } else userLogins++;
      return { exitCode: 0 };
    },
  });
  await assert.rejects(
    adapter.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'invalid_response' },
  );
  assert.equal(userLogins, 0);
});

test('unexpected process failures are sanitized at the public run boundary', async () => {
  const adapter = createFeishuOnboardingCli({
    root: '/tmp/space-onboarding-test',
    env: {},
    runnerFactory:
      () =>
      async ({ args }) => ({
        exitCode: 0,
        stderr: '',
        stdout: args.includes('--version') ? 'lark-cli version 1.0.92' : '[]',
      }),
    authProcessFactory: () => async () => {
      throw new Error('SECRET argv and token');
    },
  });
  await assert.rejects(
    adapter.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    (error: unknown) =>
      error instanceof FeishuOnboardingError &&
      error.code === 'authorization_failed' &&
      !String(error).includes('SECRET'),
  );
});
