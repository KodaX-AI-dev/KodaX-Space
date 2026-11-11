import assert from 'node:assert/strict';
import { type Page } from 'playwright';
import {
  historyTest,
  isLoaded,
  openHistoryFixture,
  sendHistoryPointer,
  startUnread,
  waitLoaded,
} from './conversationHistoryBrowserFixture.js';

async function nativeHistoryScrollbarGeometry(page: Page) {
  return page.getByTestId('conversation-scroll-container').evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('History viewport must be HTML');
    const gutter = element.offsetWidth - element.clientWidth;
    const range = element.scrollHeight - element.clientHeight;
    if (gutter <= 0 || range <= 0) throw new Error('Native scrollbar fixture must overflow');
    const rect = element.getBoundingClientRect();
    const thumb = (element.clientHeight * element.clientHeight) / element.scrollHeight;
    const travel = element.clientHeight - thumb;
    return {
      x: rect.right - gutter / 2,
      y: rect.top + (element.scrollTop / range) * travel + thumb / 2,
      top: rect.top + thumb / 2,
      bottom: rect.top + travel + thumb / 2,
      scale: travel / range,
    };
  });
}

for (const direction of ['older', 'newer'] as const)
  for (const restorationFrames of [48, 8])
    historyTest(
      `a held native scrollbar ${direction} retains pages after ${restorationFrames} frames`,
      async (t) => {
        const { page, errors } = await openHistoryFixture(t, true);
        await page.addStyleTag({
          content:
            '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}[data-testid="conversation-scroll-container"]::-webkit-scrollbar-button{display:none}',
        });
        await startUnread(page, direction);
        const scroller = page.getByTestId('conversation-scroll-container');
        await scroller.evaluate((element) => {
          element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
        });
        await page.evaluate('window.settle()');
        const geometry = await nativeHistoryScrollbarGeometry(page);
        const edge = direction === 'older' ? geometry.top : geometry.bottom;
        const sign = direction === 'older' ? -1 : 1;
        const count = await page.evaluate<number>('window.requests.length');
        await page.mouse.move(geometry.x, geometry.y);
        await page.mouse.down();
        try {
          await page.mouse.move(geometry.x, edge + sign * 15, { steps: 6 });
          await page.waitForFunction(
            (offset) =>
              (window as unknown as { requests: string[] }).requests
                .slice(offset)
                .includes('middle'),
            count,
          );
          await page.evaluate(`window.settle(${restorationFrames})`);
          const remaining = await scroller.evaluate(
            (element, direction) =>
              direction === 'older'
                ? element.scrollTop
                : element.scrollHeight - element.clientHeight - element.scrollTop,
            direction,
          );
          await page.mouse.move(
            geometry.x,
            edge + sign * (30 + remaining * geometry.scale * 1.25),
            { steps: 6 },
          );
          await waitLoaded(page, direction === 'older' ? 'OLDEST11' : 'NEWEST11');
          await page.evaluate('window.settle(48)');
          assert.deepEqual((await page.evaluate<string[]>('window.requests')).slice(count), [
            'middle',
            direction === 'older' ? 'oldest' : 'newest',
          ]);
          for (const label of ['OLDEST', 'MIDDLE', 'NEWEST'])
            assert.ok(await isLoaded(page, label + '11'), `${label} is retained`);
          // A held reversal now traverses retained rows; neither edge should reread them.
          const requests = await page.evaluate('window.requests');
          await page.mouse.move(
            geometry.x,
            direction === 'older' ? geometry.bottom + 15 : geometry.top - 15,
            { steps: 12 },
          );
          await page.evaluate('window.settle(48)');
          assert.deepEqual(await page.evaluate('window.requests'), requests);
        } finally {
          await page.mouse.up();
        }
        assert.deepEqual(errors, []);
      },
    );

