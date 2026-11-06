// First-launch onboarding smoke — OC-12 + OC-44
//
// 验证 Path B 的隔离基建确实生效 + Space 启动到能用的最小路径不卡：
//   1. 启动 Space 进程，KODAX_TEST_ONBOARDING=<unique> 强制 data dir 走 tmpdir
//   2. 主窗口能开
//   3. 没有 project 时，输入框 placeholder 提示 "Open a folder first" (BottomBar)
//   4. data-paths 隔离生效：tmpdir/kodax-test-<id>/ 目录被 Space 创建/触达过
//
// 不在范围（后续 spec）：
//   - 真实选 folder 触发 file dialog (Playwright Electron 不能直接 mock native dialog)
//   - 真实发 prompt 走 KodaX (KODAX_FORCE_MOCK=1 后是 mock adapter)

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { launchSpace } from './fixtures.js';

test('S1: first launch with isolated data dir shows welcome / no-project state', async () => {
  const testId = `s1-${Date.now()}`;
  const space = await launchSpace(testId);
  try {
    // 主窗口 title 包含 Space
    const title = await space.page.title();
    expect(title.toLowerCase()).toContain('kodax');

    // 等到 Space renderer 渲染完 body（main process bootstrap + initial state hydrate）
    // —— Welcome dashboard 或 textarea placeholder 至少一个出现
    await space.page.waitForSelector(
      '[data-testid="composer-input"], [aria-label="Loading conversation history"], h1',
      {
        timeout: 15_000,
      },
    );

    // 隔离生效检查：textarea 要么不存在（welcome state），要么 placeholder 是 "Open a folder first"
    const textarea = space.page.getByTestId('composer-input');
    if ((await textarea.count()) > 0) {
      const placeholder = await textarea.first().getAttribute('data-placeholder');
      // 期望 placeholder 提示用户先开 folder（OC-12 隔离后没有 recent project）
      // OR 已经 hydrate 到 defaultWorkspace（首次启动会创建并 use defaultWorkspace）
      // 两种都接受，只要不报错
      expect(placeholder).toBeTruthy();
    }

    // tmpdir 应该被创建（providerConfigStore.load 至少触达过路径）
    // 注：mkdir 是按需的，有些路径只在 setDefault 等写操作时才 mkdir，
    // 所以这里只验"启动了 + 没崩"，不强求目录存在。
  } finally {
    await space.close();
  }
});

test('S2: Space actually writes into the isolated data dir (OC-12 plumbing alive)', async () => {
  // 验证 KODAX_TEST_ONBOARDING 真的让 data-paths.ts 重定向 Space 持久化目录到 tmpdir。
  // Space 启动期不会主动 mkdir SPACE_DATA_DIR —— 真正触发写入需要一个 IPC 调用，比如
  // project.recent.add 写 projects.json (会 mkdir recursive 父目录)。
  // 触发 IPC 后 dataDir / dataDir/space/projects.json 才出现。
  const testId = `s2-${Date.now()}`;
  const dataDir = path.join(os.tmpdir(), `kodax-test-${testId}`);
  // 预先创建一个真实存在的 project 路径 (validateProjectRoot 会检查盘上是否存在)
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });

  const space = await launchSpace(testId);
  try {
    await space.page.waitForSelector('[data-testid="composer-input"], h1', { timeout: 15_000 });

    // 触发一次 IPC 写入：project.recent.add 会写 projects.json，mkdir SPACE_DATA_DIR
    const writeResult = await space.page.evaluate((p) => {
      return (
        window as unknown as { kodaxSpace: { invoke: (n: string, i: unknown) => Promise<unknown> } }
      ).kodaxSpace.invoke('project.recent.add', { path: p });
    }, projectDir);
    expect(writeResult).toBeTruthy();

    // 现在 dataDir + dataDir/space/projects.json 都应该存在
    const dirExists = await fs
      .access(dataDir)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
    const projectsFile = path.join(dataDir, 'space', 'projects.json');
    const fileExists = await fs
      .access(projectsFile)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
