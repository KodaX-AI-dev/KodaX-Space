// FEATURE_034: session.agentsMd IPC handler — end-to-end via kodaxHost.
//
// 验证：
//   - 已知 session + 项目根有 AGENTS.md → 拉到对应 file
//   - 已知 session + 项目根无 AGENTS.md → 返回空数组（不抛）
//   - 未知 session → handler throw → registerChannel 包成 HANDLER_ERROR envelope
//   - 不缓存：磁盘改了后再调一次拿到新内容

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kodaxHost } from '../kodax/host.js';
import { loadAgentsMd } from '../kodax/agents-md-loader.js';
import { saveAgentsMdForIpc } from '../ipc/session.js';
import { setRendererTarget } from '../ipc/push.js';

let tmpProjectRoot: string;

beforeEach(async () => {
  await kodaxHost.disposeAll();
  setRendererTarget(
    () =>
      ({
        send: () => undefined,
        isDestroyed: () => false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
  );
  tmpProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-agentsmd-test-'));
});

afterEach(async () => {
  await kodaxHost.disposeAll();
  setRendererTarget(() => null);
  if (tmpProjectRoot && fs.existsSync(tmpProjectRoot)) {
    fs.rmSync(tmpProjectRoot, { recursive: true, force: true });
  }
});

test('loadAgentsMd: returns empty when no AGENTS.md exists', async () => {
  // 用临时 globalDir 避免读到真实 ~/.kodax/AGENTS.md
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-empty-'));
  try {
    const files = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    assert.equal(files.length, 0);
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});

test('loadAgentsMd: picks up project AGENTS.md (scope: project or directory)', async () => {
  fs.writeFileSync(path.join(tmpProjectRoot, 'AGENTS.md'), '# project rules');
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-empty-'));
  try {
    const files = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    // SDK 视 projectRoot/AGENTS.md 为 scope='directory'（递归扫上下文），UI 已支持三种 scope
    const projectFile = files.find((f) => f.path.endsWith('AGENTS.md') && f.scope !== 'global');
    assert.ok(projectFile, 'project AGENTS.md should be returned');
    assert.equal(projectFile.content, '# project rules');
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});

test('loadAgentsMd: picks up global + project, global comes first', async () => {
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-'));
  fs.writeFileSync(path.join(tmpGlobal, 'AGENTS.md'), '# global rules');
  fs.writeFileSync(path.join(tmpProjectRoot, 'AGENTS.md'), '# project rules');
  try {
    const files = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    // SDK 顺序：global 在前
    const globalIdx = files.findIndex((f) => f.scope === 'global');
    const projectIdx = files.findIndex(
      (f) => f.scope !== 'global' && f.content === '# project rules',
    );
    assert.ok(globalIdx >= 0, 'global AGENTS.md found');
    assert.ok(projectIdx >= 0, 'project AGENTS.md found');
    assert.ok(globalIdx < projectIdx, 'global must come before project');
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});

test('loadAgentsMd: reflects disk changes on subsequent call (no cache)', async () => {
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-nocache-'));
  const agentsPath = path.join(tmpProjectRoot, 'AGENTS.md');
  fs.writeFileSync(agentsPath, 'v1');
  try {
    const first = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    assert.equal(first[0]?.content, 'v1');
    // 50ms 等 mtime 跳格 —— Windows NTFS mtime 分辨率较 Unix 粗，
    // 紧接 write/read 可能撞 SDK 内 mtime-cache 命中旧值。
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(agentsPath, 'v2-content-differs');
    const second = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    assert.equal(second[0]?.content, 'v2-content-differs', 'second load should see v2 (no cache)');
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});

test('loadAgentsMd: rejects relative projectRoot defensively', async () => {
  const files = await loadAgentsMd({ projectRoot: 'relative/path' });
  assert.equal(files.length, 0);
});

test('IPC integration: createSession then session.agentsMd works via kodaxHost.get', async () => {
  // reviewer F034 MEDIUM-1: 注入 tmpGlobal 避免读到真实 ~/.kodax/AGENTS.md 造成断言非确定
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-ipc-'));
  fs.writeFileSync(path.join(tmpProjectRoot, 'AGENTS.md'), '# IPC integration');
  const { sessionId } = kodaxHost.createSession({
    projectRoot: tmpProjectRoot,
    provider: 'mock',
  });
  const session = kodaxHost.get(sessionId);
  assert.ok(session);
  try {
    // 模拟 IPC handler 调用：从 session 拿 projectRoot 然后 loadAgentsMd
    const files = await loadAgentsMd({
      projectRoot: session.projectRoot,
      kodaxGlobalDir: tmpGlobal,
    });
    const projectFile = files.find((f) => f.content === '# IPC integration');
    assert.ok(projectFile, 'project AGENTS.md should be returned by SDK');
    assert.ok(projectFile.scope === 'project' || projectFile.scope === 'directory');
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});

// v0.1.6 cleanup: AGENTS.md 截断由 SDK loadAgentsFiles 负责，Space 不再持有
// MAX_AGENTS_BYTES / TRUNCATION_MARKER 常量。schema agentsFileSchema 的 content
// max（256KB + 64 byte buffer）配的是 SDK 实际截断行为——SDK 改截断尺寸时同步该 schema cap。

test('session.agentsMd.save writes the exact loaded file, never a scope-derived sibling', async () => {
  const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-global-save-'));
  const rootAgents = path.join(tmpProjectRoot, 'AGENTS.md');
  fs.writeFileSync(rootAgents, '# root stays');
  fs.mkdirSync(path.join(tmpProjectRoot, '.kodax'));
  fs.writeFileSync(path.join(tmpProjectRoot, '.kodax', 'AGENTS.md'), '# kodax');
  const { sessionId } = kodaxHost.createSession({ projectRoot: tmpProjectRoot, provider: 'mock' });
  try {
    const files = await loadAgentsMd({ projectRoot: tmpProjectRoot, kodaxGlobalDir: tmpGlobal });
    // SDK scope is precedence: <root>/.kodax/AGENTS.md is 'project', <root>/AGENTS.md 'directory'.
    const kodaxFile = files.find((f) => f.scope === 'project');
    assert.ok(kodaxFile);
    const saved = await saveAgentsMdForIpc(
      { sessionId, path: kodaxFile.path, content: '# kodax edited' },
      tmpGlobal,
    );
    assert.equal(saved.path, kodaxFile.path);
    assert.equal(fs.readFileSync(kodaxFile.path, 'utf8'), '# kodax edited');
    assert.equal(fs.readFileSync(rootAgents, 'utf8'), '# root stays');

    const globalPath = path.join(tmpGlobal, 'nested', 'AGENTS.md');
    await assert.rejects(
      saveAgentsMdForIpc({ sessionId, path: globalPath, content: 'x' }, tmpGlobal),
      /not editable/,
    );
    await assert.rejects(
      saveAgentsMdForIpc(
        { sessionId, path: path.join(tmpProjectRoot, '.kodax', 'rules', 'a.md'), content: 'x' },
        tmpGlobal,
      ),
      /not editable/,
    );
    await saveAgentsMdForIpc(
      { sessionId, path: path.join(tmpGlobal, 'AGENTS.md'), content: '# global' },
      tmpGlobal,
    );
    assert.equal(fs.readFileSync(path.join(tmpGlobal, 'AGENTS.md'), 'utf8'), '# global');
  } finally {
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
  }
});
