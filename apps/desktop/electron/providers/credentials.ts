import type { ProviderInfo } from '@kodax-space/space-ipc-schema';

import { loadKodaxCustomProviders } from '../kodax/user-config.js';
import { BUILTIN_PROVIDERS, getBuiltin, isBuiltinId } from './catalog.js';
import { providerConfigStore } from './config.js';
import { validateApiKeyEnv } from './env-guard.js';
import { getKey, configuredConnection, describeProviderCredential } from './provider-storage.js';
import { getKodaxRuntimeDir } from '../kodax/data-paths.js';
import path from 'node:path';
import { invalidateProviderCredential } from './credential-invalidation.js';
import type { OAuthCredentialSession } from '@kodax-ai/kodax/llm';
import {
  externalProviderEnvValue,
  restoreManagedProviderEnv,
  setManagedProviderEnv,
  rememberProviderSecret,
} from './managed-env.js';

type ConfiguredSource = ProviderInfo['configuredSource'];
const oauthSessions = new Map<string, { readonly key: string; readonly session: OAuthCredentialSession; readonly unsubscribe: () => void }>();

interface TrustedSharedCredentialAccount {
  readonly providerId: string;
  readonly apiKeyEnv: string;
  readonly accountId: string;
}

// Explicit security policy: equal environment-variable names alone never authorize
// keychain sharing. Only these reviewed builtin identities may share an account.
const TRUSTED_SHARED_CREDENTIAL_ACCOUNTS: readonly TrustedSharedCredentialAccount[] = [
  { providerId: 'openai', apiKeyEnv: 'OPENAI_API_KEY', accountId: 'codex-cli' },
  { providerId: 'codex-cli', apiKeyEnv: 'OPENAI_API_KEY', accountId: 'openai' },
];

function hasNonEmptyValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function trustedSharedCredentialAccounts(providerId: string, apiKeyEnv: string): readonly string[] {
  return TRUSTED_SHARED_CREDENTIAL_ACCOUNTS.filter(
    (entry) => entry.providerId === providerId && entry.apiKeyEnv === apiKeyEnv,
  ).map((entry) => entry.accountId);
}

export function providerCredentialSource(
  providerId: string,
  apiKeyEnv: string,
  keychainAccounts: ReadonlySet<string>,
): ConfiguredSource {
  const hasKeychain = keychainAccounts.has(providerId);
  const hasEnv = externalProviderEnvValue(apiKeyEnv) !== undefined;
  const hasTrustedSharedKeychain = trustedSharedCredentialAccounts(providerId, apiKeyEnv).some(
    (account) => keychainAccounts.has(account),
  );
  if (hasKeychain && hasEnv) return 'both';
  if (hasKeychain) return 'file';
  if (hasEnv) return 'env';
  if (hasTrustedSharedKeychain) return 'runtime';
  return 'none';
}

export function setManagedProviderCredentialEnv(apiKeyEnv: string, value: string): void {
  const envError = validateApiKeyEnv(apiKeyEnv);
  if (envError) {
    console.warn(`[provider] refusing to inject unsafe apiKeyEnv "${apiKeyEnv}": ${envError}`);
    return;
  }
  setManagedProviderEnv(apiKeyEnv, value);
}

export async function listKnownProviderIds(): Promise<readonly string[]> {
  await providerConfigStore.load();
  const ids = new Set(BUILTIN_PROVIDERS.map((provider) => provider.id));
  for (const provider of providerConfigStore.listCustom()) ids.add(provider.id);
  for (const provider of await loadKodaxCustomProviders()) ids.add(provider.id);
  return [...ids];
}

export async function resolveCredentialProviderIds(
  primaryProvider: string,
  resolver: () => Promise<readonly string[]>,
): Promise<readonly string[]> {
  const configuredProviders = await resolver();
  return [...new Set([primaryProvider, ...configuredProviders])].filter(
    (provider) => provider !== 'mock' && provider.trim().length > 0,
  );
}

