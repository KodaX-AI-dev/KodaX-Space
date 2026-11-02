import path from 'node:path';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { KodaXCustomProviderConfig } from '@kodax-ai/kodax/llm';
import { getKodaxRuntimeDir, getSpaceDataDir } from '../kodax/data-paths.js';
import {
  mergeSdkCustomProviderConfig,
  normalizeSpaceCustomProviderForSdk,
} from '../kodax/user-config.js';
import { providerConfigStore } from './config.js';
import * as legacy from './keychain.js';
import { createSpaceFileCredentials, type SpaceCredentialState } from './file-credentials.js';
import { externalProviderEnvValue, rememberProviderSecret } from './managed-env.js';
import { invalidateProviderCredential } from './credential-invalidation.js';
import { legacyDiscovery } from './legacy-discovery.js';

const sdk = () => import('@kodax-ai/kodax/llm');
const authPath = () => path.join(getKodaxRuntimeDir(), 'auth.json');

async function readProviderConfiguration(): Promise<unknown> {
  const { withCoreConfigWriteLock, CoreConfigWriteConflictError } = await import('@kodax-ai/kodax/repl');
  const file = path.join(getKodaxRuntimeDir(), 'config.json');
  const backoff = [10, 25, 50, 100];
  for (let attempt = 0; ; attempt++) {
    try {
      // Some SDK writers truncate under this lock; async reads can observe half-written JSON.
      return withCoreConfigWriteLock(file, () => JSON.parse(readFileSync(file, 'utf8')) as unknown);
    } catch (error) {
      if (error instanceof CoreConfigWriteConflictError && attempt < backoff.length) {
        await delay(backoff[attempt]);
        continue;
      }
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT') return undefined;
      // JSON parser messages can quote config values; report only the failure category.
      const reason = error instanceof CoreConfigWriteConflictError ? 'configuration busy'
        : error instanceof SyntaxError ? 'invalid JSON'
        : typeof code === 'string' && /^[A-Z_]{2,32}$/.test(code) ? code : 'read failed';
      throw new Error(`Cannot read provider configuration (${reason}).`);
    }
  }
}

export async function configuredConnection(
  provider: string,
): Promise<KodaXCustomProviderConfig | undefined> {
  const raw = await readProviderConfiguration();
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw)))
    throw new Error('Invalid provider configuration.');
  const configured =
    raw && typeof raw === 'object' && 'customProviders' in raw ? raw.customProviders : undefined;
  if (configured !== undefined && !Array.isArray(configured))
    throw new Error('Invalid custom provider configuration.');
  const matches = Array.isArray(configured)
    ? configured.filter(
        (value: unknown) =>
          value && typeof value === 'object' && 'name' in value && value.name === provider,
      )
    : [];
  if (matches.length > 1) throw new Error('Duplicate configured provider.');
  const existing = matches[0] as KodaXCustomProviderConfig | undefined;
  await providerConfigStore.load();
  const space = providerConfigStore.getCustom(provider);
  return space
    ? mergeSdkCustomProviderConfig(existing, normalizeSpaceCustomProviderForSdk(space)!)
    : existing;
}

export async function providerStorageBinding(provider: string) {
  const module = await sdk();
  const connection = Object.hasOwn(module.KODAX_PROVIDER_SNAPSHOTS, provider)
    ? module.getProvider(provider)
    : module.createCustomProvider(
        (await configuredConnection(provider)) ??
          (() => {
            throw new Error('Unknown configured provider.');
          })(),
      );
  return {
    profile: 'default',
    provider,
    connectionFingerprint: connection.getCredentialConnectionFingerprint(),
  };
}

let storageInitialization: Promise<ReturnType<typeof createSpaceFileCredentials>> | undefined;
function storage(): Promise<ReturnType<typeof createSpaceFileCredentials>> {
  return (storageInitialization ??= initializeStorage().catch((error: unknown) => {
    storageInitialization = undefined;
    throw error;
  }));
}
async function initializeStorage() {
  const file = (await sdk()).createFileProviderCredentialStore(authPath());
  await file.initialize();
  const discovery = process.env.KODAX_TEST_ONBOARDING
    ? { enabled: true, scopeId: undefined }
    : await legacyDiscovery(file, getSpaceDataDir());
  return createSpaceFileCredentials({
    store: file,
    scopeId: discovery.scopeId,
    resolve: providerStorageBinding,
    hasEnvironment: async (provider) => {
      const module = await sdk(),
        preset = Object.entries(module.KODAX_PROVIDER_SNAPSHOTS).find(
          ([name]) => name === provider,
        )?.[1];
      if (preset?.capabilityProfile.transport === 'cli-bridge') return false;
      const connection = await configuredConnection(provider);
      return (
        !connection?.oauth &&
        externalProviderEnvValue(preset?.apiKeyEnv ?? connection?.apiKeyEnv ?? '') !== undefined
      );
    },
    legacy: {
      has: (account) =>
        discovery.enabled ? legacy.hasMigrationKey(account) : Promise.resolve(false),
      read: process.env.KODAX_TEST_ONBOARDING ? legacy.getKey : legacy.getPersistentKey,
      remove: legacy.deleteKey,
    },
  });
}

async function fencePreviousCredentials(provider: string): Promise<void> {
  try {
    await invalidateProviderCredential(provider);
  } catch {
    console.warn(
      '[provider] Credential is saved and fenced locally; some previous Host leases could not be closed.',
    );
  }
}

