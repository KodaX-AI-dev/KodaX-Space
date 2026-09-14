import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePartnerShellLayout } from './partnerShellLayout.js';

const baseInput = {
  preferredLeftSidebarVisible: true,
  leftWidth: 260,
  rightSidebarVisible: true,
} as const;

test('600px hides the left sidebar and balances an extremely narrow Partner split', () => {
  const custom = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 600,
    requestedRightWidth: 500,
    widthMode: 'custom',
  });
  const half = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 600,
    requestedRightWidth: 200,
    widthMode: 'half',
  });

  assert.deepEqual(custom, {
    leftSidebarVisible: false,
    rightSidebarWidth: 278,
    centerWidth: 278,
  });
  assert.deepEqual(half, custom);
});

test('900px hides the left sidebar before sacrificing the Partner minimum center width', () => {
  const custom = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 900,
    requestedRightWidth: 600,
    widthMode: 'custom',
  });
  const half = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 900,
    requestedRightWidth: 200,
    widthMode: 'half',
  });

  assert.deepEqual(custom, {
    leftSidebarVisible: false,
    rightSidebarWidth: 436,
    centerWidth: 420,
  });
  assert.deepEqual(half, {
    leftSidebarVisible: false,
    rightSidebarWidth: 428,
    centerWidth: 428,
  });
});

test('1440px keeps the left sidebar and caps a wide Partner detail panel', () => {
  const custom = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 1440,
    requestedRightWidth: 900,
    widthMode: 'custom',
  });
  const half = resolvePartnerShellLayout({
    ...baseInput,
    viewportWidth: 1440,
    requestedRightWidth: 200,
    widthMode: 'half',
  });

  assert.deepEqual(custom, {
    leftSidebarVisible: true,
    rightSidebarWidth: 692,
    centerWidth: 420,
  });
  assert.deepEqual(half, {
    leftSidebarVisible: true,
    rightSidebarWidth: 556,
    centerWidth: 556,
  });
});
