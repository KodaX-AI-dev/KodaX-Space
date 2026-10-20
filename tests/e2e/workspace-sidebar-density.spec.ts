import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import { launchSpace, type SpaceInstance } from './fixtures.js';

// Real persisted project/session navigation; deterministic transcript/plan display events.
// Screenshots and computed text-node metrics complement, rather than replace, visual review.
test('dense Chinese project navigation and task details remain usable together', async () => {
  test.setTimeout(120_000);
  const space = await launchSpace(`sidebar-density-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1920, height: 1032 });
    await seedDenseProjects(space);
    await selectAppearance(page, 'Dark');
    await page.getByTestId('sidebar-session-row').first().click();
    await emitPlan(space);
    await page.getByLabel('显示右侧侧边栏', { exact: true }).click();
    await expect(page.locator('[data-task-dock-section="plan"]')).toContainText('验证项目切换');
    const composer = page.locator('.composer-surface textarea');
    await composer.fill('保留草稿，继续检查多个项目和任务详情的阅读体验');
    await captureDensity(page, '01-dense-dark');
    await selectAppearance(page, '浅色');
    await expect(composer).toHaveValue('保留草稿，继续检查多个项目和任务详情的阅读体验');
    await captureDensity(page, '02-dense-light');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('right-sidebar')).toBeVisible();
    await captureDensity(page, '03-dense-1280');
    await showAgentAndChanges(space);
    await captureDensity(page, '04-agents-changes-1280');
    await page
      .getByTestId('right-sidebar')
      .getByText('workspace-navigation.tsx', {
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await captureDensity(page, '05-changes-1280');
  } finally {
    await space.close();
  }
});

async function showAgentAndChanges(space: SpaceInstance): Promise<void> {
  const sessionId = await space.page
    .getByTestId('sidebar-session-row')
    .first()
    .getAttribute('data-session-id');
  if (!sessionId) throw new Error('Missing selected session');
  const event = agentDisplayEvent(sessionId);
  await space.app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()[0].webContents.send('session.event', payload);
  }, event);
  await expect(space.page.getByTestId('task-dock-agent-card').first()).toBeVisible();
  await expect(
    space.page.getByTestId('right-sidebar').getByText('workspace-navigation.tsx', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

function agentDisplayEvent(sessionId: string): SessionEvent {
  return {
    kind: 'managed_task_status',
    sessionId,
    status: {
      agentMode: 'ama',
      harnessProfile: 'H2_PLAN_EXECUTE_EVAL',
      activeWorkerId: 'visual-review-worker',
      activeWorkerTitle: '侧栏排版与任务详情检查',
      childFanoutClass: 'fan-out',
      childFanoutCount: 1,
      currentRound: 1,
      maxRounds: 5,
      phase: 'checking',
      globalWorkBudget: 5,
      budgetUsage: 1,
      events: [
        {
          key: 'visual-progress',
          kind: 'progress',
          phase: 'checking',
          workerId: 'visual-review-worker',
          workerTitle: '侧栏排版与任务详情检查',
          summary: '复核长任务描述和运行状态在较窄侧栏中的换行与可读性。',
        },
      ],
    },
  };
}

async function seedDenseProjects(space: SpaceInstance): Promise<void> {
  const roots = ['KodaX', 'RSIHarness', 'KodaX Space'].map((name) =>
    path.join(space.testDataDir, name),
  );
  for (const root of roots) await mkdir(root);
  await promisify(execFile)('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet'], {
    cwd: roots[0],
  });
  await writeFile(path.join(roots[0], 'workspace-navigation.tsx'), '// Visual review fixture\n');
  await space.page.evaluate(async (projects) => {
    const titles = [
      '验证多项目并行工作',
      '检查工作区视觉与交互',
      '完善设置页面的阅读层级',
      '分析上下文与运行结果',
      'Review 项目代码与测试',
      '整理组件和动态效果',
    ];
    for (const root of projects) {
      const added = await window.kodaxSpace.invoke('project.recent.add', { path: root });
      if (!added.ok) throw new Error(added.error.message);
      for (const title of titles) {
        const created = await window.kodaxSpace.invoke('session.create', {
          projectRoot: root,
          provider: 'mock',
          surface: 'code',
        });
        if (!created.ok) throw new Error(created.error.message);
        const named = await window.kodaxSpace.invoke('session.setTitle', {
          sessionId: created.data.sessionId,
          title,
        });
        if (!named.ok) throw new Error(named.error.message);
      }
    }
    localStorage.setItem(
      'kodax-space.expandedProjects',
      JSON.stringify(Object.fromEntries(projects.map((root) => [root, true]))),
    );
    localStorage.setItem('kodax-space.smartPopoutEnabled', '0');
    localStorage.setItem('kodax-space.rightSidebarWidth', '320');
  }, roots);
  await space.seedProject(roots[0]);
  await expect(space.page.getByTestId('sidebar-session-row')).toHaveCount(15);
}

async function selectAppearance(page: Page, theme: string): Promise<void> {
  await page.getByTestId('settings-button').click();
  const settings = page.getByTestId('settings-workspace');
  await settings.getByRole('button', { name: theme, exact: true }).click();
  if (await settings.getByRole('button', { name: '简体中文', exact: true }).count()) {
    await settings.getByRole('button', { name: '简体中文', exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
}

async function emitPlan(space: SpaceInstance): Promise<void> {
  const sessionId = await space.page
    .getByTestId('sidebar-session-row')
    .first()
    .getAttribute('data-session-id');
  if (!sessionId) throw new Error('Missing selected session');
  const events: SessionEvent[] = [
    {
      kind: 'text_delta',
      sessionId,
      text: '### 多项目工作区检查\n\n项目列表应当清晰、紧凑，任务详情也需要同样的阅读尺度。\n\n- 项目与会话保留各自的状态和操作。\n- 辅助信息采用次一级字号，保持清晰。\n- 切换设置之后，返回原项目与输入草稿。',
    },
    {
      kind: 'todo_update',
      sessionId,
      items: [
        { id: 'type', content: '检查侧栏字体和留白比例', status: 'completed' },
        { id: 'switch', content: '验证项目切换后草稿与运行状态', status: 'in_progress' },
        { id: 'wrap', content: '检查较长任务说明的换行，保证完整内容可以阅读', status: 'pending' },
        { id: 'theme', content: '复核深色、浅色主题与窄窗口布局', status: 'pending' },
      ],
    },
    { kind: 'session_complete', sessionId },
  ];
  await space.app.evaluate(({ BrowserWindow }, payloads) => {
    for (const payload of payloads)
      BrowserWindow.getAllWindows()[0].webContents.send('session.event', payload);
  }, events);
}

async function captureDensity(page: Page, name: string): Promise<void> {
  await page.mouse.click(800, 90);
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const selectors = {
      project: '.group\\/projectrow > button.flex-1',
      session: '[data-testid="sidebar-session-row"] > span:first-child',
      metadata: '.sidebar-session-meta',
      section: '[data-testid="task-dock-section-header"] button > span',
      task: '[data-task-dock-section="plan"] li > span:last-child',
    };
    return Object.fromEntries(
      Object.entries(selectors).map(([key, selector]) => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) throw new Error(`Missing typography sample: ${key}`);
        const style = getComputedStyle(node);
        return [
          key,
          {
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            height: node.getBoundingClientRect().height,
            rowHeight: node.parentElement?.getBoundingClientRect().height,
          },
        ];
      }),
    );
  });
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR ?? test.info().outputDir;
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(evidence, `${name}.json`), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: path.join(evidence, `${name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
}
