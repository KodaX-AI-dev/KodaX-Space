import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { build } from 'esbuild';

test('development launches Vite and Electron without preparing network connector components', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-dev-offline-'));
  const entry = new URL('../dev.mjs', import.meta.url);
  const stubs = {
    'node:child_process': `export function spawnSync(cmd,args) { if(args.some(x=>x.includes('prepare-feishu'))) return {status:1}; return {status:0}; }
      export function spawn(cmd,args) { process.stdout.write('spawn:'+JSON.stringify(args)+'\\n'); return {on(){},exitCode:null,signalCode:null}; }`,
    'node:net': `export default {createConnection(){const socket={setTimeout(){},destroy(){},once(event,cb){if(event==='error') queueMicrotask(cb);return socket;}};return socket;}}`,
    'node:module': `export function createRequire(){const r=(id)=>id==='electron'?'electron-fixture':{bin:'bin/vite.js'};r.resolve=()=>'/fixture/vite/package.json';return r;}`,
    'wait-on': 'export default async function(){}',
  };
  try {
    const output = await build({
      entryPoints: [fileURLToPath(entry)],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      define: { 'import.meta.url': JSON.stringify(entry.href) },
      plugins: [
        {
          name: 'offline-process-boundary',
          setup(builder) {
            builder.onResolve(
              { filter: /^(node:child_process|node:net|node:module|wait-on)$/ },
              ({ path }) => ({ path, namespace: 'fixture' }),
            );
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
              contents: stubs[path],
              loader: 'js',
            }));
          },
        },
      ],
    });
    const file = path.join(directory, 'dev.mjs');
    await writeFile(file, output.outputFiles[0].text);
    const stdout = execFileSync(process.execPath, [file], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    assert.match(stdout, /spawn:.*vite/);
    assert.match(stdout, /spawn:\["dist-electron"\]/);
    assert.doesNotMatch(stdout, /prepare-feishu/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
