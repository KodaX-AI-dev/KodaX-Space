// ProjectStore tests — 用临时目录验证持久化、缓存、去重、删除、损坏恢复。

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProjectStore } from '../projects/store.js';

let tmpDir = '';
let storeFile = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-space-test-'));
  storeFile = path.join(tmpDir, 'projects.json');
});

afterEach(async () => {
  // best-effort cleanup
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

test('list: empty when file does not exist', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const projects = await store.list();
  assert.equal(projects.length, 0);
});

test('addOrBump: creates new project with name derived from path basename', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const inputPath = path.join(tmpDir, 'my-project');
  const project = await store.addOrBump(inputPath);
  assert.equal(project.path, inputPath);
  assert.equal(project.name, 'my-project');
  assert.ok(project.addedAt > 0);
  assert.equal(project.addedAt, project.lastUsedAt);
});

test('addOrBump: existing path only bumps lastUsedAt, preserves addedAt + name', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const inputPath = path.join(tmpDir, 'proj');
  const first = await store.addOrBump(inputPath);
  await new Promise((r) => setTimeout(r, 5)); // ensure timestamp diff
  const second = await store.addOrBump(inputPath);
  assert.equal(second.path, first.path);
  assert.equal(second.addedAt, first.addedAt);
  assert.ok(second.lastUsedAt >= first.lastUsedAt);
});

test('addOrBump: persists to disk and survives store recreation', async () => {
  const store1 = createProjectStore(storeFile, tmpDir);
  await store1.addOrBump(path.join(tmpDir, 'a'));
  await store1.addOrBump(path.join(tmpDir, 'b'));

  // 第二个 store 实例（模拟应用重启）
  const store2 = createProjectStore(storeFile, tmpDir);
  const projects = await store2.list();
  assert.equal(projects.length, 2);
  // 顺序：新加的在前
  assert.equal(path.basename(projects[0].path), 'b');
  assert.equal(path.basename(projects[1].path), 'a');
});

test('remove: deletes the entry and returns true', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const target = path.join(tmpDir, 'target');
  await store.addOrBump(target);
  await store.addOrBump(path.join(tmpDir, 'keep'));
  const removed = await store.remove(target);
  assert.equal(removed, true);
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(path.basename(list[0].path), 'keep');
});

test('remove: returns false for non-existent path (idempotent)', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  await store.addOrBump(path.join(tmpDir, 'a'));
  const removed = await store.remove(path.join(tmpDir, 'never-existed'));
  assert.equal(removed, false);
});

test('list: recovers gracefully from corrupted JSON file', async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(storeFile, 'not valid json {{{{', 'utf-8');
  const store = createProjectStore(storeFile, tmpDir);
  // 不抛——回滚到空列表
  const projects = await store.list();
  assert.equal(projects.length, 0);
});

test('list: recovers from schema-valid-JSON-but-wrong-shape', async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(storeFile, JSON.stringify({ wrong: 'shape' }), 'utf-8');
  const store = createProjectStore(storeFile, tmpDir);
  const projects = await store.list();
  assert.equal(projects.length, 0);
});

test('persist uses atomic rename: file does not appear half-written', async () => {
  // 确认 writeFile 写的是 tmp 文件再 rename——读直接读 storeFile 应该看到完整 JSON
  const store = createProjectStore(storeFile, tmpDir);
  await store.addOrBump(path.join(tmpDir, 'p1'));
  const content = await fs.readFile(storeFile, 'utf-8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.version, 1);
  assert.ok(Array.isArray(parsed.projects));
  assert.equal(parsed.projects.length, 1);
});

// ---- Review fixes ----

test('concurrent addOrBump: both writes persisted (no lost-update race)', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  // 不 await——同时 enqueue 两个 mutation
  const p1 = store.addOrBump(path.join(tmpDir, 'concurrent-a'));
  const p2 = store.addOrBump(path.join(tmpDir, 'concurrent-b'));
  await Promise.all([p1, p2]);

  // 两个 project 都应在磁盘上
  const reloaded = createProjectStore(storeFile, tmpDir);
  const list = await reloaded.list();
  const names = list.map((p) => path.basename(p.path)).sort();
  assert.deepEqual(names, ['concurrent-a', 'concurrent-b']);
});

test('rename over existing file works (Windows fallback covers EEXIST/EPERM)', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  // 第一次写：dest 不存在，fs.rename 直接成功
  await store.addOrBump(path.join(tmpDir, 'first'));
  // 第二次写：dest 已存在，POSIX 仍原子覆盖；Windows 走 copyFile+unlink fallback
  await store.addOrBump(path.join(tmpDir, 'second'));
  const list = await createProjectStore(storeFile, tmpDir).list();
  assert.equal(list.length, 2);
});

