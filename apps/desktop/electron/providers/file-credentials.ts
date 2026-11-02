import type { AtomicFileProviderCredentialStore, ProviderApiKeyMutation, ProviderApiKeySnapshot, ProviderCredentialFileBinding } from '@kodax-ai/kodax/llm';
import { createHash } from 'node:crypto';

export interface SpaceCredentialState {
  readonly binding: ProviderCredentialFileBinding;
  readonly revision: string | null;
  readonly configured: boolean;
  readonly migration: 'none' | 'pending' | 'conflict' | 'unavailable' | 'connection-changed';
  readonly scope?: 'shared' | 'space';
  readonly sharedRevision?: string | null;
  readonly selectionRevision?: string | null;
  readonly sharedConfigured?: boolean;
  readonly authentication?: 'oauth' | 'cloud' | 'external';
  readonly authenticationConfigured?: boolean;
}
interface FileCredentialDependencies {
  readonly store: AtomicFileProviderCredentialStore;
  readonly resolve: (provider: string) => Promise<ProviderCredentialFileBinding>;
  readonly hasEnvironment?: (provider: string) => Promise<boolean>;
  readonly scopeId?: string;
  readonly legacy: {
    has(account: string): Promise<boolean>;
    read(account: string): Promise<string | undefined>;
    remove(account: string): Promise<boolean>;
  };
}
interface Snapshot {
  readonly shared: ProviderApiKeySnapshot;
  readonly space: ProviderApiKeySnapshot;
  readonly selection: ProviderApiKeySnapshot;
  readonly selected: ProviderApiKeySnapshot;
  readonly scope: 'space' | 'shared';
  readonly migration: SpaceCredentialState['migration'];
  readonly environment: boolean;
}
function sameBinding(a: ProviderCredentialFileBinding, b: ProviderCredentialFileBinding): boolean {
  return a.profile === b.profile && a.provider === b.provider && a.connectionFingerprint === b.connectionFingerprint;
}
function related(binding: ProviderCredentialFileBinding, scopeId?: string) {
  const scope = scopeId ? `:${scopeId}` : '';
  return [binding, { ...binding, profile: `space-legacy-provider:${binding.profile}${scope}` },
    { ...binding, profile: `space-provider-selection:${binding.profile}${scope}`,
      connectionFingerprint: createHash('sha256').update(JSON.stringify(['space-provider-selection-v1', binding.profile, binding.provider, scope])).digest('hex') }] as const;
}
function selectionValue(scope: 'space' | 'shared', binding: ProviderCredentialFileBinding): string {
  return JSON.stringify({ version: 1, scope, connectionFingerprint: binding.connectionFingerprint });
}
function selection(record: ProviderApiKeySnapshot): { readonly scope: 'space' | 'shared'; readonly connectionFingerprint: string } | undefined {
  if (record.key === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(record.key) as unknown; } catch { throw new Error('Invalid provider credential selection.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('version' in value) || value.version !== 1
    || !('scope' in value) || (value.scope !== 'space' && value.scope !== 'shared') || !('connectionFingerprint' in value)
    || typeof value.connectionFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.connectionFingerprint)
    || Object.keys(value).some(key => !['version', 'scope', 'connectionFingerprint'].includes(key))) throw new Error('Invalid provider credential selection.');
  return { scope: value.scope, connectionFingerprint: value.connectionFingerprint };
}
async function discover(context: FileCredentialDependencies, accounts: readonly string[]) {
  try { return (await Promise.all(accounts.map(account => context.legacy.has(account)))).some(Boolean) ? 'pending' as const : 'none' as const; }
  catch { return 'unavailable' as const; }
}
async function snapshot(context: FileCredentialDependencies, binding: ProviderCredentialFileBinding, accounts: readonly string[]): Promise<Snapshot> {
  const [shared, space, selectedSource] = await context.store.readApiKeys(related(binding, context.scopeId));
  if (!shared || !space || !selectedSource) {
    throw new Error('Invalid provider credential selection. Restore its saved state before retrying.');
  }
  const choice = selection(selectedSource), otherRoute = !!choice && choice.connectionFingerprint !== binding.connectionFingerprint;
  const changed = otherRoute;
  const known = otherRoute ? 'space' : choice?.scope ?? (space.revision !== null ? 'space' : undefined);
  const legacy = !changed && (known === undefined || (known === 'space' && space.revision === null)) ? await discover(context, accounts) : 'none';
  const environment = known === undefined && legacy === 'none' && !!await context.hasEnvironment?.(binding.provider);
  const scope = known ?? (legacy === 'none' && !environment ? 'shared' : 'space');
  const selected = scope === 'space' ? space : shared;
  const migration = changed ? 'connection-changed' : legacy !== 'none' ? legacy : scope === 'space' && space.key && shared.key && space.key !== shared.key ? 'conflict' : 'none';
  return { shared, space, selection: selectedSource, selected, scope, migration, environment };
}
function state(value: Snapshot): SpaceCredentialState {
  return { binding: value.selected.binding, revision: value.selected.revision, configured: value.selected.key !== undefined && value.migration !== 'connection-changed',
    migration: value.migration, scope: value.scope, sharedRevision: value.shared.revision,
    selectionRevision: value.selection.revision, sharedConfigured: value.shared.key !== undefined };
}
function matches(value: Snapshot, expected: SpaceCredentialState): boolean {
  return !!expected?.binding && sameBinding(value.selected.binding, expected.binding) && value.selected.revision === expected.revision
    && value.scope === (expected.scope ?? 'shared') && value.selection.revision === (expected.selectionRevision ?? null)
    && value.shared.revision === (expected.sharedRevision ?? (expected.scope === 'space' ? null : expected.revision));
}
async function checked(context: FileCredentialDependencies, provider: string, expected: SpaceCredentialState, accounts: readonly string[]) {
  const binding = await context.resolve(provider), current = await snapshot(context, binding, accounts);
  if (!matches(current, expected)) throw new Error('Provider credential conflict: connection or revision changed. Refresh before retrying.');
  return { binding, current };
}
async function oldKey(context: FileCredentialDependencies, accounts: readonly string[]): Promise<string | undefined> {
  try {
    for (const account of accounts) {
      if (!await context.legacy.has(account)) continue;
      const value = await context.legacy.read(account);
      if (value === undefined) throw new Error('Missing legacy credential.');
      return value;
    }
    return undefined;
  } catch { throw new Error('Legacy credential migration is unavailable. Its original value is retained; retry after restoring access.'); }
}
function update(record: ProviderApiKeySnapshot, key?: string): ProviderApiKeyMutation {
  return { binding: record.binding, expectedRevision: record.revision, ...(key === undefined ? {} : { key }) };
}
async function pinEnvironment(context: FileCredentialDependencies, binding: ProviderCredentialFileBinding, current: Snapshot) {
  await context.store.updateApiKeys([update(current.space), update(current.selection, selectionValue('space', binding))]);
  return undefined;
}
async function pinShared(context: FileCredentialDependencies, binding: ProviderCredentialFileBinding, current: Snapshot) {
  await context.store.updateApiKeys([update(current.shared, current.shared.key), update(current.selection, selectionValue('shared', binding))]);
  return (await snapshot(context, binding, [])).selected.key;
}
async function migrateLegacy(context: FileCredentialDependencies, binding: ProviderCredentialFileBinding, current: Snapshot, accounts: readonly string[]) {
  if (current.selection.key === undefined) {
    const [pinned] = await context.store.updateApiKeys([update(current.selection, selectionValue('space', binding))]);
    const latest = await snapshot(context, binding, accounts);
    if (latest.scope !== 'space' || latest.space.revision !== current.space.revision || latest.selection.revision !== pinned?.revision) return latest.selected.key;
    current = latest;
  }
  let key = await oldKey(context, accounts);
  if (key === undefined) throw new Error('The original credential is unavailable. Restore it or explicitly select a new credential.');
  try { await context.store.updateApiKeys([update(current.space, key), update(current.selection, selectionValue('space', binding))]); }
  catch {
    const latest = await snapshot(context, binding, []);
    if (latest.selection.revision !== current.selection.revision || latest.space.revision !== current.space.revision) key = latest.selected.key;
    else console.warn('[provider] Could not persist the legacy migration; the original credential remains active and will be retried.');
    // A failed copy may keep using only the already approved legacy value. The next call retries.
  }
  const latest = await snapshot(context, binding, []);
  if (latest.space.revision !== current.space.revision || latest.selection.revision !== current.selection.revision || latest.selected.key !== undefined) key = latest.selected.key;
  return key;
}
async function read(context: FileCredentialDependencies, provider: string, accounts: readonly string[], proof?: string, retryConflict = true, expectedScope?: Snapshot['scope']): Promise<string | undefined> {
  const binding = await context.resolve(provider);
  if (proof !== undefined && binding.connectionFingerprint !== proof) throw new Error('Provider credential connection does not match.');
  const current = await snapshot(context, binding, accounts);
  if (expectedScope !== undefined && current.scope !== expectedScope) throw new Error('Provider credential conflict: source changed during initialization. Refresh before retrying.');
  let key = current.selected.key;
  if (current.migration === 'connection-changed') throw new Error('Provider connection changed. The original credential is retained; configure this connection explicitly.');
  if (current.migration === 'unavailable') throw new Error('Legacy credential migration is unavailable. Its original value is retained; retry after restoring access.');
  try {
    if (current.environment) key = await pinEnvironment(context, binding, current);
    else if (current.scope === 'shared' && current.shared.key !== undefined && current.selection.key === undefined) key = await pinShared(context, binding, current);
    else if (current.scope === 'space' && current.space.revision === null) key = await migrateLegacy(context, binding, current, accounts);
  } catch (error: unknown) {
    const { CredentialUpdateConflictError } = await import('@kodax-ai/kodax/llm');
    if (!retryConflict || !(error instanceof CredentialUpdateConflictError)) throw error;
    // Another startup read may have fixed this origin after our snapshot. Read
    // authoritative state once; retain the connection proof and every tombstone.
    return read(context, provider, accounts, binding.connectionFingerprint, false, current.scope);
  }
  if (!sameBinding(binding, await context.resolve(provider))) throw new Error('Provider connection changed during credential migration.');
  return key;
}
async function commit(context: FileCredentialDependencies, provider: string, binding: ProviderCredentialFileBinding,
  records: readonly ProviderApiKeySnapshot[], changes: readonly ProviderApiKeyMutation[]): Promise<void> {
  const committed = await context.store.updateApiKeys(changes);
  try {
    if (!sameBinding(binding, await context.resolve(provider))) throw new Error('Provider connection changed while saving credentials.');
  } catch (error) {
    try { await context.store.updateApiKeys(records.map((record, index) => ({ ...update(record, record.key), expectedRevision: committed[index]!.revision! }))); }
    catch (rollback) { throw new AggregateError([error, rollback], 'Credential update failed; concurrent values were preserved. Refresh before retrying.'); }
    throw error;
  }
}
async function set(context: FileCredentialDependencies, provider: string, key: string, expected: SpaceCredentialState, accounts: readonly string[]) {
  const { binding, current } = await checked(context, provider, expected, accounts);
  await commit(context, provider, binding, [current.selected, current.selection],
    [update(current.selected, key), update(current.selection, selectionValue(current.scope, binding))]);
}
async function remove(context: FileCredentialDependencies, provider: string, expected: SpaceCredentialState, accounts: readonly string[]) {
  const { binding, current } = await checked(context, provider, expected, accounts);
  await commit(context, provider, binding, [current.selected, current.selection],
    [update(current.selected), update(current.selection, selectionValue(current.scope, binding))]);
  return expected.configured || current.migration === 'pending';
}
async function share(context: FileCredentialDependencies, provider: string, expected: SpaceCredentialState,
  mode: 'publish' | 'adopt', accounts: readonly string[]): Promise<void> {
  const { binding, current } = await checked(context, provider, expected, accounts);
  if (current.scope !== 'space') throw new Error('Provider already uses its shared credential.');
  if (mode !== 'publish' && mode !== 'adopt') throw new Error('Invalid credential sharing operation.');
  const key = mode === 'adopt' ? current.shared.key : current.space.key
    ?? (current.migration === 'connection-changed' || current.space.revision !== null ? undefined : await oldKey(context, accounts));
  if (key === undefined) throw new Error('The selected credential is not available.');
  const records = [current.shared, current.space, current.selection];
  await commit(context, provider, binding, records, [update(current.shared, key),
    update(current.space, current.space.key ?? (mode === 'publish' ? key : undefined)), update(current.selection, selectionValue('shared', binding))]);
}
async function move(context: FileCredentialDependencies, provider: string, previous: SpaceCredentialState,
  targetAsPreviousAlias: string, accounts: readonly string[]) {
  const target = await context.resolve(provider);
  if (targetAsPreviousAlias !== previous.binding.connectionFingerprint) return;
  const source = { ...previous.binding, profile: target.profile };
  const current = await snapshot(context, source, accounts);
  if (!matches(current, previous)) throw new Error('Credential alias changed concurrently.');
  if (sameBinding(source, target)) return state(current);
  const key = current.selected.key ?? (current.selected.revision === null ? await oldKey(context, accounts) : undefined);
  if (key === undefined) return;
  const destination = await snapshot(context, target, []);
  const selected = current.scope === 'space' ? destination.space : destination.shared;
  if ((selected.key !== undefined && selected.key !== key) || (selected.revision !== null && selected.key === undefined)) throw new Error('Credential alias destination conflict.');
  await context.store.updateApiKeys([update(current.selected), update(current.selection, selectionValue(current.scope, source)),
    update(selected, key), update(destination.selection, selectionValue(current.scope, target))]);
  return state(await snapshot(context, target, []));
}
async function removeWithConfig(context: FileCredentialDependencies, provider: string, expected: SpaceCredentialState,
  operation: () => Promise<boolean>, accounts: readonly string[]): Promise<boolean> {
  const { current } = await checked(context, provider, expected, accounts);
  const previous = current.selected.key ?? (current.selected.revision === null && current.migration !== 'connection-changed' ? await oldKey(context, accounts) : undefined);
  const removed = await context.store.updateApiKeys([update(current.selected), update(current.selection, selectionValue(current.scope, current.shared.binding))]);
  try { if (!await operation()) throw new Error('Provider configuration changed before deletion.'); }
  catch (error) {
    try { await context.store.updateApiKeys([{ ...update(current.selected, previous), expectedRevision: removed[0]!.revision! },
      { ...update(current.selection, previous === undefined ? current.selection.key : selectionValue(current.scope, current.shared.binding)), expectedRevision: removed[1]!.revision! }]); }
    catch (rollback) { throw new AggregateError([error, rollback], 'Provider deletion failed; concurrent credentials were preserved.'); }
    throw error;
  }
  return true;
}
/** Main-only adapter. Legacy imports keep their Space account and never publish a CLI-wide credential. */
export function createSpaceFileCredentials(context: FileCredentialDependencies) {
  return {
    describe: async (provider: string, accounts: readonly string[]) => state(await snapshot(context, await context.resolve(provider), accounts)),
    read: (provider: string, accounts: readonly string[], proof?: string) => read(context, provider, accounts, proof),
    async pin(provider: string, expected: SpaceCredentialState, accounts: readonly string[]) {
      const { binding, current } = await checked(context, provider, expected, accounts);
      if (current.selection.key !== undefined) return state(current);
      const changes = [update(current.selection, selectionValue(current.scope, binding))];
      if (current.environment) changes.unshift(update(current.space));
      const committed = await context.store.updateApiKeys(changes);
      const latest = await snapshot(context, binding, accounts);
      const revision = current.environment ? committed[0]!.revision : current.selected.revision;
      if (latest.selected.revision !== revision || latest.selection.revision !== committed.at(-1)?.revision) throw new Error('Provider credential conflict while preserving its origin.');
      return state(latest);
    },
    move: (provider: string, previous: SpaceCredentialState, proof: string, accounts: readonly string[] = []) => move(context, provider, previous, proof, accounts),
    set: (provider: string, key: string, expected: SpaceCredentialState, accounts: readonly string[] = []) => set(context, provider, key, expected, accounts),
    remove: (provider: string, expected: SpaceCredentialState, accounts: readonly string[] = []) => remove(context, provider, expected, accounts),
    share: (provider: string, expected: SpaceCredentialState, mode: 'publish' | 'adopt', accounts: readonly string[]) => share(context, provider, expected, mode, accounts),
    removeWithConfig: (provider: string, expected: SpaceCredentialState, operation: () => Promise<boolean>, accounts: readonly string[]) => removeWithConfig(context, provider, expected, operation, accounts),
  };
}
