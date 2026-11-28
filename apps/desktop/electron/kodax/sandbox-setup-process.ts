import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Windows setup runs synchronous helpers for minutes (UAC wait, ACL work). In the
// main process that freezes Space, and a user who closes the frozen window leaves
// setup half done. A child Node process keeps Space responsive and finishes setup.
// A safety net only: the SDK bounds every wait itself (45 min for another setup, 10 min for
// the UAC prompt, then the elevated steps), and killing the child mid-setup interrupts it.
const SETUP_TIMEOUT_MS = 90 * 60_000;
const MAX_OUTPUT = 256 * 1024;

const WORKER = `
const [sandboxUrl, agentUrl] = process.argv.slice(1);
const diagnostics = [];
try {
  const agent = await import(agentUrl);
  agent.setKodaXDiagnosticSink((d) => {
    if ((d.level === 'warn' || d.level === 'error') && diagnostics.length < 20) {
      diagnostics.push(agent.formatKodaXDiagnostic(d).slice(0, 2000));
    }
  });
} catch {}
let result;
try {
  const outcome = await (await import(sandboxUrl)).activateKodaXSandbox({
    allowElevation: true,
    onProgress: (phase) => process.stdout.write('\\nSANDBOX_SETUP_PHASE:' + phase + '\\n'),
  });
  result = { status: outcome.status, attempted: outcome.attempted, error: outcome.error, code: outcome.code };
} catch (error) {
  result = { thrown: String(error && error.message || error) };
}
process.stdout.write('\\nSANDBOX_SETUP_RESULT:' + JSON.stringify({ ...result, diagnostics }) + '\\n');
`;

export interface ChildSetupResult {
  readonly status?: unknown;
  readonly attempted?: unknown;
  readonly error?: unknown;
  readonly code?: unknown;
  readonly thrown?: string;
  readonly diagnostics: readonly string[];
}

export interface SandboxSetupModules {
  readonly sandbox: string;
  readonly agent: string;
}

/** File URLs of the SDK entries this Space build ships; the child imports exactly these. */
export function resolveSandboxSetupModules(): SandboxSetupModules {
  // The CJS main bundle empties import.meta; only the tsx test loader takes the ESM branch.
  const resolver = typeof require === 'function' ? require : createRequire(import.meta.url);
  const manifestPath = resolver.resolve('@kodax-ai/kodax/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports: Record<string, { import: string }>;
  };
  const entry = (name: string) =>
    pathToFileURL(path.resolve(path.dirname(manifestPath), manifest.exports[name].import)).href;
  return { sandbox: entry('./sandbox'), agent: entry('./agent') };
}

export function parseChildSetupOutput(stdout: string): ChildSetupResult {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((value) => value.startsWith('SANDBOX_SETUP_RESULT:'));
  if (!line) throw new Error('Sandbox setup process returned no result.');
  const value = JSON.parse(line.slice('SANDBOX_SETUP_RESULT:'.length)) as Record<string, unknown>;
  const diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    status: value.status,
    attempted: value.attempted,
    error: value.error,
    code: value.code,
    ...(typeof value.thrown === 'string' ? { thrown: value.thrown } : {}),
    diagnostics,
  };
}

const PHASE_PREFIX = 'SANDBOX_SETUP_PHASE:';

export interface SandboxSetupProcessOptions {
  /** Receives each SDK `onProgress` phase as the child reports it (unvalidated text). */
  readonly onPhase?: (phase: string) => void;
  readonly modules?: SandboxSetupModules;
  readonly executable?: string;
}

/** Run SDK sandbox activation in a child Node process (Electron in Node mode in production). */
export function runSandboxSetupProcess({
  onPhase,
  modules = resolveSandboxSetupModules(),
  executable = process.execPath,
}: SandboxSetupProcessOptions = {}): Promise<ChildSetupResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ['--input-type=module', '--eval', WORKER, modules.sandbox, modules.agent],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stdout.length < MAX_OUTPUT) stdout += text;
      const lines = (pending + text).split(/\r?\n/);
      pending = (lines.pop() ?? '').slice(-1024);
      for (const line of lines) {
        if (line.startsWith(PHASE_PREFIX)) onPhase?.(line.slice(PHASE_PREFIX.length));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => child.kill(), SETUP_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolve(parseChildSetupOutput(stdout));
      } catch {
        reject(
          new Error(`Sandbox setup process exited ${String(code)}: ${stderr.trim().slice(-1000)}`),
        );
      }
    });
  });
}
