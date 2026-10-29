import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  recordCandidate,
  verifyCandidate,
  verifyAcceptedCandidate,
} from '../release-candidate.mjs';

const identity = {
  repository: 'example/space',
  sha: 'a'.repeat(40),
  runId: '10',
  platform: 'windows-latest',
  version: '1.0.0',
};

test('the same candidate archive and installers verify independently for acceptance and publishing', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'app.tgz'), 'packaged bytes');
  await writeFile(path.join(root, 'setup.exe'), 'installer bytes');
  await recordCandidate(root, identity);
  await verifyCandidate(root, identity, 'archive');
  await verifyCandidate(root, identity, 'installers');
  await writeFile(path.join(root, 'setup.exe'), 'different build');
  await assert.rejects(verifyCandidate(root, identity, 'installers'), /checksum/);
  await assert.rejects(
    verifyCandidate(root, { ...identity, sha: 'b'.repeat(40) }, 'archive'),
    /identity/,
  );
  await assert.rejects(verifyCandidate(root, { ...identity, runId: '11' }, 'archive'), /identity/);
});

test('a rebuilt candidate cannot borrow an earlier acceptance receipt', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-accepted-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installerDir = path.join(root, `installer-${identity.platform}`);
  const acceptedDir = path.join(root, `accepted-${identity.platform}`);
  await mkdir(installerDir);
  await mkdir(acceptedDir);
  await writeFile(path.join(installerDir, 'app.tgz'), 'first build');
  await writeFile(path.join(installerDir, 'setup.exe'), 'installer');
  await recordCandidate(installerDir, identity);
  await writeFile(
    path.join(acceptedDir, 'candidate.json'),
    await readFile(path.join(installerDir, 'candidate.json')),
  );
  await verifyAcceptedCandidate(root, identity);
  await writeFile(path.join(installerDir, 'app.tgz'), 'rebuilt app');
  await recordCandidate(installerDir, identity);
  await assert.rejects(verifyAcceptedCandidate(root, identity), /acceptance receipt/);
});

test('candidate validation rejects an empty installer list and unsafe manifest paths', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'app.tgz'), 'archive');
  await assert.rejects(recordCandidate(root, identity), /installers/);
  await writeFile(path.join(root, 'setup.exe'), 'installer');
  await recordCandidate(root, identity);
  const manifest = JSON.parse(await readFile(path.join(root, 'candidate.json'), 'utf8'));
  manifest.installers[0].name = '../setup.exe';
  await writeFile(path.join(root, 'candidate.json'), JSON.stringify(manifest));
  await assert.rejects(verifyCandidate(root, identity, 'installers'), /filename/);
});