test('list: filters out poisoned entries with non-absolute paths', async () => {
  // 模拟攻击者 / 别的进程往 projects.json 里写畸形条目
  await fs.mkdir(tmpDir, { recursive: true });
  const poisoned = {
    version: 1,
    projects: [
      { path: path.join(tmpDir, 'valid'), name: 'valid', addedAt: 1, lastUsedAt: 1 },
      { path: '../../escape', name: 'escape', addedAt: 1, lastUsedAt: 1 }, // 非绝对
      { path: 'relative-path', name: 'rel', addedAt: 1, lastUsedAt: 1 }, // 非绝对
    ],
  };
  await fs.writeFile(storeFile, JSON.stringify(poisoned), 'utf-8');

  const list = await createProjectStore(storeFile, tmpDir).list();
  // 只有 valid 应该幸存
  assert.equal(list.length, 1);
  assert.equal(path.basename(list[0].path), 'valid');
});

test('list: filters out entries with NUL byte in path', async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  const poisoned = {
    version: 1,
    projects: [
      { path: path.join(tmpDir, 'ok'), name: 'ok', addedAt: 1, lastUsedAt: 1 },
      { path: '/safe-looking\x00/escape', name: 'nul', addedAt: 1, lastUsedAt: 1 },
    ],
  };
  await fs.writeFile(storeFile, JSON.stringify(poisoned), 'utf-8');
  const list = await createProjectStore(storeFile, tmpDir).list();
  assert.equal(list.length, 1);
  assert.equal(path.basename(list[0].path), 'ok');
});

// ---- F043 rename / setArchived ----

test('rename: changes name, preserves other fields', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'orig-name');
  const before = await store.addOrBump(p);
  const renamed = await store.rename(p, 'My Custom Name');
  assert.equal(renamed, true);
  const list = await store.list();
  assert.equal(list[0].name, 'My Custom Name');
  assert.equal(list[0].path, before.path);
  assert.equal(list[0].addedAt, before.addedAt);
  assert.equal(list[0].lastUsedAt, before.lastUsedAt);
});

test('rename: trims whitespace from input', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'p1');
  await store.addOrBump(p);
  await store.rename(p, '   trimmed   ');
  const list = await store.list();
  assert.equal(list[0].name, 'trimmed');
});

test('rename: rejects empty/whitespace-only name', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'p2');
  await store.addOrBump(p);
  assert.equal(await store.rename(p, ''), false);
  assert.equal(await store.rename(p, '   '), false);
  const list = await store.list();
  assert.equal(list[0].name, 'p2', 'name unchanged');
});

test('rename: returns false for non-existent path', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const result = await store.rename(path.join(tmpDir, 'never-added'), 'x');
  assert.equal(result, false);
});

test('setArchived: sets archived=true', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'arch1');
  await store.addOrBump(p);
  const ok = await store.setArchived(p, true);
  assert.equal(ok, true);
  const list = await store.list();
  assert.equal(list[0].archived, true);
});

test('setArchived: unarchive omits the field entirely (clean serialization)', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'arch2');
  await store.addOrBump(p);
  await store.setArchived(p, true);
  await store.setArchived(p, false);
  // re-read from disk to verify the field is not just `archived: false` but absent
  const raw = JSON.parse(await fs.readFile(storeFile, 'utf-8'));
  assert.equal('archived' in raw.projects[0], false, 'archived field omitted when false');
  const list = await store.list();
  assert.equal(list[0].archived, undefined);
});

test('setArchived: returns false for non-existent path', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const result = await store.setArchived(path.join(tmpDir, 'never-added'), true);
  assert.equal(result, false);
});

test('rename + setArchived: independent fields, no mutual interference', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const p = path.join(tmpDir, 'combo');
  await store.addOrBump(p);
  await store.rename(p, 'My Project');
  await store.setArchived(p, true);
  const list = await store.list();
  assert.equal(list[0].name, 'My Project');
  assert.equal(list[0].archived, true);
});

test('order: empty until set, then persisted and kept across other mutations', async () => {
  const store = createProjectStore(storeFile, tmpDir);
  const a = path.join(tmpDir, 'a');
  const b = path.join(tmpDir, 'b');
  await store.addOrBump(a);
  assert.deepEqual(await store.order(), []);

  await store.setOrder([b, a]);
  await store.addOrBump(b);
  await store.rename(a, 'Renamed');
  await store.setArchived(b, true);

  const reloaded = createProjectStore(storeFile, tmpDir);
  assert.deepEqual(await reloaded.order(), [b, a]);
  assert.equal((await reloaded.list()).length, 2);
});

test('order: a file written before order existed still loads its projects', async () => {
  await fs.writeFile(
    storeFile,
    JSON.stringify({
      version: 1,
      projects: [{ path: path.join(tmpDir, 'old'), name: 'old', addedAt: 1, lastUsedAt: 1 }],
    }),
  );
  const store = createProjectStore(storeFile, tmpDir);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(await store.order(), []);
});
