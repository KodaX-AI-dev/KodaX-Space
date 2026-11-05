import assert from 'node:assert/strict';
import test from 'node:test';
import { useAppStore } from './appStore.js';

test('completed prewarm refreshes only the current Session and Host generation', (t) => {
  const original = useAppStore.getState();
  t.after(() => useAppStore.setState(original));
  useAppStore.setState({
    currentSessionId: 'selected',
    runtimeConnection: { ...original.runtimeConnection, runtimeId: 'current-host' },
    repoIntelStatusRevision: 0,
  });
  original.invalidateRepoIntelStatus('selected', 'old-host');
  original.invalidateRepoIntelStatus('other', 'current-host');
  assert.equal(useAppStore.getState().repoIntelStatusRevision, 0);
  original.invalidateRepoIntelStatus('selected', 'current-host');
  assert.equal(useAppStore.getState().repoIntelStatusRevision, 1);
});
