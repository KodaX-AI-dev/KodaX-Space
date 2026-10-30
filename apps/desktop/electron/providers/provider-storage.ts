import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { KodaXCustomProviderConfig } from '@kodax-ai/kodax/llm';
import { getKodaxRuntimeDir } from '../kodax/data-paths.js';
import { mergeSdkCustomProviderConfig, normalizeSpaceCustomProviderForSdk } from '../kodax/user-config.js';
import { providerConfigStore } from './config.js';
import * as legacy from './keychain.js';
import { createSpaceFileCredentials, type SpaceCredentialState } from './file-credentials.js';
import { rememberProviderSecret } from './managed-env.js';

const sdk = () => import('@kodax-ai/kodax/llm');
const authPath = () => path.join(getKodaxRuntimeDir(), 'auth.json');

export async function configuredConnection(provider: string): Promise<KodaXCustomProviderConfig | undefined> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path.join(getKodaxRuntimeDir(), 'config.json'), 'utf8')) as unknown; }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw new Error('Cannot read provider configuration.'); }
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) throw new Error('Invalid provider configuration.');
  const configured = raw && typeof raw === 'object' && 'customProviders' in raw ? raw.customProviders : undefined;
  if (configured !== undefined && !Array.isArray(configured)) throw new Error('Invalid custom provider configuration.');
  const matches = Array.isArray(configured) ? configured.filter((value: unknown) => value && typeof value === 'object' && 'name' in value && value.name === provider) : [];
  if (matches.length > 1) throw new Error('Duplicate configured provider.');
  const existing = matches[0] as KodaXCustomProviderConfig | undefined;
  await providerConfigStore.load();
  const space = providerConfigStore.getCustom(provider);
  return space ? mergeSdkCustomProviderConfig(existing, normalizeSpaceCustomProviderForSdk(space)!) : existing;
}

export async function providerStorageBinding(provider: string) {
  const module = await sdk();
  const connection = Object.hasOwn(module.KODAX_PROVIDER_SNAPSHOTS, provider)
    ? module.getProvider(provider) : module.createCustomProvider((await configuredConnection(provider)) ?? (() => { throw new Error('Unknown configured provider.'); })());
  return { profile: 'default', provider, connectionFingerprint: connection.getCredentialConnectionFingerprint() };
}

let credentials: ReturnType<typeof createSpaceFileCredentials> | undefined;
async function storage() {
  if (credentials) return credentials;
  const file = (await sdk()).createFileProviderCredentialStore(authPath());
  await file.initialize();
  credentials = createSpaceFileCredentials({ store: file, resolve: providerStorageBinding,
    legacy: { has: legacy.hasMigrationKey, read: process.env.KODAX_TEST_ONBOARDING ? legacy.getKey : legacy.getPersistentKey, remove: legacy.deleteKey } });
  return credentials;
}

// Aliases are an explicit reviewed migration map, never inferred from equal env names.
function legacyAccounts(provider: string): readonly string[] {
  return provider === 'openai' ? ['openai', 'codex-cli'] : provider === 'codex-cli' ? ['codex-cli', 'openai'] : [provider];
}
export async function describeProviderCredential(provider: string): Promise<SpaceCredentialState> {
  const state = await (await storage()).describe(provider, legacyAccounts(provider));
  const module = await sdk();
  const snapshot = Object.entries(module.KODAX_PROVIDER_SNAPSHOTS).find(([name]) => name === provider)?.[1];
  if (snapshot?.capabilityProfile.transport === 'cli-bridge') return { ...state, authentication: 'external', authenticationConfigured: true };
  const connection = await configuredConnection(provider);
  if (connection?.cloud) return { ...state, authentication: 'cloud', authenticationConfigured: true };
  if (connection?.oauth) {
    const registered = connection.oauthRegistration && await module.createFileProviderCredentialStore(authPath()).oauth.transact(connection.oauthRegistration,
      async record => ({ record, result: !!record && (record.profile ?? 'default') === state.binding.profile && record.service === connection.oauth && !!record.credentials }));
    return { ...state, authentication: 'oauth', authenticationConfigured: !!registered };
  }
  return state;
}
export async function getKey(provider: string, proof?: string): Promise<string | undefined> {
  const store = await storage();
  let key = await store.read(provider, legacyAccounts(provider), proof);
  if (!key && (provider === 'codex-cli' || provider === 'openai')) {
    const state = await store.describe(provider, []);
    if (state.revision === null) key = await store.read(provider === 'openai' ? 'codex-cli' : 'openai', [], undefined);
  }
  return key === undefined ? undefined : rememberProviderSecret(key);
}
export async function assertProviderCredentialState(provider: string, expected: SpaceCredentialState | undefined): Promise<SpaceCredentialState> {
  if (!expected) throw new Error('Provider update requires its displayed credential revision. Refresh before retrying.');
  const current = await describeProviderCredential(provider);
  if (JSON.stringify(current.binding) !== JSON.stringify(expected.binding) || current.revision !== expected.revision) throw new Error('Provider connection or credential changed. Refresh before retrying.');
  return current;
}
export async function setKey(provider: string, key: string, expected?: SpaceCredentialState): Promise<void> {
  if (!expected) throw new Error('Credential update requires its displayed revision. Refresh before retrying.');
  if ((await configuredConnection(provider))?.oauth) throw new Error('Use OAuth login for this connection. API-key storage cannot replace its grant.');
  rememberProviderSecret(key);
  const store = await storage();
  await store.set(provider, key, expected, legacyAccounts(provider));
}
export async function deleteKey(provider: string, expected?: SpaceCredentialState): Promise<boolean> {
  if (!expected) throw new Error('Credential removal requires its displayed revision. Refresh before retrying.');
  const store = await storage();
  return store.remove(provider, expected, legacyAccounts(provider));
}
export async function removeProviderWithCredentials(provider: string, expected: SpaceCredentialState | undefined, operation: () => Promise<boolean>): Promise<boolean> {
  if (!expected) throw new Error('Provider removal requires its displayed credential revision. Refresh before retrying.');
  return (await storage()).removeWithConfig(provider, expected, operation, legacyAccounts(provider));
}
export async function moveProviderCredential(provider: string, previous: SpaceCredentialState): Promise<SpaceCredentialState | undefined> {
  const connection = await configuredConnection(provider);
  if (!connection) throw new Error('Unknown alias migration destination.');
  const proof = (await sdk()).createCustomProvider({ ...connection, name: previous.binding.provider }).getCredentialConnectionFingerprint();
  return (await storage()).move(provider, previous, proof);
}
export async function hasKey(provider: string): Promise<boolean> {
  const state = await describeProviderCredential(provider);
  return state.configured || (state.revision === null && state.migration === 'pending');
}
export async function listConfiguredAccounts(candidates: readonly string[]): Promise<readonly string[]> {
  return (await Promise.all(candidates.map(async provider => await hasKey(provider) ? provider : undefined))).filter((id): id is string => id !== undefined);
}
export async function getBackendStatus(): Promise<'file'> { await storage(); return 'file'; }
