import assert from 'node:assert/strict';
import test from 'node:test';
import { readSessionWorkMode, setSessionWorkMode } from './work-mode.js';

test('work mode uses Host settings, preserves CAS conflicts and rejects an old Host before mutation', async () => {
  let writes = 0;
  const host = {
    capabilities: { sharedSessionSettings: { version: 2, keys: ['workMode'] } },
    sessions: {
      getSettingsVersioned: async () => ({ revision: 4, value: {} }),
      updateSettingsVersioned: async (
        _id: string,
        patch: { workMode?: string | null },
        options: { expectedRevision: number },
      ) => {
        writes += 1;
        assert.deepEqual(patch, { workMode: 'agent' });
        assert.equal(options.expectedRevision, 3);
        throw Object.assign(new Error('Settings changed'), { code: 'conflict' });
      },
    },
  };
  assert.deepEqual(await readSessionWorkMode(host, 's'), {
    supported: true,
    revision: 4,
    workMode: 'coding',
  });
  await assert.rejects(setSessionWorkMode(host, 's', 'agent', 3), { code: 'conflict' });
  host.capabilities.sharedSessionSettings.keys = [];
  await assert.rejects(setSessionWorkMode(host, 's', 'agent', 3), {
    code: 'daemon_upgrade_required',
  });
  assert.equal(writes, 1);
  assert.equal((await readSessionWorkMode(host, 's')).supported, false);
});
