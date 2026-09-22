import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StructuredLogger } from './logger.js';
import { initializeSdkDiagnostics } from './sdk-bridge.js';

test('SDK diagnostics preserve Windows probes, cached outcomes, and capability failures as structured redacted data', async (t) => {
  const { emitKodaXDiagnostic, setKodaXDiagnosticSink } = await import('@kodax-ai/kodax/agent');
  t.after(setKodaXDiagnosticSink(undefined));
  const directory = await mkdtemp(path.join(tmpdir(), 'space-sdk-diagnostics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logger = new StructuredLogger({
    directory,
    version: 'test',
    sdkVersion: 'test',
    secretValues: ['secret-fixture'],
  });
  await initializeSdkDiagnostics(null);
  await Promise.all([initializeSdkDiagnostics(logger), initializeSdkDiagnostics(logger)]);
  const details = [
    {
      stage: 'boot-identity',
      cached: false,
      available: false,
      durationMs: 5001,
      timeoutMs: 5000,
      exitCode: null,
      errorCode: 'ETIMEDOUT',
      executableKind: 'powershell',
    },
    { stage: 'job-membership', cached: true, available: false },
    {
      stage: 'exit-owner-validation',
      missing: ['windowsBootIdentity', 'processContainment'],
      nextAction: 'restart_application',
    },
    { stage: 'capability-check', capability: 'daemonShutdownVerification', requiredVersion: 1 },
  ];
  for (const detail of details)
    emitKodaXDiagnostic({
      source:
        detail.stage === 'capability-check' ? 'runtime.daemon.capabilities' : 'runtime:windows',
      level: 'warn',
      message: 'probe result secret-fixture',
      detail,
    });
  emitKodaXDiagnostic({
    source: 'context:compaction',
    level: 'debug',
    message: 'unrelated diagnostic',
    detail: { context: 'private conversation' },
  });
  const records = (await logger.readActiveLog())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.data.detail),
    details,
  );
  assert.deepEqual(
    records.map((record) => record.data.source),
    ['runtime:windows', 'runtime:windows', 'runtime:windows', 'runtime.daemon.capabilities'],
  );
  assert.ok(records.every((record) => record.message === 'probe result [REDACTED]'));
  logger.log = () => {
    throw new Error('failed diagnostic sink');
  };
  assert.doesNotThrow(() =>
    emitKodaXDiagnostic({
      source: 'runtime:windows',
      level: 'warn',
      message: 'probe result',
      detail: details[0],
    }),
  );
});
