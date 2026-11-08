import { expect, test, type Page } from '@playwright/test';
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
    if (index === 109) {
      messages.push(
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'HISTORY_THINKING_NEEDLE_109' },
            { type: 'text', text: 'HISTORY_DETAIL_CONTEXT_109' },
            {
              type: 'tool_use',
              id: 'history-read-109',
              name: 'read',
              input: { path: 'HISTORY_TOOL_NEEDLE_109' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'history-read-109',
              content: 'HISTORY_TOOL_RESULT_109',
            },
          ],
        },
      );
    }
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

async function nativeHistoryGeometry(page: Page) {
  return page.getByTestId('conversation-scroll-container').evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected HTML history viewport');
    const gutter = element.offsetWidth - element.clientWidth;
    const range = element.scrollHeight - element.clientHeight;
    if (gutter <= 0 || range <= 0) throw new Error('Native history scrollbar must overflow');
    const rect = element.getBoundingClientRect();
    const thumb = (element.clientHeight * element.clientHeight) / element.scrollHeight;
    return {
      x: rect.right - gutter / 2,
      y: rect.top + (element.scrollTop / range) * (element.clientHeight - thumb) + thumb / 2,
      top: rect.top + thumb / 2,
      bottom: rect.bottom - thumb / 2,
    };
  });
}

async function dragNativeHistoryWindow(page: Page, direction: 'older' | 'newer'): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  const ids = () =>
    page
      .locator('[data-msg-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id')));
  const settle = () =>
    page.evaluate(async () => {
      for (let frame = 0; frame < 48; frame++)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
  await settle();
  await scroller.evaluate((element, direction) => {
    element.scrollTop =
      direction === 'newer' ? element.scrollHeight - element.clientHeight - 100 : 100;
  }, direction);
  await settle();
  const geometry = await nativeHistoryGeometry(page);
  const edge = direction === 'newer' ? geometry.bottom : geometry.top;
  const sign = direction === 'newer' ? 1 : -1;
  await page.mouse.move(geometry.x, geometry.y);
  await page.mouse.down();
  try {
    for (let index = 0; index < 2; index++) {
      const before = await ids();
      if (index > 0) await page.mouse.move(geometry.x, edge - sign * 15, { steps: 4 });
      await page.mouse.move(geometry.x, edge + sign * 15, { steps: 6 });
      await expect.poll(ids).not.toEqual(before);
      await settle();
    }
  } finally {
    await page.mouse.up();
  }
}

test('native scrollbar stays held across SDK history windows in both directions', async () => {
  const provider = await createLocalSdkProvider();
  try {
    const { space } = await launchRealSdkSpace(
      `history-native-scrollbar-${Date.now()}`,
      provider.url,
      seedHistory,
    );
    try {
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
        .click();
      const stream = space.page.getByTestId('conversation-stream');
      await expect(stream).toContainText('HISTORY_ANSWER_259');
      await stream.getByRole('button', { name: 'View saved conversation', exact: true }).click();
      await expect(stream).toContainText('HISTORY_QUESTION_259');
      const newestIds = await stream
        .locator('[data-msg-id]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id')));
      await dragNativeHistoryWindow(space.page, 'older');
      await expect(stream).not.toContainText('HISTORY_QUESTION_259');
      await dragNativeHistoryWindow(space.page, 'newer');
      await expect
        .poll(() =>
          stream
            .locator('[data-msg-id]')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id'))),
        )
        .toEqual(newestIds);
      await space.page.getByRole('button', { name: 'Jump to bottom', exact: true }).click();
      await expect(stream).toContainText('HISTORY_ANSWER_259');
      expect(provider.requests).toEqual([]);
      expect(provider.errors).toEqual([]);
    } finally {
      await space.close();
    }
  } finally {
    await provider.close();
  }
});

test('saved history search locates a question outside the live window and restores the selected result', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `history-search-${Date.now()}`,
    provider.url,
    seedHistory,
  );
  try {
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
      .click();
    const stream = space.page.getByTestId('conversation-stream');
    await expect(stream).toContainText('HISTORY_ANSWER_259');
    await space.page.keyboard.press('Control+f');
    const search = space.page.getByTestId('transcript-search-bar');
    const query = 'HISTORY_QUESTION_109';
    await search.getByRole('searchbox').fill(query);
    await expect(search.getByText('0/0', { exact: true })).toBeVisible();
    await search.getByRole('combobox').selectOption('session');
    const hit = search.getByTestId('sdk-history-search-result').filter({ hasText: query });
    await expect(hit).toHaveCount(1);
    await search.getByRole('searchbox').press('Enter');
    await expect(search.getByTestId('sdk-history-search-body')).toContainText(query);
    await search.getByRole('button', { name: 'View in conversation' }).click();
    await expect(
      stream.locator('[data-msg-id]').filter({ hasText: query }).first(),
    ).toBeInViewport();
    await space.page.getByRole('button', { name: 'Back to results' }).click();
    await expect(hit).toBeFocused();
    await expect(search.getByRole('searchbox')).toHaveValue(query);
    for (const [needle, body] of [
      ['HISTORY_TOOL_NEEDLE_109', 'HISTORY_TOOL_RESULT_109'],
      ['HISTORY_DETAIL_CONTEXT_109', 'HISTORY_DETAIL_CONTEXT_109'],
    ]) {
      await search.getByRole('searchbox').fill(needle);
      const detailHit = search.getByTestId('sdk-history-search-result').filter({ hasText: needle });
      await expect(detailHit).toHaveCount(1);
      await detailHit.click();
      await search.getByRole('button', { name: 'View in conversation' }).click();
      await expect(stream.getByText(body, { exact: true })).toBeVisible();
      await expect(stream.getByText('HISTORY_THINKING_NEEDLE_109', { exact: true })).toBeVisible();
      await expect(stream.locator('[data-source-item]:focus')).toBeInViewport();
      await space.page.getByRole('button', { name: 'Back to results' }).click();
      await expect(detailHit).toBeFocused();
    }
    await space.page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(stream).toContainText('HISTORY_ANSWER_259');
    expect(provider.requests).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('packaged SDK history reports are readable and one bottom arrow reaches the latest after bidirectional browsing', async () => {
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
    await stream.getByRole('button', { name: 'View saved conversation', exact: true }).click();
    await expect.poll(ids).not.toEqual(newest);
    await expect(stream).toContainText('HISTORY_QUESTION_259');
    const moveToOlder = async () => {
      const before = await ids();
      await scroller.hover();
      await space.page.mouse.wheel(
        0,
        -(await scroller.evaluate((element) => element.scrollHeight)),
      );
      try {
        await expect.poll(ids, { timeout: 10_000 }).not.toEqual(before);
        await expect
          .poll(() =>
            scroller.evaluate(
              (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
            ),
          )
          .toBeLessThan(2);
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
    await moveToOlder();
    const oldest = await ids();
    expect(oldest).not.toEqual(middle);
    await scroller.hover();
    await space.page.mouse.wheel(0, await scroller.evaluate((element) => element.scrollHeight));
    await expect.poll(ids).toEqual(middle);
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
    await space.page.screenshot({ path: test.info().outputPath('history-return-latest.png') });
    expect(failures).toEqual([]);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
