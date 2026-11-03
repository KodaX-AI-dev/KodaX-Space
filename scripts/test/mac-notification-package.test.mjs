import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

test('macOS notification packages have an ad-hoc identity and preserve hash-pinned SDK resources', async () => {
  const config = parse(
    await readFile(new URL('../../electron-builder.yml', import.meta.url), 'utf8'),
  );
  assert.equal(config.mac.identity, '-');
  assert.equal(config.mac.hardenedRuntime, false);
  assert.ok(config.mac.signIgnore.includes('Contents/Resources/'));
});

test('release verifies each Mac signature before fingerprinting the candidate', async () => {
  const release = parse(
    await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'),
  );
  const steps = release.jobs.build.steps;
  const signature = steps.findIndex((step) => step.name === 'Verify macOS application signature');
  const archive = steps.findIndex((step) => step.name === 'Archive and fingerprint candidate');
  assert.ok(signature >= 0 && signature < archive);
  assert.equal(steps[signature].if, "runner.os == 'macOS'");
  assert.match(steps[signature].run, /codesign --verify --deep --strict/);
});
