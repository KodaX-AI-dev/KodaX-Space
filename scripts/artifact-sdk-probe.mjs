// Runs under real Node against either the installed SDK or its physical ASAR tree.
// It never prepares/downloads Chromium or calls a model provider.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const [sdkDirectory, workspace] = process.argv.slice(2);
const entry = (name) => pathToFileURL(path.join(sdkDirectory, 'dist/artifacts/dist', name));
const { createArtifactSdk } = await import(entry('index.js'));
const { createNodeArtifactPort } = await import(entry('runtime.js'));
const { createKodaXArtifactPort } = await import(entry('client.js'));
const { registerArtifactTools } = await import(entry('kodax.js'));
assert.equal(typeof createKodaXArtifactPort, 'function');
const require = createRequire(entry('runtime.js'));

async function verifyRegistration() {
  const tools = [];
  const skills = [];
  const remove = registerArtifactTools(
    {
      registerTool: (tool) => {
        tools.push(tool);
        return () => undefined;
      },
      registerSkillPath: (skill) => {
        skills.push(skill);
        return () => undefined;
      },
    },
    {
      nodeExecutable: process.execPath,
      execute: async () => {
        throw new Error('Registration must not execute a worker.');
      },
    },
  );
  assert.equal(tools.length, 9);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 9);
  assert.equal(skills.length, 1);
  assert.match(
    await readFile(path.join(skills[0], 'artifact-review/SKILL.md'), 'utf8'),
    /artifact/i,
  );
  remove();
  for (const dependency of [
    '@aiden0z/pptx-renderer/browser',
    'pdfjs-dist/build/pdf.mjs',
    'pdfjs-dist/build/pdf.worker.mjs',
    'docx-renderer',
    'playwright-core/package.json',
  ]) {
    require.resolve(dependency);
  }
}

async function verifyPixels() {
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 2, height: 1 });
  png.data.set([255, 0, 0, 255, 0, 255, 0, 255]);
  const bytes = PNG.sync.write(png);
  const source = path.join(workspace, 'source.png');
  await writeFile(source, bytes);
  const sdk = createArtifactSdk(createNodeArtifactPort({ workspaceRoot: workspace }));
  const opened = await sdk.open({ path: 'source.png' });
  assert.equal(opened.status, 'ready');
  const rendered = await sdk.render({
    path: 'source.png',
    expectedSourceHash: opened.artifact.sourceHash,
  });
  assert.equal(rendered.status, 'ready');
  const input = { source: rendered.evidence.source, raster: rendered.evidence.evidence[0] };
  const read = await sdk.readEvidence(input);
  assert.equal(read.status, 'ready');
  assert.equal(read.image.width, 2);
  assert.equal(read.image.height, 1);
  assert.deepEqual(Buffer.from(read.image.dataBase64, 'base64'), bytes);
  await verifyWorker();
  await writeFile(source, PNG.sync.write(new PNG({ width: 3, height: 1 })));
  await assert.rejects(sdk.readEvidence(input), /changed|hash|source|stale/i);
  await assert.rejects(sdk.open({ path: 'source.png' }, AbortSignal.abort()), {
    name: 'AbortError',
  });
}

async function verifyWorker() {
  const manifest = JSON.stringify({
    request: { operation: 'open', input: { path: 'source.png' } },
    options: { workspaceRoot: workspace },
  });
  const request = path.join(workspace, `.artifact-request-${randomUUID()}.json`);
  await writeFile(request, manifest);
  const worker = path.join(sdkDirectory, 'dist/artifacts/dist/runtime-entry.js');
  const output = await promisify(execFile)(
    process.execPath,
    [worker, request, createHash('sha256').update(manifest).digest('hex')],
    { timeout: 30_000, windowsHide: true },
  );
  assert.equal(JSON.parse(output.stdout.trim().slice('ARTIFACT_RESULT:'.length)).status, 'ready');
}

await verifyRegistration();
await verifyPixels();
process.stdout.write(
  JSON.stringify({
    exports: 4,
    registeredTools: 9,
    worker: true,
    pngRoundTrip: true,
    staleEvidenceRejected: true,
  }) + '\n',
);
