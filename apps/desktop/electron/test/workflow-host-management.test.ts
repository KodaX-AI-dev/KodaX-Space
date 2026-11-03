import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowController } from '../kodax/workflow-controller.js';

test('shared Host workflows refuse legacy-controller mutations with an explicit SDK requirement', async () => {
  const controller = new WorkflowController();
  controller.setHostOwner({
    enabled: () => true,
    ownsRun: async () => true,
    start: async () => ({ runId: 'host-run' }),
    runDirectory: async () => '/unused',
  });
  await assert.rejects(controller.rename('host-run', 'new name'), /Host SDK.*rename/i);
  await assert.rejects(controller.deleteRun('host-run', true), /Host SDK.*delete/i);
});
