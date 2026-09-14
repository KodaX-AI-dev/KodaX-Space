import type { IpcMainInvokeEvent } from 'electron';
import { getSpaceExtensionStore, getSpaceExpertCatalog } from '../space-extensions/runtime.js';
import { isSpaceExtensionFrameUrl } from '../window/space-extension-frame.js';
import { isRendererTarget, pushToRenderer } from './push.js';
import { registerChannelWithEvent } from './register.js';
import { getPartnerConnectorService } from '../partner-connectors/runtime.js';

export { getSpaceExtensionStore } from '../space-extensions/runtime.js';

export function assertSpaceExtensionSender(event: IpcMainInvokeEvent): void {
  if (
    !isRendererTarget(event.sender) ||
    event.senderFrame !== event.sender.mainFrame ||
    isSpaceExtensionFrameUrl(event.senderFrame?.url ?? '')
  )
    throw new Error('Space Extensions require the primary application main frame');
}

async function chooseExtensionArchive(): Promise<string | undefined> {
  const { BrowserWindow, dialog } = await import('electron');
  const parent = BrowserWindow.getFocusedWindow();
  const options: Electron.OpenDialogOptions = {
    title: '安装 Space 扩展',
    filters: [{ name: 'Space Extension', extensions: ['space-extension'] }],
    properties: ['openFile'],
  };
  const selected = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return selected.canceled ? undefined : selected.filePaths[0];
}

async function publishExtensions(): Promise<void> {
  pushToRenderer('space.extensions.changed', { extensions: await getSpaceExtensionStore().list() });
}

/** Only trusted host UI can manage packages; child frames have no lifecycle IPC. */
export function registerSpaceExtensionChannels(register = registerChannelWithEvent): void {
  registerExpertCatalogChannels(register);
  register('space.extensions.list', async (_input, event) => {
    assertSpaceExtensionSender(event);
    return { extensions: await getSpaceExtensionStore().list() };
  });
  register('space.extensions.install', async (input, event) => {
    assertSpaceExtensionSender(event);
    const archive = input.filePath ?? (await chooseExtensionArchive());
    if (!archive) return { cancelled: true };
    const extension = await getPartnerConnectorService().deactivate(undefined, () =>
      getSpaceExtensionStore().install(archive),
    );
    await publishExtensions();
    return { extension };
  });
  register('space.extensions.setEnabled', async (input, event) => {
    assertSpaceExtensionSender(event);
    const extension = await getPartnerConnectorService().deactivate(input.extensionId, () =>
      getSpaceExtensionStore().setEnabled(input.extensionId, input.enabled),
    );
    await publishExtensions();
    return { extension };
  });
  register('space.extensions.uninstall', async (input, event) => {
    assertSpaceExtensionSender(event);
    await getPartnerConnectorService().deactivate(input.extensionId, () =>
      getSpaceExtensionStore().uninstall(input.extensionId),
    );
    await publishExtensions();
    return { ok: true };
  });
  register('space.extensions.view', async (input, event) => {
    assertSpaceExtensionSender(event);
    return getSpaceExtensionStore().getView(input.extensionId);
  });
}

function registerExpertCatalogChannels(register: typeof registerChannelWithEvent): void {
  register('space.extensions.catalog', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { experts: await getSpaceExpertCatalog().list(input.extensionId) };
  });
  register('space.extensions.resolveExpert', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { expert: await getSpaceExpertCatalog().resolve(input) };
  });
  register('space.extensions.expert.save', async (input, event) => {
    assertSpaceExtensionSender(event);
    const expert = await getSpaceExpertCatalog().save(input);
    await publishExtensions();
    return { expert };
  });
  register('space.extensions.expert.delete', async (input, event) => {
    assertSpaceExtensionSender(event);
    await getSpaceExpertCatalog().delete(input);
    await publishExtensions();
    return { ok: true };
  });
}
