import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export async function verifyArtifactSdkPackage({
  sdkDirectory,
  probeRoot,
  nodeExecutable = process.execPath,
}) {
  const resources = [
    'dist/artifacts/dist/runtime-entry.js',
    'dist/artifacts/dist/docx.browser.js',
    'dist/artifacts/skills/artifact-review/SKILL.md',
    'dist/artifacts/LICENSE',
  ];
  const manifest = JSON.parse(await readFile(path.join(sdkDirectory, 'package.json'), 'utf8'));
  for (const entry of [
    './artifacts',
    './artifacts/client',
    './artifacts/runtime',
    './artifacts/kodax',
  ]) {
    if (!manifest.exports?.[entry]) throw new Error(`Missing Artifact SDK export: ${entry}`);
  }
  for (const resource of resources) {
    if (!(await stat(path.join(sdkDirectory, resource))).size)
      throw new Error(`Empty Artifact SDK resource: ${resource}`);
  }
  await mkdir(probeRoot, { recursive: true });
  const parent = await realpath(probeRoot);
  const workspace = await realpath(await mkdtemp(path.join(parent, '.artifact-package-')));
  if (
    path.dirname(workspace) !== parent ||
    !path.basename(workspace).startsWith('.artifact-package-')
  ) {
    throw new Error('Artifact probe workspace escaped its output directory.');
  }
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const probe = fileURLToPath(new URL('./artifact-sdk-probe.mjs', import.meta.url));
    const result = await promisify(execFile)(
      nodeExecutable,
      [probe, path.resolve(sdkDirectory), workspace],
      { cwd: workspace, env, timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(result.stdout.trim());
  } finally {
    await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
  }
}
