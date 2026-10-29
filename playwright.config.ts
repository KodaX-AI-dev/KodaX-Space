// Playwright config — OC-12 / OC-44
//
// 用 @playwright/test 的 `_electron` API 启 Space 进程跑端到端测试。
// 隔离原则：每条 spec 起一个新进程 + 唯一 KODAX_TEST_ONBOARDING 值，
// 让 data-paths.ts 把 ~/.kodax 重定向到 tmpdir/kodax-test-<id>，不污染用户数据。
//
// 跑法：
//   npm run e2e          —— build:smoke 后跑全部 spec
//   npm run e2e:run      —— 只跑（假定已 build）
//   npm run e2e:headed   —— 显示窗口（debug 用）
//
// ci.yml runs the source suite in shards. release.yml runs the SDK acceptance
// subset against each platform's packaged executable with the same retry policy.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Electron 启动 + main process bootstrap 不快，给宽松超时。
  // CI runner（尤其 Windows）负载重时整体慢 2-3x，给更长的 expect 超时 + 多一次重试，
  // 减少「本地/Linux 绿、Windows 因运行器慢而红」的漂移 flake。
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: process.env.CI ? 25_000 : 5_000 },
  // 顺序跑 —— 单 process / spec 模型下并发起多个 Electron 会撞资源
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/playwright.json' }]]
    : [['list']],
  use: {
    // 默认抓 trace 到本地，方便排查
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
