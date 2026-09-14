import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getSpaceExpertCatalog, getSpaceExtensionStore } from './runtime.js';

test('runtime singletons are lazy, shared, and do not write or discover user resources', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-extension-runtime-'));
  const previousProfile = process.env.KODAX_PROFILE_DIR;
  const previousTestProfile = process.env.KODAX_TEST_ONBOARDING;
  process.env.KODAX_PROFILE_DIR = directory;
  delete process.env.KODAX_TEST_ONBOARDING;
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.KODAX_PROFILE_DIR;
    else process.env.KODAX_PROFILE_DIR = previousProfile;
    if (previousTestProfile === undefined) delete process.env.KODAX_TEST_ONBOARDING;
    else process.env.KODAX_TEST_ONBOARDING = previousTestProfile;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const store = getSpaceExtensionStore();
  assert.equal(store, getSpaceExtensionStore());
  assert.equal(getSpaceExpertCatalog(), getSpaceExpertCatalog());
  assert.deepEqual(await store.list(), []);
  await assert.rejects(getSpaceExpertCatalog().list('missing.extension'), /not installed/i);
  assert.deepEqual(await fs.readdir(directory), []);
});
