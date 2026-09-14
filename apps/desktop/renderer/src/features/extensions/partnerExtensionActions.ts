import type {
  ChannelInput,
  ChannelOutput,
  PartnerExpertSnapshotT,
  SpaceExpertRefT,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import type { ExtensionFrameRequest } from './extensionFrameBridge.js';

export interface PartnerExtensionActionsOptions {
  readonly extensionId: string;
  readonly isActive: () => boolean;
  readonly api: {
    catalog(extensionId: string): Promise<ChannelOutput<'space.extensions.catalog'>>;
    resolve(ref: SpaceExpertRefT): Promise<ChannelOutput<'space.extensions.resolveExpert'>>;
    save(
      input: ChannelInput<'space.extensions.expert.save'>,
    ): Promise<ChannelOutput<'space.extensions.expert.save'>>;
    delete(ref: SpaceExpertRefT): Promise<ChannelOutput<'space.extensions.expert.delete'>>;
  };
  readonly selectExpert: (ref: SpaceExpertRefT) => Promise<void>;
  readonly onSelected: () => void;
  readonly onDetails: (expert: PartnerExpertSnapshotT) => void;
  readonly confirmDelete: (expert: PartnerExpertSnapshotT) => Promise<boolean>;
  readonly connectors?: {
    catalog(): Promise<{ connectors: SpaceConnectorDefinitionT[]; connectedIds?: string[] }>;
    onConfigure(connector: SpaceConnectorDefinitionT): void;
  };
}

/** The untrusted frame submits content; package and conversation identity stay in the host. */
export function createPartnerExtensionActions(options: PartnerExtensionActionsOptions) {
  return async (request: ExtensionFrameRequest): Promise<unknown> => {
    if (!options.isActive()) throw new Error('Extension view is closed or changed');
    if (request.method === 'connector.catalog' || request.method === 'connector.configure') {
      if (!options.connectors) throw new Error('Connector configuration unavailable');
      const catalog = await options.connectors.catalog();
      if (!options.isActive()) throw new Error('Extension view is closed or changed');
      if (request.method === 'connector.catalog')
        return {
          connectors: catalog.connectors,
          connectedIds: catalog.connectedIds ?? [],
        };
      const connector = catalog.connectors.find((item) => item.id === request.connectorId);
      if (!connector) throw new Error('Connector unavailable');
      options.connectors.onConfigure(connector);
      return { opened: true };
    }
    if (request.method === 'catalog.list') return options.api.catalog(options.extensionId);
    if (request.method === 'expert.save')
      return options.api.save({
        extensionId: options.extensionId,
        ...(request.expertId !== undefined
          ? { expertId: request.expertId, expectedRevision: request.expectedRevision }
          : {}),
        values: request.values,
      });
    const ref = {
      extensionId: options.extensionId,
      expertId: request.expertId,
      revision: request.revision,
    };
    if (request.method === 'expert.select') {
      await options.selectExpert({
        ...ref,
        ...(request.useSkill !== undefined ? { useSkill: request.useSkill } : {}),
      });
      if (options.isActive()) options.onSelected();
      return { selected: true };
    }
    if (request.method === 'expert.details') {
      const { expert } = await options.api.resolve(ref);
      if (options.isActive()) options.onDetails(expert);
      return { opened: true };
    }
    if (!ref.expertId.startsWith('user.')) throw new Error('Built-in experts cannot be deleted');
    const { expert } = await options.api.resolve(ref);
    if (!options.isActive()) throw new Error('Extension view is closed or changed');
    if (!(await options.confirmDelete(expert))) return { cancelled: true };
    if (!options.isActive()) throw new Error('Extension view is closed or changed');
    return options.api.delete(ref);
  };
}
