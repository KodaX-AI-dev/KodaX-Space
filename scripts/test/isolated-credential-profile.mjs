import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Loaded before application modules in each test worker. A persistent credential
// backend must never discover the developer's real profile or share another test's keys.
const suffix = `space-suite-${randomUUID()}`;
const root = path.join(os.tmpdir(), `kodax-test-${suffix}`);
process.env.KODAX_TEST_ONBOARDING = suffix;
process.env.KODAX_HOME = root;
process.once('exit', () => {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('kodax-test-space-suite-')) return;
  try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
  catch { process.emitWarning('Owned credential test profile could not be removed; it remains in the OS temporary directory.'); }
});
