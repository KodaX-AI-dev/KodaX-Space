// Slash command dispatch — Path D Phase 1
//
// 验 /clear 路径：发 prompt → 看见 user+reply → /clear → user+reply 消失。
// 验 F031 slash 命令 runtime 接通：renderer 输 "/<name>" → main slash.exec →
// renderer 根据 clearStream/echo 等 flag 重绘消息流。
//
// 不测 /help 因为它仅 echo "/help"，没有可观察的显著状态变化；用 /clear 的
// "消息消失"作可视化断言更稳。

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { launchSpace } from './fixtures.js';

test('S5: /clear wipes the conversation buffer', async () => {
  test.skip(
    !!process.env.CI && process.platform === 'win32',
    'mock assistant turn ("Ran 1 command") can stall on Windows CI; keep local and Linux coverage',
  );
  const testId = `s5-${Date.now()}`;
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });

  const space = await launchSpace(testId);
  try {
    await space.seedProject(projectDir);

    const textarea = space.page.getByTestId('composer-input');
    await expect(textarea).toBeEnabled({ timeout: 10_000 });

    // 范围限定到对话流容器（避免匹到 breadcrumb / Recents 里同名的 session title）
    const stream = space.page.getByTestId('conversation-stream');

    // 1) 发个 prompt 让对话流非空 + tool cluster header 可见
    const prompt = 'hello before clear';
    await textarea.fill(prompt);
    await textarea.press('Enter');
    await expect(stream.getByText(prompt).first()).toBeVisible({ timeout: 10_000 });
    // mock adapter 跑完 → "Ran 1 command" cluster 出现
    await expect(stream.getByText(/Ran 1 command/).first()).toBeVisible({ timeout: 15_000 });

    // 2) /clear —— SlashCommandPopover 在 fill('/...') 后异步打开 (要拉 commands)，
    // 用 textarea.press('Enter') 会撞 popover-still-loading 的空窗。直接点 Send 按钮
    // 走 handleSend 路径，跳过 popover：BottomBar 见到 /clear 自己路由到 slash.exec。
    await textarea.fill('/clear');
    await space.page.getByLabel('Send message').click();

    // 3) 之前的对话流内容消失（resetSessionMessages 清空 userMessagesBySession + eventsBySession）
    await expect(stream.getByText(prompt).first()).not.toBeVisible({ timeout: 5_000 });
    await expect(stream.getByText(/Ran 1 command/).first()).not.toBeVisible({ timeout: 5_000 });
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