export async function resolveProviderCredentialInfo(
  providerId: string,
): Promise<{ readonly apiKeyEnv: string } | undefined> {
  if (isBuiltinId(providerId)) {
    const builtin = getBuiltin(providerId);
    return builtin ? { apiKeyEnv: builtin.apiKeyEnv } : undefined;
  }
  await providerConfigStore.load();
  const custom = providerConfigStore.getCustom(providerId);
  if (custom) return { apiKeyEnv: custom.apiKeyEnv };
  const sdkCustom = (await loadKodaxCustomProviders()).find(
    (provider) => provider.id === providerId,
  );
  return sdkCustom ? { apiKeyEnv: sdkCustom.apiKeyEnv } : undefined;
}

/** Main-process-only lookup. The returned secret must never cross renderer IPC. */
export async function readProviderCredential(providerId: string, connectionFingerprint?: string): Promise<string | undefined> {
  if (providerId === 'mock') return undefined;
  const stored = await getKey(providerId, connectionFingerprint);
  const connection = await configuredConnection(providerId);
  if (connection?.oauth) {
    if (!connection.oauthRegistration) throw new Error('OAuth connection has no approved registration.');
    const [runtime, llm] = await Promise.all([import('@kodax-ai/kodax/runtime'), import('@kodax-ai/kodax/llm')]);
    const configPath = path.join(getKodaxRuntimeDir(), 'config.json');
    await runtime.migrateProviderOAuthRegistration({ configPath, registrationId: connection.oauthRegistration });
    const key = JSON.stringify([configPath, connection.oauthRegistration]);
    const previous = oauthSessions.get(providerId);
    if (previous && previous.key !== key) { previous.unsubscribe(); oauthSessions.delete(providerId); await invalidateProviderCredential(providerId); }
    let session = oauthSessions.get(providerId)?.session;
    if (!session) {
      session = await llm.openOAuthSession({ id: connection.oauthRegistration, store: runtime.providerOAuthStore(configPath), driver: llm.createOAuthRefreshDriver(connection.oauth) });
      const unsubscribe = session.onInvalidate(() => invalidateProviderCredential(providerId));
      oauthSessions.set(providerId, { key, session, unsubscribe });
    }
    if ((session.profile ?? 'default') !== 'default' || session.service !== connection.oauth
      || (connection.oauth === 'radius' && new URL(session.issuer ?? '').href.replace(/\/$/, '') !== new URL(connection.baseUrl).href.replace(/\/$/, ''))) throw new Error('OAuth registration does not match the approved connection.');
    return rememberProviderSecret(await session.acquire());
  }
  if (connection?.cloud) {
    const [runtime, llm] = await Promise.all([import('@kodax-ai/kodax/runtime'), import('@kodax-ai/kodax/llm')]);
    const credential = stored ? connection.cloud.service === 'bedrock' ? { type: 'bearer' as const, token: stored } : { type: 'api-key' as const, key: stored }
      : await runtime.createNativeCloudCredentialResolver(connection)(new AbortController().signal);
    for (const value of Object.values(credential)) if (typeof value === 'string') rememberProviderSecret(value);
    return rememberProviderSecret(llm.serializeCloudCredential(providerId, credential));
  }
  const info = await resolveProviderCredentialInfo(providerId);
  if (!info) return undefined;
  if (hasNonEmptyValue(stored)) return stored;
  return externalProviderEnvValue(info.apiKeyEnv);
}

export async function ensureProviderKeyInjected(providerId: string): Promise<boolean> {
  if (providerId === 'mock') return false;
  const info = await resolveProviderCredentialInfo(providerId);
  if (!info) return false;
  if ((await describeProviderCredential(providerId)).authenticationConfigured === true) return true;
  const credential = await readProviderCredential(providerId);
  if (!credential) {
    restoreManagedProviderEnv(info.apiKeyEnv);
    return false;
  }
  return true;
}
