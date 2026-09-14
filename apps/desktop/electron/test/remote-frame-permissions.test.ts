import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from 'electron';
import { installRemoteFramePermissionGuards } from '../window/remote-frame-permissions.js';

type PermissionRequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>;
type PermissionCheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>;

test('remote frame permission guards deny every subframe request and check', () => {
  let requestHandler: PermissionRequestHandler | undefined;
  let checkHandler: PermissionCheckHandler | undefined;
  const target = {
    setPermissionRequestHandler(handler: PermissionRequestHandler) {
      requestHandler = handler;
    },
    setPermissionCheckHandler(handler: PermissionCheckHandler) {
      checkHandler = handler;
    },
  } as Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>;

  installRemoteFramePermissionGuards(target);
  assert.ok(requestHandler);
  assert.ok(checkHandler);
  const handleRequest = requestHandler as PermissionRequestHandler;
  const handleCheck = checkHandler as PermissionCheckHandler;

  let granted: boolean | null = null;
  handleRequest({} as never, 'media', (value: boolean) => (granted = value), {
    isMainFrame: false,
    requestingUrl: 'https://example.com',
  });
  assert.equal(granted, false);
  assert.equal(
    handleCheck(null, 'media', 'https://example.com', {
      isMainFrame: false,
      embeddingOrigin: 'app://space',
    }),
    false,
  );
});

test('remote frame permission guards preserve trusted main-frame permission behavior', () => {
  let requestHandler: PermissionRequestHandler | undefined;
  let checkHandler: PermissionCheckHandler | undefined;
  const target = {
    setPermissionRequestHandler(handler: PermissionRequestHandler) {
      requestHandler = handler;
    },
    setPermissionCheckHandler(handler: PermissionCheckHandler) {
      checkHandler = handler;
    },
  } as Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>;

  installRemoteFramePermissionGuards(target);
  assert.ok(requestHandler);
  assert.ok(checkHandler);
  const handleRequest = requestHandler as PermissionRequestHandler;
  const handleCheck = checkHandler as PermissionCheckHandler;

  let granted: boolean | null = null;
  handleRequest({} as never, 'notifications', (value: boolean) => (granted = value), {
    isMainFrame: true,
    requestingUrl: 'app://space/index.html',
  });
  assert.equal(granted, true);
  assert.equal(
    handleCheck(null, 'notifications', 'app://space', {
      isMainFrame: true,
    }),
    true,
  );
});
