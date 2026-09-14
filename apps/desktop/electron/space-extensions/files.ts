import { constants, promises as fs } from 'node:fs';

export async function assertOwnedDirectory(directory: string, create = false): Promise<void> {
  if (create) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Extension directory is a symlink or is not a directory');
  }
}

/** Read a bounded snapshot from one regular-file descriptor; never follow a leaf symlink. */
export async function readRegularFile(filePath: string, maxBytes: number): Promise<Buffer> {
  const before = await fs.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Extension file is not a regular file');
  if (before.size > maxBytes)
    throw new Error(`Extension file exceeds size limit ${maxBytes} bytes`);
  const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev) {
      throw new Error('Extension file changed while opening');
    }
    const bytes = Buffer.alloc(Math.min(maxBytes + 1, stat.size + 1));
    let total = 0;
    while (total < bytes.length) {
      const result = await file.read(bytes, total, bytes.length - total, total);
      if (result.bytesRead === 0) return bytes.subarray(0, total);
      total += result.bytesRead;
    }
    if (total > maxBytes || total > stat.size)
      throw new Error('Extension file changed or exceeds size limit');
    return bytes.subarray(0, total);
  } finally {
    await file.close();
  }
}
