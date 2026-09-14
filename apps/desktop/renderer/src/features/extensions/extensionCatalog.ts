import type { SpaceExtensionT } from '@kodax-space/space-ipc-schema';

export type ExtensionInstallResult = { cancelled: true } | { extension: SpaceExtensionT };

export interface ExtensionCatalogApi {
  list(): Promise<SpaceExtensionT[]>;
  install(): Promise<ExtensionInstallResult>;
  setEnabled(extensionId: string, enabled: boolean): Promise<SpaceExtensionT>;
  uninstall(extensionId: string): Promise<void>;
  subscribe(listener: (extensions: SpaceExtensionT[]) => void): () => void;
}

export interface ExtensionCatalogSnapshot {
  readonly extensions: readonly SpaceExtensionT[];
  readonly loading: boolean;
  readonly error: string | null;
}

/** Owns the installed-package projection, not Skill discovery or agent execution. */
export function createExtensionCatalog(api: ExtensionCatalogApi) {
  let snapshot: ExtensionCatalogSnapshot = { extensions: [], loading: true, error: null };
  let revision = 0;
  const listeners = new Set<() => void>();
  const publish = (next: ExtensionCatalogSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const accept = (extensions: readonly SpaceExtensionT[]): void => {
    revision += 1;
    publish({ extensions, loading: false, error: null });
  };
  const refresh = async (): Promise<void> => {
    const requestRevision = ++revision;
    publish({ ...snapshot, loading: true, error: null });
    try {
      const extensions = await api.list();
      if (revision === requestRevision) accept(extensions);
    } catch (error) {
      if (revision !== requestRevision) return;
      publish({
        ...snapshot,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const upsert = (extension: SpaceExtensionT): void => {
    accept([...snapshot.extensions.filter((entry) => entry.id !== extension.id), extension]);
  };

  return {
    getSnapshot: (): ExtensionCatalogSnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect: (): (() => void) => {
      let unsubscribe: () => void;
      try {
        unsubscribe = api.subscribe(accept);
      } catch (error) {
        revision += 1;
        publish({
          extensions: [],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return () => undefined;
      }
      void refresh();
      return () => {
        revision += 1;
        unsubscribe();
      };
    },
    refresh,
    install: async (): Promise<ExtensionInstallResult> => {
      const startedAtRevision = revision;
      const result = await api.install();
      if ('extension' in result) {
        if (revision === startedAtRevision) upsert(result.extension);
        else await refresh();
      }
      return result;
    },
    setEnabled: async (extensionId: string, enabled: boolean): Promise<void> => {
      const startedAtRevision = revision;
      const extension = await api.setEnabled(extensionId, enabled);
      if (revision === startedAtRevision) upsert(extension);
      else await refresh();
    },
    uninstall: async (extensionId: string): Promise<void> => {
      const startedAtRevision = revision;
      await api.uninstall(extensionId);
      if (revision === startedAtRevision)
        accept(snapshot.extensions.filter((entry) => entry.id !== extensionId));
      else await refresh();
    },
  };
}

export type ExtensionCatalog = ReturnType<typeof createExtensionCatalog>;
