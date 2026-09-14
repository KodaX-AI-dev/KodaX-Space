import path from 'node:path';
import { z } from 'zod';
import { spaceExpertDefinitionSchema, spaceExpertRefSchema } from '@kodax-space/space-ipc-schema';
import { replaceFileWithoutFollowingAliases } from '../kodax/atomic-file.js';
import { assertOwnedDirectory, readRegularFile } from './files.js';

const userExpertEntrySchema = z
  .object({
    expert: spaceExpertDefinitionSchema.refine((expert) => expert.id.startsWith('user.')),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().optional(),
    basedOn: spaceExpertRefSchema.optional(),
  })
  .strict();
const userExpertsSchema = z
  .object({
    version: z.literal(1),
    entries: z
      .array(userExpertEntrySchema)
      .max(128, 'User expert record count exceeds limit 128, including deleted records')
      .refine(
        (entries) => new Set(entries.map((entry) => entry.expert.id)).size === entries.length,
        'Duplicate user expert identities are not allowed',
      ),
  })
  .strict();
export type UserExpertEntry = z.infer<typeof userExpertEntrySchema>;
const MAX_USER_EXPERT_BYTES = 1024 * 1024;
const userQueues = new Map<string, Promise<unknown>>();

/** User-authored definitions live outside immutable, replaceable extension bundles. */
export class UserExpertStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    if (!path.isAbsolute(rootDir) || path.parse(rootDir).root === path.resolve(rootDir)) {
      throw new Error('User expert root must be an absolute application-owned directory');
    }
    this.rootDir = path.resolve(rootDir);
  }

  async read(extensionId: string): Promise<UserExpertEntry[]> {
    const directory = this.extensionDirectory(extensionId);
    try {
      await assertOwnedDirectory(this.rootDir);
      await assertOwnedDirectory(directory);
      const bytes = await readRegularFile(
        path.join(directory, 'experts.json'),
        MAX_USER_EXPERT_BYTES,
      );
      return userExpertsSchema.parse(JSON.parse(bytes.toString('utf8'))).entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async write(extensionId: string, entries: UserExpertEntry[]): Promise<void> {
    const directory = this.extensionDirectory(extensionId);
    const bytes = Buffer.from(JSON.stringify(userExpertsSchema.parse({ version: 1, entries })));
    if (bytes.length > MAX_USER_EXPERT_BYTES) {
      throw new Error(`User expert data exceeds size limit ${MAX_USER_EXPERT_BYTES} bytes`);
    }
    await assertOwnedDirectory(this.rootDir, true);
    await assertOwnedDirectory(directory, true);
    await replaceFileWithoutFollowingAliases(
      path.join(directory, 'experts.json'),
      bytes,
      'User experts changed while saving',
    );
  }

  serialize<T>(extensionId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.extensionDirectory(extensionId);
    const previous = userQueues.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    userQueues.set(key, settled);
    void settled.then(() => {
      if (userQueues.get(key) === settled) userQueues.delete(key);
    });
    return next;
  }

  private extensionDirectory(extensionId: string): string {
    return path.join(this.rootDir, spaceExpertRefSchema.shape.extensionId.parse(extensionId));
  }
}
