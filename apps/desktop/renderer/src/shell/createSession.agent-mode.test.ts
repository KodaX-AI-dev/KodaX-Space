import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSessionCreateInputs } from './createSession.js';

test('new-session admission replaces retired pending and default SA with AMA', () => {
  const resolved = resolveSessionCreateInputs({
    projectRoot: '/repo',
    providers: [],
    defaultProviderId: null,
    kodaxDefaults: null,
    pendingProviderId: null,
    pendingReasoningMode: null,
    pendingAgentMode: 'sa',
    spaceRuntimeDefaults: { agentMode: 'sa' },
  });
  assert.equal(resolved.agentMode, 'ama');
  assert.notEqual(resolved.runtimeOverrides.agentMode, 'sa');
});
