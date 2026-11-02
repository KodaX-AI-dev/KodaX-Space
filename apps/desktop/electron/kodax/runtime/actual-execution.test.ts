import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeRunStatus } from '@kodax-ai/kodax/runtime';
import { projectRuntimeRun } from './coder-daemon-projection.js';

test('actual assembly survives projection; an old Run stays unknown', () => {
  const base = { runId: 'r', sessionId: 's', phase: 'running' } as RuntimeRunStatus;
  assert.equal(projectRuntimeRun(base).workMode, undefined);
  assert.equal(projectRuntimeRun(base).effectiveConfig, undefined);
  const effectiveConfig = {
    agentMode: 'ama' as const,
    workMode: 'agent' as const,
    toolScope: ['bash', 'write'],
    modelToolScope: ['bash'],
    agentProfile: { surface: 'partner', name: 'Analyst' },
  };
  const run = { ...base, workMode: 'agent' as const, effectiveConfig };
  assert.equal(projectRuntimeRun(run).workMode, 'agent');
  assert.deepEqual(projectRuntimeRun(run).effectiveConfig, effectiveConfig);
});
