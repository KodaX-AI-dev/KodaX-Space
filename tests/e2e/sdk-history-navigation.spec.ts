import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createSessionManager } from '@kodax-ai/kodax/session';
import type { KodaXMessage } from '@kodax-ai/kodax/agent';
import { captureWithEvidenceBudget } from '../../scripts/e2e-evidence-budget.mjs';
import { transcriptWindowing } from './fixtures.js';
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
    const rect = element.getBoundingClientRect();
    const height = element.clientHeight;
    const range = element.scrollHeight - height;
    const top = element.scrollTop;
    const gutter = element.offsetWidth - element.clientWidth;
    if (gutter <= 0 || range <= 0 || top <= 0 || top >= range)
      throw new Error('Native drag must start inside an overflowing page');
    const thumb = (height * height) / (range + height);
    const travel = height - thumb;
    return {
      x: rect.right - gutter / 2,
      y: rect.top + (top / range) * travel + thumb / 2,
      top: rect.top + thumb / 2,
      bottom: rect.top + height - thumb / 2,
      nativePixelsPerScroll: travel / range,
    };
  });
}

async function watchNativeHistoryWindows(page: Page, direction: 'older' | 'newer'): Promise<void> {
  await page.getByTestId('conversation-scroll-container').evaluate((element, direction) => {
    const stream = document.querySelector('[data-testid="conversation-stream"]');
    if (!stream) throw new Error('Expected conversation stream');
    const firstIndex = () => {
      const indexes = [...stream.querySelectorAll('[data-msg-id]')]
        .map((row) => Number(row.textContent?.match(/HISTORY_(?:QUESTION|ANSWER)_(\d+)/)?.[1]))
        .filter(Number.isFinite);
      return direction === 'older' ? Math.min(...indexes) : Math.max(...indexes);
    };
    const markers: number[] = [];
    const record = (marker: number) => {
      markers.push(marker);
      element.setAttribute('data-native-page-markers', JSON.stringify(markers));
    };
    // Windowed, the mounted rows follow the reader, not the loaded edge: record each painted page
    // load instead, signed by its direction.
    if (window.kodaxSpace?.transcriptWindowing === true) {
      record(0);
      const loads = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== 'kodax.history.paint') continue;
          const { seq, kind } = (entry as PerformanceMeasure).detail as {
            seq: number;
            kind: string;
          };
          if (kind === 'older' || kind === 'newer') record(kind === 'older' ? -seq : seq);
        }
      });
      loads.observe({ type: 'measure' });
      element.addEventListener('finish-native-history-test', () => loads.disconnect(), {
        once: true,
      });
      return;
    }
    const initial = firstIndex();
    if (!Number.isFinite(initial)) throw new Error('Expected seeded history marker');
    record(initial);
    const observer = new MutationObserver(() => {
      const next = firstIndex();
      if (Number.isFinite(next) && next !== markers.at(-1)) record(next);
    });
    observer.observe(stream, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-msg-id'],
    });
    element.addEventListener('finish-native-history-test', () => observer.disconnect(), {
      once: true,
    });
  }, direction);
}

async function nativeHistoryMarkers(page: Page): Promise<number[]> {
  return JSON.parse(
    (await page
      .getByTestId('conversation-scroll-container')
      .getAttribute('data-native-page-markers')) ?? '[]',
  ) as number[];
}

async function expectNativeHistoryDirection(page: Page, sign: number): Promise<void> {
  const markers = await nativeHistoryMarkers(page);
  expect(
    markers.every((value, index) => index === 0 || (value - markers[index - 1]!) * sign > 0),
    JSON.stringify({ sign, markers }),
  ).toBe(true);
}

async function settleNativeHistoryLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 48; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function attachNativeHistoryDragFailure(
  page: Page,
  geometry: Awaited<ReturnType<typeof nativeHistoryGeometry>>,
  direction: string,
  originalError: unknown,
): Promise<void> {
  try {
    const evidence = await captureWithEvidenceBudget(
      Promise.all([
        page.getByTestId('conversation-scroll-container').evaluate((element) => ({
          top: element.scrollTop,
          height: element.scrollHeight,
          client: element.clientHeight,
          rect: element.getBoundingClientRect().toJSON(),
        })),
        nativeHistoryMarkers(page),
      ]).then(([viewport, markers]) => ({ viewport, markers })),
    );
    await test.info().attach(`native-${direction}-geometry.json`, {
      body: JSON.stringify({ geometry, evidence }),
      contentType: 'application/json',
    });
  } catch (cause) {
    throw new AggregateError(
      [originalError, cause],
      'Native history drag and evidence capture failed',
      { cause: originalError },
    );
  }
}

async function moveNativeHistoryPages(
  page: Page,
  geometry: Awaited<ReturnType<typeof nativeHistoryGeometry>>,
  direction: 'older' | 'newer',
): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  const edge = direction === 'newer' ? geometry.bottom : geometry.top;
  const sign = direction === 'newer' ? 1 : -1;
  const count = async () => (await nativeHistoryMarkers(page)).length - 1;
  await page.mouse.move(geometry.x, edge + sign * 15, { steps: 6 });
  await expect.poll(count, { message: `${direction} first native page` }).toBeGreaterThanOrEqual(1);
  await settleNativeHistoryLayout(page);
  if ((await count()) < 2) {
    const remaining = await scroller.evaluate(
      (element, direction) =>
        direction === 'older'
          ? element.scrollTop
          : element.scrollHeight - element.scrollTop - element.clientHeight,
      direction,
    );
    // Native dragging retains its initial pixel/content ratio when a replacement page grows.
    await page.mouse.move(
      geometry.x,
      edge + sign * (30 + remaining * geometry.nativePixelsPerScroll * 1.25),
      { steps: 6 },
    );
  }
  await expect
    .poll(count, { message: `${direction} second native page` })
    .toBeGreaterThanOrEqual(2);
  await expectNativeHistoryDirection(page, sign);
}

