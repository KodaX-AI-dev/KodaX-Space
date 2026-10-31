import { createHash } from 'node:crypto';
import path from 'node:path';
import type { RuntimeClientSecretStore } from './runtime-client-identity.js';
import { getKodaxRuntimeDir } from '../data-paths.js';
import { verifyLegacyRuntimeSecret } from './runtime-credential-recovery.js';
import { rememberProviderSecret } from '../../providers/managed-env.js';
import type { FileProviderCredentialStore } from '@kodax-ai/kodax/llm';

async function openFile(authFile: string): Promise<FileProviderCredentialStore> {
  const sdk = await import('@kodax-ai/kodax/llm');
  const file = sdk.createFileProviderCredentialStore(authFile); await file.initialize(); return file;
}
function legacyStore(authFile: string): RuntimeClientSecretStore {
  return {
    async read(account, identity) {
      if (process.env.KODAX_TEST_ONBOARDING) {
        const moduleId = '@napi-rs/keyring/keytar.js';
        const keyring = await import(moduleId) as typeof import('@napi-rs/keyring/keytar.js');
        return (await keyring.getPassword('kodax-space-test-runtime', account)) ?? undefined;
      }
      const keychain = await import('../../providers/keychain.js');
      return keychain.getPersistentKey(account, identity ? candidate => verifyLegacyRuntimeSecret(identity, candidate,
        path.join(path.dirname(authFile), 'runtime', 'daemon', 'coder', 'host-tool-invocations.json')) : undefined);
    },
    async write() { throw new Error('Legacy client secret storage is read-only.'); },
  };
}

/** Separate reserved bindings in auth.json; never project client secrets into Provider IPC. */
export function createRuntimeClientFileSecretStore(input: {
  readonly authFile?: string;
  readonly legacy?: RuntimeClientSecretStore;
} = {}): RuntimeClientSecretStore {
  const authFile = input.authFile ?? path.join(getKodaxRuntimeDir(), 'auth.json');
  let pending: Promise<FileProviderCredentialStore> | undefined;
  const store = () => pending ??= openFile(authFile).catch(error => { pending = undefined; throw error; });
  const binding = (account: string) => ({ profile: 'space-client-identity', provider: account,
    connectionFingerprint: createHash('sha256').update(JSON.stringify(['space-client-secret-v1', account])).digest('hex') });
  const legacy = input.legacy ?? legacyStore(authFile);
  return {
    async read(account, identity) {
      const file = await store(), target = binding(account), current = await file.readApiKey(target);
      if (current) return rememberProviderSecret(current.key);
      const state = await file.describeApiKey(target);
      if (state.revision !== undefined) return undefined;
      if (identity === undefined) return undefined; // New candidate accounts have no legacy authority to import.
      const previous = await legacy.read(account, identity);
      if (previous === undefined) return undefined;
      try { await file.setApiKey(target, previous, null); }
      catch (error) {
        if ((await file.readApiKey(target))?.key !== previous) throw error;
      }
      if ((await file.readApiKey(target))?.key !== previous) throw new Error('Client secret migration changed concurrently.');
      return rememberProviderSecret(previous);
    },
    async write(account, secret) {
      rememberProviderSecret(secret);
      const file = await store(), target = binding(account), state = await file.describeApiKey(target);
      await file.setApiKey(target, secret, state.revision ?? null);
    },
  };
}
