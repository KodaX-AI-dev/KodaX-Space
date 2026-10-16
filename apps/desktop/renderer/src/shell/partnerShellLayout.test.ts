import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePartnerShellLayout } from './partnerShellLayout.js';

const baseInput = {
  preferredLeftSidebarVisible: true,
  leftWidth: 260,
  rightSidebarVisible: true,
} as const;

test('closing Partner detail returns all available width to its continuous canvas', () => {
  assert.deepEqual(
    resolvePartnerShellLayout({
      ...baseInput,
      viewportWidth: 900,
      rightSidebarVisible: false,
      requestedRightWidth: 320,
      widthMode: 'default',
    }),
    {
      leftSidebarVisible: true,
      rightSidebarWidth: 0,
      centerWidth: 636,
    },
  );
});

test('a deliberately hidden navigation stays hidden with a readable detail workspace', () => {
  assert.deepEqual(
    resolvePartnerShellLayout({
      ...baseInput,
      viewportWidth: 1440,
      preferredLeftSidebarVisible: false,
      requestedRightWidth: 320,
      widthMode: 'custom',
    }),
    {
      leftSidebarVisible: false,
      rightSidebarWidth: 320,
      centerWidth: 1116,
    },
  );
});

test('invalid saved detail widths recover to the minimum instead of breaking the layout', () => {
  assert.deepEqual(
    resolvePartnerShellLayout({
      ...baseInput,
      viewportWidth: 1440,
      requestedRightWidth: Number.NaN,
      widthMode: 'custom',
    }),
    {
      leftSidebarVisible: true,
      rightSidebarWidth: 180,
      centerWidth: 992,
    },
  );
});

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
    rightSidebarWidth: 298,
    centerWidth: 298,
  });
  assert.deepEqual(half, custom);
});

test('900px retains navigation after removing panel gutters, with a readable custom center', () => {
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
    leftSidebarVisible: true,
    rightSidebarWidth: 212,
    centerWidth: 420,
  });
  assert.deepEqual(half, {
    leftSidebarVisible: true,
    rightSidebarWidth: 316,
    centerWidth: 316,
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
    rightSidebarWidth: 752,
    centerWidth: 420,
  });
  assert.deepEqual(half, {
    leftSidebarVisible: true,
    rightSidebarWidth: 586,
    centerWidth: 586,
  });
});
