// F040 v0.1.9 Step 7 — project drag-sort + Archived fold-state persistence e2e.
//
// 不在 Electron 里模拟拖动,只测 localStorage 持久化通路。
// 拖排交互 (指针拖动 + 落点预览) 由 renderer/src/shell/projectDragSort.browser.test.ts
// 和 sortPreview.test.ts 覆盖。

import { test, expect } from '@playwright/test';
import { launchSpace } from './fixtures.js';

const TEST_ID = `project-reorder-${Date.now()}`;

test('archivedProjectsExpanded persists across reload', async () => {
  const space = await launchSpace(TEST_ID);
  try {
    const { page } = space;
    await page.waitForTimeout(2000);
    // Chromium localStorage 跨 test run 共享 (Space main 没设独立 userData),清掉
    // 本次 spec 用到的 keys 防上一次跑的值串进默认状态。
    await page.evaluate(() => {
      window.localStorage.removeItem('kodax-space.archivedProjectsExpanded');
      window.localStorage.removeItem('kodax-space.projectOrder');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 默认 false — lsKey 不存在或值 != '1'
    const def = await page.evaluate(() =>
      window.localStorage.getItem('kodax-space.archivedProjectsExpanded'),
    );
    expect(def === null || def === '0').toBe(true);

    // 设 true 后 reload
    await page.evaluate(() =>
      window.localStorage.setItem('kodax-space.archivedProjectsExpanded', '1'),
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const after = await page.evaluate(() =>
      window.localStorage.getItem('kodax-space.archivedProjectsExpanded'),
    );
    expect(after).toBe('1');
  } finally {
    await space.close();
  }
});

test('projectOrder lsKey is read and survives reload', async () => {
  const space = await launchSpace(`${TEST_ID}-order`);
  try {
    const { page } = space;
    await page.waitForTimeout(2000);
    // Chromium localStorage 跨 test run 共享 (Space main 没设独立 userData),清掉
    // 本次 spec 用到的 keys 防上一次跑的值串进默认状态。
    await page.evaluate(() => {
      window.localStorage.removeItem('kodax-space.archivedProjectsExpanded');
      window.localStorage.removeItem('kodax-space.projectOrder');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 直接写一个合法 projectOrder
    const seeded = ['/proj/a', '/proj/b', '/proj/c'];
    await page.evaluate((order) => {
      window.localStorage.setItem('kodax-space.projectOrder', JSON.stringify(order));
    }, seeded);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const after = await page.evaluate(() =>
      window.localStorage.getItem('kodax-space.projectOrder'),
    );
    expect(after).toBe(JSON.stringify(seeded));
  } finally {
    await space.close();
  }
});

test('projectOrder corrupt LS value is rejected gracefully (no white screen)', async () => {
  // 防回归: 之前用 useState 时坏 LS 值不会让 sidebar 崩;现在 readPersistedProjectOrder
  // 必须容错(非 JSON / 非数组 / 元素非 string / 超 256 项)。
  const space = await launchSpace(`${TEST_ID}-corrupt`);
  try {
    const { page } = space;

    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.localStorage.setItem('kodax-space.projectOrder', 'not valid json {{{');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 没崩 — root 仍然有内容
    const rootPainted = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root !== null && root.childNodes.length > 0;
    });
    expect(rootPainted).toBe(true);
  } finally {
    await space.close();
  }
});
