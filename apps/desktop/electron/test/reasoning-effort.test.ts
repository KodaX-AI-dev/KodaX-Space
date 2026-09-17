import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerCustomProviders,
  resolveWireEffort as resolveSdkWireEffort,
} from '@kodax-ai/kodax/coding';

import {
  effortToReasoningMode,
  projectReasoningProfile,
  reasoningModeToEffort,
  runtimeSettingEffort,
} from '../kodax/reasoning-effort.js';

test('canonical efforts are preserved while legacy Space modes remain readable', () => {
  assert.equal(reasoningModeToEffort('off'), 'none');
  assert.equal(reasoningModeToEffort('minimal'), 'minimal');
  assert.equal(reasoningModeToEffort('low'), 'low');
  assert.equal(reasoningModeToEffort('medium'), 'medium');
  assert.equal(reasoningModeToEffort('high'), 'high');
  assert.equal(reasoningModeToEffort('xhigh'), 'xhigh');
  assert.equal(reasoningModeToEffort('max'), 'max');
  assert.equal(reasoningModeToEffort('quick'), 'low');
  assert.equal(reasoningModeToEffort('balanced'), 'medium');
  assert.equal(reasoningModeToEffort('deep'), 'max');
});

test('SDK effort projection keeps xhigh/max distinct and normalizes legacy aliases', () => {
  assert.equal(effortToReasoningMode('none'), 'off');
  assert.equal(effortToReasoningMode('minimal'), 'minimal');
  assert.equal(effortToReasoningMode('low'), 'low');
  assert.equal(effortToReasoningMode('medium'), 'medium');
  assert.equal(effortToReasoningMode('high'), 'high');
  assert.equal(effortToReasoningMode('xhigh'), 'xhigh');
  assert.equal(effortToReasoningMode('max'), 'max');
  assert.equal(effortToReasoningMode('quick'), 'low');
  assert.equal(effortToReasoningMode('balanced'), 'medium');
  assert.equal(effortToReasoningMode('deep'), 'max');
  assert.equal(effortToReasoningMode('ultra'), 'ultra');
});

test('reasoning profile projection folds every disabled effort into thinking off', () => {
  assert.deepEqual(
    projectReasoningProfile({
      supportedEfforts: [
        { value: 'none' },
        { value: 'minimal' },
        { value: 'low' },
        { value: 'ultra', isDefault: true },
      ],
      disabledEfforts: ['none', 'minimal'],
    }),
    {
      supportedEfforts: ['low', 'ultra'],
      defaultEffort: 'ultra',
      canDisableThinking: true,
    },
  );
});

test('explicit supportsDisabledThinking false overrides disabled effort metadata', () => {
  assert.deepEqual(
    projectReasoningProfile({
      supportedEfforts: [{ value: 'none' }, { value: 'minimal' }, { value: 'low' }],
      disabledEfforts: ['none', 'minimal'],
      supportsDisabledThinking: false,
    }),
    {
      supportedEfforts: ['low'],
      canDisableThinking: false,
    },
  );
});

test('only-disabled profile preserves a known empty strength ladder', () => {
  assert.deepEqual(
    projectReasoningProfile({
      supportedEfforts: [{ value: 'none' }],
      disabledEfforts: ['none'],
    }),
    {
      supportedEfforts: [],
      canDisableThinking: true,
    },
  );
});

test('reasoning-disabled profile preserves a known empty strength ladder', () => {
  assert.deepEqual(projectReasoningProfile({ effortStrategy: 'none' }), {
    supportedEfforts: [],
    canDisableThinking: false,
  });
});

test('prompt-only profile does not invent wire effort choices', () => {
  assert.deepEqual(projectReasoningProfile({ effortStrategy: 'prompt-only' }), {
    supportedEfforts: [],
    canDisableThinking: false,
  });
});

test('custom provider without a reasoning declaration defaults to max', () => {
  registerCustomProviders([
    {
      name: 'space-unprofiled-qwen',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKeyEnv: 'SPACE_TEST_QWEN_KEY',
      model: 'qwen3.8-27b',
    },
  ]);

  assert.equal(
    resolveSdkWireEffort({
      provider: 'space-unprofiled-qwen',
      model: 'qwen3.8-27b',
      desiredEffort: 'max',
    }).effort,
    'max',
  );
});

test('SDK registry resolver starts auto at max for an unprofiled custom provider', async () => {
  registerCustomProviders([
    {
      name: 'space-unprofiled-auto-qwen',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKeyEnv: 'SPACE_TEST_QWEN_KEY',
      model: 'qwen3.8-27b',
    },
  ]);

  assert.equal(
    resolveSdkWireEffort({
      provider: 'space-unprofiled-auto-qwen',
      model: 'qwen3.8-27b',
      desiredEffort: 'auto',
    }).effort,
    'max',
  );
});

test('Runtime settings preserve intent independently of negotiated wire effort', () => {
  assert.equal(runtimeSettingEffort('auto'), 'auto');
  assert.equal(runtimeSettingEffort(undefined), null);
  assert.equal(runtimeSettingEffort('off'), 'none');
  assert.equal(runtimeSettingEffort('deep'), 'max');
  assert.equal(runtimeSettingEffort('high'), 'high');
});

test('SDK fallback owns the monotonic effort ladder', () => {
  registerCustomProviders([
    {
      name: 'space-profiled-qwen',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKeyEnv: 'SPACE_TEST_QWEN_KEY',
      model: 'qwen3.8-27b',
      reasoning: {
        efforts: ['off', 'low', 'medium', 'xhigh'],
        default: 'xhigh',
      },
    },
  ]);

  const resolve = (reasoningMode: 'high' | 'xhigh' | 'max' | 'off'): string | undefined =>
    resolveSdkWireEffort({
      provider: 'space-profiled-qwen',
      model: 'qwen3.8-27b',
      desiredEffort: reasoningModeToEffort(reasoningMode),
    }).effort;

  assert.equal(resolve('high'), 'medium');
  assert.equal(resolve('xhigh'), 'xhigh');
  assert.equal(resolve('max'), 'xhigh');
  assert.equal(resolve('off'), 'none');
});

test('learned wire rejections are delegated to the SDK resolver', () => {
  registerCustomProviders([
    {
      name: 'space-rejected-max',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKeyEnv: 'SPACE_TEST_QWEN_KEY',
      model: 'reasoner',
      reasoning: { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], default: 'max' },
    },
  ]);

  const resolved = resolveSdkWireEffort({
    provider: 'space-rejected-max',
    model: 'reasoner',
    desiredEffort: 'max',
    rejectedEfforts: ['max'],
  });
  assert.equal(resolved.effort, 'xhigh');
});

test('unknown reasoning and disabling capabilities remain unknown', () => {
  assert.deepEqual(projectReasoningProfile(undefined), {});
  assert.deepEqual(projectReasoningProfile({ effortStrategy: 'openai-chat-effort' }), {});
});
