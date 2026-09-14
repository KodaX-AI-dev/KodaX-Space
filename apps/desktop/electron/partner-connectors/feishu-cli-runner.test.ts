import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { createFeishuCliRunner, FeishuCliError } from './feishu-cli-runner.js';

test('working directory setup preserves immediate dispatch after the host permission guard', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath });
  const args = ['-e', 'process.stdout.write("approved request")'];
  const pending = run({ args });
  args[1] = 'process.stdout.write("changed after dispatch")';
  assert.equal((await pending).stdout, 'approved request');
});

test('each CLI invocation gets an empty private directory that is removed before completion', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath });
  const invoke = () =>
    run({
      args: [
        '-e',
        'const fs=require("node:fs");process.stdout.write(JSON.stringify({cwd:process.cwd(),empty:fs.readdirSync(".").length===0,home:process.env.HOME,profile:process.argv[1],mode:fs.statSync(".").mode&511}));',
        '--',
        '--profile=space-fixture',
      ],
    });
  const results = await Promise.all([invoke(), invoke()]);
  const shared = await realpath(tmpdir());
  const directories = new Set<string>();
  for (const result of results) {
    const value = JSON.parse(result.stdout) as {
      cwd: string;
      empty: boolean;
      home?: string;
      profile: string;
      mode: number;
    };
    assert.notEqual(value.cwd, shared);
    assert.equal(value.empty, true);
    assert.equal(value.home, process.env.HOME);
    assert.equal(value.profile, '--profile=space-fixture');
    if (process.platform !== 'win32') assert.equal(value.mode, 0o700);
    assert.equal(existsSync(value.cwd), false);
    directories.add(value.cwd);
  }
  assert.equal(directories.size, 2);
});

test('CLI working files are removed after success, failure, timeout, output limit, and live cancellation', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'feishu-runner-fixture-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const mode of ['success', 'failure', 'timeout', 'output_limit', 'cancelled']) {
    const report = join(fixture, `${mode}.json`);
    const controller = new AbortController();
    const run = createFeishuCliRunner({
      executable: process.execPath,
      timeoutMs: 1500,
      maxOutputBytes: 64,
    });
    const pending = run({
      args: [
        '-e',
        'const fs=require("node:fs");fs.mkdirSync("resources");fs.writeFileSync("resources/canary.html","PRIVATE_CANARY");fs.writeFileSync(process.argv[1],JSON.stringify({cwd:process.cwd(),pid:process.pid}));switch(process.argv[2]){case "success":process.exit(0);break;case "failure":process.exit(1);break;case "output_limit":process.stdout.write("x".repeat(1024));default:setInterval(()=>{},1000);}',
        '--',
        report,
        mode,
      ],
      signal: controller.signal,
    }).then(
      (value) => value,
      (error: unknown) => error,
    );
    if (mode === 'cancelled') {
      for (let attempt = 0; attempt < 200 && !existsSync(report); attempt++) await setTimeout(5);
      assert.ok(existsSync(report), 'the cancellation fixture must start');
      controller.abort();
    }
    const result = await pending;
    if (mode === 'success' || mode === 'failure') {
      assert.ok(result && typeof result === 'object' && 'exitCode' in result);
      assert.equal(result.exitCode, mode === 'success' ? 0 : 1);
    } else {
      assert.ok(result instanceof FeishuCliError);
      assert.equal(result.code, mode);
      assert.equal(result.dispatched, true);
    }
    const { cwd, pid } = JSON.parse(await readFile(report, 'utf8')) as {
      cwd: string;
      pid: number;
    };
    assert.equal(existsSync(cwd), false, `${mode} must clean up working files before returning`);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  }
});

