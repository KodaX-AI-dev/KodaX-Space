const epochs = new Map<string, number>();
const listeners = new Set<(provider: string) => void | Promise<void>>();
export function providerCredentialEpoch(provider: string): number { return epochs.get(provider) ?? 0; }
export function onProviderCredentialInvalidation(listener: (provider: string) => void | Promise<void>): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export async function invalidateProviderCredential(provider: string): Promise<void> {
  epochs.set(provider, providerCredentialEpoch(provider) + 1);
  const results = await Promise.allSettled([...listeners].map(async listener => listener(provider)));
  if (results.some(result => result.status === 'rejected')) throw new Error('Credential was fenced locally but some Host leases could not be revoked.');
}
