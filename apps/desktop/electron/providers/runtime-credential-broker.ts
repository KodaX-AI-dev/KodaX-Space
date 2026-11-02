import type {
  RuntimeScopedCredentialBroker,
  RuntimeScopedCredentialRequest,
} from '@kodax-ai/kodax/runtime';

interface ScopedRuntimeCredentialBrokerInput {
  readonly leaseBinding: { readonly leaseId?: string };
  readonly providers: readonly string[];
  readonly sessionId: string;
  readonly requireConnectionProof?: boolean;
  readonly credentialEpoch?: (provider: string) => number;
  readonly authorize: (request: RuntimeScopedCredentialRequest) => boolean;
  readonly readCredential: (
    provider: string,
    connectionFingerprint?: string,
    context?: RuntimeScopedCredentialRequest,
  ) => Promise<string | undefined>;
}

/** Apply the common immutable envelope fences before an operation-specific policy. */
export function createScopedRuntimeCredentialBroker(
  input: ScopedRuntimeCredentialBrokerInput,
): RuntimeScopedCredentialBroker {
  const epochs = new Map(
    input.providers.map((provider) => [provider, input.credentialEpoch?.(provider)]),
  );
  return async (request) => {
    if (
      request.leaseId !== input.leaseBinding.leaseId ||
      request.sessionId !== input.sessionId ||
      !input.providers.includes(request.provider) ||
      (input.requireConnectionProof === true &&
        !/^[a-f0-9]{64}$/.test(request.connectionFingerprint ?? '')) ||
      epochs.get(request.provider) !== input.credentialEpoch?.(request.provider) ||
      !input.authorize(request)
    ) {
      return undefined;
    }
    const credential = await input.readCredential(
      request.provider,
      request.connectionFingerprint,
      request,
    );
    return epochs.get(request.provider) === input.credentialEpoch?.(request.provider)
      ? credential
      : undefined;
  };
}
