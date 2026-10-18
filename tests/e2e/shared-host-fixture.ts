import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runFile = promisify(execFile);
const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve('@kodax-ai/kodax/package.json')),
  'dist/kodax_cli.js',
);

export async function startConflictingHistoryHost(
  root: string,
  options: {
    readonly providerUrl?: string;
    readonly sdkDirectory?: string;
    readonly persistent?: boolean;
  } = {},
) {
  const { providerUrl } = options;
  const source = `
    import { promises as fs } from 'node:fs';
    import path from 'node:path';
    const { createSessionManager } = await import(process.argv[3]);
    const { ensureKodaXRuntime } = await import(process.argv[4]);
    const root = process.argv[1];
    const project = path.join(root, 'workspace');
    await fs.mkdir(project, { recursive: true });
    const manager = createSessionManager({ sessionsDir: path.join(root, 'sessions') });
    for (const label of ['first', 'second']) await manager.storage.save('issue222-' + label, {
      title: 'ISSUE222 ' + label + ' history', gitRoot: project, scope: 'user',
      runtimeInfo: { workspaceRoot: project, surface: 'repl' },
      messages: [
        { role: 'user', content: 'saved question ' + label },
        { role: 'assistant', content: [{ type: 'text', text: 'saved answer ' + label }] },
      ],
    });
    const runtime = await ensureKodaXRuntime({ profile: 'default', sessionsDir: path.join(root, 'sessions'),
      ...(process.argv[5] === 'persistent' ? { daemonLifecycle: 'persistent' } : {}) });
    let run;
    if (process.argv[2]) {
      const session = await runtime.sessions.create({ projectPath: project });
      const lease = await runtime.credentials.registerScoped({ providers: ['issue222-local'] }, async () => 'space-e2e-fixture');
      run = await runtime.runs.start({
        sessionId: session.id, prompt: 'HOLD_QUEUE', mode: 'coding',
        options: { provider: 'issue222-local', model: 'space-e2e-model' },
        credential: { leaseId: lease.id, mode: 'scoped', providers: ['issue222-local'] },
      });
    }
    const owner = (await runtime.daemon.inspect()).owner;
    if (run) {
      process.on('message', async message => {
        if (message !== 'release') return;
        const result = await run.result;
        if (result.phase !== 'completed') throw new Error('Protected Run did not complete: ' + JSON.stringify(result));
        await runtime.close(); process.disconnect();
      });
    } else { await runtime.close(); }
    process.send({ ready: true, pid: owner.pid, runtimeId: runtime.identity.runtimeId });
    if (!run) process.disconnect();
  `;
  if (providerUrl) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(root, 'config.json'),
      JSON.stringify({
        customProviders: [
          {
            name: 'issue222-local',
            protocol: 'openai',
            baseUrl: providerUrl,
            apiKeyEnv: 'ISSUE222_UNUSED_KEY',
            model: 'space-e2e-model',
            contextWindow: 32768,
            maxOutputTokens: 1024,
          },
        ],
      }),
    );
  }
  const executable = process.env.SPACE_E2E_EXECUTABLE;
  const modulePath = (name: string) =>
    options.sdkDirectory
      ? pathToFileURL(path.join(options.sdkDirectory, 'dist', `sdk-${name}.js`)).href
      : executable
        ? pathToFileURL(
            path.resolve(
              path.dirname(executable),
              process.platform === 'darwin' ? '../Resources' : 'resources',
              'app.asar/node_modules/@kodax-ai/kodax/dist',
              `sdk-${name}.js`,
            ),
          ).href
        : `@kodax-ai/kodax/${name}`;
  const child = spawn(
    executable ?? process.execPath,
    [
      '--input-type=module',
      '-e',
      source,
      root,
      providerUrl ?? '',
      modulePath('session'),
      modulePath('runtime'),
      options.persistent ? 'persistent' : '',
    ],
    {
      env: {
        ...process.env,
        KODAX_HOME: root,
        ...(executable ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let stderr = '';
  if (!child.stderr) throw new Error('Shared Host fixture requires a stderr pipe');
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk}`.slice(-4096);
  });
  const exited = once(child, 'exit');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const owner = await new Promise<{ pid: number; runtimeId: string }>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Isolated shared Host did not start')), 20_000);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Shared Host fixture exited: ${stderr}`));
    });
    child.once('message', (message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('pid' in message) ||
        typeof message.pid !== 'number' ||
        !('runtimeId' in message) ||
        typeof message.runtimeId !== 'string'
      )
        return reject(new Error('Shared Host fixture returned no owner identity'));
      resolve({ pid: message.pid, runtimeId: message.runtimeId });
    });
  }).finally(() => clearTimeout(timer));
  const confirmExit = async () => {
    const [code, signal] = await exited;
    if (code !== 0)
      throw new Error(`Protected shared Host client failed (${code ?? signal}): ${stderr}`);
  };
  return {
    ...owner,
    async release() {
      if (child.connected) child.send('release');
      await confirmExit();
    },
    async stop() {
      if (child.connected) child.send('release');
      try {
        await confirmExit();
      } finally {
        await runFile(
          process.execPath,
          [cli, 'daemon', 'stop', '--profile', 'default', '--timeout-ms', '5000', '--json'],
          {
            env: { ...process.env, KODAX_HOME: root },
            windowsHide: true,
            timeout: 20_000,
          },
        );
      }
    },
  };
}
