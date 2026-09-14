import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  spaceExtensionManifestSchema,
  SPACE_EXTENSION_MAX_HTML_BYTES,
  type SpaceExtensionManifestT,
  type SpaceExtensionT,
} from '@kodax-space/space-ipc-schema';
import { replaceFileWithoutFollowingAliases } from '../kodax/atomic-file.js';
import { getDiagnosticsLogger } from '../diagnostics/runtime.js';
import {
  readSpaceExtensionArchive,
  verifyExtensionHtml,
  type SpaceExtensionArchive,
} from './archive.js';
import { assertOwnedDirectory, readRegularFile } from './files.js';

const entrySchema = z
  .object({
    directory: z.string().uuid(),
    manifest: spaceExtensionManifestSchema,
    enabled: z.boolean(),
    installedAt: z.number().int().nonnegative(),
  })
  .strict();
const registrySchema = z
  .object({
    version: z.literal(1),
    entries: z.array(entrySchema).max(64),
    provisionedBundledIds: z.array(z.string().min(1).max(128)).max(64).default([]),
  })
  .strict();
type ExtensionEntry = z.infer<typeof entrySchema>;
type ExtensionRegistry = z.infer<typeof registrySchema>;
const MAX_REGISTRY_BYTES = 1024 * 1024;
const rootQueues = new Map<string, Promise<unknown>>();

function summary(entry: ExtensionEntry): SpaceExtensionT {
  const { id, name, description, version, experts, connectors } = entry.manifest;
  return {
    id,
    name,
    description,
    version,
    enabled: entry.enabled,
    installedAt: entry.installedAt,
    expertCount: experts.length,
    connectorCount: connectors.length,
  };
}

function requireEntry(entries: ExtensionEntry[], extensionId: string): ExtensionEntry {
  const entry = entries.find((candidate) => candidate.manifest.id === extensionId);
  if (!entry) throw new Error('Space Extension is not installed');
  return entry;
}

