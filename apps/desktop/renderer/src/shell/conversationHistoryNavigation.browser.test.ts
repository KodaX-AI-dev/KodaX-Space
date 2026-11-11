import assert from 'node:assert/strict';
import { type Page } from 'playwright';
import {
  historyTest,
  isLoaded,
  loadedIds,
  openHistoryFixture,
  rowInView,
  sendHistoryPointer,
  startUnread,
  waitLoaded,
  type HistoryDirection,
} from './conversationHistoryBrowserFixture.js';

historyTest(
  'saved history boundary explains single-page navigation and preserves the return position',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    page.setDefaultTimeout(3500);
    await page.evaluate(
      'window.singlePage=true;window.historyStatus="resolved";window.primeLive()',
    );
    const scroller = page.getByTestId('conversation-scroll-container');
    // The newest live row: the first one is not mounted at the bottom.
    await page.getByText('Live 19', { exact: true }).waitFor();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const browse = page.getByRole('button', { name: 'Browse history messages', exact: true });
    await browse.waitFor({ timeout: 3000 });
    await page.getByText('Opens at the most recent saved messages.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Start of this conversation', { exact: true }).count(), 0);
    await browse.click();
    // The saved page opens at its newest message; its first row is a spacer there.
    await waitLoaded(page, 'NEWEST0');
    await page.getByText('Start of this conversation', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate('window.requests'), ['newest']);
    await page.getByRole('button', { name: 'Return to reading position' }).click();
    await page.getByText('Live 0', { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="conversation-scroll-container"]')!.scrollTop < 30,
    );
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('transcript-search-bar');
    assert.equal(await search.getByRole('combobox').inputValue(), 'page');
    assert.equal(
      await search.getByRole('option', { name: 'Loaded content', exact: true }).count(),
      1,
    );
    await search.getByRole('searchbox').fill('not in the loaded content');
    await search.getByRole('button', { name: 'Search saved conversation', exact: true }).click();
    assert.equal(await search.getByRole('combobox').inputValue(), 'session');
    assert.deepEqual(errors, []);
  },
);

historyTest(
  'earlier-history boundary keeps readable messages during failure and offers a working retry',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    page.setDefaultTimeout(3500);
    await page.evaluate('window.historyStatus="resolved";window.middle()');
    await waitLoaded(page, 'MIDDLE0');
    await page.evaluate('window.settle(48);window.hold=true');
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await page.waitForFunction('window.requests.at(-1)==="oldest"');
    await page.getByTestId('history-paging-status').waitFor();
    await page.evaluate('window.fail=true;window.release()');
    const error = page.getByTestId('history-paging-error');
    await error.waitFor();
    assert.ok(await isLoaded(page, 'MIDDLE0'), 'the read page stays during the failure');
    assert.equal(await page.getByText('Start of this conversation', { exact: true }).count(), 0);
    await page.evaluate('window.fail=false;window.hold=false');
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitLoaded(page, 'OLDEST0');
    await page.getByText('Start of this conversation', { exact: true }).waitFor();
    assert.ok(await isLoaded(page, 'MIDDLE0'), 'the read page is retained');
    assert.deepEqual(errors, []);
  },
);

historyTest(
  'a saved-history revision change keeps the read rows in place and returns to newest without them',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    page.setDefaultTimeout(3500);
    await page.evaluate('window.middle()');
    await waitLoaded(page, 'MIDDLE0');
    await page.evaluate('window.settle(48)');
    const stream = page.getByTestId('conversation-stream');
    const before = await rowInView(page);
    await page.evaluate('window.revision="r2"');
    // A pointer click would first scroll the button at the top into view.
    await page
      .getByRole('button', { name: 'Load earlier messages', exact: true })
      .evaluate((button: HTMLElement) => button.click());
    await page
      .getByText('Saved history changed while you were reading. This page is still available.')
      .waitFor();
    await page.evaluate('window.settle(24)');
    assert.ok(await isLoaded(page, 'MIDDLE0'), 'the read page stays');
    assert.equal(await isLoaded(page, 'OLDEST0'), false, 'no page of the new revision is mixed in');
    const after = await rowInView(page, before.id);
    assert.ok(
      Math.abs(after.offset - before.offset) <= 2,
      `${before.id} moved from ${before.offset} to ${after.offset}`,
    );
    await page.getByRole('button', { name: 'Return to newest messages', exact: true }).click();
    await stream.getByText('NEWEST 11', { exact: true }).waitFor();
    await page.evaluate('window.settle(24)');
    assert.equal(await isLoaded(page, 'MIDDLE0'), false, 'the stale page is not revived');
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="conversation-scroll-container"]')!;
      return element.scrollHeight - element.scrollTop - element.clientHeight < 2;
    });
    assert.deepEqual(errors, []);
  },
);

