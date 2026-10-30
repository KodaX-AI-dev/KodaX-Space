import type { FileProviderCredentialStore, ProviderCredentialFileBinding } from '@kodax-ai/kodax/llm';

export interface SpaceCredentialState {
  readonly binding: ProviderCredentialFileBinding;
  readonly revision: string | null;
  readonly configured: boolean;
  readonly migration: 'none' | 'pending' | 'conflict' | 'unavailable';
  readonly authentication?: 'oauth' | 'cloud' | 'external';
  readonly authenticationConfigured?: boolean;
}
interface FileCredentialDependencies {
  readonly store: FileProviderCredentialStore;
  readonly resolve: (provider: string) => Promise<ProviderCredentialFileBinding>;
  readonly legacy: {
    has(account: string): Promise<boolean>;
    read(account: string): Promise<string | undefined>;
    remove(account: string): Promise<boolean>;
  };
}
type CredentialContext = FileCredentialDependencies & { readonly conflicts: Set<string>; readonly unavailable: Set<string> };
function sameBinding(a: ProviderCredentialFileBinding, b: ProviderCredentialFileBinding): boolean {
  return a.profile === b.profile && a.provider === b.provider && a.connectionFingerprint === b.connectionFingerprint;
}
async function describe(context: CredentialContext, provider: string, accounts: readonly string[]): Promise<SpaceCredentialState> {
  const binding = await context.resolve(provider), saved = await context.store.describeApiKey(binding), id = JSON.stringify(binding);
  let pending = false;
  try { pending = (await Promise.all(accounts.map(account => context.legacy.has(account)))).some(Boolean); }
  catch { context.unavailable.add(id); }
  return { binding, revision: saved.revision ?? null, configured: saved.configured,
    migration: context.unavailable.has(id) ? 'unavailable' : context.conflicts.has(id) ? 'conflict' : pending ? 'pending' : 'none' };
}
async function checkedBinding(context: CredentialContext, provider: string, expected: SpaceCredentialState) {
  const binding = await context.resolve(provider);
  if (!expected || !sameBinding(binding, expected.binding) || (expected.revision !== null && typeof expected.revision !== 'string')) {
    throw new Error('Provider connection changed. Refresh its state before retrying.');
  }
  return binding;
}
async function cleanup(context: CredentialContext, accounts: readonly string[], key?: string): Promise<void> {
  try {
    for (const account of accounts) {
      if (key !== undefined && await context.legacy.read(account) !== key) continue;
      if (await context.legacy.has(account)) await context.legacy.remove(account);
    }
  } catch { throw new Error('Credential file was committed, but legacy cleanup failed. Refresh its migration state before retrying.'); }
}
async function legacyKey(context: CredentialContext, binding: ProviderCredentialFileBinding, account: string, saved: boolean) {
  try {
    if (!await context.legacy.has(account)) return undefined;
    const previous = await context.legacy.read(account);
    if (previous === undefined) throw new Error('Legacy credential is missing.');
    return previous;
  } catch {
    context.unavailable.add(JSON.stringify(binding));
    if (saved) return undefined;
    throw new Error('Legacy credential migration is unavailable. Restore its storage before retrying.');
  }
}
async function read(context: CredentialContext, provider: string, accounts: readonly string[], proof?: string): Promise<string | undefined> {
  const binding = await context.resolve(provider);
  if (proof !== undefined && binding.connectionFingerprint !== proof) throw new Error('Provider credential connection does not match.');
  let saved = await context.store.readApiKey(binding);
  const state = await context.store.describeApiKey(binding);
  if (!saved && state.revision !== undefined) return undefined;
  for (const account of accounts) {
    const previous = await legacyKey(context, binding, account, saved !== undefined);
    if (previous === undefined) continue;
    if (!saved) {
      try { await context.store.setApiKey(binding, previous, state.revision ?? null); }
      catch (error) { saved = await context.store.readApiKey(binding); if (!saved) throw error; }
      saved = await context.store.readApiKey(binding);
    }
    if (saved?.key !== previous) { context.conflicts.add(JSON.stringify(binding)); continue; }
    await cleanup(context, [account], previous);
  }
  if (!sameBinding(binding, await context.resolve(provider))) throw new Error('Provider connection changed during credential migration.');
  return (await context.store.readApiKey(binding))?.key;
}
async function move(context: CredentialContext, provider: string, previous: SpaceCredentialState, targetAsPreviousAlias: string) {
  const target = await context.resolve(provider), source = previous.binding;
  if (target.profile !== source.profile || targetAsPreviousAlias !== source.connectionFingerprint) return;
  const key = await context.store.readApiKey(source);
  if (!key || key.revision !== previous.revision) throw new Error('Credential alias changed concurrently.');
  const existing = await context.store.readApiKey(target), state = await context.store.describeApiKey(target);
  if (existing && existing.key !== key.key) throw new Error('Credential alias destination conflict.');
  const copied = existing ?? await context.store.setApiKey(target, key.key, state.revision ?? null);
  try { await context.store.removeApiKey(source, key.revision); }
  catch (error) { if (!existing) await context.store.removeApiKey(target, copied.revision); throw error; }
  return { binding: target, revision: copied.revision, configured: true, migration: 'none' as const };
}
async function set(context: CredentialContext, provider: string, key: string, expected: SpaceCredentialState, accounts: readonly string[]) {
  const binding = await checkedBinding(context, provider, expected), previous = await context.store.readApiKey(binding);
  const saved = await context.store.setApiKey(binding, key, expected.revision);
  if (!sameBinding(binding, await context.resolve(provider))) {
    if (previous) await context.store.setApiKey(binding, previous.key, saved.revision);
    else await context.store.removeApiKey(binding, saved.revision);
    throw new Error('Provider connection changed while saving credentials.');
  }
  await cleanup(context, accounts);
  context.conflicts.delete(JSON.stringify(binding)); context.unavailable.delete(JSON.stringify(binding));
}
async function remove(context: CredentialContext, provider: string, expected: SpaceCredentialState, accounts: readonly string[]) {
  const binding = await checkedBinding(context, provider, expected);
  await context.store.removeApiKey(binding, expected.revision);
  await cleanup(context, accounts);
  context.conflicts.delete(JSON.stringify(binding)); context.unavailable.delete(JSON.stringify(binding));
  return expected.configured;
}
async function removeWithConfig(context: CredentialContext, provider: string, expected: SpaceCredentialState,
  operation: () => Promise<boolean>, accounts: readonly string[]): Promise<boolean> {
  const binding = await checkedBinding(context, provider, expected);
  let previous = (await context.store.readApiKey(binding))?.key;
  if (!previous) for (const account of accounts) { previous = await legacyKey(context, binding, account, false); if (previous) break; }
  const removed = await context.store.removeApiKey(binding, expected.revision);
  try { if (!await operation()) throw new Error('Provider configuration changed before deletion.'); }
  catch (error) {
    if (previous) await context.store.setApiKey(binding, previous, removed.revision);
    throw error;
  }
  await cleanup(context, accounts);
  return true;
}
/** Main-only adapter. No decrypted credential or legacy account value crosses IPC. */
export function createSpaceFileCredentials(input: FileCredentialDependencies) {
  const context: CredentialContext = { ...input, conflicts: new Set(), unavailable: new Set() };
  return {
    describe: (provider: string, accounts: readonly string[]) => describe(context, provider, accounts),
    read: (provider: string, accounts: readonly string[], proof?: string) => read(context, provider, accounts, proof),
    move: (provider: string, previous: SpaceCredentialState, targetAsPreviousAlias: string) => move(context, provider, previous, targetAsPreviousAlias),
    set: (provider: string, key: string, expected: SpaceCredentialState, accounts: readonly string[] = []) => set(context, provider, key, expected, accounts),
    remove: (provider: string, expected: SpaceCredentialState, accounts: readonly string[] = []) => remove(context, provider, expected, accounts),
    removeWithConfig: (provider: string, expected: SpaceCredentialState, operation: () => Promise<boolean>, accounts: readonly string[]) => removeWithConfig(context, provider, expected, operation, accounts),
  };
}