/** Owns only immutable extension bundles and their activation registry, never user documents. */
export class SpaceExtensionStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    if (!path.isAbsolute(rootDir) || path.parse(rootDir).root === path.resolve(rootDir)) {
      throw new Error('Space Extension root must be an absolute application-owned directory');
    }
    this.rootDir = path.resolve(rootDir);
  }

  list(): Promise<SpaceExtensionT[]> {
    return this.serialize(async () => (await this.readRegistry()).map(summary));
  }

  /** Only application startup supplies an installer-owned archive; never exposed through IPC. */
  provisionBundled(archivePath: string, expectedId: string): Promise<void> {
    return this.serialize(async () => {
      const registry = await this.readRegistryDocument();
      if (registry.provisionedBundledIds.includes(expectedId)) return;
      const bundle = await readSpaceExtensionArchive(archivePath);
      if (bundle.manifest.id !== expectedId) throw new Error('Bundled extension identity mismatch');
      const provisionedIds = [...registry.provisionedBundledIds, expectedId];
      if (registry.entries.some((entry) => entry.manifest.id === expectedId)) {
        await this.writeRegistry(registry.entries, provisionedIds);
        return;
      }
      await this.installBundle(bundle, true, provisionedIds);
    });
  }

  install(archivePath: string): Promise<SpaceExtensionT> {
    return this.serialize(async () =>
      this.installBundle(await readSpaceExtensionArchive(archivePath)),
    );
  }

  private async installBundle(
    bundle: SpaceExtensionArchive,
    enabled = false,
    provisionedBundledIds?: string[],
  ): Promise<SpaceExtensionT> {
    const entries = await this.readRegistry();
    const displaced = entries.find((entry) => entry.manifest.id === bundle.manifest.id);
    if (displaced) await this.assertPackageDirectory(displaced, true);
    const entry: ExtensionEntry = {
      directory: randomUUID(),
      manifest: bundle.manifest,
      enabled,
      installedAt: Date.now(),
    };
    await assertOwnedDirectory(this.rootDir, true);
    await assertOwnedDirectory(path.join(this.rootDir, 'packages'), true);
    const stage = await fs.mkdtemp(path.join(this.rootDir, '.install-'));
    let packageReady = false;
    try {
      await fs.mkdir(path.join(stage, 'ui'), { mode: 0o700 });
      await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(bundle.manifest), {
        mode: 0o600,
      });
      await fs.writeFile(path.join(stage, 'ui/index.html'), bundle.html, { mode: 0o600 });
      await fs.rename(stage, this.packagePath(entry));
      packageReady = true;
      await this.writeRegistry(
        [...entries.filter((item) => item !== displaced), entry],
        provisionedBundledIds,
      );
    } catch (error) {
      await fs.rm(packageReady ? this.packagePath(entry) : stage, {
        recursive: true,
        force: true,
      });
      throw error;
    }
    if (displaced) await this.cleanCommittedBundle(displaced);
    return summary(entry);
  }

  setEnabled(extensionId: string, enabled: boolean): Promise<SpaceExtensionT> {
    return this.serialize(async () => {
      const entries = await this.readRegistry();
      const entry = requireEntry(entries, extensionId);
      if (enabled) await this.readView(entry);
      entry.enabled = enabled;
      await this.writeRegistry(entries);
      return summary(entry);
    });
  }

  uninstall(extensionId: string): Promise<boolean> {
    return this.serialize(async () => {
      const entries = await this.readRegistry();
      const entry = entries.find((item) => item.manifest.id === extensionId);
      if (!entry) return false;
      await this.assertPackageDirectory(entry, true);
      await this.writeRegistry(entries.filter((item) => item !== entry));
      await this.cleanCommittedBundle(entry);
      return true;
    });
  }

  getView(extensionId: string): Promise<{ extension: SpaceExtensionT; html: string }> {
    return this.serialize(async () => {
      const entry = requireEntry(await this.readRegistry(), extensionId);
      if (!entry.enabled) throw new Error('Space Extension is disabled');
      return { extension: summary(entry), html: await this.readView(entry) };
    });
  }

  getManifest(extensionId: string): Promise<SpaceExtensionManifestT> {
    return this.serialize(async () => {
      const entry = requireEntry(await this.readRegistry(), extensionId);
      if (!entry.enabled) throw new Error('Space Extension is disabled');
      await this.readView(entry);
      const bytes = await readRegularFile(
        path.join(this.packagePath(entry), 'manifest.json'),
        64 * 1024,
      );
      const manifest = spaceExtensionManifestSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (JSON.stringify(manifest) !== JSON.stringify(entry.manifest)) {
        throw new Error('Space Extension manifest integrity mismatch');
      }
      return manifest;
    });
  }

  private packagePath(entry: ExtensionEntry): string {
    return path.join(this.rootDir, 'packages', entry.directory);
  }

  private async readView(entry: ExtensionEntry): Promise<string> {
    await this.assertPackageDirectory(entry);
    await assertOwnedDirectory(path.join(this.packagePath(entry), 'ui'));
    const bytes = await readRegularFile(
      path.join(this.packagePath(entry), entry.manifest.ui.entry),
      SPACE_EXTENSION_MAX_HTML_BYTES,
    );
    return verifyExtensionHtml(entry.manifest, bytes);
  }

  private async readRegistry(): Promise<ExtensionEntry[]> {
    return (await this.readRegistryDocument()).entries;
  }

  private async readRegistryDocument(): Promise<ExtensionRegistry> {
    try {
      await assertOwnedDirectory(this.rootDir);
      const bytes = await readRegularFile(
        path.join(this.rootDir, 'registry.json'),
        MAX_REGISTRY_BYTES,
      );
      return registrySchema.parse(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, entries: [], provisionedBundledIds: [] };
      throw error;
    }
  }

  private async writeRegistry(
    entries: ExtensionEntry[],
    provisionedBundledIds?: string[],
  ): Promise<void> {
    const registry = registrySchema.parse({
      version: 1,
      entries,
      provisionedBundledIds:
        provisionedBundledIds ?? (await this.readRegistryDocument()).provisionedBundledIds,
    });
    const bytes = Buffer.from(JSON.stringify(registry));
    if (bytes.length > MAX_REGISTRY_BYTES) {
      throw new Error(`Space Extension registry exceeds size limit ${MAX_REGISTRY_BYTES} bytes`);
    }
    await assertOwnedDirectory(this.rootDir, true);
    await replaceFileWithoutFollowingAliases(
      path.join(this.rootDir, 'registry.json'),
      bytes,
      'Space Extension registry changed while saving',
    );
  }

  private async removePackage(entry: ExtensionEntry): Promise<void> {
    if (!(await this.assertPackageDirectory(entry, true))) return;
    await fs.rm(this.packagePath(entry), { recursive: true, force: true });
  }

  private async cleanCommittedBundle(entry: ExtensionEntry): Promise<void> {
    try {
      await this.removePackage(entry);
    } catch (error) {
      const message =
        'Space Extension registry change committed; failed to clean unregistered bundle';
      const detail = {
        extensionId: entry.manifest.id,
        bundleDirectory: entry.directory,
        code: (error as NodeJS.ErrnoException).code ?? 'UNSAFE_OR_UNAVAILABLE',
      };
      const logger = getDiagnosticsLogger();
      if (logger) logger.warn('space-extensions', 'bundle_cleanup_failed', message, detail);
      else
        process.emitWarning(message, {
          code: 'SPACE_EXTENSION_CLEANUP_FAILED',
          detail: JSON.stringify(detail),
        });
    }
  }

  private async assertPackageDirectory(
    entry: ExtensionEntry,
    allowMissing = false,
  ): Promise<boolean> {
    await assertOwnedDirectory(this.rootDir);
    try {
      await assertOwnedDirectory(path.join(this.rootDir, 'packages'));
      await assertOwnedDirectory(this.packagePath(entry));
      return true;
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = rootQueues.get(this.rootDir) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    rootQueues.set(this.rootDir, settled);
    void settled.then(() => {
      if (rootQueues.get(this.rootDir) === settled) rootQueues.delete(this.rootDir);
    });
    return next;
  }
}
