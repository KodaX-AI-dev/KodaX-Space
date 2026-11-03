import type { KodaXDaemonRuntime } from '@kodax-ai/kodax/runtime';
import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { ClientSubmitInput } from '@kodax-ai/kodax/client';
import { getSpaceDataDir } from '../data-paths.js';
import { writeNewFileExclusive, replaceFileIfUnchanged } from '../atomic-file.js';

const artifact = z
  .object({
    kind: z.enum(['image', 'file', 'video']),
    path: z.string(),
    mediaType: z.string().optional(),
    mimeType: z.string().optional(),
    name: z.string().optional(),
    source: z.enum(['user-inline', 'clipboard', 'drag-drop', 'file-picker']).optional(),
    description: z.string().optional(),
  })
  .strict();
const inputSchema = z
  .object({
    sessionId: z.string(),
    inputId: z.string(),
    text: z.string(),
    delivery: z.enum(['immediate', 'after_turn', 'steer', 'redirect']).optional(),
    targetRunId: z.string().optional(),
    inputArtifacts: z.array(artifact).optional(),
  })
  .strict();
const recordSchema = z
  .object({ principal: z.string(), input: inputSchema, withdrawn: z.literal(true).optional() })
  .strict();
const MAX_BYTES = 32 * 1024 * 1024;

function intentPath(principal: string, sessionId: string, inputId: string) {
  const id = createHash('sha256')
    .update(JSON.stringify([principal, sessionId, inputId]))
    .digest('hex');
  return path.join(getSpaceDataDir(), 'input-intents', `${id}.json`);
}

/** Space recovery material only; the Host remains the single input/Session authority. */
export async function captureProductInput(
  principal: string,
  input: ClientSubmitInput,
): Promise<void> {
  const value = recordSchema.parse({
    principal,
    input: JSON.parse(JSON.stringify(input)) as unknown,
  });
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_BYTES) throw new Error('Input recovery record is too large.');
  const file = intentPath(principal, input.sessionId, input.inputId);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    await writeNewFileExclusive(file, bytes, 'Input recovery record already exists.');
  } catch (error) {
    const existing = await readProductInput(principal, input.sessionId, input.inputId);
    if (!isDeepStrictEqual(existing, value.input)) throw error;
  }
}

async function readProductRecord(principal: string, sessionId: string, inputId: string) {
  const file = intentPath(principal, sessionId, inputId);
  let handle;
  try {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES)
      throw new Error('Invalid input recovery record.');
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      throw new Error('Input recovery record changed.');
    const bytes = Buffer.alloc(opened.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== opened.size) throw new Error('Input recovery record changed.');
    let value: unknown;
    try {
      value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) as unknown;
    } catch {
      throw new Error('Invalid input recovery record.');
    }
    const parsed = recordSchema.safeParse(value);
    if (!parsed.success) throw new Error('Invalid input recovery record.');
    const record = parsed.data;
    if (
      record.principal !== principal ||
      record.input.sessionId !== sessionId ||
      record.input.inputId !== inputId
    )
      throw new Error('Input recovery identity changed.');
    // Artifact variants have already crossed the SDK Product input boundary when captured.
    return {
      input: record.input as ClientSubmitInput,
      withdrawn: record.withdrawn,
      hash: `sha256:${createHash('sha256').update(bytes.subarray(0, bytesRead)).digest('hex')}`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function readProductInput(principal: string, sessionId: string, inputId: string) {
  return (await readProductRecord(principal, sessionId, inputId))?.input;
}

export async function takeBackProductInput(
  runs: Pick<KodaXDaemonRuntime['runs'], 'getInput' | 'withdrawInput'>,
  principal: string,
  input: { sessionId: string; inputId: string },
): Promise<ClientSubmitInput> {
  const saved = await readProductRecord(principal, input.sessionId, input.inputId);
  const original = saved?.input;
  if (!saved || !original)
    throw new Error(
      'This input has no complete Space recovery record. No new withdrawal was attempted; its outcome must be checked with the Host.',
    );
  if (saved.withdrawn) return original;
  const fact = await runs.getInput(input.sessionId, input.inputId);
  if (fact?.state !== 'withdrawn') {
    try {
      await runs.withdrawInput(input.sessionId, input.inputId);
    } catch (error) {
      if ((await runs.getInput(input.sessionId, input.inputId))?.state !== 'withdrawn') throw error;
    }
  }
  const bytes = Buffer.from(JSON.stringify({ principal, input: original, withdrawn: true }));
  try {
    await replaceFileIfUnchanged(
      intentPath(principal, input.sessionId, input.inputId),
      bytes,
      saved.hash,
      'Input take-back confirmation changed concurrently.',
      MAX_BYTES,
    );
  } catch (error) {
    const confirmed = await readProductRecord(principal, input.sessionId, input.inputId);
    if (!confirmed?.withdrawn || !isDeepStrictEqual(confirmed.input, original)) throw error;
  }
  return original;
}
