import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPartnerExtension } from '../build-partner-extension.mjs';
import { verifyPackagedPartnerLibrary } from '../smoke-pack.mjs';

test('packaging requires the exact built Partner library and rejects missing or changed bytes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-bundled-partner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { archivePath } = await buildPartnerExtension({ outDir: path.join(root, 'built') });
  const resources = path.join(root, 'resources');
  const destination = path.join(
    resources,
    'bundled-extensions',
    'kodax.partner-library.space-extension',
  );
  const input = { asarPath: path.join(resources, 'app.asar'), sourceArchivePath: archivePath };

  await assert.rejects(verifyPackagedPartnerLibrary(input), /Partner library/);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(archivePath, destination);
  await verifyPackagedPartnerLibrary(input);

  await writeFile(destination, 'invalid archive');
  await assert.rejects(verifyPackagedPartnerLibrary(input), /Partner library/);
});
