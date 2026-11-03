import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  partnerExpertSnapshotSchema,
  partnerConnectorSnapshotsSchema,
} from '@kodax-space/space-ipc-schema';
import type { RuntimeBusinessBinding } from '@kodax-ai/kodax/client';
import { getSpaceDataDir } from '../data-paths.js';
import { writeNewFileExclusive } from '../atomic-file.js';

const selectionSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    projectRoot: z.string().min(1),
    expert: partnerExpertSnapshotSchema.optional(),
    bindings: partnerConnectorSnapshotsSchema,
  })
  .strict();
export type PartnerBusinessSelection = z.infer<typeof selectionSchema>;
const MAX_BYTES = 256 * 1024;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const directory = () => path.join(getSpaceDataDir(), 'partner-bindings');

/** Immutable Main-owned scope, referenced by hash rather than filling the Host's 16 KiB snapshot. */
export async function capturePartnerBusinessBinding(
  selection: PartnerBusinessSelection,
): Promise<RuntimeBusinessBinding> {
  const value = selectionSchema.parse(selection);
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_BYTES) throw new Error('Partner business selection is too large.');
  const binding = { id: `space.partner:${value.sessionId}`, revision: digest(bytes) };
  await fs.mkdir(directory(), { recursive: true, mode: 0o700 });
  try {
    await writeNewFileExclusive(
      path.join(directory(), `${binding.revision}.json`),
      bytes,
      'Partner business snapshot already exists.',
    );
  } catch (error) {
    // A concurrent identical capture is idempotent; never replace an existing record.
    try {
      await readPartnerBusinessBinding(binding, value.sessionId, value.projectRoot);
    } catch {
      throw error;
    }
  }
  return binding;
}

export async function readPartnerBusinessBinding(
  binding: RuntimeBusinessBinding | undefined,
  sessionId: string,
  projectRoot: string,
): Promise<PartnerBusinessSelection> {
  if (binding?.id !== `space.partner:${sessionId}` || !/^[a-f0-9]{64}$/.test(binding.revision))
    throw new Error('Original Partner business binding is unavailable.');
  const file = path.join(directory(), `${binding.revision}.json`);
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES)
    throw new Error('Invalid Partner business snapshot.');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      throw new Error('Partner business snapshot changed.');
    const bytes = Buffer.alloc(opened.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== opened.size || digest(bytes.subarray(0, bytesRead)) !== binding.revision)
      throw new Error('Partner business snapshot changed.');
    const value = selectionSchema.parse(
      JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) as unknown,
    );
    if (value.sessionId !== sessionId || value.projectRoot !== projectRoot)
      throw new Error('Partner business snapshot belongs to a different Session or workspace.');
    return value;
  } finally {
    await handle.close();
  }
}
