import type { RuntimeScopedCredentialRequest } from '@kodax-ai/kodax/runtime';
import type { OAuthCredentialSession } from '@kodax-ai/kodax/llm';
export type RuntimeCredentialContext = Pick<
  RuntimeScopedCredentialRequest,
  'credentialContextVersion' | 'rejectedCredentialFingerprint'
>;

/** Preserve the trusted registration identity; refresh is not generation-POST replay. */
export async function acquireRuntimeOAuthCredential(
  provider: string,
  session: Pick<OAuthCredentialSession, 'acquire' | 'replayIdentity' | 'recoverRejectedCredential'>,
  context?: RuntimeCredentialContext,
): Promise<string> {
  if (context?.rejectedCredentialFingerprint !== undefined) {
    if (
      context.credentialContextVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(context.rejectedCredentialFingerprint) ||
      !session.recoverRejectedCredential
    )
      throw new Error('OAuth recovery requires a negotiated credential context.');
    await session.recoverRejectedCredential(context.rejectedCredentialFingerprint);
  }
  const token = await session.acquire();
  if (context?.credentialContextVersion !== 1) return token;
  const { serializeProviderCredentialGrant } = await import('@kodax-ai/kodax/llm');
  return serializeProviderCredentialGrant({
    provider,
    credential: token,
    identity: session.replayIdentity,
    recoverable: session.recoverRejectedCredential !== undefined,
  });
}