historyTest(
  'a held scrollbar the browser pulls back to the top right after a restore keeps reading older',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t, true);
    page.setDefaultTimeout(5000);
    // A tall newest page: the jump to its top lands far from the rows the reader had mounted.
    await page.evaluate(
      `window.extraItems=Array.from({length:200},(_,i)=>({id:'bulk'+i,type:'assistant',historyBoundary:{entryId:'found',sourceRevision:'s'},text:'Bulk '+i+'\\n\\n'+('Varying paragraph.\\n\\n').repeat(4)}))`,
    );
    await page.evaluate('window.locate("newest")');
    await waitLoaded(page, 'NEWEST11');
    const scroller = page.getByTestId('conversation-scroll-container');
    await scroller.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });
    await page.evaluate('window.settle(48)');
    await sendHistoryPointer(page, 'pointerdown');
    try {
      // The thumb is held at the top: whenever the restore moves the view down, Chromium puts it
      // back under the thumb on a following frame.
      await page.evaluate(`{
        const element = document.querySelector('[data-testid="conversation-scroll-container"]');
        const hold = () => {
          if (window.requests.includes('oldest')) return;
          if (element.scrollTop !== 0) element.scrollTop = 0;
          requestAnimationFrame(hold);
        };
        hold();
      }`);
      await waitLoaded(page, 'OLDEST11');
    } finally {
      await sendHistoryPointer(page, 'pointerup');
    }
    assert.deepEqual(errors, []);
  },
);

for (const phase of ['stable', 'restoring'] as const)
  historyTest(
    `holding a scrollbar during ${phase} does not turn programmatic search scrolling into paging`,
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, true);
      await startUnread(page, 'newer');
      await page.keyboard.press('Control+f');
      const search = page.getByTestId('transcript-search-bar');
      await search.getByRole('searchbox').fill('no current-page match');
      await search.getByText('0/0').waitFor();
      const scroller = page.getByTestId('conversation-scroll-container');
      await scroller.evaluate((element) => {
        element.scrollTop = 100;
      });
      await page.evaluate('window.settle(48)');
      await sendHistoryPointer(page, 'pointerdown');
      if (phase === 'restoring') {
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.getByText('MIDDLE 0', { exact: true }).waitFor();
        await page.evaluate('window.settle(8)');
      }
      const requests = await page.evaluate('window.requests');
      await search.getByRole('searchbox').fill(phase === 'restoring' ? 'MIDDLE 11' : 'OLDEST 11');
      await search.getByText('1/1').waitFor();
      await page.evaluate('window.settle(48)');
      assert.deepEqual(await page.evaluate('window.requests'), requests);
      await sendHistoryPointer(page, 'pointercancel');
      await sendHistoryPointer(page, 'pointermove');
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.evaluate('window.settle()');
      assert.deepEqual(
        await page.evaluate('window.requests'),
        requests,
        'cancelled pointer cannot start another read',
      );
      assert.deepEqual(errors, []);
    },
  );

for (const direction of ['older', 'newer'] as const)
  historyTest(
    `a short history viewport confirms its first native ${direction} boundary`,
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, true);
      await page.evaluate('window.middle()');
      await page.getByText('MIDDLE 11', { exact: true }).waitFor();
      await page.evaluate('window.settle(48)');
      const scroller = page.getByTestId('conversation-scroll-container');
      const range = await scroller.evaluate((element) => {
        const content = element.firstElementChild;
        if (!(content instanceof HTMLElement)) throw new Error('Expected history content');
        content.style.height = `${element.clientHeight + 200}px`;
        content.style.overflow = 'hidden';
        element.scrollTop = 100;
        return element.scrollHeight - element.clientHeight;
      });
      assert.equal(range, 200);
      await page.evaluate('window.settle()');
      const geometry = await nativeHistoryScrollbarGeometry(page);
      await page.mouse.move(geometry.x, geometry.y);
      await page.mouse.down();
      try {
        await page.mouse.move(
          geometry.x,
          direction === 'older' ? geometry.top - 5 : geometry.bottom + 5,
          { steps: 1 },
        );
        await page.waitForFunction(
          (cursor) => (window as unknown as { requests: string[] }).requests.at(-1) === cursor,
          direction === 'older' ? 'oldest' : 'newest',
        );
      } finally {
        await page.mouse.up();
      }
      assert.deepEqual(errors, []);
    },
  );

