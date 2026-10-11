import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { RuntimeExecutionAuthorization } from '@kodax-ai/kodax/client';
import { writeNewFileExclusive } from '../atomic-file.js';

const id = z.string().min(1).max(256);
const authorizationSchema = z
  .object({
    credential: z
      .object({ leaseId: id, mode: z.literal('scoped'), providers: z.array(id).max(256) })
      .strict()
      .optional(),
    hostTools: z.object({ leaseId: id }).strict().optional(),
    tools: z.array(id).max(512).optional(),
    workflowHostPolicy: z
      .object({
        maxAgents: z.number().int().positive().optional(),
        tokenBudget: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const recordSchema = z
  .object({
    version: z.literal(1),
    runtimeId: id,
    clientInstanceId: id,
    sessionId: id,
    inputId: id,
    authorization: authorizationSchema,
  })
  .strict();
type Record = z.infer<typeof recordSchema>;
const MAX_BYTES = 128 * 1024;

/** Non-secret Main selections. SDK verifies lease ownership and binds each input to its Run. */
export class RuntimeInputAuthorizationStore {
  private readonly memory = new Map<string, Record>();
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly directory?: string) {}

  async read(
    runtimeId: string,
    clientInstanceId: string,
    sessionId: string,
    inputId: string,
  ): Promise<RuntimeExecutionAuthorization | undefined> {
    const identity = { runtimeId, clientInstanceId, sessionId, inputId };
    const key = this.key(identity);
    const record = this.directory
      ? await this.readFile(path.join(this.directory, `${key}.json`))
      : this.memory.get(key);
    if (
      record &&
      !isDeepStrictEqual(identity, {
        runtimeId: record.runtimeId,
        clientInstanceId: record.clientInstanceId,
        sessionId: record.sessionId,
        inputId: record.inputId,
      })
    ) {
      throw new Error('Main authorization record identity changed.');
    }
    return record ? structuredClone(record.authorization) : undefined;
  }

  capture(
    runtimeId: string,
    clientInstanceId: string,
    input: { sessionId: string; inputId: string; authorization: RuntimeExecutionAuthorization },
  ): Promise<void> {
    const operation = this.writes.then(async () => {
      const record = recordSchema.parse({ version: 1, runtimeId, clientInstanceId, ...input });
      const previous = await this.read(runtimeId, clientInstanceId, input.sessionId, input.inputId);
      if (previous) {
        if (!isDeepStrictEqual(previous, record.authorization))
          throw new Error('Accepted input authorization cannot be replaced.');
        return;
      }
      const key = this.key({
        runtimeId,
        clientInstanceId,
        sessionId: input.sessionId,
        inputId: input.inputId,
      });
      if (this.directory) {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
        if (bytes.length > MAX_BYTES)
          throw new Error('Main authorization record exceeds its read limit.');
        await writeNewFileExclusive(
          path.join(this.directory, `${key}.json`),
          bytes,
          'Main authorization record changed concurrently.',
        );
      } else this.memory.set(key, record);
    });
    this.writes = operation.catch(() => undefined); // Failure is delivered to the caller; later writes can still proceed.
    return operation;
  }

  private key(identity: {
    runtimeId: string;
    clientInstanceId: string;
    sessionId: string;
    inputId: string;
  }): string {
    return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }

  private async readFile(file: string): Promise<Record | undefined> {
    let handle;
    try {
      const before = await fs.lstat(file);
      if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES)
        throw new Error('Invalid Main authorization record file.');
      handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = await handle.stat();
      if (
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size ||
        !opened.isFile()
      )
        throw new Error('Main authorization record changed during read.');
      const bytes = Buffer.alloc(opened.size + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      const after = await handle.stat();
      if (
        bytesRead !== opened.size ||
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs
      )
        throw new Error('Main authorization record changed during read.');
      return recordSchema.parse(
        JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) as unknown,
      );
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return undefined;
      throw error;
    } finally {
      await handle?.close();
    }
  }
}
