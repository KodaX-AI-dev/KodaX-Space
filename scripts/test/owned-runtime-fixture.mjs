import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createKodaXRuntime, createProviderCredentialAuthorizer, getKodaXRuntimeOwnerState, waitForRuntimeDaemonShutdown } from '@kodax-ai/kodax/runtime';
import { createCustomProvider } from '@kodax-ai/kodax/llm';

const owned = new WeakMap();
export async function createOwnedTestRuntime({ sharedDaemonHost: _retired, ...options }) {
  void _retired;
  assert.ok(path.isAbsolute(options.homeDir), 'owned fixtures require an explicit isolated home');
  const runtime = await createKodaXRuntime({ ...options, mode: 'daemon' });
  owned.set(runtime, { homeDir: options.homeDir, profile: options.profile ?? 'default' });
  return runtime;
}
export function bindOwnedTestProvider(runtime, connection) {
  const record = owned.get(runtime); assert.ok(record);
  record.authority = createProviderCredentialAuthorizer({ sources: [{ kind: 'environment', provider: connection.name,
    profile: record.profile, apiKeyEnv: connection.apiKeyEnv, connectionFingerprint: createCustomProvider(connection).getCredentialConnectionFingerprint() }] });
}
export async function startOwnedTestRun(runtime, input) {
  const record = owned.get(runtime); assert.ok(record);
  const authorization = await record.authority?.authorizeExecution({ kind: 'input', input: {
    sessionId: input.sessionId, inputId: randomUUID(), text: input.prompt ?? 'Fixture operation' } }, { identity: runtime.identity, credentials: runtime.credentials });
  return runtime.runs.start({ ...input, ...(authorization?.credential ? { credential: authorization.credential } : {}) });
}
export async function stopOwnedTestRuntime(runtime) {
  if (!runtime) return;
  const record = owned.get(runtime); assert.ok(record, 'never stop an unowned shared Host');
  const state = await getKodaXRuntimeOwnerState(record);
  assert.equal(state.owner?.runtimeId, runtime.identity.runtimeId, 'never stop a replacement Host');
  await record.authority?.close();
  await runtime.daemon.shutdown();
  await runtime.close();
  const verified = await waitForRuntimeDaemonShutdown({ configHome: path.join(record.homeDir, '.kodax'), profile: record.profile, owner: state.owner, timeoutMs: 15000 });
  assert.equal(verified.status, 'succeeded');
  owned.delete(runtime);
}

/** Only synthetic historical-state fixtures have no executable work to settle. */
export async function killOwnedSyntheticHostFixture(runtime) {
  const record = owned.get(runtime); assert.ok(record);
  assert.ok(path.basename(record.homeDir).startsWith('space-admission-'));
  const state = await getKodaXRuntimeOwnerState(record);
  assert.equal(state.owner?.runtimeId, runtime.identity.runtimeId);
  assert.notEqual(state.owner.pid, process.pid);
  await runtime.close();
  process.kill(state.owner.pid, 'SIGKILL');
  const deadline = Date.now() + 5000;
  while (true) {
    try { process.kill(state.owner.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') break; throw error; }
    assert.ok(Date.now() < deadline, 'synthetic fixture owner did not exit');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  owned.delete(runtime);
}
