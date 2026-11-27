// Fail when a shipped Linux ELF needs a newer glibc / libstdc++ than RHEL 8-family
// systems provide (glibc 2.28, GCC 8 libstdc++). Electron itself targets 2.25; the
// native modules we compile are what drift with the build host.
// See docs/research/kodax-space-linux-glibc-2-28-build.md.
//
// Usage: node scripts/check-linux-glibc.mjs <file-or-dir>...   (needs binutils readelf)

import { spawnSync } from 'node:child_process';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = { GLIBC: '2.28', GLIBCXX: '3.4.25', CXXABI: '1.3.11' };

// Version-need lines read "Name: GLIBC_2.34  Flags: none  Version: 3"; version
// definitions put Name last, so requiring Flags after Name skips them.
const NEED = /Name: (GLIBC|GLIBCXX|CXXABI)_(\d+(?:\.\d+)*)\s+Flags:/g;

function newer(version, limit) {
  const a = version.split('.').map(Number);
  const b = limit.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** @param {string} readelfText output of `readelf -V -W` */
export function versionViolations(readelfText) {
  return [...readelfText.matchAll(NEED)]
    .filter(([, family, version]) => newer(version, LIMITS[family]))
    .map(([, family, version]) => `${family}_${version}`);
}

async function isElf(file) {
  const handle = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4), 0, 4, 0);
    return bytesRead === 4 && buffer.toString('latin1') === '\x7fELF';
  } finally {
    await handle.close();
  }
}

async function* files(target) {
  const info = await stat(target);
  if (info.isFile()) {
    yield target;
    return;
  }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) yield* files(child);
    else if (entry.isFile()) yield child;
  }
}

async function main(targets) {
  if (targets.length === 0) throw new Error('Usage: check-linux-glibc.mjs <file-or-dir>...');
  let elfCount = 0;
  let failed = false;
  for (const target of targets) {
    for await (const file of files(target)) {
      if (!(await isElf(file))) continue;
      elfCount += 1;
      const result = spawnSync('readelf', ['-V', '-W', file], { encoding: 'utf8' });
      if (result.error || result.status !== 0) {
        throw new Error(`readelf failed for ${file}: ${result.error?.message ?? result.stderr}`);
      }
      const violations = versionViolations(result.stdout);
      if (violations.length > 0) {
        failed = true;
        console.error(`[glibc] ${file}: ${violations.join(', ')}`);
      }
    }
  }
  if (elfCount === 0) throw new Error(`No ELF files found under ${targets.join(', ')}`);
  const limits = Object.entries(LIMITS)
    .map(([k, v]) => `${k}_${v}`)
    .join(', ');
  if (failed) throw new Error(`Linux binaries exceed ${limits}`);
  console.log(`[glibc] ${elfCount} ELF files within ${limits}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
