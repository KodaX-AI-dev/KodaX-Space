import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaskDockRunView } from './taskDockProjection.js';

test('local service availability takes precedence over idle, completed and running task summaries', () => {
  for (const connectionState of [
    'connecting',
    'reconnecting',
    'disconnected',
    'incompatible',
    'degraded',
  ] as const) {
    for (const hasSession of [false, true]) {
      const view = buildTaskDockRunView({
        hasProject: true,
        hasSession,
        pendingSend: false,
        isStreaming: false,
        connectionState,
      });
      assert.doesNotMatch(view.headline, /Ready|就绪/i);
      assert.equal(view.attentionKind, 'blocked');
    }
  }
  const recovered = buildTaskDockRunView({
    hasProject: true,
    hasSession: false,
    pendingSend: false,
    isStreaming: false,
    connectionState: 'ready',
  });
  assert.match(recovered.headline, /Ready|就绪/i);
});
