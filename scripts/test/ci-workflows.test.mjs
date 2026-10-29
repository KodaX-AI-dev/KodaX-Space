import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { SOURCE_JOBS } from '../ci-source-gate.mjs';

const workflow = async (name) =>
  parse(await readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8'));

test('release cannot publish without complete source and packaged acceptance, including Intel', async () => {
  const release = await workflow('release.yml');
  assert.deepEqual(release.jobs.release.needs, ['source', 'build', 'acceptance']);
  assert.match(release.jobs.release.if, /github.event_name == 'push'/);
  assert.match(release.jobs.release.if, /refs\/tags\/v/);
  assert.equal(
    release.jobs.build.needs,
    undefined,
    'packaging must run concurrently with source checks',
  );
  assert.deepEqual(release.jobs.build.strategy.matrix.include.map((item) => item.os).sort(), [
    'macos-15-intel',
    'macos-latest',
    'ubuntu-latest',
    'windows-latest',
  ]);
  assert.deepEqual(release.jobs.acceptance.strategy.matrix.include.map((item) => item.os).sort(), [
    'macos-15-intel',
    'macos-latest',
    'ubuntu-latest',
    'windows-latest',
  ]);
  const publishChecks = release.jobs.release.steps.find(
    (step) => step.name === 'Recheck source and accepted installer checksums',
  );
  assert.match(publishChecks.run, /ci-source-gate.mjs verify/);
  assert.match(publishChecks.run, /release-candidate.mjs publish/);
});

test('source gates require every actual matrix job and release does not repeat their unit tests', async () => {
  const ci = await workflow('ci.yml');
  const build = await workflow('build.yml');
  const release = await workflow('release.yml');
  assert.deepEqual(SOURCE_JOBS['ci.yml'], [
    ...ci.jobs.test.strategy.matrix.include.map((item) => `${item.os} / E2E shard ${item.shard}`),
    ci.jobs.gate.name,
  ]);
  assert.deepEqual(SOURCE_JOBS['build.yml'], [
    ...build.jobs.smoke.strategy.matrix.os.map((os) => `Smoke build (${os})`),
    build.jobs.lint.name,
    build.jobs.gate.name,
  ]);
  for (const job of [ci.jobs.test, release.jobs.build]) {
    assert.equal(
      job.steps.some((step) => /npm test|npm run typecheck/.test(step.run || '')),
      false,
    );
  }
  assert.equal(build.jobs.smoke.steps.filter((step) => step.run === 'npm test').length, 1);
  for (const source of [ci, build]) {
    assert.equal(source.jobs.gate.if, 'always()');
    assert.equal(
      source.on.push['paths-ignore'],
      undefined,
      'required workflows must still report a gate on docs changes',
    );
  }
});

test('acceptance receipts require success and retry evidence survives a green run', async () => {
  const release = await workflow('release.yml');
  const ci = await workflow('ci.yml');
  const steps = release.jobs.acceptance.steps;
  const acceptanceIndex = steps.findIndex(
    (step) => step.name === 'Packaged SDK consumer acceptance',
  );
  const receiptIndex = steps.findIndex((step) => step.name === 'Record accepted candidate');
  assert.ok(receiptIndex > acceptanceIndex);
  assert.equal(steps[acceptanceIndex]['continue-on-error'], undefined);
  assert.equal(steps[receiptIndex].if, undefined, 'default success condition must guard receipts');
  for (const job of [ci.jobs.test, release.jobs.acceptance]) {
    assert.ok(
      job.steps.some(
        (step) => step.uses === 'actions/upload-artifact@v4' && step.if === 'always()',
      ),
    );
  }
});

test('each isolated Windows E2E runner prepares native artifacts before running the suite', async () => {
  const ci = await workflow('ci.yml');
  const release = await workflow('release.yml');
  for (const job of [ci.jobs.test, release.jobs.acceptance]) {
    const warmup = job.steps.findIndex(
      (step) => step.run === 'node scripts/test/warm-kodax-native-artifacts.mjs',
    );
    const e2e = job.steps.findIndex((step) => (step.run || '').includes('npm run e2e:run'));
    assert.ok(warmup >= 0 && warmup < e2e, 'runner isolation must not remove native readiness');
  }
});
