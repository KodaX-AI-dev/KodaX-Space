import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AtomicFileProviderCredentialStore } from '@kodax-ai/kodax/llm';

async function existingFile(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid legacy migration metadata.');
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
async function legacyEvidence(store: AtomicFileProviderCredentialStore, spaceDir: string): Promise<boolean> {
  for (const name of ['provider-config.json', 'provider-credentials.v1.json', 'projects.json']) {
    if (await existingFile(path.join(spaceDir, name))) return true;
  }
  const identity = path.join(spaceDir, 'runtime-client-identity.json');
  if (!await existingFile(identity)) return false;
  if ((await lstat(identity)).size > 4096) throw new Error('Invalid legacy migration metadata.');
  const bytes = await readFile(identity, 'utf8');
  let raw: unknown;
  try { raw = JSON.parse(bytes) as unknown; }
  catch { throw new Error('Invalid legacy migration metadata.'); }
  if (!raw || typeof raw !== 'object' || !('secretAccount' in raw) || typeof raw.secretAccount !== 'string') return true;
  const clientAuth = path.join(path.dirname(spaceDir), 'auth.json');
  const file = path.resolve(clientAuth) === path.resolve(store.filePath) ? store
    : (await import('@kodax-ai/kodax/llm')).createFileProviderCredentialStore(clientAuth);
  const binding = { profile: 'space-client-identity', provider: raw.secretAccount,
    connectionFingerprint: createHash('sha256').update(JSON.stringify(['space-client-secret-v1', raw.secretAccount])).digest('hex') };
  return (await file.describeApiKey(binding)).revision === undefined;
}
/** A protected baseline prevents a fresh profile from later adopting global OS credentials merely because settings appeared. */
export async function legacyDiscovery(store: AtomicFileProviderCredentialStore, spaceDir: string): Promise<{ enabled: boolean; scopeId?: string }> {
  const relative = path.relative(path.dirname(store.filePath), spaceDir).replaceAll('\\', '/');
  const fingerprint = createHash('sha256').update(JSON.stringify(['space-provider-upgrade-v1', relative])).digest('hex');
  const binding = { profile: 'space-provider-upgrade', provider: 'legacy-discovery', connectionFingerprint: fingerprint };
  let saved = await store.readApiKey(binding);
  if (!saved) {
    const enabled = await legacyEvidence(store, spaceDir);
    try { await store.setApiKey(binding, enabled ? 'eligible' : 'fresh', null); }
    catch (error) { saved = await store.readApiKey(binding); if (!saved) throw error; }
    saved = await store.readApiKey(binding);
  }
  if (saved?.key !== 'eligible' && saved?.key !== 'fresh') throw new Error('Invalid legacy migration baseline.');
  return { enabled: saved.key === 'eligible', ...(relative === 'space' ? {} : { scopeId: fingerprint }) };
}
