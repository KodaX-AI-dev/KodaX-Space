import assert from 'node:assert/strict';
import test from 'node:test';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import { setRendererTarget } from './push.js';
import { assertSpaceExtensionSender } from './space-extensions.js';

test('extension lifecycle authorizes only the primary application main frame', () => {
  const mainFrame = { url: 'app://space/index.html' } as WebFrameMain;
  const sender = { id: 701, mainFrame, isDestroyed: () => false } as WebContents;
  setRendererTarget(() => sender);
  const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
  assert.doesNotThrow(() => assertSpaceExtensionSender(event));
  assert.throws(
    () =>
      assertSpaceExtensionSender({
        ...event,
        senderFrame: { url: 'app://space/__space-extension-frame' } as WebFrameMain,
      }),
    /primary application/,
  );
  assert.throws(
    () =>
      assertSpaceExtensionSender({
        ...event,
        sender: { ...sender, id: 702 } as WebContents,
      }),
    /primary application/,
  );
  setRendererTarget(() => null);
  assert.throws(() => assertSpaceExtensionSender(event), /primary application/);
});
