// Trusted shared-Host extension. Resolve the SDK shipped with this Space copy,
// never a package or executable supplied by a conversation or project directory.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export async function resolveArtifactNode(env = process.env) {
  if (!process.versions.electron) return process.execPath;
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1];
  const candidates = [...new Set((pathValue ?? '').split(path.delimiter))]
    .map((directory) => directory.replace(/^"|"$/g, ''))
    .filter((directory) => path.isAbsolute(directory))
    .map((directory) => path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node'))
    .filter((candidate) => existsSync(candidate));
  const cleanEnv = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE'].includes(key.toUpperCase()),
    ),
  );
  // Stay below builtin activation's deadline even when a stale Node shim hangs.
  const deadline = Date.now() + 2_000;
  for (const candidate of candidates) {
    const timeout = deadline - Date.now();
    if (timeout <= 0) break;
    try {
      const { stdout } = await promisify(execFile)(
        candidate,
        ['-p', 'JSON.stringify({node:process.versions.node,electron:!!process.versions.electron})'],
        { env: cleanEnv, timeout, maxBuffer: 4096, windowsHide: true },
      );
      const version = JSON.parse(stdout.trim());
      const [major, minor] = String(version.node).split('.').map(Number);
      if (!version.electron && (major > 20 || (major === 20 && minor >= 16))) return candidate;
    } catch {
      // A stale version-manager shim or incompatible binary is not a usable worker.
    }
  }
  throw new Error(
    'Artifact tools require real Node.js >=20.16 on the shell PATH. Reload Host extensions after installing Node.js.',
  );
}

export function resolveSpaceArtifactImports() {
  const resources = fileURLToPath(new URL('.', import.meta.url));
  const packaged = path.join(resources, 'app.asar', 'package.json');
  const require = createRequire(
    existsSync(packaged) ? packaged : new URL('../package.json', import.meta.url),
  );
  const manifestPath = require.resolve('@kodax-ai/kodax/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sdkRoot = path.dirname(manifestPath);
  const artifact = path.resolve(sdkRoot, manifest.exports['./artifacts/kodax'].import);
  // Node workers cannot read ASAR. The complete Artifact tree is asarUnpack'd.
  const physicalArtifact = artifact.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
  return {
    artifact: pathToFileURL(physicalArtifact).href,
    coding: pathToFileURL(path.resolve(sdkRoot, manifest.exports['./coding'].import)).href,
  };
}

export default async function registerSpaceArtifacts(api) {
  const nodeExecutable = await resolveArtifactNode();
  const imports = resolveSpaceArtifactImports();
  const [{ registerArtifactTools }, { executeManagedProcess }] = await Promise.all([
    import(imports.artifact),
    import(imports.coding),
  ]);
  return registerArtifactTools(api, { execute: executeManagedProcess, nodeExecutable });
}
