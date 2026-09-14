import {
  isPartnerConnectorResource,
  type PartnerConnectorOnboardingT,
  type PartnerConnectorOnboardingValueT,
} from '@kodax-space/space-ipc-schema';
import type { CredentialStore } from './remote-mcp-oauth.js';
import {
  checkReadConnectorDocument,
  ReadConnectorError,
  type ReadConnector,
  type ReadConnectorIdentity,
  type ReadConnectorDocument,
  type ReadConnectorInput,
} from './read-connector.js';

export interface ApiConnectorOptions {
  credentials: CredentialStore;
  fetchFn?: typeof fetch;
  cleanupLegacy?: (profile: string, signal?: AbortSignal) => Promise<void>;
}
export interface ApiSession {
  identity: ReadConnectorIdentity;
}
interface ApiConnectorConfig<C, S extends ApiSession> {
  id: 'slack-mcp' | 'zoom-mcp' | 'github-api';
  inputKind: NonNullable<PartnerConnectorOnboardingT['inputKind']>;
  parse(value: unknown): C;
  authenticate(value: C, signal?: AbortSignal): Promise<S>;
  read(session: S, input: ReadConnectorInput): Promise<ReadConnectorDocument>;
}
const active = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
};
const safe = (error: unknown): ReadConnectorError =>
  error instanceof ReadConnectorError ? error : new ReadConnectorError('authorization_failed');

/** Three credential-based official APIs share lifecycle only; provider requests remain separate. */
export function createApiCredentialConnector<C, S extends ApiSession>(
  config: ApiConnectorConfig<C, S>,
  options: ApiConnectorOptions,
): ReadConnector {
  const key = (profile: string) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u.test(profile))
      throw new ReadConnectorError('invalid_response');
    return `partner-connector-api:${config.id}:${profile}`;
  };
  const load = async (profile: string, signal?: AbortSignal) => {
    active(signal);
    const value = await options.credentials.get(key(profile));
    active(signal);
    return value === undefined ? undefined : config.parse(JSON.parse(value) as unknown);
  };
  const remove = async (profile: string) => {
    const name = key(profile);
    await options.credentials.delete(name);
    if ((await options.credentials.get(name)) !== undefined)
      throw new ReadConnectorError('authorization_failed');
  };
  return {
    id: config.id,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: (value) => isPartnerConnectorResource(config.id, value),
    inspect: async (profile, signal) => {
      try {
        const value = await load(profile, signal);
        if (value === undefined)
          return { installed: true, version: 'official-api', reason: '请先连接并验证应用凭据。' };
        const session = await config.authenticate(value, signal);
        active(signal);
        return { installed: true, version: 'official-api', identity: session.identity };
      } catch (error) {
        throw safe(error);
      }
    },
    run: async (input) => {
      let saving = false;
      try {
        active(input.signal);
        key(input.profile);
        const submitted: PartnerConnectorOnboardingValueT | undefined = await input.requestInput?.(
          config.inputKind,
        );
        active(input.signal);
        const value = config.parse(submitted);
        input.onProgress({ phase: 'verifying' });
        await config.authenticate(value, input.signal);
        active(input.signal);
        saving = true;
        const serialized = JSON.stringify(value);
        await options.credentials.set(key(input.profile), serialized);
        active(input.signal);
        if ((await options.credentials.get(key(input.profile))) !== serialized)
          throw new ReadConnectorError('authorization_failed');
        active(input.signal);
      } catch (error) {
        if (saving) {
          try {
            await remove(input.profile);
          } catch {
            throw new ReadConnectorError('authorization_failed');
          }
        }
        throw safe(error);
      }
    },
    read: async (input) => {
      if (!isPartnerConnectorResource(config.id, input.documentUrl))
        throw new ReadConnectorError('invalid_resource');
      let session: S;
      try {
        const value = await load(input.profile);
        if (value === undefined) throw new ReadConnectorError('authorization_failed');
        session = await config.authenticate(value);
      } catch (error) {
        throw safe(error);
      }
      if (
        session.identity.authorityId !== input.expected.authorityId ||
        session.identity.subjectId !== input.expected.subjectId
      )
        throw new ReadConnectorError('identity_changed');
      return checkReadConnectorDocument(await config.read(session, input));
    },
    disconnect: async (profile, signal) => {
      try {
        active(signal);
        await remove(profile);
        await options.cleanupLegacy?.(profile, signal);
      } catch (error) {
        throw safe(error);
      }
    },
  };
}