historyTest(
  'partial and unverified saved histories never claim to be the conversation start',
  async (t) => {
    for (const status of ['partial', 'ambiguous', undefined]) {
      const { page, errors } = await openHistoryFixture(t);
      page.setDefaultTimeout(3500);
      await page.evaluate((value) => {
        Object.assign(window, { singlePage: true, historyStatus: value });
      }, status);
      await page.evaluate('window.primeLive()');
      await page.getByRole('button', { name: 'Browse history messages', exact: true }).click();
      await waitLoaded(page, 'NEWEST0');
      assert.equal(await page.getByText('Start of this conversation', { exact: true }).count(), 0);
      if (status)
        await page
          .getByText('Showing available history; its full range could not be verified.', {
            exact: true,
          })
          .waitFor();
      assert.deepEqual(errors, []);
    }
  },
);

historyTest(
  'one bottom control returns from frozen history to the real latest message and downward gestures visit adjacent pages',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate('window.start()');
    const stream = page.getByTestId('conversation-stream');
    const scroller = page.getByTestId('conversation-scroll-container');
    await waitLoaded(page, 'OLDEST11');
    assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('transcript-search-bar');
    await search.getByRole('searchbox').fill('concealed tool result');
    await search.getByText('0/0').waitFor();
    // Verbose view shows tool details, so every loaded tool result counts, mounted or not.
    await page.evaluate('window.detail("verbose")');
    await search.getByText('1/3').waitFor();
    // Slow rendering must not turn a programmatic search jump into history paging.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });
    await search.getByRole('searchbox').fill('no current-page match');
    await search.getByText('0/0').waitFor();
    await scroller.hover();
    await page.mouse.wheel(0, -(await scroller.evaluate((element) => element.scrollHeight)));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="conversation-scroll-container"]')!.scrollTop === 0,
    );
    await page.evaluate('window.settle()');
    await search.getByRole('searchbox').fill('concealed tool result');
    await search.getByText('1/3').waitFor();
    await page.evaluate('window.settle()');
    await page.evaluate('window.settle()');
    assert.deepEqual(
      await page.evaluate('window.requests'),
      ['newest', 'middle', 'oldest'],
      'search scrolling must not request an adjacent history page',
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate('window.detail("summary")');
    await search.getByText('0/0').waitFor();
    await page.evaluate('window.detail("normal")');
    await search.getByRole('searchbox').fill('needle');
    await search.getByText('0/0').waitFor();
    const scope = search.getByRole('combobox');
    await scope.selectOption('session', { timeout: 1500 });
    await search.getByText('Archived needle', { exact: true }).click();
    assert.equal(await search.getByText('0/0').count(), 0);
    await stream.getByText('Located record', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await waitLoaded(page, 'OLDEST11');
    await search.getByText('Archived needle', { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-hit-id') === 'unique-hit',
    );
    for (const [kind, mode] of [
      ['tool', 'summary'],
      ['thinking', 'summary'],
      ['thinking', 'normal'],
      ['mixed', 'normal'],
    ]) {
      await page.evaluate((value) => {
        Object.assign(window, { locatedKind: value });
      }, kind);
      await page.evaluate((value) => {
        const detail = (window as unknown as { detail: (mode: string) => void }).detail;
        detail(value);
      }, mode);
      await search.getByText('Archived needle', { exact: true }).click();
      await stream
        .getByText(`Located ${kind === 'mixed' ? 'tool' : kind} detail`, { exact: true })
        .waitFor({ timeout: 3000 });
      if (kind === 'mixed') {
        await stream.getByText('Second located tool detail', { exact: true }).waitFor();
        await stream.getByText('Located thinking detail', { exact: true }).waitFor();
      }
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('data-source-item')),
        kind === 'mixed' ? 'located-answer' : `located-${kind}`,
      );
      await page.getByRole('button', { name: 'Back to results' }).click();
      if (mode === 'summary') assert.equal(await stream.getByTestId('tool-call-card').count(), 0);
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-hit-id') === 'unique-hit',
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('data-hit-id')),
        'unique-hit',
      );
    }
    await page.evaluate('window.detail("normal")');
    await page.keyboard.press('Escape');
    const latest = page.getByRole('button', { name: 'Jump to bottom', exact: true });
    await latest.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(
      await latest.count(),
      1,
      'the normal bottom arrow must also be available at the bottom of older history',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Return to newest messages', exact: true }).count(),
      0,
    );
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await scroller.hover();
    await page.mouse.wheel(0, 300);
    await waitLoaded(page, 'MIDDLE0');
    await page.evaluate('window.settle(48)');
    assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    assert.ok(await isLoaded(page, 'OLDEST11'));
    assert.ok(await isLoaded(page, 'NEWEST11'));
    await latest.click();
    await stream.getByText('NEWEST 11', { exact: true }).waitFor();
    const reportMarker = await stream
      .getByTestId('system-notice')
      .evaluate(
        (element) =>
          element
            .closest('[data-testid="conversation-render-row"]')
            ?.querySelector('.conversation-timeline-decoration')?.className,
      );
    assert.doesNotMatch(
      reportMarker ?? '',
      /bg-warn/,
      'the report timeline marker is informational too',
    );
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="conversation-scroll-container"]')!;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    });
    await page.evaluate('window.middle()');
    await waitLoaded(page, 'MIDDLE0');
    // A direct scrollTop write is not a user gesture, so it must wait out the page's own scrolls.
    await page.evaluate('window.settle(48)');
    await page.evaluate('window.hold=true');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await scroller.hover();
    await page.mouse.wheel(0, -300);
    await page.waitForFunction('window.requests.at(-1)==="oldest"');
    await latest.click();
    await stream.getByText('NEWEST 11', { exact: true }).waitFor();
    await page.evaluate('window.fail=true;window.release()');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="conversation-scroll-container"]')!;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    });
    assert.ok(
      !(await isLoaded(page, 'OLDEST0')),
      'late older replies cannot replace the selected newest window',
    );
    assert.deepEqual(
      await page.evaluate('window.toasts()'),
      [],
      'obsolete navigation failures cannot raise notices',
    );
    await page.evaluate('window.hold=false;window.middle()');
    await waitLoaded(page, 'MIDDLE0');
    await page.evaluate('window.holdNewest=true');
    await latest.click();
    await page.waitForFunction('window.newestHeld');
    await page.evaluate('window.select("other")');
    await page.locator('[data-session-id="other"]').waitFor();
    await page.evaluate('window.select("s")');
    await page.locator('[data-session-id="s"]').waitFor();
    await page.evaluate('window.releaseNewest()');
    await page.evaluate('window.settle()');
    assert.deepEqual(
      await page.evaluate('window.toasts()'),
      [],
      'an unmounted Session owner cannot report failure after A to B to A',
    );
    await page.evaluate('window.primeLive()');
    const saved = page.getByRole('button', { name: 'Browse history messages' });
    await saved.waitFor();
    await saved.focus();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.keyboard.press('ArrowUp');
    await saved.waitFor();
    await page.keyboard.press('Enter');
    await stream.getByText('NEWEST 11', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Return to reading position' }).click();
    await stream.getByText('Live 0', { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="conversation-scroll-container"]')!.scrollTop < 30,
    );
    await stream
      .locator('[data-msg-id="view-0"]')
      .getByRole('button', { name: 'Keep through this turn and create a branch' })
      .click();
    assert.deepEqual(await page.evaluate('JSON.parse(JSON.stringify(window.selectedTurn))'), {
      kind: 'item',
      source: 'view',
      itemId: 'view-0',
      outputId: 'output-0',
    });
    // Enter saved history through its real UI owner before testing same-page
    // receipt reuse. Direct store reads bypass that owner's live-follow guard.
    // Keep this interaction valid on a slower renderer too.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.evaluate('window.locatedKind="same-page"');
    await saved.click();
    await stream.getByText('NEWEST 11', { exact: true }).waitFor();
    await stream.getByTestId('process-receipt-tool_cluster').getByRole('button').first().click();
    const reusedTool = stream.getByTestId('tool-call-card');
    await reusedTool.waitFor();
    assert.equal(await page.evaluate('window.requests.at(-1)'), 'newest');
    assert.equal(
      await reusedTool.getByRole('button').first().getAttribute('aria-expanded'),
      'false',
    );
    await page.keyboard.press('Control+f');
    await search.getByRole('searchbox').fill('needle');
    await search.getByRole('combobox').selectOption('session');
    await search.getByText('Archived needle', { exact: true }).click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-source-item') === 'NEWEST0',
    );
    await page.getByRole('button', { name: 'Back to results' }).click();
    await reusedTool.waitFor();
    assert.equal(await page.evaluate('window.requests.at(-1)'), 'newest');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-hit-id') === 'unique-hit',
    );
    assert.equal(
      await reusedTool.getByRole('button').first().getAttribute('aria-expanded'),
      'false',
    );
    assert.deepEqual(errors, []);
  },
);

