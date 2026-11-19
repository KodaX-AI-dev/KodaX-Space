import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { getKodaxDir, _resetDataPathsCacheForTesting } from '../kodax/data-paths.js';
import { installSkillFromPath } from '../skill/install.js';

let tmpSourceRoot: string;
let tmpProjectRoot: string;
let testHome: string;
let originalKodaxHome: string | undefined;
let extraCleanup: string[];

beforeEach(() => {
  originalKodaxHome = process.env.KODAX_HOME;
  extraCleanup = [];
  const suffix = `skill-install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  process.env.KODAX_TEST_ONBOARDING = suffix;
  _resetDataPathsCacheForTesting();
  testHome = path.join(os.tmpdir(), `kodax-test-${suffix}`);
  tmpSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-skill-source-'));
  tmpProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-skill-project-'));
});

afterEach(() => {
  delete process.env.KODAX_TEST_ONBOARDING;
  if (originalKodaxHome === undefined) delete process.env.KODAX_HOME;
  else process.env.KODAX_HOME = originalKodaxHome;
  _resetDataPathsCacheForTesting();
  for (const dir of [tmpSourceRoot, tmpProjectRoot, testHome, ...extraCleanup]) {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeSkill(dir: string, name: string): string {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Test skill\n---\nUse this skill for tests.\n`,
  );
  fs.writeFileSync(path.join(skillDir, 'notes.txt'), 'copied');
  return skillDir;
}

interface ZipEntryInput {
  readonly name: string;
  readonly data: string | Buffer;
  readonly externalAttrs?: number;
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC32_TABLE.length; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC32_TABLE[i] = crc >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(zipPath: string, entries: readonly ZipEntryInput[]): void {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(entry.externalAttrs ?? 0, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, ...centralParts, end]));
}

test('installs a selected skill folder into the user skills directory', async () => {
  const source = writeSkill(tmpSourceRoot, 'demo-skill');

  const result = await installSkillFromPath('directory', source, { target: 'user' });

  assert.equal(result.name, 'demo-skill');
  assert.equal(result.targetDir, path.join(getKodaxDir(), 'skills'));
  assert.equal(result.installDir, path.join(getKodaxDir(), 'skills', 'demo-skill'));
  assert.equal(fs.readFileSync(path.join(result.installDir, 'notes.txt'), 'utf8'), 'copied');
});

test('installs a single nested skill folder into project skills', async () => {
  writeSkill(tmpSourceRoot, 'nested-skill');

  const result = await installSkillFromPath('directory', tmpSourceRoot, {
    target: 'project',
    projectRoot: tmpProjectRoot,
  });

  assert.equal(result.name, 'nested-skill');
  assert.equal(result.targetDir, path.join(tmpProjectRoot, '.kodax', 'skills'));
  assert.equal(
    fs.existsSync(path.join(tmpProjectRoot, '.kodax', 'skills', 'nested-skill', 'SKILL.md')),
    true,
  );
});

test('installs a skill zip into the user skills directory', async () => {
  const source = writeSkill(tmpSourceRoot, 'zip-skill');
  const zipPath = path.join(tmpSourceRoot, 'zip-skill.zip');
  writeZip(zipPath, [
    {
      name: 'zip-skill/SKILL.md',
      data: fs.readFileSync(path.join(source, 'SKILL.md')),
    },
    {
      name: 'zip-skill/notes.txt',
      data: 'copied from zip',
    },
  ]);

  const result = await installSkillFromPath('archive', zipPath, { target: 'user' });

  assert.equal(result.name, 'zip-skill');
  assert.equal(fs.readFileSync(path.join(result.installDir, 'notes.txt'), 'utf8'), 'copied from zip');
});

function manyFileSkillEntries(name: string, fileCount: number): ZipEntryInput[] {
  const entries: ZipEntryInput[] = [
    { name: `${name}/SKILL.md`, data: `---\nname: ${name}\ndescription: Test skill\n---\n` },
  ];
  for (let i = 0; i < fileCount; i++) {
    entries.push({ name: `${name}/assets/icons/icon-${i}.svg`, data: `<svg id="${i}"/>` });
  }
  return entries;
}

function installTmpEntries(): string[] {
  const tmpBase = path.join(getKodaxDir(), 'skills', '.install-tmp');
  return fs.existsSync(tmpBase) ? fs.readdirSync(tmpBase) : [];
}

// Issue 253: CyberPPT ships 11,639 icons; a 4,096-entry cap rejected it after partial extraction.
test('installs a skill zip with more than 4096 files and leaves no install temp', async () => {
  const zipPath = path.join(tmpSourceRoot, 'icon-skill.zip');
  writeZip(zipPath, manyFileSkillEntries('icon-skill', 5000));

  const result = await installSkillFromPath('archive', zipPath, { target: 'user' });

  assert.equal(result.name, 'icon-skill');
  assert.equal(
    fs.readdirSync(path.join(result.installDir, 'assets', 'icons')).length,
    5000,
  );
  assert.deepEqual(installTmpEntries(), []);
});

test('rejects an over-limit skill zip before extracting any entry', async () => {
  const zipPath = path.join(tmpSourceRoot, 'huge.zip');
  writeZip(zipPath, manyFileSkillEntries('huge-skill', 32768));

  await assert.rejects(
    () => installSkillFromPath('archive', zipPath, { target: 'user' }),
    /archive has 32769 entries; the limit is 32768/,
  );
  assert.deepEqual(installTmpEntries(), []);
});

test('user skill install follows KODAX_HOME when it is explicitly set', async () => {
  const customHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-home-skills-'));
  extraCleanup.push(customHome);
  delete process.env.KODAX_TEST_ONBOARDING;
  process.env.KODAX_HOME = customHome;
  _resetDataPathsCacheForTesting();
  const source = writeSkill(tmpSourceRoot, 'home-skill');

  const result = await installSkillFromPath('directory', source, { target: 'user' });

  assert.equal(result.targetDir, path.join(customHome, 'skills'));
  assert.equal(result.installDir, path.join(customHome, 'skills', 'home-skill'));
});

test('rejects a skill folder without SKILL.md', async () => {
  fs.mkdirSync(path.join(tmpSourceRoot, 'not-a-skill'), { recursive: true });

  await assert.rejects(
    () => installSkillFromPath('directory', tmpSourceRoot, { target: 'user' }),
    /SKILL\.md/,
  );
});

test('rejects a skill zip with path traversal entries', async () => {
  const zipPath = path.join(tmpSourceRoot, 'unsafe.zip');
  writeZip(zipPath, [
    {
      name: '../evil/SKILL.md',
      data: '---\nname: evil-skill\n---\n',
    },
  ]);

  await assert.rejects(
    () => installSkillFromPath('archive', zipPath, { target: 'user' }),
    /unsafe archive entry|invalid relative path/,
  );
});

test('rejects a skill zip with symlink entries', async () => {
  const zipPath = path.join(tmpSourceRoot, 'symlink.zip');
  writeZip(zipPath, [
    {
      name: 'link',
      data: 'target',
      externalAttrs: (0o120777 << 16) >>> 0,
    },
  ]);

  await assert.rejects(
    () => installSkillFromPath('archive', zipPath, { target: 'user' }),
    /symlink/,
  );
});
