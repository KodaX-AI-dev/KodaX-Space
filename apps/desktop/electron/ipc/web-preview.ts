import { remoteWebPreviewRegistry } from '../window/remote-web-preview.js';
import { assertSpaceExtensionSender } from './space-extensions.js';
import { pushToRenderer } from './push.js';
import { registerChannelWithEvent } from './register.js';

const observed = new Set<number>();

export function registerWebPreviewChannels(): void {
  registerChannelWithEvent('webPreview.prepare', ({ url }, event) => {
    assertSpaceExtensionSender(event);
    const owner = event.sender;
    if (!observed.has(owner.id)) {
      observed.add(owner.id);
      owner.once('destroyed', () => {
        observed.delete(owner.id);
        remoteWebPreviewRegistry.release(owner.id);
      });
      owner.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
        if (isMainFrame && !inPlace) remoteWebPreviewRegistry.release(owner.id);
      });
      owner.on(
        'did-fail-load',
        (_event, code, _description, _url, isMainFrame, processId, routingId) => {
          if (isMainFrame || code === -3 || owner.isDestroyed()) return;
          const frame = owner.mainFrame.framesInSubtree.find(
            (item) => item.processId === processId && item.routingId === routingId,
          );
          const id = remoteWebPreviewRegistry.forFrame(owner.id, frame ?? null, owner.mainFrame);
          if (id && frame?.parent === owner.mainFrame) pushToRenderer('webPreview.failed', { id });
        },
      );
    }
    return remoteWebPreviewRegistry.create(owner.id, url);
  });
  registerChannelWithEvent('webPreview.release', ({ id }, event) => {
    assertSpaceExtensionSender(event);
    remoteWebPreviewRegistry.release(event.sender.id, id);
    return { released: true };
  });
}
