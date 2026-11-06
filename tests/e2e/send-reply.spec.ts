// Send + reply roundtrip — Path D Phase 1
//
// 验 KodaX Space 最核心的"开会话 → 发消息 → 看到回复"路径不退化。
// 用 KODAX_FORCE_MOCK=1 启 mock adapter（回固定文案），不依赖任何外部 API key。
//
// 流程：
//   1. 启 Space，KODAX_TEST_ONBOARDING + KODAX_FORCE_MOCK 双隔离
//   2. localStorage 注入 currentProjectPath = <tmp project dir>，reload 让 store hydrate
//   3. 等 textarea enabled（!busy + currentProjectPath）
//   4. 输入 prompt 按 Enter
//   5. 等 mock adapter 的回复文字出现在对话流

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { launchSpace } from './fixtures.js';

test('S3: send a prompt and see assistant reply via mock adapter', async () => {
  // Quarantined on the Windows CI runner only. The mock assistant turn
  // (text → tool_start → tool_result → iteration_end) intermittently stalls
  // before the "Ran 1 command" tool cluster renders — a long-standing
  // Windows-CI-only flake that is not reproducible locally or on Linux and is
  // not fixed by larger timeouts (it stalls, it is not merely slow). Still runs
  // on Linux CI and local dev for real coverage. TODO: root-cause the
  // streaming/mock-turn stall on the Windows runner, then re-enable.
  test.skip(
    !!process.env.CI && process.platform === 'win32',
    'flaky on Windows CI: mock assistant turn intermittently stalls (tracked)',
  );
  const testId = `s3-${Date.now()}`;
  // 准备一个真实存在的 project 目录（Space main 端 validateProjectRoot 会查盘）
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });

  const space = await launchSpace(testId);
  try {
    // 把 project dir 注入 store + 注册 recents + reload (fixture 共享 helper)
    await space.seedProject(projectDir);

    // textarea 出现且未 disabled
    const textarea = space.page.getByTestId('composer-input');
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(textarea).toBeEnabled({ timeout: 10_000 });

    // scope 到对话流容器：避免匹配 breadcrumb / Recents 里同 session title
    const stream = space.page.getByTestId('conversation-stream');

    // 发 prompt
    const prompt = 'hello from playwright e2e';
    await textarea.fill(prompt);
    await textarea.press('Enter');

    // user message 出现：对话流里 prompt 文本可见
    await expect(stream.getByText(prompt).first()).toBeVisible({ timeout: 10_000 });

    // mock adapter 完整跑：emit text_delta → tool_start("read") → tool_result → iteration_end。
    // composeMessages 把 text + tools 聚成 sub-cluster，外层 cluster header 显示 "Ran 1 command"。
    // 用这条作"mock adapter 跑完"的稳定信号，比 text 内容更稳（text 在折叠的子 cluster 标题里，
    // 不展开看不到）。
    await expect(stream.getByText(/Ran 1 command/).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
