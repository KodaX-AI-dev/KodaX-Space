import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeishuAuthProcess, FeishuOnboardingError } from './feishu-auth-process.js';

test('onboarding streams output before exit and removes inherited credential/runtime overrides', async () => {
  const seen: string[] = [];
  const run = createFeishuAuthProcess({
    executable: process.execPath,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LARKSUITE_CLI_TOKEN: 'secret',
      NODE_OPTIONS: '--bad',
      ELECTRON_RUN_AS_NODE: '1',
    },
  });
  const result = await run({
    args: [
      '-e',
      'process.stdout.write("first\\n");process.stderr.write(JSON.stringify(Object.keys(process.env)));',
    ],
    signal: new AbortController().signal,
    timeoutMs: 2000,
    onOutput: (stream, chunk) => seen.push(`${stream}:${chunk}`),
  });
  assert.equal(result.exitCode, 0);
  assert.ok(seen.some((line) => line.includes('stdout:first')));
  assert.doesNotMatch(seen.join(''), /LARKSUITE_CLI_TOKEN|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/u);
  assert.match(seen.join(''), /LARKSUITE_CLI_NO_UPDATE_NOTIFIER/u);
});

test('cancel, deadlines and output limits stop an onboarding process and never expose raw errors', async () => {
  for (const expected of ['cancelled', 'expired', 'invalid_response'] as const) {
    const controller = new AbortController();
    const run = createFeishuAuthProcess({ executable: process.execPath, maxOutputBytes: 20 });
    await assert.rejects(
      run({
        args: [
          '-e',
          `process.stdout.write(${JSON.stringify(expected === 'invalid_response' ? 'SECRET'.repeat(20) : 'ready')});setTimeout(()=>process.exit(0),300);`,
        ],
        timeoutMs: expected === 'expired' ? 30 : 2000,
        signal: controller.signal,
        onOutput: () => {
          if (expected === 'cancelled') controller.abort();
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof FeishuOnboardingError);
        assert.equal(error.code, expected);
        assert.doesNotMatch(String(error), /SECRET/u);
        return true;
      },
    );
  }
});