async function dragNativeHistoryWindow(page: Page, direction: 'older' | 'newer'): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  await settleNativeHistoryLayout(page);
  await scroller.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  });
  await settleNativeHistoryLayout(page);
  const geometry = await nativeHistoryGeometry(page);
  await watchNativeHistoryWindows(page, direction);
  await page.mouse.move(geometry.x, geometry.y);
  await page.mouse.down();
  let failed = false;
  let cleanupFailure: 'timed_out' | 'query_failed' | undefined;
  try {
    await moveNativeHistoryPages(page, geometry, direction);
  } catch (error) {
    failed = true;
    await attachNativeHistoryDragFailure(page, geometry, direction, error);
    throw error;
  } finally {
    const cleanup = await captureWithEvidenceBudget(
      Promise.all([
        page.mouse.up(),
        scroller.evaluate((element) =>
          element.dispatchEvent(new Event('finish-native-history-test')),
        ),
      ]).then(() => ({ released: true })),
    );
    if ('status' in cleanup) {
      cleanupFailure = cleanup.status;
      if (failed)
        test
          .info()
          .annotations.push({ type: 'native-history-cleanup', description: cleanup.status });
    }
  }
  if (cleanupFailure) throw new Error(`Native scrollbar cleanup ${cleanupFailure}`);
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
      const window = await space.app.browserWindow(space.page);
      await window.evaluate((window) => window.setContentSize(1024, 724));
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
        .click();
      const stream = space.page.getByTestId('conversation-stream');
      await expect(stream).toContainText('HISTORY_ANSWER_259');
      const ids = () =>
        stream
          .locator('[data-msg-id]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-msg-id')));
      const newestIds = await ids();
      await stream.getByRole('button', { name: 'Browse history messages', exact: true }).click();
      await expect.poll(ids).not.toEqual(newestIds);
      await expect(stream).toContainText('HISTORY_QUESTION_259');
      await dragNativeHistoryWindow(space.page, 'older');
      // Loaded rows far from the reader stay loaded but unmounted when windowed; the history browser
      // tests check retention against the transcript model with the gate on and off.
      const windowed = await transcriptWindowing(space.page);
      if (!windowed) await expect(stream).toContainText('HISTORY_QUESTION_259');
      // Locate an unread oldest window through the real search entry before appending newer pages.
      await space.page.keyboard.press('Control+f');
      const search = space.page.getByTestId('transcript-search-bar');
      await search.getByRole('searchbox').fill('HISTORY_QUESTION_0');
      await search.getByRole('combobox').selectOption('session');
      await search
        .getByTestId('sdk-history-search-result')
        .filter({ hasText: 'HISTORY_QUESTION_0' })
        .click();
      await expect(stream).toContainText('HISTORY_QUESTION_0');
      await dragNativeHistoryWindow(space.page, 'newer');
      if (!windowed) await expect(stream).toContainText('HISTORY_QUESTION_0');
      const bottom = space.page.getByRole('button', { name: 'Jump to bottom', exact: true });
      if (await bottom.count()) await bottom.click();
      await expect.poll(ids).toEqual(newestIds);
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
    await hit.locator('..').getByRole('button', { name: 'Read original', exact: true }).click();
    await expect(search.getByTestId('sdk-history-search-body')).toContainText(query);
    await search.getByRole('button', { name: 'Back to results', exact: true }).click();
    await search.getByRole('searchbox').press('Enter');
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
    await stream.getByRole('button', { name: 'Browse history messages', exact: true }).click();
    await expect.poll(ids).not.toEqual(newest);
    await expect(stream).toContainText('HISTORY_QUESTION_259');
    // Windowed, the mounted ids follow the reader instead of listing every loaded row.
    const windowed = await transcriptWindowing(space.page);
    const moveToOlder = async () => {
      const before = await ids();
      await scroller.evaluate((element) => {
        element.scrollTop = 0;
      });
      await settleNativeHistoryLayout(space.page);
      const anchor = stream.locator('[data-msg-id]').first();
      const anchorId = await anchor.getAttribute('data-msg-id');
      const anchorTop = await anchor.evaluate((element) => element.getBoundingClientRect().top);
      await scroller.hover();
      await space.page.mouse.wheel(
        0,
        -(await scroller.evaluate((element) => element.scrollHeight)),
      );
      try {
        await expect.poll(ids, { timeout: 10_000 }).not.toEqual(before);
        await settleNativeHistoryLayout(space.page);
        const after = await ids();
        if (!windowed) expect(before.every((id) => after.includes(id))).toBe(true);
        expect(
          Math.abs(
            (await stream
              .locator(`[data-msg-id="${anchorId}"]`)
              .evaluate((element) => element.getBoundingClientRect().top)) - anchorTop,
          ),
        ).toBeLessThanOrEqual(2);
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
    await settleNativeHistoryLayout(space.page);
    if (!windowed) expect(await ids()).toEqual(oldest);
    await expect(stream).toContainText('HISTORY_QUESTION_259');
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