// Retained rows give the viewport a stable identity even after content height changes.
historyTest(
  'prepending retains the visible row and its offset across a delayed layout change',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    await page.evaluate('window.middle()');
    const scroller = page.getByTestId('conversation-scroll-container');
    await waitLoaded(page, 'MIDDLE0');
    await page.evaluate('window.settle(48)');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.evaluate('window.settle()');
    const row = page.locator('[data-source-item="MIDDLE0"]');
    const before = await row.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate('window.hold=true');
    await scroller.hover();
    await page.mouse.wheel(0, -300);
    await page.waitForFunction('window.requests.at(-1)==="oldest"');
    await page.evaluate('window.release()');
    await page.getByText('OLDEST 11', { exact: true }).waitFor();
    await page.evaluate('window.settle(8)');
    // The row directly above the reader; with windowing, rows further up are a spacer.
    await page.locator('[data-source-item="OLDEST11"]').evaluate((element) => {
      (element as HTMLElement).style.paddingTop = '100px';
    });
    await page.evaluate('window.settle(48)');
    assert.ok(
      Math.abs((await row.evaluate((element) => element.getBoundingClientRect().top)) - before) <=
        2,
    );
    assert.ok(await isLoaded(page, 'MIDDLE11'));
    assert.deepEqual(errors, []);
  },
);

historyTest(
  'the first native edge is not determined by an earlier opposite relayout offset',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t, true);
    await page.addStyleTag({
      content: '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}',
    });
    await page.evaluate('window.middle()');
    await page.getByText('MIDDLE 11', { exact: true }).waitFor();
    await page.evaluate('window.settle(48)');
    const scroller = page.getByTestId('conversation-scroll-container');
    await scroller.evaluate((element) => {
      element.scrollTop = 1000;
    });
    await page.evaluate('window.settle()');
    await sendHistoryPointer(page, 'pointerdown');
    try {
      await scroller.evaluate((element) => {
        const content = element.firstElementChild;
        if (!(content instanceof HTMLElement)) throw new Error('Expected history content');
        content.style.paddingTop = '500px';
        element.scrollTop = 1500;
      });
      await page.evaluate('window.settle()');
      await scroller.evaluate((element) => {
        const content = element.firstElementChild;
        if (!(content instanceof HTMLElement)) throw new Error('Expected history content');
        content.style.paddingTop = '0px';
        element.scrollTop = 0;
      });
      await page.getByText('OLDEST 11', { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    } finally {
      await sendHistoryPointer(page, 'pointerup');
    }
    assert.deepEqual(errors, []);
  },
);

historyTest(
  'appending a newer page from a located window keeps the visible row at the bottom edge',
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    await page.evaluate('window.middle()');
    const scroller = page.getByTestId('conversation-scroll-container');
    await page.getByText('MIDDLE 11', { exact: true }).waitFor();
    await page.evaluate('window.settle(48)');
    assert.equal(await page.getByTestId('conversation-history-boundary').count(), 1);
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate('window.settle()');
    const row = page.locator('[data-source-item="MIDDLE11"]');
    const before = await row.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate('window.hold=true');
    await scroller.hover();
    await page.mouse.wheel(0, 120);
    await page.waitForFunction('window.requests.at(-1)==="newest"');
    await page.evaluate('window.settle(4)');
    await page.evaluate('window.release()');
    await waitLoaded(page, 'NEWEST11');
    await page.evaluate('window.settle(48)');
    const after = await row.evaluate((element) => element.getBoundingClientRect().top);
    assert.ok(Math.abs(after - before) <= 2, `visible row drifted ${after - before}px`);
    assert.deepEqual(errors, []);
  },
);

historyTest('find counts collapsed thinking and opens it on jump', async (t) => {
  const { page, errors } = await openHistoryFixture(t);
  await page.evaluate(
    `window.extraItems=[{id:'pondered',type:'thinking',text:'Pondered the hidden route',historyBoundary:{entryId:'found',sourceRevision:'s'}}];window.start()`,
  );
  const stream = page.getByTestId('conversation-stream');
  await waitLoaded(page, 'OLDEST11');
  const thought = stream.getByText('Pondered the hidden route');
  assert.equal(await thought.count(), 0, 'thinking starts collapsed in the normal view');
  await page.keyboard.press('Control+f');
  const search = page.getByTestId('transcript-search-bar');
  await search.getByRole('searchbox').fill('hidden route');
  await search.getByText('1/1').waitFor();
  await thought.waitFor();
  await page.evaluate('window.settle(48)');
  assert.ok(await thought.isVisible());
  const inView = await thought.evaluate((element) => {
    const scroller = document.querySelector('[data-testid="conversation-scroll-container"]')!;
    const box = element.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    return box.bottom > frame.top && box.top < frame.bottom;
  });
  assert.ok(inView, 'the opened hit is scrolled into view');
  assert.deepEqual(errors, []);
});
