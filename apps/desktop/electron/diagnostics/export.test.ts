import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { buildDiagnosticBundle } from './export.js';

test('failed-startup export includes both daemon logs from the configured home and reports missing sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-startup-export-'));
  const logDirectory = path.join(root, 'diagnostics');
  const runtimeDirectory = path.join(root, 'custom-home');
  const daemonDirectory = path.join(runtimeDirectory, 'runtime', 'daemon', 'coder');
  await mkdir(logDirectory, { recursive: true });
  await mkdir(daemonDirectory, { recursive: true });
  await writeFile(
    path.join(logDirectory, 'space-main.jsonl'),
    '{"event":"host_initialization_failed"}\n',
  );
  await writeFile(
    path.join(daemonDirectory, 'bootstrap.log'),
    `[kodax-startup] {"phase":"extensions","time":"2026-11-12T07:01:45Z"}\n` +
      `[Error] Could not verify the Windows Job containment; Bearer secret-credential at ${root}\n`,
  );
  await writeFile(
    path.join(daemonDirectory, 'daemon.log'),
    `${JSON.stringify({
      message: 'Windows process probe completed.',
      data: { detail: { stage: 'job-membership', errorCode: 'ETIMEDOUT', timeoutMs: 5000 } },
      prompt: 'private-conversation',
    })}\n`,
  );
  await writeFile(path.join(daemonDirectory, 'daemon.token'), 'must-not-collect');
  await writeFile(path.join(runtimeDirectory, 'auth.json'), '{"secret":"must-not-collect"}');

  const zip = await JSZip.loadAsync(
    await buildDiagnosticBundle({
      logDirectory,
      runtimeDirectory,
      spaceVersion: '0.1.47-alpha.5',
      sdkVersion: '0.7.97-beta.4',
      platform: 'win32',
      privatePathPrefixes: [root],
      capabilities: { runtime: { state: 'failed' } },
    }),
  );
  const bootstrap = await zip.file('logs/runtime/coder/bootstrap.log')?.async('string');
  const daemon = await zip.file('logs/runtime/coder/daemon.log')?.async('string');
  assert.ok(bootstrap);
  assert.ok(bootstrap.includes('Could not verify the Windows Job containment'));
  assert.ok(bootstrap.includes('[kodax-startup]'));
  assert.doesNotMatch(bootstrap, /corrupt-log-line|secret-credential/);
  assert.ok(!bootstrap.includes(root));
  assert.match(daemon ?? '', /job-membership.*ETIMEDOUT.*5000/);
  assert.doesNotMatch(daemon ?? '', /private-conversation/);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
    logSources: { path: string; status: string }[];
  };
  assert.ok(
    manifest.logSources.some(
      (source) => source.path === 'logs/runtime/coder/daemon.log' && source.status === 'collected',
    ),
  );
  assert.ok(
    manifest.logSources.some(
      (source) =>
        source.path === 'logs/runtime/default/bootstrap.log' && source.status === 'missing',
    ),
  );
  assert.ok(!Object.keys(zip.files).some((name) => /auth|token/.test(name)));
  assert.equal(
    await readFile(path.join(daemonDirectory, 'daemon.token'), 'utf8'),
    'must-not-collect',
  );
});

test('export keeps current daemon evidence ahead of rotations and reports truncated and unreadable logs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-bounded-export-'));
  const daemon = path.join(root, 'runtime', 'daemon', 'coder');
  await mkdir(daemon, { recursive: true });
  await writeFile(path.join(root, 'space-main.jsonl'), '{"event":"current"}\n');
  await writeFile(path.join(root, 'space-main.1.jsonl'), '{"event":"historical"}\n'.repeat(1000));
  await writeFile(
    path.join(daemon, 'bootstrap.log'),
    'old-startup\n'.repeat(1000) + '[Error] latest-startup-failure\n',
  );
  await mkdir(path.join(daemon, 'daemon.log'));
  const zip = await JSZip.loadAsync(
    await buildDiagnosticBundle({
      logDirectory: root,
      runtimeDirectory: root,
      spaceVersion: 'test',
      sdkVersion: 'test',
      platform: 'win32',
      maxLogFileBytes: 1024,
      maxTotalLogBytes: 2048,
    }),
  );
  assert.match(
    await zip.file('logs/runtime/coder/bootstrap.log')!.async('string'),
    /latest-startup-failure/,
  );
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
    logSources: { path: string; status: string }[];
  };
  assert.ok(
    manifest.logSources.some(
      (source) => source.path.endsWith('bootstrap.log') && source.status === 'truncated',
    ),
  );
  assert.ok(
    manifest.logSources.some(
      (source) => source.path === 'logs/runtime/coder/daemon.log' && source.status === 'unreadable',
    ),
  );
  const contents = await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir && file.name.startsWith('logs/'))
      .map((file) => file.async('nodebuffer')),
  );
  assert.ok(contents.reduce((sum, content) => sum + content.length, 0) <= 2048);
});

test('export refuses a daemon directory alias outside the configured home and respects category selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-alias-export-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'space-private-export-'));
  await mkdir(path.join(root, 'runtime', 'daemon'), { recursive: true });
  await writeFile(path.join(outside, 'bootstrap.log'), 'outside-private-log');
  await symlink(
    outside,
    path.join(root, 'runtime', 'daemon', 'coder'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const options = {
    logDirectory: root,
    runtimeDirectory: root,
    spaceVersion: 'test',
    sdkVersion: 'test',
    platform: process.platform,
  };
  const zip = await JSZip.loadAsync(await buildDiagnosticBundle(options));
  assert.equal(zip.file('logs/runtime/coder/bootstrap.log'), null);
  const selected = await JSZip.loadAsync(
    await buildDiagnosticBundle({ ...options, categories: ['manifest', 'release'] }),
  );
  assert.deepEqual(Object.keys(selected.files).sort(), ['manifest.json', 'release.json']);
});
