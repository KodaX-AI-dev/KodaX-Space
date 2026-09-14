import path from 'node:path';
import { getSpaceExtensionStore } from './runtime.js';

const PARTNER_LIBRARY_ID = 'kodax.partner-library';

export async function provisionBundledPartnerLibrary(context: {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly mainDirectory: string;
}): Promise<void> {
  const root = context.isPackaged ? context.resourcesPath : context.mainDirectory;
  await getSpaceExtensionStore().provisionBundled(
    path.join(root, 'bundled-extensions', `${PARTNER_LIBRARY_ID}.space-extension`),
    PARTNER_LIBRARY_ID,
  );
}
