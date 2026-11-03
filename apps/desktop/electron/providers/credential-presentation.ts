import type { ProviderInfo } from '@kodax-space/space-ipc-schema';
import { describeProviderCredential } from './provider-storage.js';

/** A single unreadable binding must remain visible without hiding healthy providers. */
export async function describeProviderList(
  providers: readonly ProviderInfo[],
  describe: typeof describeProviderCredential = describeProviderCredential,
): Promise<ProviderInfo[]> {
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const credentialState = await describe(provider.id);
        return presentProviderCredential(provider, credentialState);
      } catch {
        // No raw credential-store error crosses IPC; the card exposes an explicit failure.
        return {
          ...provider,
          configured: false,
          configuredSource: 'none' as const,
          credentialError: 'unavailable' as const,
        };
      }
    }),
  );
}

function presentProviderCredential(
  provider: ProviderInfo,
  credentialState: Awaited<ReturnType<typeof describeProviderCredential>>,
): ProviderInfo {
  if (
    ['connection-changed', 'source-required', 'unavailable'].includes(credentialState.migration) &&
    !credentialState.authentication
  )
    return {
      ...provider,
      credentialState,
      configured: false,
      configuredSource: 'none' as const,
    };
  const environment = credentialState.environmentAvailable === true;
  const source: ProviderInfo['configuredSource'] =
    credentialState.authentication ??
    (credentialState.configured || credentialState.migration === 'pending'
      ? environment
        ? 'both'
        : 'file'
      : environment && (credentialState.origin === 'env' || credentialState.origin === undefined)
        ? 'env'
        : credentialState.origin === undefined && provider.configuredSource === 'runtime'
          ? 'runtime'
          : 'none');
  return {
    ...provider,
    credentialState,
    configured: credentialState.authentication
      ? credentialState.authenticationConfigured === true
      : source !== 'none',
    configuredSource: source,
  };
}
