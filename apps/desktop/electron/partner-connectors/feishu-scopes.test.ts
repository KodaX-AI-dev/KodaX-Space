import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEISHU_BASE_CREATE_SCOPES, FEISHU_ONBOARDING_SCOPES } from './feishu-scopes.js';

test('Feishu Base creation has one exact five-scope authorization contract', () => {
  assert.deepEqual(FEISHU_BASE_CREATE_SCOPES, [
    'base:app:create',
    'base:table:read',
    'base:table:create',
    'base:table:update',
    'base:table:delete',
  ]);
});

test('Feishu onboarding requests document scopes followed by the shared Base scopes', () => {
  assert.deepEqual(FEISHU_ONBOARDING_SCOPES, [
    'docx:document:readonly',
    'docx:document:create',
    'docx:document:write_only',
    ...FEISHU_BASE_CREATE_SCOPES,
  ]);
});
