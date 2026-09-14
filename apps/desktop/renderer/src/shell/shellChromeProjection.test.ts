import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectShellChrome } from './shellChromeProjection.js';

test('Partner keeps the project switcher while hiding unsupported and placeholder shell chrome', () => {
  assert.deepEqual(projectShellChrome('partner'), {
    showWorkflowNavigation: false,
    showFutureFeatures: false,
    showLocalEnvironment: false,
    showPlaceholderBranch: false,
    showProjectSwitcher: true,
    showRepositoryIntelligence: false,
  });
});

test('Coder preserves its existing shell chrome', () => {
  assert.deepEqual(projectShellChrome('code'), {
    showWorkflowNavigation: true,
    showFutureFeatures: true,
    showLocalEnvironment: true,
    showPlaceholderBranch: true,
    showProjectSwitcher: true,
    showRepositoryIntelligence: true,
  });
});
