import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const installerPattern = /\.(exe|dmg|AppImage|deb|zip|blockmap|yml)$/;
const platforms = ['windows-latest', 'macos-15-intel', 'macos-latest', 'ubuntu-latest'];

async function checksum(root, name) {
  if (!name || /[/\\:]/.test(name) || name === '.' || name === '..')
    throw new Error('Unsafe candidate filename');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(root, name))) hash.update(chunk);
  return { name, sha256: hash.digest('hex') };
}

export async function recordCandidate(root, identity) {
  const names = (await readdir(root)).filter((name) => installerPattern.test(name)).sort();
  if (!names.length) throw new Error('Candidate has no installers');
  const manifest = {
    ...identity,
    archive: await checksum(root, 'app.tgz'),
    installers: await Promise.all(names.map((name) => checksum(root, name))),
  };
  await writeFile(path.join(root, 'candidate.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function verifyCandidate(root, identity, kind) {
  const manifest = JSON.parse(await readFile(path.join(root, 'candidate.json'), 'utf8'));
  for (const [key, value] of Object.entries(identity)) {
    if (!value || manifest[key] !== value) throw new Error(`Candidate identity mismatch: ${key}`);
  }
  if (!Array.isArray(manifest.installers) || !manifest.installers.length)
    throw new Error('Missing candidate installers');
  if (manifest.archive?.name !== 'app.tgz') throw new Error('Missing candidate archive');
  if (!['archive', 'installers'].includes(kind))
    throw new Error('Unknown candidate verification kind');
  const files = kind === 'archive' ? [manifest.archive] : manifest.installers;
  for (const file of files) {
    if ((await checksum(root, file.name)).sha256 !== file.sha256)
      throw new Error(`Candidate checksum mismatch: ${file.name}`);
  }
  if (kind === 'installers') {
    const actual = (await readdir(root)).filter((name) => installerPattern.test(name)).sort();
    const expected = manifest.installers.map((file) => file.name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Candidate installer set mismatch');
  }
}

async function main() {
  const [mode, root = 'out', platform] = process.argv.slice(2);
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const identity = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    platform,
    version,
  };
  if (mode === 'publish') {
    for (const target of platforms) {
      await verifyAcceptedCandidate(root, { ...identity, platform: target });
    }
  } else {
    if (!platforms.includes(platform)) throw new Error('Unknown candidate platform');
    if (mode === 'record') await recordCandidate(root, identity);
    else if (mode === 'verify') await verifyCandidate(root, identity, 'archive');
    else throw new Error('Usage: release-candidate.mjs record|verify|publish directory [platform]');
  }
}

export async function verifyAcceptedCandidate(root, identity) {
  const installerDir = path.join(root, `installer-${identity.platform}`);
  const accepted = await readFile(
    path.join(root, `accepted-${identity.platform}`, 'candidate.json'),
    'utf8',
  );
  const built = await readFile(path.join(installerDir, 'candidate.json'), 'utf8');
  if (accepted !== built) throw new Error('Candidate differs from its acceptance receipt');
  await verifyCandidate(installerDir, identity, 'installers');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