type HistoryGesture = 'keyboard' | 'touch' | 'scrollbar';

async function sendHistoryTouch(
  page: Page,
  type: 'touchstart' | 'touchmove',
  clientY: number,
): Promise<void> {
  await page.getByTestId('conversation-scroll-container').evaluate(
    (element, { type, clientY }) => {
      const touch = new Touch({ identifier: 1, target: element, clientX: 100, clientY });
      element.dispatchEvent(new TouchEvent(type, { touches: [touch], bubbles: true }));
    },
    { type, clientY },
  );
}

async function dispatchHistoryGesture(
  page: Page,
  input: HistoryGesture,
  direction: HistoryDirection,
): Promise<void> {
  const stream = page.getByTestId('conversation-stream');
  if (input === 'keyboard') {
    // Any mounted row: key presses from inside the transcript page it.
    await stream.locator('[data-msg-id]').first().focus();
    await page.keyboard.press(direction === 'newer' ? 'End' : 'Home');
    return;
  }
  if (input === 'touch') {
    await sendHistoryTouch(page, 'touchstart', 300);
    await sendHistoryTouch(page, 'touchmove', direction === 'newer' ? 200 : 400);
  } else await sendHistoryPointer(page, 'pointerdown');
  await page.getByTestId('conversation-scroll-container').evaluate((element, direction) => {
    element.scrollTop = direction === 'newer' ? element.scrollHeight : 0;
  }, direction);
}

