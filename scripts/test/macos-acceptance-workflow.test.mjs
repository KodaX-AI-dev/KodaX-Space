import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

test('macOS acceptance runs both native architectures without publishing or hiding retries', async () => {
  const workflow = parse(
    await readFile(
      new URL('../../.github/workflows/macos-acceptance.yml', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.permissions.contents, 'read');
  const job = workflow.jobs.acceptance;
  assert.equal(job.strategy['fail-fast'], false);
  assert.deepEqual(job.strategy.matrix.include, [
    { os: 'macos-15-intel', arch: 'x64', unpacked: 'mac' },
    { os: 'macos-15', arch: 'arm64', unpacked: 'mac-arm64' },
  ]);
  const units = job.steps.find(
    (step) => step.name === 'Native credential Git and notification regressions',
  );
  assert.match(units.run, /file-credentials.native.test.ts/);
  assert.doesNotMatch(units.run, /--test-force-exit/);
  const e2e = job.steps.find((step) => step.name === 'Packaged macOS acceptance');
  assert.match(e2e.env.SPACE_E2E_EXECUTABLE, /Contents\/MacOS\/KodaX Space$/);
  assert.match(e2e.run, /--retries=0/);
  assert.match(e2e.run, /provider-file-credentials.spec.ts/);
  assert.match(e2e.run, /sdk-history-navigation.spec.ts/);
  assert.ok(job.steps.some((step) => step.name === 'Verify candidate identity and signature'));
  assert.ok(
    job.steps.some((step) => step.uses === 'actions/upload-artifact@v4' && step.if === 'always()'),
  );
  assert.ok(job.steps.every((step) => step['continue-on-error'] === undefined));
});
