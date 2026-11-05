import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createSessionManager } from '@kodax-ai/kodax/session';
import type { KodaXMessage } from '@kodax-ai/kodax/agent';
import { createLocalSdkProvider, launchRealSdkSpace } from './sdk-provider-fixture.js';

test.setTimeout(120_000);
const SESSION = 'sdk-history-navigation';
const REPORT =
  '<agent-completed id="child-report" path="/root/review" state="completed">\n**Review report**\n\nThe checkpoint says &quot;preserve&quot;.\n</agent-completed>';

async function seedHistory(root: string): Promise<void> {
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  const manager = createSessionManager({
    sessionsDir: path.join(root, 'sessions'),
    configHome: root,
  });
  const messages: KodaXMessage[] = [];
  for (let index = 0; index < 260; index++) {
    messages.push(
      { role: 'user', inputId: `input-${index}`, content: `HISTORY_QUESTION_${index}` },
      {
        role: 'assistant',
        outputId: `output-${index}`,
        content: [
          {
            type: 'text',
            text: `HISTORY_ANSWER_${index}\n\n${'Read the full report paragraph.\n\n'.repeat(6)}`,
          },
        ],
      },
    );
  }
  messages.push({ role: 'user', content: REPORT, _source: 'agent-completed' });
  await manager.storage.save(SESSION, {
    title: 'SDK_HISTORY_NAVIGATION',
    gitRoot: project,
    scope: 'user',
    runtimeInfo: { workspaceRoot: project, surface: 'repl' },
    messages,
  });
}

