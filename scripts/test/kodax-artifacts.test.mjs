import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { createArtifactSdk } from '@kodax-ai/kodax/artifacts';
import { createKodaXArtifactPort } from '@kodax-ai/kodax/artifacts/client';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { ensureKodaXRuntime, waitForRuntimeDaemonShutdown } from '@kodax-ai/kodax/runtime';
import { verifyArtifactSdkPackage } from '../kodax-artifact-package.mjs';

test('published Client and Artifact facade imports do not load renderer backends', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-artifact-lazy-')));
  try {
    const loader = path.join(root, 'reject-renderers.mjs');
    await writeFile(
      loader,
      `export async function resolve(id,context,next) {
const renderers=['@aiden0z/pptx-renderer','docx-renderer','pdfjs-dist','playwright-core','pptxgenjs'];
if(renderers.some(name=>id===name||id.startsWith(name+'/'))) throw new Error('Startup loaded renderer: '+id);
return next(id,context); }`,
    );
    const source = `await import(${JSON.stringify(import.meta.resolve('@kodax-ai/kodax/client'))});
await import(${JSON.stringify(import.meta.resolve('@kodax-ai/kodax/artifacts'))});`;
    await promisify(execFile)(
      process.execPath,
      ['--loader', pathToFileURL(loader).href, '--input-type=module', '--eval', source],
      { timeout: 30_000, windowsHide: true },
    );
  } finally {
    assert.equal(path.dirname(root), await realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-artifact-lazy-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('published Artifact SDK resources, Node worker and PNG identity are usable', async () => {
  const result = await verifyArtifactSdkPackage({
    sdkDirectory: path.resolve('node_modules/@kodax-ai/kodax'),
    probeRoot: os.tmpdir(),
  });
  assert.deepEqual(result, {
    exports: 4,
    registeredTools: 9,
    worker: true,
    pngRoundTrip: true,
    staleEvidenceRejected: true,
  });
});

async function closeSharedHost({ client, runtime, home, owner, root }) {
  try {
    await client?.disconnect();
  } finally {
    try {
      await runtime.daemon.shutdown();
    } finally {
      await runtime.close();
    }
  }
  assert.equal(
    (await waitForRuntimeDaemonShutdown({ configHome: path.join(home, '.kodax'), owner })).status,
    'succeeded',
  );
  assert.equal(path.dirname(root), await realpath(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('space-artifact-host-'));
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}

test(
  'registered shared Host returns exact PNG evidence without a model or input replay',
  { timeout: 60_000 },
  async (t) => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-artifact-host-')));
    const home = path.join(root, 'home');
    await mkdir(path.join(home, '.kodax/extensions'), { recursive: true });
    const extension = `import {registerArtifactTools} from ${JSON.stringify(import.meta.resolve('@kodax-ai/kodax/artifacts/kodax'))};
import {executeManagedProcess} from ${JSON.stringify(import.meta.resolve('@kodax-ai/kodax/coding'))};
export default api => registerArtifactTools(api, {execute:executeManagedProcess,nodeExecutable:${JSON.stringify(process.execPath)}});`;
    await writeFile(path.join(home, '.kodax/extensions/artifacts.mjs'), extension);
    const { PNG } = createRequire(import.meta.resolve('@kodax-ai/kodax/package.json'))('pngjs');
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([255, 0, 0, 255, 0, 255, 0, 255]);
    const source = PNG.sync.write(png);
    await writeFile(path.join(root, 'source.png'), source);
    const runtime = await ensureKodaXRuntime({
      homeDir: home,
      defaultProvider: 'openai',
      daemonStartupTimeoutMs: 30_000,
    });
    const owner = (await runtime.daemon.inspect()).owner;
    let client;
    t.after(() => closeSharedHost({ client, runtime, home, owner, root }));
    client = await connectKodaXClient({ homeDir: home });
    const catalog = await client.catalog.extensions();
    assert.equal(
      catalog.diagnostics.tools.filter((tool) => tool.name.startsWith('artifact_')).length,
      9,
    );
    const session = await client.sessions.create({ projectPath: root });
    await client.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
    const sdk = createArtifactSdk(createKodaXArtifactPort(client, session.id));
    const rendered = await sdk.render({ path: 'source.png' });
    assert.equal(rendered.status, 'ready');
    const evidence = await sdk.readEvidence({
      source: rendered.evidence.source,
      raster: rendered.evidence.evidence[0],
    });
    assert.equal(evidence.status, 'ready');
    assert.deepEqual(Buffer.from(evidence.image.dataBase64, 'base64'), source);
    assert.deepEqual(await readFile(path.join(root, 'source.png')), source);
    assert.deepEqual((await client.statistics.readRequests(session.id)).items, []);
    const runs = await runtime.runs.list({ sessionId: session.id });
    assert.equal(runs.length, 2, 'one Run per explicit operation');
    assert.ok(runs.every((run) => run.phase === 'completed'));
    assert.equal((await runtime.daemon.inspect()).owner.runtimeId, owner.runtimeId);
  },
);
