import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoHidePartnerContextRail } from './partnerWorkspaceLayout.js';

test('the context card rail yields to an open detail panel when the center is narrow', () => {
  assert.equal(shouldAutoHidePartnerContextRail(true, 700), true);
  assert.equal(shouldAutoHidePartnerContextRail(true, 900), false);
});

test('the context card rail stays available when the detail panel is closed', () => {
  assert.equal(shouldAutoHidePartnerContextRail(false, 500), false);
  assert.equal(shouldAutoHidePartnerContextRail(false, null), false);
});
