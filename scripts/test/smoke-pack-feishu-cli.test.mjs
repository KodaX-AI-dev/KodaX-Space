import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyPackagedFeishuCliResources } from '../smoke-pack.mjs';

const VERSION = '1.0.92';
const APP_VERSION = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
const OFFICIAL_LICENSE = await readFile(
  new URL('../../resources/partner-connectors/feishu-cli/LICENSE', import.meta.url),
);

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function fixture(target = 'darwin-arm64', options = {}) {
  const tempParent = options.tempParent ?? tmpdir();
  const root = await mkdtemp(path.join(tempParent, 'space-pack-feishu-smoke-'));
  const macDir = options.macDir ?? (target === 'darwin-arm64' ? 'mac-arm64' : 'mac');
  const resources = target.startsWith('darwin-')
    ? path.join(root, macDir, 'KodaX Space.app', 'Contents', 'Resources')
    : path.join(root, target.startsWith('win32-') ? 'win-unpacked' : 'linux-unpacked', 'resources');
  const archive = Buffer.from('pinned Feishu CLI archive');
  const format = target.startsWith('win32-') ? 'zip' : 'tar.gz';
  const lock = {
    schemaVersion: 1,
    component: 'lark-cli',
    version: VERSION,
    assets: {
      [target]: {
        bytes: archive.byteLength,
        sha256: digest(archive),
        format,
      },
    },
  };
  const lockPath = path.join(root, 'feishu-cli.lock.json');
  const archivePath = path.join(
    resources,
    'managed-components',
    'feishu-cli',
    VERSION,
    target,
    `lark-cli.${format}`,
  );
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(path.join(resources, 'app.asar'), 'fixture');
  await writeFile(
    path.join(resources, 'managed-components', 'feishu-cli', 'LICENSE'),
    OFFICIAL_LICENSE,
  );
  await writeFile(lockPath, JSON.stringify(lock));
  await writeFile(archivePath, archive);
  if (target.startsWith('darwin-')) {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(0xfeedfacf, 0);
    header.writeUInt32LE(target === 'darwin-arm64' ? 0x0100000c : 0x01000007, 4);
    const executableDir = path.join(path.dirname(resources), 'MacOS');
    await mkdir(executableDir, { recursive: true });
    await writeFile(path.join(executableDir, 'KodaX Space'), header);
  }
  if (macDir === 'mac' && options.includeDmg !== false) {
    const artifactArch = options.artifactArch ?? target.slice('darwin-'.length);
    await writeFile(path.join(root, `KodaX-Space-${APP_VERSION}-${artifactArch}.dmg`), 'fixture');
  }
  return {
    root,
    resources,
    lockPath,
    archivePath,
    archiveBytes: archive.byteLength,
    asarPath: path.join(resources, 'app.asar'),
  };
}

test('packaged Feishu CLI smoke accepts the one locked archive and license for every release target', async () => {
  for (const target of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']) {
    const f = await fixture(target);
    try {
      assert.deepEqual(
        await verifyPackagedFeishuCliResources({
          asarPath: f.asarPath,
          lockPath: f.lockPath,
        }),
        { target, version: VERSION },
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('packaged Feishu CLI smoke rejects a foreign architecture archive', async () => {
  const f = await fixture();
  try {
    const foreign = path.join(
      f.resources,
      'managed-components',
      'feishu-cli',
      VERSION,
      'darwin-x64',
      'lark-cli.tar.gz',
    );
    await mkdir(path.dirname(foreign), { recursive: true });
    await writeFile(foreign, 'foreign');
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /unexpected Feishu CLI file.*darwin-x64/u,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('packaged Feishu CLI smoke anchors macOS inference and supports arm64 in mac output', async () => {
  const ancestor = await mkdtemp(path.join(tmpdir(), 'mac-arm64-'));
  try {
    for (const [target, artifactArch] of [
      ['darwin-x64', 'x64'],
      ['darwin-arm64', 'arm64'],
    ]) {
      const f = await fixture(target, { tempParent: ancestor, macDir: 'mac', artifactArch });
      try {
        if (target === 'darwin-x64') {
          await writeFile(path.join(f.root, `KodaX-Space-${APP_VERSION}-arm64.dmg`), 'fixture');
        }
        assert.equal(
          (
            await verifyPackagedFeishuCliResources({
              asarPath: f.asarPath,
              lockPath: f.lockPath,
            })
          ).target,
          target,
        );
      } finally {
        await rm(f.root, { recursive: true, force: true });
      }
    }
    for (const target of ['darwin-x64', 'darwin-arm64']) {
      const f = await fixture(target, { tempParent: ancestor, macDir: 'mac', includeDmg: false });
      try {
        assert.equal(
          (
            await verifyPackagedFeishuCliResources({
              asarPath: f.asarPath,
              lockPath: f.lockPath,
            })
          ).target,
          target,
        );
      } finally {
        await rm(f.root, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(ancestor, { recursive: true, force: true });
  }
});

test('packaged Feishu CLI smoke rejects extra files and symbolic links', async () => {
  const f = await fixture();
  try {
    const extra = path.join(f.resources, 'managed-components', 'feishu-cli', 'lark-cli.exe');
    await writeFile(extra, 'unexpected executable');
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /unexpected Feishu CLI file.*lark-cli\.exe/u,
    );
    await rm(extra);
    const foreignDir = path.join(
      f.resources,
      'managed-components',
      'feishu-cli',
      VERSION,
      'darwin-x64',
    );
    await symlink(
      path.dirname(f.archivePath),
      foreignDir,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /unsafe symbolic link/u,
    );
    await rm(foreignDir, { recursive: true, force: true });
    const componentRoot = path.join(f.resources, 'managed-components', 'feishu-cli');
    const realRoot = `${componentRoot}-real`;
    await rename(componentRoot, realRoot);
    await symlink(realRoot, componentRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /root is a symbolic link/u,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('packaged Feishu CLI smoke rejects archive tampering and a missing license explicitly', async () => {
  const f = await fixture();
  try {
    await writeFile(f.archivePath, Buffer.alloc(f.archiveBytes, 0x78));
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /archive SHA-256 mismatch/u,
    );
    await writeFile(f.archivePath, 'tampered');
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /archive size mismatch/u,
    );
    await writeFile(
      path.join(f.resources, 'managed-components', 'feishu-cli', 'LICENSE'),
      'tampered license',
    );
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /license does not match/u,
    );
    await rm(path.join(f.resources, 'managed-components', 'feishu-cli', 'LICENSE'));
    await assert.rejects(
      verifyPackagedFeishuCliResources({ asarPath: f.asarPath, lockPath: f.lockPath }),
      /license missing or unsafe/u,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