for (const input of ['keyboard', 'touch', 'scrollbar'] as const) {
  historyTest(
    `${input} reads unread adjacent pages and keeps every already-read page`,
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, input === 'scrollbar');
      const scroller = page.getByTestId('conversation-scroll-container');
      for (const direction of ['older', 'newer'] as const) {
        await startUnread(page, direction);
        await scroller.evaluate((element, direction) => {
          element.scrollTop =
            direction === 'newer' ? element.scrollHeight - element.clientHeight - 100 : 100;
        }, direction);
        await page.evaluate('window.settle()');
        const before = await page.evaluate<number>('window.requests.length');
        await dispatchHistoryGesture(page, input, direction);
        await page.waitForFunction(
          (count) => (window as unknown as { requests: string[] }).requests.length > count,
          before,
        );
        await waitLoaded(page, 'MIDDLE11');
        await waitLoaded(page, direction === 'older' ? 'NEWEST11' : 'OLDEST11');
        await page.evaluate('window.settle(48)');
        if (input === 'scrollbar') await sendHistoryPointer(page, 'pointerup');
        // Reversing over already-read content must not refetch or change source.
        const requests = await page.evaluate('window.requests');
        const ids = await loadedIds(page);
        await dispatchHistoryGesture(page, input, direction === 'older' ? 'newer' : 'older');
        await page.evaluate('window.settle(48)');
        if (input === 'scrollbar') await sendHistoryPointer(page, 'pointercancel');
        assert.deepEqual(await page.evaluate('window.requests'), requests);
        assert.deepEqual(await loadedIds(page), ids);
      }
      assert.deepEqual(errors, []);
    },
  );
}