test('a caller aborts a live verification subprocess without leaking output or leaving it active', async () => {
  const controller = new AbortController();
  const run = createFeishuCliRunner({ executable: process.execPath });
  const pending = run({
    args: ['-e', 'process.stderr.write("SECRET");setTimeout(()=>process.exit(0),250);'],
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof FeishuCliError &&
      error.code === 'cancelled' &&
      !String(error).includes('SECRET'),
  );
});

test('subprocess runner preserves argument boundaries and stdin without inheriting credential or runtime overrides', async () => {
  const run = createFeishuCliRunner({
    executable: process.execPath,
    env: {
      ...process.env,
      LARKSUITE_CLI_APP_SECRET: 'SECRET',
      LARKSUITE_CLI_CONFIG_DIR: '/wrong',
      LARK_CHANNEL: '1',
      OPENCLAW_CLI: '1',
      HERMES_QUIET: '1',
      NODE_OPTIONS: '--invalid',
      NODE_PATH: '/wrong',
      ELECTRON_RUN_AS_NODE: '1',
      ANTHROPIC_API_KEY: 'SECRET',
      USERPROFILE: 'C:\\Users\\Test',
    },
  });
  const result = await run({
    args: [
      '-e',
      'let input="";process.stdin.on("data",s=>input+=s);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({arg:process.argv[1],input,update:process.env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER,skills:process.env.LARKSUITE_CLI_NO_SKILLS_NOTIFIER,keys:Object.keys(process.env)})));',
      'x;$(touch /not-executed)',
    ],
    stdin: 'plain body',
  });
  const value = JSON.parse(result.stdout) as {
    arg: string;
    input: string;
    update: string;
    skills: string;
    keys: string[];
  };
  assert.equal(result.exitCode, 0);
  assert.equal(value.arg, 'x;$(touch /not-executed)');
  assert.equal(value.input, 'plain body');
  assert.ok(value.keys.includes('PATH'));
  assert.ok(value.keys.includes('USERPROFILE'));
  assert.equal(value.update, '1');
  assert.equal(value.skills, '1');
  assert.ok(
    !value.keys.some((key) =>
      /LARKSUITE_CLI_(APP_SECRET|CONFIG_DIR)|LARK_CHANNEL|OPENCLAW|HERMES|NODE_OPTIONS|NODE_PATH|ELECTRON|API_KEY/u.test(
        key,
      ),
    ),
  );
});

test('subprocess timeout stops dispatch and returns only a safe indeterminate-result error', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath, timeoutMs: 25 });
  await assert.rejects(
    run({ args: ['-e', 'process.stderr.write("SECRET");setTimeout(()=>process.exit(0),250);'] }),
    (error: unknown) => {
      assert.ok(error instanceof FeishuCliError);
      assert.equal(error.code, 'timeout');
      assert.equal(error.dispatched, true);
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    },
  );
});

test('subprocess output is bounded across stdout and stderr and preserves split UTF-8', async () => {
  const limited = createFeishuCliRunner({ executable: process.execPath, maxOutputBytes: 64 });
  await assert.rejects(
    limited({
      args: [
        '-e',
        'process.stdout.write("x".repeat(40));process.stderr.write("SECRET".repeat(10));',
      ],
    }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'output_limit' && error.dispatched,
  );
  const run = createFeishuCliRunner({ executable: process.execPath });
  const result = await run({
    args: [
      '-e',
      'const b=Buffer.from("中文");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.end(b.subarray(1)),20);',
    ],
  });
  assert.equal(result.stdout, '中文');
});

test('runner refuses invalid process limits and arguments before spawning, and reports a missing CLI safely', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath });
  for (const request of [
    { args: ['bad\0argument'] },
    { args: [], timeoutMs: 0 },
    { args: [], timeoutMs: Number.NaN },
    { args: [], stdin: 'x'.repeat(1024 * 1024 + 1) },
  ]) {
    await assert.rejects(
      run(request),
      (error: unknown) =>
        error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
    );
  }
  const missing = createFeishuCliRunner({ executable: '/not-present-kodax-feishu-cli' });
  await assert.rejects(
    missing({ args: ['--version'] }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'cli_missing' && !error.dispatched,
  );
});
