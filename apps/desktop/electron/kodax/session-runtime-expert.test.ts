import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SessionRuntimeStore } from './session-runtime-store.js';

const expert = {
  extensionId: 'partner.library',
  extensionVersion: '1.0.0',
  expert: {
    id: 'writing-guide',
    revision: 1,
    name: 'Writing guide',
    description: 'Helps improve a draft',
    prompt: 'Explain the evidence behind every suggested revision.',
    starterTasks: [],
  },
};

test('a Partner expert survives a new runtime-store instance and can be explicitly cleared', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-expert-runtime-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new SessionRuntimeStore(directory);

  assert.equal(
    await store.set('expert-session', { provider: 'mock', partnerExpert: expert }),
    true,
  );
  const reopened = new SessionRuntimeStore(directory);
  assert.deepEqual(await reopened.read('expert-session'), {
    provider: 'mock',
    partnerExpert: expert,
  });
  assert.equal(await reopened.set('expert-session', { partnerExpert: undefined }), true);
  assert.deepEqual(await reopened.read('expert-session'), { provider: 'mock' });
});

test('a schema-bounded escaped expert fits the connector-era runtime metadata limit', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-expert-runtime-limit-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new SessionRuntimeStore(directory);
  await store.set('expert-session', { provider: 'mock', partnerExpert: expert });
  const control = '\u0000';

  assert.equal(
    await store.set('expert-session', {
      provider: control.repeat(128),
      model: control.repeat(512),
      partnerExpert: {
        ...expert,
        expert: {
          ...expert.expert,
          name: control.repeat(80),
          description: control.repeat(280),
          prompt: control.repeat(8_000),
          starterTasks: Array.from({ length: 4 }, () => control.repeat(512)),
        },
      },
    }),
    true,
  );
  assert.equal(
    (await store.read('expert-session'))?.partnerExpert?.expert.prompt,
    control.repeat(8_000),
  );
});

test('a runtime sidecar beyond 256 KiB is rejected and never overwritten', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-expert-runtime-overflow-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new SessionRuntimeStore(directory);
  const filePath = path.join(directory, 'expert-session.json');
  const previous = Buffer.from(
    JSON.stringify({
      version: 1,
      sessionId: 'expert-session',
      provider: 'mock',
      partnerExpert: expert,
      updatedAt: 'x'.repeat(256 * 1024),
    }),
  );
  await fs.writeFile(filePath, previous);
  assert.equal(await store.read('expert-session'), null);
  assert.equal(await store.set('expert-session', { provider: 'mock' }), false);
  assert.deepEqual(await fs.readFile(filePath), previous);
});