test('SDK task rename persists and history scrolls continuously across page boundaries', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `history-navigation-${Date.now()}`,
    provider.url,
    seedHistory,
  );
  const failures: string[] = [];
  space.page.on('pageerror', (error) => failures.push(error.message));
  try {
    await expect
      .poll(
        async () =>
          space.page.evaluate(async () => {
            const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
            return result.ok ? result.data.connection.state : 'unavailable';
          }),
        { timeout: 30_000 },
      )
      .toBe('ready');
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
      .click();
    const sessionRow = space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_NAVIGATION' });
    await sessionRow.click({ button: 'right' });
    await space.page.locator('[data-menu-action="rename-session"]').click();
    const rename = space.page.getByRole('textbox', { name: 'Rename session' });
    await rename.fill('SDK_HISTORY_RENAMED');
    await rename.press('Enter');
    await expect
      .poll(() =>
        space.page.evaluate(async (id) => {
          const result = await window.kodaxSpace!.invoke('session.list', { surface: 'code' });
          return result.ok ? result.data.sessions.find((s) => s.sessionId === id)?.title : null;
        }, SESSION),
      )
      .toBe('SDK_HISTORY_RENAMED');
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_RENAMED' })
      .click();
    const stream = space.page.getByTestId('conversation-stream');
    const scroller = space.page.getByTestId('conversation-scroll-container');
    const report = stream.getByTestId('system-notice').filter({ hasText: 'Task report' });
    await expect(report).toHaveCount(1, { timeout: 30_000 });
    await expect(report).toHaveAttribute('data-notice-variant', 'info');
    await expect(report.locator('details')).not.toHaveAttribute('open');
    await report.locator('summary').click();
    await expect(report.locator('strong')).toHaveText('Review report');
    await expect(report).toContainText('The checkpoint says "preserve".');
    await expect(report).not.toContainText('<agent-completed');
    const markerClass = await report.evaluate(
      (element) =>
        element
          .closest('[data-testid="conversation-render-row"]')
          ?.querySelector('.conversation-timeline-decoration')?.className,
    );
    expect(markerClass).not.toContain('bg-warn');
    await expect(space.page.locator('html')).not.toHaveClass(/visual-history-restore-active/);
    await report.evaluate(async (element) => {
      await Promise.all(
        (element.closest('.reveal')?.getAnimations() ?? []).map((animation) => animation.finished),
      );
    });
    await space.page.screenshot({ path: test.info().outputPath('report-expanded.png') });
    const ids = () =>
      stream
        .locator('[data-msg-id]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id')));
    const newest = await ids();
    const moveToOlder = async () => {
      const before = await ids();
      const heightBefore = await scroller.evaluate((el) => el.scrollHeight);
      await scroller.hover();
      await space.page.mouse.wheel(
        0,
        -(await scroller.evaluate((element) => element.scrollHeight)),
      );
      try {
        await expect.poll(ids, { timeout: 10_000 }).not.toEqual(before);
        await expect(stream.getByText('HISTORY_ANSWER_259', { exact: true })).toHaveCount(1);
        await expect
          .poll(() => scroller.evaluate((el) => el.scrollHeight))
          .toBeGreaterThan(heightBefore);
      } catch (error) {
        const facts = await space.page.evaluate(async (sessionId) => {
          const history = await window.kodaxSpace!.invoke('session.history', {
            sessionId,
            requestId: crypto.randomUUID(),
            expectedSurface: 'code',
          });
          const profile = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
          const element = document.querySelector('[data-testid="conversation-scroll-container"]')!;
          return {
            page: history.ok ? history.data.page : history.error,
            connection: profile.ok ? profile.data.connection : profile.error,
            geometry: {
              top: element.scrollTop,
              height: element.scrollHeight,
              client: element.clientHeight,
            },
            paging: document.querySelector('[data-testid="history-paging-status"]')?.textContent,
            failure: document.querySelector('[data-testid="history-paging-error"]')?.textContent,
          };
        }, SESSION);
        await test.info().attach('navigation-failure.json', {
          body: JSON.stringify(facts),
          contentType: 'application/json',
        });
        throw error;
      }
    };
    await moveToOlder();
    const middle = await ids();
    await test.info().attach('history-identities.json', {
      body: JSON.stringify({ newest, middle }),
      contentType: 'application/json',
    });
    const seam = stream.getByText('HISTORY_ANSWER_220', { exact: true });
    await expect(seam).toHaveCount(1);
    const seamBox = await seam.boundingBox();
    const scrollBox = await scroller.boundingBox();
    expect(
      seamBox!.y,
      'first older load should preserve the visible current-view boundary',
    ).toBeGreaterThanOrEqual(scrollBox!.y - 120);
    expect(seamBox!.y).toBeLessThan(scrollBox!.y + scrollBox!.height);

    await moveToOlder();
    const oldest = await ids();
    expect(oldest).not.toEqual(middle);
    await scroller.hover();
    await space.page.mouse.wheel(0, await scroller.evaluate((element) => element.scrollHeight));
    await expect.poll(ids).toEqual(oldest);
    await expect(
      space.page.getByRole('button', { name: 'Return to newest messages', exact: true }),
    ).toHaveCount(0);
    const bottom = space.page.getByRole('button', { name: 'Jump to bottom', exact: true });
    await expect(bottom).toHaveCount(1);
    await bottom.click();
    await expect.poll(ids).toEqual(newest);
    await expect
      .poll(() =>
        scroller.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThan(2);
    await expect(report).toHaveCount(1);
    await space.page.waitForTimeout(500);
    await space.page.screenshot({ path: test.info().outputPath('history-return-latest.png') });
    expect(failures).toEqual([]);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('a short-looking SDK conversation with folded tools keeps its final answer when loading older history', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `compact-history-${Date.now()}`,
    provider.url,
    async (root) => {
      const project = path.join(root, 'project');
      await mkdir(project, { recursive: true });
      const manager = createSessionManager({
        sessionsDir: path.join(root, 'sessions'),
        configHome: root,
      });
      const messages: KodaXMessage[] = [
        { role: 'user', inputId: 'compact-query', content: 'COMPACT_HISTORY_QUERY' },
      ];
      for (let i = 0; i < 160; i++)
        messages.push(
          {
            role: 'assistant',
            outputId: `compact-${i}`,
            content: [
              { type: 'tool_use', id: `call-${i}`, name: 'read', input: { path: 'fixture.txt' } },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: `call-${i}`, content: 'Read complete' }],
          },
        );
      messages.push({
        role: 'assistant',
        outputId: 'compact-final',
        content: [
          {
            type: 'text',
            text: 'COMPACT_FINAL_ANSWER\n\n' + 'A readable final paragraph.\n\n'.repeat(18),
          },
        ],
      });
      await manager.storage.save('compact-history', {
        title: 'COMPACT_HISTORY',
        gitRoot: project,
        scope: 'user',
        runtimeInfo: { workspaceRoot: project, surface: 'repl' },
        messages,
      });
    },
  );
  try {
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'COMPACT_HISTORY' })
      .click();
    const scroller = space.page.getByTestId('conversation-scroll-container');
    const answer = space.page.getByText('COMPACT_FINAL_ANSWER', { exact: true });
    await expect(answer).toHaveCount(1, { timeout: 30000 });
    const ids = () =>
      scroller
        .locator('[data-msg-id]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id')));
    const query = space.page.getByText('COMPACT_HISTORY_QUERY', { exact: true });
    for (let page = 0; page < 4 && (await query.count()) === 0; page++) {
      const before = await ids();
      await space.page.waitForTimeout(700);
      await scroller.hover();
      await space.page.mouse.wheel(0, -(await scroller.evaluate((el) => el.scrollHeight)));
      await expect.poll(ids).not.toEqual(before);
      await expect(answer).toHaveCount(1);
    }
    await expect(query).toHaveCount(1);
    await space.page.mouse.wheel(0, await scroller.evaluate((el) => el.scrollHeight));
    await expect(
      scroller.getByText('A readable final paragraph.', { exact: true }).last(),
    ).toBeInViewport();
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