// Aliases are an explicit reviewed migration map, never inferred from equal env names.
function legacyAccounts(provider: string): readonly string[] {
  return provider === 'openai'
    ? ['openai', 'codex-cli']
    : provider === 'codex-cli'
      ? ['codex-cli', 'openai']
      : [provider];
}
export async function describeProviderCredential(provider: string): Promise<SpaceCredentialState> {
  const state = await (await storage()).describe(provider, legacyAccounts(provider));
  const module = await sdk();
  const snapshot = Object.entries(module.KODAX_PROVIDER_SNAPSHOTS).find(
    ([name]) => name === provider,
  )?.[1];
  if (snapshot?.capabilityProfile.transport === 'cli-bridge')
    return { ...state, authentication: 'external', authenticationConfigured: true };
  const connection = await configuredConnection(provider);
  if (connection?.cloud)
    return { ...state, authentication: 'cloud', authenticationConfigured: true };
  if (connection?.oauth) {
    const profile = (await providerStorageBinding(provider)).profile;
    const registered =
      connection.oauthRegistration &&
      (await module
        .createFileProviderCredentialStore(authPath())
        .oauth.transact(connection.oauthRegistration, async (record) => ({
          record,
          result:
            !!record &&
            (record.profile ?? 'default') === profile &&
            record.service === connection.oauth &&
            !!record.credentials,
        })));
    return {
      ...state,
      migration: 'none',
      authentication: 'oauth',
      authenticationConfigured: !!registered,
    };
  }
  return state;
}
export async function getKey(provider: string, proof?: string): Promise<string | undefined> {
  const store = await storage();
  let key = await store.read(provider, legacyAccounts(provider), proof);
  if (!key && (provider === 'codex-cli' || provider === 'openai')) {
    const state = await store.describe(provider, []);
    if (state.scope === 'shared' && state.revision === null)
      key = await store.read(provider === 'openai' ? 'codex-cli' : 'openai', [], undefined);
  }
  return key === undefined ? undefined : rememberProviderSecret(key);
}
export async function assertProviderCredentialState(
  provider: string,
  expected: SpaceCredentialState | undefined,
): Promise<SpaceCredentialState> {
  if (!expected)
    throw new Error(
      'Provider update requires its displayed credential revision. Refresh before retrying.',
    );
  const current = await describeProviderCredential(provider);
  if (
    JSON.stringify(current.binding) !== JSON.stringify(expected.binding) ||
    current.revision !== expected.revision ||
    current.scope !== expected.scope ||
    current.selectionRevision !== expected.selectionRevision ||
    current.sharedRevision !== expected.sharedRevision
  )
    throw new Error('Provider connection or credential changed. Refresh before retrying.');
  return (await storage()).pin(provider, current, legacyAccounts(provider));
}
export async function setKey(
  provider: string,
  key: string,
  expected?: SpaceCredentialState,
): Promise<void> {
  if (!expected)
    throw new Error('Credential update requires its displayed revision. Refresh before retrying.');
  if ((await configuredConnection(provider))?.oauth)
    throw new Error(
      'Use OAuth login for this connection. API-key storage cannot replace its grant.',
    );
  rememberProviderSecret(key);
  const store = await storage();
  await store.set(provider, key, expected, legacyAccounts(provider));
  await fencePreviousCredentials(provider);
}
export async function deleteKey(
  provider: string,
  expected?: SpaceCredentialState,
): Promise<boolean> {
  if (!expected)
    throw new Error('Credential removal requires its displayed revision. Refresh before retrying.');
  const store = await storage();
  const removed = await store.remove(provider, expected, legacyAccounts(provider));
  await fencePreviousCredentials(provider);
  return removed;
}
export async function shareProviderCredential(
  provider: string,
  expected: SpaceCredentialState,
  mode: 'publish' | 'adopt',
): Promise<void> {
  if ((await configuredConnection(provider))?.oauth)
    throw new Error('Use OAuth login for this connection.');
  await (await storage()).share(provider, expected, mode, legacyAccounts(provider));
  await fencePreviousCredentials(provider);
}
export async function removeProviderWithCredentials(
  provider: string,
  expected: SpaceCredentialState | undefined,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  if (!expected)
    throw new Error(
      'Provider removal requires its displayed credential revision. Refresh before retrying.',
    );
  const removed = await (
    await storage()
  ).removeWithConfig(provider, expected, operation, legacyAccounts(provider));
  await fencePreviousCredentials(provider);
  return removed;
}
export async function moveProviderCredential(
  provider: string,
  previous: SpaceCredentialState,
): Promise<SpaceCredentialState | undefined> {
  const connection = await configuredConnection(provider);
  if (!connection) throw new Error('Unknown alias migration destination.');
  const proof = (await sdk())
    .createCustomProvider({ ...connection, name: previous.binding.provider })
    .getCredentialConnectionFingerprint();
  const moved = await (
    await storage()
  ).move(provider, previous, proof, legacyAccounts(previous.binding.provider));
  if (moved) {
    await fencePreviousCredentials(previous.binding.provider);
    await fencePreviousCredentials(provider);
  }
  return moved;
}
export async function hasKey(provider: string): Promise<boolean> {
  const state = await describeProviderCredential(provider);
  return state.configured || (state.revision === null && state.migration === 'pending');
}
export async function listConfiguredAccounts(
  candidates: readonly string[],
): Promise<readonly string[]> {
  return (
    await Promise.all(
      candidates.map(async (provider) => ((await hasKey(provider)) ? provider : undefined)),
    )
  ).filter((id): id is string => id !== undefined);
}
export async function getBackendStatus(): Promise<'file'> {
  await storage();
  return 'file';
}

/** Establish auth.json/staging protection before Main exposes executable tools. */
export async function initializeProviderCredentialStorage(): Promise<void> {
  await storage();
}
