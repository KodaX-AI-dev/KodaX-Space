import { chmod, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// node-pty 1.1.0 ships its macOS spawn helpers without executable mode bits.
// Repair the installed copy before tests or electron-builder copy these files.
export async function ensureNodePtyHelpers(nodePtyRoot) {
  const root = await realpath(nodePtyRoot);
  for (const arch of ['arm64', 'x64']) {
    const helper = path.join(root, 'prebuilds', `darwin-${arch}`, 'spawn-helper');
    if ((await realpath(helper)) !== helper || !(await lstat(helper)).isFile()) {
      throw new Error(`Unsafe node-pty helper: ${helper}`);
    }
    await chmod(helper, 0o755);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.platform !== 'win32') {
    await ensureNodePtyHelpers(
      fileURLToPath(new URL('../node_modules/node-pty/', import.meta.url)),
    );
  }
}
