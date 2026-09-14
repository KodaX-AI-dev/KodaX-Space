import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderCliProcess } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

test('provider process confines cwd, arguments, stdin and environment to the trusted host inputs', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-process-')));
  const cwd = path.join(root, 'work');
  const run = createProviderCliProcess({
    executable: process.execPath,
    cwd,
    env: { ...process.env, NODE_OPTIONS: '--invalid', WECOM_CLI_ACCESS_TOKEN: 'SECRET' },
    overrides: { WECOM_CLI_CONFIG_DIR: path.join(root, 'account') },
  });
  try {
    const result = await run({
      args: [
        '-e',
        'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({arg:process.argv[1],s,cwd:process.cwd(),keys:Object.keys(process.env)})));',
        'x;$(touch /not-run)',
      ],
      stdin: 'body',
    });
    const value = JSON.parse(result.stdout) as {
      arg: string;
      s: string;
      cwd: string;
      keys: string[];
    };
    assert.equal(result.exitCode, 0);
    assert.equal(value.arg, 'x;$(touch /not-run)');
    assert.equal(value.s, 'body');
    assert.ok(value.cwd.endsWith('/work'));
    assert.ok(value.keys.includes('WECOM_CLI_CONFIG_DIR'));
    assert.ok(!value.keys.includes('WECOM_CLI_ACCESS_TOKEN'));
    assert.ok(!value.keys.includes('NODE_OPTIONS'));
    assert.equal(await readFile(path.join(cwd, '.env'), 'utf8'), '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const code = (expected: string) => (error: unknown) =>
  error instanceof ReadConnectorError && error.code === expected;
test('provider process checks the host session after preparing cwd and immediately before spawn', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-gates-')));
  const cwd = path.join(root, 'work');
  const run = createProviderCliProcess({ executable: process.execPath, cwd });
  let checked = false;
  try {
    await assert.rejects(
      run({
        args: ['-e', 'process.exit(42)'],
        beforeSpawn: async () => {
          assert.equal(await readFile(path.join(cwd, '.env'), 'utf8'), '');
          checked = true;
        },
        assertSpawn: () => {
          assert.equal(checked, true);
          throw new ReadConnectorError('cancelled');
        },
      }),
      code('cancelled'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider process bounds stdout, stderr, time, callback failures and cancellation without exposing child text', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-bounds-')));
  const run = createProviderCliProcess({
    executable: process.execPath,
    cwd: root,
    maxOutputBytes: 80,
  });
  try {
    await assert.rejects(
      run({ args: ['-e', 'process.stdout.write("SECRET".repeat(30))'] }),
      code('invalid_response'),
    );
    await assert.rejects(
      run({ args: ['-e', 'process.stderr.write("SECRET".repeat(30))'] }),
      code('invalid_response'),
    );
    await assert.rejects(
      run({ args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 30 }),
      code('expired'),
    );
    await assert.rejects(
      run({
        args: ['-e', 'process.stdout.write("SECRET")'],
        onOutput: () => {
          throw new Error('SECRET');
        },
      }),
      code('invalid_response'),
    );
    const controller = new AbortController();
    await assert.rejects(
      run({
        args: ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'],
        signal: controller.signal,
        onOutput: () => controller.abort(),
      }),
      code('cancelled'),
    );
    await assert.rejects(run({ args: [], signal: AbortSignal.abort() }), code('cancelled'));
    const unicode = await run({
      args: [
        '-e',
        'const b=Buffer.from("汉字");process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),5)',
      ],
    });
    assert.equal(unicode.stdout, '汉字');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider process refuses symlink ancestors, inherited dotenv files, invalid args and missing executables', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-invalid-')));
  try {
    await mkdir(path.join(root, 'target'));
    await symlink(path.join(root, 'target'), path.join(root, 'linked'));
    await assert.rejects(
      createProviderCliProcess({
        executable: process.execPath,
        cwd: path.join(root, 'linked', 'child'),
      })({ args: [] }),
      code('invalid_response'),
    );
    await writeFile(path.join(root, '.env'), 'SECRET=malicious');
    await assert.rejects(
      createProviderCliProcess({ executable: process.execPath, cwd: root })({ args: [] }),
      code('invalid_response'),
    );
    const run = createProviderCliProcess({
      executable: process.execPath,
      cwd: path.join(root, 'safe'),
    });
    await assert.rejects(run({ args: ['bad\0arg'] }), code('invalid_response'));
    await assert.rejects(run({ args: [], timeoutMs: 0 }), code('invalid_response'));
    await assert.rejects(
      createProviderCliProcess({
        executable: path.join(root, 'missing'),
        cwd: path.join(root, 'safe'),
      })({ args: [] }),
      code('read_failed'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider process refuses a private working directory made accessible to other users', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-mode-')));
  try {
    await chmod(root, 0o755);
    await assert.rejects(
      createProviderCliProcess({ executable: process.execPath, cwd: root })({
        args: ['-e', 'process.exit(0)'],
      }),
      code('invalid_response'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
