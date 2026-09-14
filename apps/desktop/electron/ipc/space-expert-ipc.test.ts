import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import JSZip from 'jszip';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import type { ChannelInput, ChannelOutput, InvokeChannelName } from '@kodax-space/space-ipc-schema';

process.env.KODAX_TEST_ONBOARDING = `expert-library-ipc-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxDir } = await import('../kodax/data-paths.js');
applySdkHomeEnv();
const directory = getKodaxDir();
const { registerSpaceExtensionChannels } = await import('./space-extensions.js');
const { getSpaceExtensionStore, getSpaceExpertCatalog } =
  await import('../space-extensions/runtime.js');
const { setRendererTarget } = await import('./push.js');

type Handler = (
  input: ChannelInput<InvokeChannelName>,
  event: IpcMainInvokeEvent,
) => Promise<ChannelOutput<InvokeChannelName>> | ChannelOutput<InvokeChannelName>;
const handlers = new Map<string, Handler>();
const pushes: string[] = [];
const mainFrame = { url: 'app://space/index.html' } as WebFrameMain;
const sender = {
  id: 703,
  mainFrame,
  isDestroyed: () => false,
  send: (channel: string) => pushes.push(channel),
} as unknown as WebContents;
const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
setRendererTarget(() => sender);

after(async () => {
  setRendererTarget(() => null);
  await fs.rm(directory, { recursive: true, force: true });
});

async function installLibrary(): Promise<void> {
  const html = '<!doctype html><title>Independent library</title>';
  const archive = new JSZip();
  archive.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      hostApiVersion: 1,
      id: 'test.library',
      name: 'Expert library',
      description: '',
      version: '1.0.0',
      ui: { entry: 'ui/index.html', sha256: createHash('sha256').update(html).digest('hex') },
      experts: [],
    }),
  );
  archive.file('ui/index.html', html);
  await fs.mkdir(directory, { recursive: true });
  const archivePath = path.join(directory, 'library.space-extension');
  await fs.writeFile(archivePath, await archive.generateAsync({ type: 'nodebuffer' }));
  await getSpaceExtensionStore().install(archivePath);
  await getSpaceExtensionStore().setEnabled('test.library', true);
}

test('registered expert CRUD channels persist host-owned content and reject child-frame mutations', async () => {
  registerSpaceExtensionChannels((name, handler) => {
    handlers.set(name, handler as Handler);
  });
  const save = handlers.get('space.extensions.expert.save');
  const remove = handlers.get('space.extensions.expert.delete');
  assert.ok(save, 'the save channel must be registered on the real host entry point');
  assert.ok(remove, 'the delete channel must be registered on the real host entry point');
  await installLibrary();
  const input = {
    extensionId: 'test.library',
    values: { name: 'Writing guide', description: '', prompt: 'Preserve facts.', starterTasks: [] },
  };
  for (const invalidEvent of [
    { sender, senderFrame: { url: 'app://space/__space-extension-frame' } },
    { sender: { ...sender, id: 704 }, senderFrame: mainFrame },
  ]) {
    await assert.rejects(
      () => Promise.resolve(save(input, invalidEvent as IpcMainInvokeEvent)),
      /primary application/,
    );
  }
  assert.deepEqual(await getSpaceExpertCatalog().list('test.library'), []);
  const saved = (await save(input, event)) as ChannelOutput<'space.extensions.expert.save'>;
  assert.match(saved.expert.id, /^user\./);
  assert.deepEqual(await getSpaceExpertCatalog().list('test.library'), [saved.expert]);
  assert.deepEqual(pushes, ['space.extensions.changed']);
  const ref = { extensionId: 'test.library', expertId: saved.expert.id, revision: 1 };
  await assert.rejects(
    () => Promise.resolve(remove(ref, { sender, senderFrame: {} } as IpcMainInvokeEvent)),
    /primary application/,
  );
  assert.deepEqual(await remove(ref, event), { ok: true });
  assert.deepEqual(await getSpaceExpertCatalog().list('test.library'), []);
  assert.deepEqual(pushes, ['space.extensions.changed', 'space.extensions.changed']);
  await getSpaceExtensionStore().setEnabled('test.library', false);
  await assert.rejects(() => Promise.resolve(save(input, event)), /disabled/);
  assert.equal(pushes.length, 2);
});
