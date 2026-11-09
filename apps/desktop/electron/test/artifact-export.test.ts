import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import type { ChannelOutput, IpcResult } from '@kodax-space/space-ipc-schema';

const require = createRequire(import.meta.url);
require('electron');
const electronModule = require.cache[require.resolve('electron')];
assert.ok(electronModule);
const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
let savePath: string | undefined;
let suggestedPath: string | undefined;
electronModule.exports = {
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input: unknown) => Promise<unknown>) =>
      handlers.set(name, handler),
  },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {
    showSaveDialog: async (options: { defaultPath: string }) => {
      suggestedPath = options.defaultPath;
      return { canceled: savePath === undefined, filePath: savePath };
    },
  },
};
const { registerArtifactChannels } = await import('../ipc/artifact.js');
const { artifactStore } = await import('../artifact/store.js');
const { kodaxHost } = await import('../kodax/host.js');
const { projectStore } = await import('../projects/store.js');
const { adminPolicyAuditStore } = await import('../kodax/admin-policy-audit-store.js');
registerArtifactChannels();

test('Save As copies registered workspace HTML and PDF files with their original extension and leaves the source intact', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-export-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('artifact-export-'));
    await rm(root, { recursive: true, force: true });
  });
  const project = path.join(root, 'project');
  const output = path.join(root, 'saved');
  await mkdir(project);
  await mkdir(output);
  t.mock.method(kodaxHost, 'get', () => ({ projectRoot: project }));
  t.mock.method(projectStore, 'assertAllowed', async () => project);
  t.mock.method(adminPolicyAuditStore, 'assertArtifactExportAllowed', async () => {});
  t.mock.method(adminPolicyAuditStore, 'record', async () => {});
  t.mock.method(artifactStore, 'readGeneratedFile', async () => null);
  const exported = handlers.get('artifact.export');
  assert.ok(exported);
  for (const [filename, kind, bytes] of [
    ['anatomy.html', 'file', Buffer.from('<h1>解剖图</h1>')],
    ['anatomy.pdf', 'pdf', Buffer.from('%PDF-1.7\nOriginal PDF\u0000')],
  ] as const) {
    const source = path.join(project, filename);
    await writeFile(source, bytes);
    savePath = path.join(output, filename);
    t.mock.method(artifactStore, 'read', async () => ({
      ref: {
        id: 'a',
        sessionId: 's',
        surface: 'code',
        kind,
        title: 'Anatomy',
        currentVersion: 2,
        versions: [],
        createdAt: 1,
        updatedAt: 1,
      },
      version: 2,
      path: source,
      fileSource: 'workspace',
    }));
    const result = (await exported({}, { id: 'a', version: 2 })) as IpcResult<
      ChannelOutput<'artifact.export'>
    >;
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.data.ok, 'workspace-backed artifacts must support Save As');
    assert.equal(suggestedPath, filename);
    assert.deepEqual(await readFile(savePath), bytes);
    assert.deepEqual(await readFile(source), bytes);
    savePath = undefined;
    const canceled = (await exported({}, { id: 'a', version: 2 })) as IpcResult<
      ChannelOutput<'artifact.export'>
    >;
    assert.ok(canceled.ok && canceled.data.canceled);
  }
  for (const source of [
    path.join(root, 'outside.html'),
    path.join(project, 'missing.html'),
    project,
  ]) {
    if (source.endsWith('outside.html')) await writeFile(source, 'Outside the project');
    suggestedPath = undefined;
    savePath = path.join(output, 'must-not-exist.html');
    t.mock.method(artifactStore, 'read', async () => ({
      ref: {
        id: 'a',
        sessionId: 's',
        surface: 'code',
        kind: 'file',
        title: 'Invalid source',
        currentVersion: 2,
        versions: [],
        createdAt: 1,
        updatedAt: 1,
      },
      version: 2,
      path: source,
      fileSource: 'workspace',
    }));
    const rejected = (await exported({}, { id: 'a', version: 2 })) as IpcResult<
      ChannelOutput<'artifact.export'>
    >;
    assert.equal(rejected.ok, false);
    assert.equal(
      suggestedPath,
      undefined,
      'invalid sources must be rejected before opening a save dialog',
    );
    await assert.rejects(readFile(savePath), { code: 'ENOENT' });
  }
});
