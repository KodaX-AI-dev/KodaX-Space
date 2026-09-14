import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  spaceExtensionManifestSchema,
  SPACE_EXTENSION_MAX_HTML_BYTES,
} from '@kodax-space/space-ipc-schema';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(repositoryRoot, 'extensions', 'partner-library');
const archiveDate = new Date('2000-01-01T00:00:00.000Z');

/** Embed local portraits so the isolated extension needs no network or asset permissions. */
export async function readPartnerLibraryHtml() {
  const presentation = JSON.parse(
    await fs.readFile(path.join(sourceDirectory, 'expert-presentation.json'), 'utf8'),
  );
  const avatars = {};
  for (const id of presentation.avatarIds) {
    if (!/^[a-z][a-z-]*$/.test(id)) throw new Error('Invalid expert avatar id');
    const bytes = await fs.readFile(
      path.join(repositoryRoot, 'apps/desktop/public/expert-avatars', `${id}.jpg`),
    );
    avatars[id] = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  }
  const payload = JSON.stringify({ avatars, experts: presentation.experts }).replaceAll(
    '<',
    '\\u003c',
  );
  const template = await fs.readFile(path.join(sourceDirectory, 'ui', 'index.html'), 'utf8');
  const marker = '/*__EXPERT_PRESENTATION__*/ { avatars: {}, experts: {} }';
  if (!template.includes(marker)) throw new Error('Expert presentation marker missing');
  return Buffer.from(template.replace(marker, () => payload));
}

/** Build an independent UI-only archive, never bundle its page into the application renderer. */
export async function buildPartnerExtension({
  outDir = path.join(repositoryRoot, 'out', 'extensions'),
} = {}) {
  const html = await readPartnerLibraryHtml();
  if (html.length > SPACE_EXTENSION_MAX_HTML_BYTES)
    throw new Error('Partner library UI exceeds archive size limit');
  const source = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'manifest.json'), 'utf8'));
  const manifest = spaceExtensionManifestSchema.parse({
    ...source,
    ui: { ...source.ui, sha256: createHash('sha256').update(html).digest('hex') },
  });
  const zip = new JSZip();
  const fileOptions = { date: archiveDate, createFolders: false, unixPermissions: 0o100644 };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), fileOptions);
  zip.file('ui/index.html', html, fileOptions);
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const outputDirectory = path.resolve(outDir);
  await fs.mkdir(outputDirectory, { recursive: true });
  const archivePath = path.join(
    outputDirectory,
    `${manifest.id}-${manifest.version}.space-extension`,
  );
  const temporaryPath = path.join(outputDirectory, `.${manifest.id}-${randomUUID()}.tmp`);
  await fs.writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
  try {
    await fs.rename(temporaryPath, archivePath);
  } catch (error) {
    await fs.unlink(temporaryPath);
    throw error;
  }
  return { archivePath, manifest };
}

function commandOptions(args) {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === '--out-dir' && args[1].trim()) return { outDir: args[1] };
  throw new Error('Usage: node scripts/build-partner-extension.mjs [--out-dir <directory>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPartnerExtension(commandOptions(process.argv.slice(2))).then(
    ({ archivePath }) => process.stdout.write(`${archivePath}\n`),
    (error) => {
      process.stderr.write(
        `Partner extension build failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
