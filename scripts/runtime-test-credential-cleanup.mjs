import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SERVICE_NAME = 'kodax-space-test-runtime';
const SECRET_ACCOUNT_RE =
  /^runtime_client_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PROFILE_PREFIXES = ['kodax-test-', 'kodax-space-boot-smoke-'];
const MAX_IDENTITY_BYTES = 4 * 1024;

function isAllowedTestProfile(profileDir) {
  const resolvedProfile = path.resolve(profileDir);
  const resolvedTemp = path.resolve(os.tmpdir());
  const relative = path.relative(resolvedTemp, resolvedProfile);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return ALLOWED_PROFILE_PREFIXES.some((prefix) =>
    path.basename(resolvedProfile).startsWith(prefix),
  );
}

async function readTestSecretAccounts(profileDir) {
  if (!isAllowedTestProfile(profileDir)) return undefined;
  const identityPath = path.join(profileDir, 'space', 'runtime-client-identity.json');
  let bytes;
  try {
    bytes = await fs.readFile(identityPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
  if (bytes.byteLength > MAX_IDENTITY_BYTES) return undefined;
  let identity;
  try {
    identity = JSON.parse(bytes.toString('utf8'));
  } catch {
    return undefined;
  }
  if (
    typeof identity?.secretAccount !== 'string' ||
    !SECRET_ACCOUNT_RE.test(identity.secretAccount)
  )
    return undefined;
  return [
    ...new Set(
      [identity.secretAccount, identity.exitRecovery?.secretAccount].filter(
        (account) => typeof account === 'string' && SECRET_ACCOUNT_RE.test(account),
      ),
    ),
  ];
}

/**
 * Remove only the test-Runtime keychain items named by an isolated test profile,
 * including the retained old identity after an accepted complete exit.
 *
 * Production profiles are rejected by path, and provider credentials are
 * rejected by the runtime-client account regex. This must run before the test
 * profile directory is deleted, otherwise the credential loses its owner
 * evidence and becomes impossible to clean safely.
 */
export async function cleanupRuntimeClientCredentialForTestProfile(profileDir, options = {}) {
  const accounts = await readTestSecretAccounts(profileDir);
  if (accounts === undefined) return { cleaned: false, reason: 'not_found_or_not_test_profile' };
  const deletePassword =
    options.deletePassword ??
    (async (service, account) => {
      const imported = await import('@napi-rs/keyring/keytar.js');
      return (imported.default ?? imported).deletePassword(service, account);
    });
  const deleted = await Promise.all(
    accounts.map((account) => deletePassword(SERVICE_NAME, account)),
  );
  return { cleaned: deleted.some(Boolean), account: accounts[0] };
}
