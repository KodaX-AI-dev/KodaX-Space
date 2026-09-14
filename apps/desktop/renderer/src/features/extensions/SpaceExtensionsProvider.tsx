import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ChannelInput, ChannelOutput, InvokeChannelName } from '@kodax-space/space-ipc-schema';
import { invokeWithTimeout } from '../../lib/ipcInvokeWithTimeout.js';
import { translateMessage } from '../../i18n/I18nProvider.js';
import {
  createExtensionCatalog,
  type ExtensionCatalog,
  type ExtensionCatalogApi,
} from './extensionCatalog.js';

const ExtensionCatalogContext = createContext<ExtensionCatalog | null>(null);

export async function invokeExtensionHost<C extends InvokeChannelName>(
  channel: C,
  input: ChannelInput<C>,
): Promise<ChannelOutput<C>> {
  const bridge = window.kodaxSpace;
  if (!bridge) throw new Error(translateMessage('extensions.desktopRequired'));
  // Native picking and remote write verification own their main-process deadlines.
  // A renderer timeout must not offer a retry while a reviewed write is still submitting.
  const result =
    channel === 'space.extensions.install' || channel === 'partner.connectors.proposals.apply'
      ? await bridge.invoke(channel, input)
      : await invokeWithTimeout(bridge, channel, input);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function desktopApi(): ExtensionCatalogApi {
  return {
    list: async () => (await invokeExtensionHost('space.extensions.list', {})).extensions,
    install: () => invokeExtensionHost('space.extensions.install', {}),
    setEnabled: async (extensionId, enabled) =>
      (await invokeExtensionHost('space.extensions.setEnabled', { extensionId, enabled }))
        .extension,
    uninstall: async (extensionId) => {
      await invokeExtensionHost('space.extensions.uninstall', { extensionId });
    },
    subscribe: (listener) =>
      window.kodaxSpace?.on('space.extensions.changed', ({ extensions }) => listener(extensions)) ??
      (() => undefined),
  };
}

function CatalogRoot({ children }: { readonly children: ReactNode }): JSX.Element {
  const [catalog] = useState(() => createExtensionCatalog(desktopApi()));
  useEffect(() => catalog.connect(), [catalog]);
  return (
    <ExtensionCatalogContext.Provider value={catalog}>{children}</ExtensionCatalogContext.Provider>
  );
}

/** Settings can also open outside Shell; nested providers reuse its live catalog. */
export function SpaceExtensionsProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const existing = useContext(ExtensionCatalogContext);
  return existing ? <>{children}</> : <CatalogRoot>{children}</CatalogRoot>;
}

export function useSpaceExtensions() {
  const catalog = useContext(ExtensionCatalogContext);
  if (!catalog) throw new Error('SpaceExtensionsProvider is required');
  const snapshot = useSyncExternalStore(
    catalog.subscribe,
    catalog.getSnapshot,
    catalog.getSnapshot,
  );
  return { catalog, snapshot };
}

export function readExtensionView(
  extensionId: string,
): Promise<ChannelOutput<'space.extensions.view'>> {
  return invokeExtensionHost('space.extensions.view', { extensionId });
}
