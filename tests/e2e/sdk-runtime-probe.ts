import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SpaceInstance } from './fixtures.js';

/** Connect to this fixture's existing Host, never infer a second endpoint from TMPDIR. */
export function runIsolatedSdkProbe(
  space: Pick<SpaceInstance, 'testDataDir'>,
  program: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
) {
  return promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import path from 'node:path';
    import {readFile,realpath} from 'node:fs/promises';
    import {connectKodaXRuntime} from '@kodax-ai/kodax/runtime';
    const root=process.env.KODAX_HOME;
    const dir=path.join(root,'runtime','daemon','coder');
    const descriptor=JSON.parse(await readFile(path.join(dir,'daemon.json'),'utf8'));
    assert.equal(descriptor.profile,'coder');
    assert.equal(await realpath(descriptor.configHome),await realpath(root));
    assert.equal(typeof descriptor.endpoint,'string');
    const client=await connectKodaXRuntime({profile:'coder',sessionsDir:path.join(root,'sessions'),
      endpoint:descriptor.endpoint,daemonToken:(await readFile(path.join(dir,'daemon.token'),'utf8')).trim()});
    try { ${program} } finally {await client.close();}
  `,
    ],
    {
      windowsHide: true,
      timeout,
      env: { ...process.env, ...env, KODAX_HOME: space.testDataDir },
    },
  );
}
