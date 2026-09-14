import { chmod, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// node-pty 1.1.0 ships its macOS spawn helpers without executable mode bits.
// Repair the installed copy before tests or electron-builder copy these files.
export async function ensureNodePtyHelpers(nodePtyRoot) {
  const root = await realpath(nodePtyRoot);
  const helpers = [
    'prebuilds/darwin-arm64/spawn-helper',
    'prebuilds/darwin-x64/spawn-helper',
    'build/Release/spawn-helper',
    'build/Debug/spawn-helper',
  ];
  for (const relative of helpers) {
    const helper = path.join(root, relative);
    const stat = await lstat(helper).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!stat) continue; // Source builds remove prebuilds; other platforms have no helper.
    if (!stat.isFile() || (await realpath(helper)) !== helper) {
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
