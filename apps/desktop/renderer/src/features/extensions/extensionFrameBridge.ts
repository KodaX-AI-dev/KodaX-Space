import { spaceExpertDraftSchema, type SpaceExpertDraftT } from '@kodax-space/space-ipc-schema';

interface ExtensionFrameEnvelope {
  readonly type: 'space-extension.request.v1';
  readonly requestId: string;
  readonly token: string;
}

export type ExtensionFrameRequest = ExtensionFrameEnvelope &
  (
    | { readonly method: 'catalog.list' }
    | { readonly method: 'connector.catalog' }
    | { readonly method: 'connector.configure'; readonly connectorId: string }
    | {
        readonly method: 'expert.select';
        readonly expertId: string;
        readonly revision: number;
        readonly useSkill?: boolean;
      }
    | {
        readonly method: 'expert.details' | 'expert.delete';
        readonly expertId: string;
        readonly revision: number;
      }
    | {
        readonly method: 'expert.save';
        readonly expertId?: string;
        readonly expectedRevision?: number;
        readonly values: SpaceExpertDraftT;
      }
  );

const envelopeFields = ['type', 'requestId', 'token', 'method'];
function validExpertIdentity(id: unknown, revision: unknown): boolean {
  return (
    typeof id === 'string' &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) &&
    id.length <= 96 &&
    Number.isInteger(revision) &&
    Number(revision) >= 1 &&
    Number(revision) <= 1_000_000
  );
}

export function parseExtensionFrameRequest(data: unknown): ExtensionFrameRequest | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const item = data as Record<string, unknown>;
  if (
    item.type !== 'space-extension.request.v1' ||
    typeof item.requestId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(item.requestId) ||
    typeof item.token !== 'string' ||
    item.token.length > 96
  )
    return null;
  if (
    ![
      'catalog.list',
      'connector.catalog',
      'connector.configure',
      'expert.select',
      'expert.details',
      'expert.save',
      'expert.delete',
    ].includes(String(item.method))
  )
    return null;
  const extraFields =
    item.method === 'catalog.list' || item.method === 'connector.catalog'
      ? []
      : item.method === 'connector.configure'
        ? ['connectorId']
        : item.method === 'expert.save'
          ? ['expertId', 'expectedRevision', 'values']
          : item.method === 'expert.select'
            ? ['expertId', 'revision', 'useSkill']
            : ['expertId', 'revision'];
  if (Object.keys(item).some((key) => ![...envelopeFields, ...extraFields].includes(key)))
    return null;
  if (item.method === 'connector.catalog') return item as unknown as ExtensionFrameRequest;
  if (item.method === 'connector.configure')
    return validExpertIdentity(item.connectorId, 1)
      ? (item as unknown as ExtensionFrameRequest)
      : null;
  if (item.method === 'expert.save') {
    if (
      (item.expertId !== undefined || item.expectedRevision !== undefined) &&
      !validExpertIdentity(item.expertId, item.expectedRevision)
    )
      return null;
    const values = spaceExpertDraftSchema.safeParse(item.values);
    if (!values.success) return null;
    return { ...item, values: values.data } as ExtensionFrameRequest;
  }
  if (item.method !== 'catalog.list' && !validExpertIdentity(item.expertId, item.revision))
    return null;
  if (
    item.method === 'expert.select' &&
    item.useSkill !== undefined &&
    typeof item.useSkill !== 'boolean'
  )
    return null;
  return item as unknown as ExtensionFrameRequest;
}

export function createExtensionFrameBridge(options: {
  readonly token: string;
  readonly source: () => unknown;
  readonly dispatch: (request: ExtensionFrameRequest) => Promise<unknown>;
  readonly reply: (response: unknown) => void;
}) {
  let active = true;
  const seen = new Set<string>();
  let pending = 0;
  return {
    dispose: (): void => {
      active = false;
    },
    receive: async (event: { readonly source: unknown; readonly data: unknown }): Promise<void> => {
      const source = options.source();
      if (!active || !source || event.source !== source) return;
      const request = parseExtensionFrameRequest(event.data);
      if (
        !request ||
        request.token !== options.token ||
        seen.has(request.requestId) ||
        pending >= 16 ||
        seen.size >= 512
      )
        return;
      seen.add(request.requestId);
      pending += 1;
      let response: unknown;
      try {
        response = { ok: true, data: await options.dispatch(request) };
      } catch (error) {
        response = {
          ok: false,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        };
      } finally {
        pending -= 1;
      }
      if (active && source === options.source())
        options.reply({
          type: 'space-extension.response.v1',
          requestId: request.requestId,
          token: options.token,
          ...(response as object),
        });
    },
  };
}
