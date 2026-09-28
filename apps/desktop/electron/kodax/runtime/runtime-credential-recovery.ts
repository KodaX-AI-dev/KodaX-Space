import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getKodaxRuntimeDir } from '../data-paths.js';

// Compatibility reader for the rc.2 Windows migration. Read-only: never start
// a daemon to "validate" a secret, since that accepts a different bridge identity.
const journalSchema = z.object({
  version: z.literal(1),
  clients: z.array(z.object({ key: z.string(), invocations: z.array(z.unknown()) })),
});

export async function verifyLegacyRuntimeSecret(
  identity: { readonly instanceId: string },
  candidate: string,
  journalPath = path.join(
    getKodaxRuntimeDir(),
    'runtime',
    'daemon',
    'coder',
    'host-tool-invocations.json',
  ),
): Promise<boolean> {
  if (candidate.length < 32 || candidate.length > 512) return false;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const before = await fs.lstat(journalPath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink > 1) return false;
    handle = await fs.open(journalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size > 16 * 1024 * 1024)
      return false;
    const bytes = await handle.readFile();
    if (bytes.length > 16 * 1024 * 1024) return false;
    const parsed = journalSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    if (!parsed.success) return false;
    const prefix = `stable:${identity.instanceId}:`;
    const keys = new Set(
      parsed.data.clients.map(({ key }) => key).filter((key) => key.startsWith(prefix)),
    );
    return (
      keys.size === 1 &&
      keys.has(`${prefix}${createHash('sha256').update(candidate).digest('hex')}`)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError)
      return false;
    throw new Error('Runtime credential recovery evidence could not be read.');
  } finally {
    await handle?.close();
  }
}
