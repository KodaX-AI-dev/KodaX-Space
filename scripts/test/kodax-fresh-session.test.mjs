import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOwnedTestRuntime, stopOwnedTestRuntime } from './owned-runtime-fixture.mjs';

test('installed shared Host creates fresh Sessions without opening legacy Run event journals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-fresh-session-'));
  const options = { homeDir: root, sessionsDir: path.join(root, 'sessions'), defaultProvider: 'anthropic' };
  const block = path.join(root, 'block-old-history'), counter = path.join(root, 'old-history-read'), ready = path.join(root, 'hook-ready');
  let runtime;
  try {
    runtime = await createOwnedTestRuntime(options);
    const unrelated = await runtime.sessions.create({ projectPath: root });
    await runtime.sessions.updateSettings(unrelated.id, { permissionMode: 'full-access' });
    const input = path.join(root, 'fixture.txt'); await writeFile(input, 'fixture');
    const run = await runtime.runs.start({ sessionId: unrelated.id, prompt: 'Read fixture',
      options: { toolInvocation: { name: 'read', input: { path: input } }, lsp: false } });
    assert.equal((await run.result).phase, 'completed');
    const oldLog = path.join(root, '.kodax', 'runtime', 'profiles', 'default', 'runs', run.runId, 'events.jsonl');
    // Live events have no durable journal. A legacy artifact must remain unread.
    await mkdir(path.dirname(oldLog), { recursive: true });
    await writeFile(oldLog, `${JSON.stringify({ sessionId: unrelated.id, content: 'x'.repeat(256 * 1024) })}\n`);
    assert.ok((await stat(oldLog)).size > 0);
    await stopOwnedTestRuntime(runtime); runtime = undefined;
    const extension = path.join(root, 'deny-old-history.mjs');
    await writeFile(extension, `import fs from 'node:fs';import fsp from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
export default function activate(api) {
 const check=file=>{if(String(file)===${JSON.stringify(oldLog)}&&fs.existsSync(${JSON.stringify(block)})){fs.writeFileSync(${JSON.stringify(counter)},'old-history-read');throw Object.assign(new Error('EIO: unrelated Run history was opened'),{code:'EIO'});}};
 for(const [owner,key] of [[fs,'openSync'],[fs,'readFileSync'],[fsp,'open'],[fsp,'readFile']]){const original=owner[key];owner[key]=(...args)=>{check(args[0]);return original(...args)};}
 syncBuiltinESMExports();
 fs.writeFileSync(${JSON.stringify(ready)},'active');
}`);
    await mkdir(path.join(root, '.kodax'), { recursive: true });
    await writeFile(path.join(root, '.kodax', 'config.json'), JSON.stringify({ extensions: [extension] }));
    runtime = await createOwnedTestRuntime(options);
    assert.equal(await readFile(ready, 'utf8'), 'active');
    await writeFile(block, 'block');
    const session = await runtime.sessions.create({ projectPath: root, gitRoot: root, surface: 'space-desktop', tag: 'code' });
    const observation = await runtime.sessions.observe(session.id, () => undefined);
    assert.equal(observation.snapshot.seq, 1); observation.close();
    await assert.rejects(stat(counter), { code: 'ENOENT' });
  } finally {
    await rm(block, { force: true });
    await stopOwnedTestRuntime(runtime);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
