import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import { type Page } from 'playwright';
import {
  browserAvailable,
  openHistoryFixture,
  rowInView,
  sendHistoryPointer,
  startUnread,
  waitLoaded,
} from './conversationHistoryBrowserFixture.js';

/** A long single-page transcript; every `queryEvery`-th row (offset 1) is a user query. */
async function openWindowedTranscript(
  t: TestContext,
  count = 3000,
  { queryEvery = 0, before = '', scrollbars = false } = {},
) {
  const opened = await openHistoryFixture(t, scrollbars);
  await opened.page.evaluate(`window.singlePage=true;
window.extraItems=Array.from({length:${count}},(_,i)=>${queryEvery}&&i%${queryEvery}===1?{id:'query'+i,type:'user',text:'Query '+i}:({id:'bulk'+i,type:'assistant',historyBoundary:{entryId:'found',sourceRevision:'s'},text:'Bulk '+i+'\\n\\n'+('Varying paragraph.\\n\\n').repeat(i%7)}));
${before};window.start()`);
  await opened.page.getByText(`Bulk ${count - 1}`, { exact: true }).waitFor({ timeout: 60_000 });
  await opened.page.evaluate('window.settle(24)');
  return opened;
}

const mountedRows = (page: Page): Promise<number> => page.locator('[data-window-row]').count();

/** Distinct scrollTop:mounted-row states over 12 frames; a settled window has exactly one. */
const windowFrames = (page: Page): Promise<string[]> =>
  page.getByTestId('conversation-scroll-container').evaluate(async (element) => {
    const frames = new Set<string>();
    for (let frame = 0; frame < 12; frame += 1) {
      frames.add(`${element.scrollTop}:${element.querySelectorAll('[data-window-row]').length}`);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return [...frames];
  });

const railMarkers = (page: Page) =>
  page.getByRole('navigation', { name: 'User query jump points' }).getByRole('button');
const currentMarker = (page: Page) =>
  page.getByRole('navigation', { name: 'User query jump points' }).locator('[aria-current]');

test(
  'the query rail shows a bounded run of markers around the reader',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 1000, { queryEvery: 5 });
    const markers = railMarkers(page);
    assert.ok((await markers.count()) <= 31, `${await markers.count()} markers for 200 queries`);
    assert.equal(await markers.last().getAttribute('aria-current'), 'location');
    await page.getByTestId('conversation-scroll-container').evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    assert.equal(await currentMarker(page).count(), 1);
    const current = await markers.evaluateAll((buttons) =>
      buttons.findIndex((button) => button.hasAttribute('aria-current')),
    );
    const count = await markers.count();
    assert.ok(current > 5 && current < count - 6, `current marker ${current} of ${count}`);
    // Reading on to the next query moves the marker, not the run.
    const first = await markers.first().getAttribute('aria-label');
    const label = (await currentMarker(page).getAttribute('aria-label'))!;
    const next = Number(label.replace('Query ', '')) + 5;
    await page.locator(`[data-msg-id="query${next}"]`).evaluate((element) => {
      element.scrollIntoView({ block: 'start' });
    });
    await page.evaluate('window.settle(24)');
    assert.equal(await currentMarker(page).getAttribute('aria-label'), `Query ${next}`);
    assert.equal(await markers.first().getAttribute('aria-label'), first);
    assert.deepEqual(errors, []);
  },
);

test(
  'the query rail shrinks its run to fit a short transcript',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 1000, { queryEvery: 5 });
    const markers = railMarkers(page);
    assert.equal(await markers.count(), 31);
    // The fixture has no stylesheet, so give the stream and its overlaid rail their app layout.
    // At the shortest window the transcript has less room than a full run of markers needs.
    await page.addStyleTag({
      content:
        '[data-testid="conversation-stream"]{position:relative;height:300px;overflow:hidden}' +
        '[data-testid="conversation-stream"]>nav{position:absolute;top:0}',
    });
    await page.evaluate('window.settle(24)');
    // 19 markers and their gaps fit in 300px; 21 would not.
    assert.equal(await markers.count(), 19);
    assert.equal(await markers.last().getAttribute('aria-current'), 'location');
    assert.deepEqual(errors, []);
  },
);

test(
  'a query rail jump reaches a query whose row is not mounted',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 1000, { queryEvery: 5 });
    await page.getByTestId('conversation-scroll-container').evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    const marker = railMarkers(page).first();
    const label = (await marker.getAttribute('aria-label'))!;
    // The rail labels its markers with the query text; `Query 6` is row `query6`.
    const row = page.locator(`[data-msg-id="${label.replace('Query ', 'query')}"]`);
    assert.equal(await row.count(), 0, `${label} starts unmounted`);
    await marker.click();
    await page.evaluate('window.settle(48)');
    const offset = await row.evaluate((element) => {
      const scroller = element.closest('[data-testid="conversation-scroll-container"]')!;
      return element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });
    assert.ok(offset >= 0 && offset < 80, `${label} is ${offset}px below the top`);
    assert.equal(await currentMarker(page).getAttribute('aria-label'), label);
    // The run holds still under the pointer that clicked it.
    assert.equal(await railMarkers(page).first().getAttribute('aria-label'), label);
    // Mounted rows announce their place in the whole transcript, not in the window.
    const positions = await page
      .getByRole('feed')
      .getByRole('article')
      .evaluateAll((rows) =>
        rows.map((row) => [row.getAttribute('aria-posinset'), row.getAttribute('aria-setsize')]),
      );
    const sizes = new Set(positions.map(([, size]) => size));
    assert.equal(sizes.size, 1);
    assert.ok(Number([...sizes][0]) > 1000, `set size ${[...sizes][0]}`);
    const starts = positions.map(([position]) => Number(position));
    assert.ok(starts[0] > 1, `first mounted row ${starts[0]}`);
    assert.ok(
      starts.every((position, index) => index === 0 || position > starts[index - 1]),
      'positions ascend',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing mounts a bounded slice of a long transcript and follows the reader',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    // Following the bottom must be a fixed point: auto-follow's own scrolls do not reshape it.
    const bottomFrames = await windowFrames(page);
    assert.equal(bottomFrames.length, 1, `the bottom kept changing: ${bottomFrames.join(' ')}`);
    assert.ok((await mountedRows(page)) <= 80, `mounted ${await mountedRows(page)} rows`);
    assert.equal(await page.getByText('Bulk 0', { exact: true }).count(), 0);
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    const middle = await scroller.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const visible = [...element.querySelectorAll('[data-window-row]')].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.bottom > frame.top && box.top < frame.bottom;
      });
      return {
        visible: visible.length,
        scrollTop: element.scrollTop,
        half: element.scrollHeight / 2,
      };
    });
    assert.ok(middle.visible > 0, 'the middle of the transcript is mounted, not a blank spacer');
    assert.ok(Math.abs(middle.scrollTop - middle.half) < 2000, 'the reader stays in the middle');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByText('NEWEST 0', { exact: true }).waitFor();
    assert.ok((await mountedRows(page)) <= 80);
    assert.deepEqual(errors, []);
  },
);

for (const nativeAnchoring of [true, false])
  test(
    `windowing keeps the row being read in place while rows above mount${nativeAnchoring ? '' : ' without native anchoring'}`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openWindowedTranscript(t);
      const scroller = page.getByTestId('conversation-scroll-container');
      // Chromium keeps a coarse anchor it picked while the viewport held only a spacer, until the
      // next scroll; the window must not depend on native anchoring to keep its own changes still.
      if (!nativeAnchoring)
        await scroller.evaluate((element) => {
          element.style.overflowAnchor = 'none';
        });
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight / 2;
      });
      await page.evaluate('window.settle(24)');
      const id = await scroller.evaluate((element) => {
        const frame = element.getBoundingClientRect();
        const row = [...element.querySelectorAll<HTMLElement>('[data-window-row]')].find(
          (candidate) => candidate.getBoundingClientRect().top >= frame.top,
        );
        return row!.dataset.windowRow!;
      });
      const row = page.locator(`[data-window-row="${id}"]`);
      const top = (): Promise<number> =>
        row.evaluate((element) => element.getBoundingClientRect().top);
      const before = await top();
      await scroller.hover();
      for (let step = 0; step < 4; step += 1) {
        await page.mouse.wheel(0, -100);
        await page.evaluate('window.settle(4)');
      }
      await page.evaluate('window.settle(24)');
      const moved = (await top()) - before;
      assert.ok(Math.abs(moved - 400) <= 2, `read row moved ${moved}px for a 400px scroll`);
      assert.deepEqual(errors, []);
    },
  );

test(
  'windowing keeps the reader in place while the transcript pane is hidden and shown',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    const read = () =>
      scroller.evaluate((element) => {
        const frame = element.getBoundingClientRect();
        const row = [...element.querySelectorAll<HTMLElement>('[data-window-row]')].find(
          (candidate) => candidate.getBoundingClientRect().bottom > frame.top,
        );
        return row ? `${row.dataset.windowRow}@${row.getBoundingClientRect().top - frame.top}` : '';
      });
    const before = await read();
    // Max width mode takes the pane out of layout (`display: none`) and later restores it.
    const pane = (display: string) =>
      scroller.evaluate((element, display) => {
        element.parentElement!.style.display = display;
      }, display);
    await pane('none');
    await page.evaluate('window.settle(24)');
    await pane('');
    await page.evaluate('window.settle(24)');
    assert.equal(await read(), before);
    assert.deepEqual(errors, []);
  },
);

test(
  "windowing keeps the reader's row mounted when content above moves it without a scroll",
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    // A caller inserting content above a reader at scrollTop 0 moves the rows without native
    // anchoring or a scroll event, then restores its own anchor a frame later. A row measurement
    // landing in between must not re-read the reader as wherever the shifted rows now are.
    await scroller.evaluate((element) => {
      element.style.overflowAnchor = 'none';
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    const id = await scroller.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const rows = [...element.querySelectorAll<HTMLElement>('[data-window-row]')];
      const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > frame.top)!;
      row.parentElement!.style.paddingTop = '20000px';
      row.style.minHeight = `${row.offsetHeight + 1}px`;
      return row.dataset.windowRow!;
    });
    await page.evaluate('window.settle(24)');
    assert.equal(await page.locator(`[data-window-row="${id}"]`).count(), 1);
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing follows a caller scroll to the bottom that lands before its scroll event',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    // A row measurement queues the window's next frame; the caller jumps to the bottom earlier in
    // that frame (as "Browse history messages" does), so the window runs before the scroll event.
    await scroller.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const rows = [...element.querySelectorAll<HTMLElement>('[data-window-row]')];
      const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > frame.top)!;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          element.scrollTop = element.scrollHeight;
        }),
      );
      row.style.minHeight = `${row.offsetHeight + 3000}px`;
    });
    await page.evaluate('window.settle(24)');
    const gap = await scroller.evaluate(
      (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
    );
    assert.ok(gap <= 32, `${gap}px from the bottom`);
    assert.deepEqual(errors, []);
  },
);

for (const jump of [false, true])
  test(
    `windowing keeps a reader at the bottom on their rows when a newer page lands below${jump ? ' and the viewport jumps before the restore' : ''}`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t);
      await page.evaluate(() => {
        const fixture = window as unknown as {
          pageExtra: Record<string, unknown[]>;
        };
        // A newer page several viewports tall, so its rows cannot all be mounted with the reader's.
        fixture.pageExtra = {
          MIDDLE: Array.from({ length: 160 }, (_, index) => ({
            id: `extra${index}`,
            type: 'assistant',
            historyBoundary: { entryId: 'found', sourceRevision: 's' },
            text: `Extra ${index}\n\n${'Varying paragraph.\n\n'.repeat(index % 7)}`,
          })),
        };
      });
      await startUnread(page, 'newer');
      const scroller = page.getByTestId('conversation-scroll-container');
      const count = await page.evaluate<number>('window.requests.length');
      await page.evaluate('window.hold=true');
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.evaluate('window.settle()');
      await scroller.hover();
      await page.mouse.wheel(0, 120);
      await page.waitForFunction(
        (count) => (window as unknown as { requests: string[] }).requests.length > count,
        count,
      );
      // The window reads "the bottom" while the page is in flight.
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.evaluate('window.settle(24)');
      const row = page.locator('[data-source-item="OLDEST11"]');
      const before = await row.evaluate((element) => element.getBoundingClientRect().top);
      // Mounted in every frame: a row that leaves the DOM comes back wherever spacer estimates say.
      // The jump variant moves the viewport in the frame the page lands, before the caller restores
      // its anchor (Chromium does this on some appends). The window then re-reads the reader there,
      // but the row the caller restores to (the message at 42% of the viewport) must stay mounted.
      const tracked = jump
        ? await scroller.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height * 0.42,
            );
            return `[data-msg-id="${hit!.closest<HTMLElement>('[data-msg-id]')!.dataset.msgId}"]`;
          })
        : '[data-source-item="OLDEST11"]';
      await page.evaluate(
        `window.mounted=[];{let n=0,jump=${jump};const tick=()=>{if(jump&&window.loaded().includes('extra0')){jump=false;document.querySelector('[data-testid="conversation-scroll-container"]').scrollTop+=3000}window.mounted.push(!!document.querySelector('${tracked}'));if(++n<40)requestAnimationFrame(tick)};requestAnimationFrame(tick)}`,
      );
      await page.evaluate('window.release()');
      await waitLoaded(page, 'extra159');
      await page.evaluate('window.settle(48)');
      const mounted = await page.evaluate<boolean[]>('window.mounted');
      assert.ok(mounted.every(Boolean), `${tracked} left the DOM: ${mounted.join(',')}`);
      const moved = (await row.evaluate((element) => element.getBoundingClientRect().top)) - before;
      assert.ok(Math.abs(moved) <= 1, `the row being read moved ${moved}px`);
      assert.deepEqual(errors, []);
    },
  );

const inView = (page: Page, selector: string): Promise<boolean> =>
  page.locator(selector).evaluate((element) => {
    const frame = document
      .querySelector('[data-testid="conversation-scroll-container"]')!
      .getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return box.bottom > frame.top && box.top < frame.bottom;
  });

test(
  'windowing keeps a reader who jumps to the bottom there while the last rows mount',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByText('NEWEST 0', { exact: true }).waitFor();
    await page.evaluate('window.settle(24)');
    // An inactive window does not auto-follow, so only the window itself can keep the bottom.
    await page.evaluate(() => {
      document.hasFocus = () => false;
    });
    // The bottom of the estimated layout: the last rows mount there at their real heights.
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate('window.settle(48)');
    const gap = await scroller.evaluate(
      (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
    );
    assert.ok(gap <= 1, `the reader ended ${gap}px above the bottom`);
    assert.ok(await inView(page, '[data-source-item="bulk2999"]'), 'the last row is in view');
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing keeps a reader who scrolls to the top there while the first row mounts taller',
  { skip: !browserAvailable },
  async (t) => {
    // Grown, the first row mounts far taller than the spacer that stood for it, as a long query
    // does before it collapses.
    const before = `document.head.insertAdjacentHTML('beforeend', '<style>.grown [data-window-row]:has([data-source-item="NEWEST0"]) { padding-bottom: 2000px }</style>')`;
    const { page, errors } = await openWindowedTranscript(t, 40, { before });
    const scroller = page.getByTestId('conversation-scroll-container');
    // Walk up from the bottom to where the second row is mounted and the first is not.
    const steps = (await page.evaluate(`(async () => {
      const element = document.querySelector('[data-testid="conversation-scroll-container"]');
      const steps = [];
      for (let top = element.scrollHeight; top > 0; top -= 100) {
        element.scrollTop = top;
        await window.settle(4);
        steps.push(Math.round(element.scrollTop));
        const first = element.querySelector('[data-source-item="NEWEST0"]');
        if (!first && element.querySelector('[data-source-item="NEWEST1"]')) return steps;
      }
      return [...steps, 'none'];
    })()`)) as Array<number | string>;
    assert.equal(typeof steps.at(-1), 'number', `steps ${steps.join(',')}`);
    await page.evaluate(() => document.body.classList.add('grown'));
    // At the top the first row is a spacer, with the mounted second row below it in view.
    assert.ok(
      await scroller.evaluate((element) => {
        element.scrollTop = 0;
        const second = element.querySelector('[data-source-item="NEWEST1"]')!;
        const offset = second.getBoundingClientRect().top - element.getBoundingClientRect().top;
        return offset > 0 && offset < element.clientHeight;
      }),
      'the second row is in view from the top',
    );
    await page.evaluate('window.settle(48)');
    assert.equal(await scroller.evaluate((element) => element.scrollTop), 0);
    assert.ok(await inView(page, '[data-source-item="NEWEST0"]'), 'the first row is in view');
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing keeps the rows in use mounted while the reader scrolls away',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    await page.evaluate('window.streaming(true)');
    await page.evaluate('window.settle(24)');
    await page.locator('[data-source-item="bulk2998"]').focus();
    // Stands in for an open popup menu trigger inside the row.
    await page.locator('[data-source-item="bulk2996"]').evaluate((element) => {
      element.setAttribute('aria-haspopup', 'menu');
      element.setAttribute('aria-expanded', 'true');
    });
    await page.locator('[data-source-item="bulk2997"]').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByText('NEWEST 0', { exact: true }).waitFor();
    await page.evaluate('window.settle(24)');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-source-item')),
      'bulk2998',
      'the focused row keeps focus',
    );
    assert.match(await page.evaluate(() => document.getSelection()!.toString()), /Bulk 2997/);
    assert.equal(await page.locator('[data-source-item="bulk2996"]').count(), 1, 'open menu');
    assert.equal(await page.locator('[data-source-item="bulk2999"]').count(), 1, 'live tail');
    assert.ok((await mountedRows(page)) <= 80);
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing mounts a far find hit before jumping to it',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('transcript-search-bar');
    await search.getByRole('searchbox').fill('NEWEST 3');
    await search.getByText('1/1').waitFor();
    await page.locator('[data-source-item="NEWEST3"]').waitFor();
    await page.evaluate('window.settle(48)');
    assert.ok(await inView(page, '[data-source-item="NEWEST3"]'), 'the hit is in view');
    assert.equal((await windowFrames(page)).length, 1, 'the window settles after a far jump');
    assert.ok((await mountedRows(page)) <= 80);
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing mounts a far located search hit before jumping to it',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    await page.evaluate('window.locatedKind="far"');
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('transcript-search-bar');
    await search.getByRole('searchbox').fill('needle');
    await search.getByRole('combobox').selectOption('session');
    await search.getByText('Archived needle', { exact: true }).click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-source-item') === 'located-input',
    );
    await page.evaluate('window.settle(48)');
    assert.ok(await inView(page, '[data-source-item="located-input"]'), 'the hit is in view');
    assert.ok((await mountedRows(page)) <= 80);
    assert.deepEqual(errors, []);
  },
);

// Skewed: paragraph spacing the estimates do not know about, so every newly measured row moves
// the kind's scale (and the unmounted rows with it) between a scroll and the frame that reads it.
for (const skewed of [false, true]) {
  test(
    `windowing paints rows, not blank spacers, in the frame of a fast scroll${skewed ? ' while estimates rescale' : ''}`,
    { skip: !browserAvailable },
    async (t) => {
      const before = skewed
        ? `document.head.insertAdjacentHTML('beforeend', '<style>[data-window-row] p + p { margin-top: 90px }</style>')`
        : '';
      const { page, errors } = await openWindowedTranscript(t, 3000, { before });
      // The probe listens after the window, so its frame callback runs after the window's own.
      // Every step moves three viewports up, so none may end back at the bottom.
      const { blank, bottom } = (await page.evaluate(`(async () => {
        const element = document.querySelector('[data-testid="conversation-scroll-container"]');
        const covered = () => {
          const frame = element.getBoundingClientRect();
          const middle = frame.top + frame.height / 2;
          return [...element.querySelectorAll('[data-window-row]')].some((row) => {
            const box = row.getBoundingClientRect();
            return box.top <= middle + 12 && box.bottom >= middle - 12;
          });
        };
        const blank = [];
        const bottom = [];
        for (let step = 0; step < 12; step += 1) {
          await new Promise((resolve) => {
            element.addEventListener('scroll', () => requestAnimationFrame(() => {
              const top = Math.round(element.scrollTop);
              if (!covered()) blank.push(top);
              if (element.scrollHeight - top - element.clientHeight < element.clientHeight) bottom.push(top);
              resolve();
            }), { once: true });
            element.scrollTop -= element.clientHeight * 3;
          });
        }
        return { blank, bottom };
      })()`)) as { blank: number[]; bottom: number[] };
      assert.deepEqual(blank, [], 'frames painted with a spacer across the middle of the view');
      assert.deepEqual(bottom, [], 'frames pulled back to the bottom');
      assert.deepEqual(errors, []);
    },
  );
}

test(
  'windowing leaves a held scrollbar where the pointer puts it',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 3000, { scrollbars: true });
    await page.addStyleTag({
      content: '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}',
    });
    await sendHistoryPointer(page, 'pointerdown');
    try {
      const moved = await page.evaluate(`(async () => {
        const element = document.querySelector('[data-testid="conversation-scroll-container"]');
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const moved = [];
        for (let step = 0; step < 12; step += 1) {
          element.scrollTop -= element.clientHeight * 1.5;
          const set = element.scrollTop;
          for (let wait = 0; wait < 3; wait += 1) {
            await frame();
            if (element.scrollTop !== set) {
              moved.push(Math.round(set) + '->' + Math.round(element.scrollTop));
              break;
            }
          }
        }
        return moved;
      })()`);
      assert.deepEqual(moved, [], 'the window moved the scroller under a held thumb');
    } finally {
      await sendHistoryPointer(page, 'pointerup');
    }
    await page.evaluate('window.settle(24)');
    assert.equal((await windowFrames(page)).length, 1, 'the window settles once released');
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing spacers show placeholder lines rather than blank space',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    // The app stylesheet, less the imports the fixture origin cannot serve.
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    await page.addStyleTag({ content: styles.replace(/^@import .*$/gm, '') });
    const spacer = page.locator('[data-window-spacer]').first();
    assert.notEqual(
      await spacer.evaluate((element) => getComputedStyle(element).backgroundImage),
      'none',
    );
    assert.deepEqual(errors, []);
  },
);

for (const change of ['font', 'resize'] as const)
  test(
    `windowing keeps the reader's row in place across a ${change} change`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openWindowedTranscript(t);
      await page.getByTestId('conversation-scroll-container').evaluate((element) => {
        element.scrollTop = element.scrollHeight / 2;
      });
      await page.evaluate('window.settle(24)');
      const reader = `(() => {
        const element = document.querySelector('[data-testid="conversation-scroll-container"]');
        const top = element.getBoundingClientRect().top;
        const row = [...element.querySelectorAll('[data-window-row]')]
          .find((row) => row.getBoundingClientRect().bottom > top);
        return { id: row.dataset.windowRow, offset: row.getBoundingClientRect().top - top };
      })()`;
      const before: { id: string; offset: number } = await page.evaluate(reader);
      if (change === 'font') await page.evaluate('window.fontSize("lg")');
      else await page.setViewportSize({ width: 900, height: 700 });
      await page.evaluate('window.settle(24)');
      const offset = await page.locator(`[data-window-row="${before.id}"]`).evaluate((row) => {
        const scroller = row.closest('[data-testid="conversation-scroll-container"]')!;
        return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      });
      assert.ok(
        Math.abs(offset - before.offset) <= 2,
        `${before.id} moved from ${before.offset} to ${offset}`,
      );
      assert.equal((await windowFrames(page)).length, 1, 'the window settles');
      assert.deepEqual(errors, []);
    },
  );

test(
  'windowing remounts a loaded image at its size, not at zero height',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 3000, {
      before: `window.extraItems.forEach((item,i)=>{if(i%4===0)item.text+='\\n\\n![chart](http://history.test/chart.svg)'})`,
    });
    await page.getByTestId('conversation-scroll-container').evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    await page.waitForFunction(`(() => {
      const images = [...document.querySelectorAll('[data-window-row] img')];
      return images.length > 0 && images.every((image) => image.complete && image.naturalHeight);
    })()`);
    const heights: number[] = await page.evaluate(`(async () => {
      const element = document.querySelector('[data-testid="conversation-scroll-container"]');
      const heights = [];
      const observer = new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof HTMLElement)
              for (const image of node.querySelectorAll('img'))
                heights.push(image.getBoundingClientRect().height);
      });
      observer.observe(element, { childList: true, subtree: true });
      const back = element.scrollTop;
      element.scrollTop = back - element.clientHeight * 6;
      await window.settle(24);
      element.scrollTop = back;
      await window.settle(24);
      observer.disconnect();
      return heights;
    })()`);
    assert.ok(heights.length > 0, 'images remounted');
    assert.ok(
      heights.every((height) => height > 0),
      `remounted image heights ${heights.join(',')}`,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'a growing live tail stays followed at the bottom and a reader above it stays in place',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    const gap = () =>
      scroller.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      );
    const grow = async (step: number) => {
      await page.evaluate(
        `window.live(2000,'Streaming ${step}\\n\\n'+'Growing line.\\n\\n'.repeat(${step * 3}))`,
      );
      await page.getByText(`Streaming ${step}`, { exact: true }).waitFor();
      await page.evaluate('window.settle(8)');
    };
    await page.evaluate(
      'window.singlePage=true;window.primeLive().then(()=>window.streaming(true))',
    );
    for (let step = 1; step <= 4; step += 1) {
      await grow(step);
      assert.ok((await gap()) < 2, `step ${step} follows the tail (gap ${await gap()})`);
    }
    assert.ok((await mountedRows(page)) <= 80);
    // A reader gesture: a scrollTop write while streaming is not the reader leaving the bottom.
    await scroller.hover();
    await page.mouse.wheel(0, -3000);
    await page.evaluate('window.settle(24)');
    const before = await rowInView(page);
    for (let step = 5; step <= 7; step += 1) await grow(step);
    const after = await rowInView(page, before.id);
    assert.ok(
      Math.abs(after.offset - before.offset) <= 2,
      `${before.id} moved from ${before.offset} to ${after.offset}`,
    );
    await page.getByRole('button', { name: 'Jump to bottom', exact: true }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="conversation-scroll-container"]')!;
      return element.scrollHeight - element.scrollTop - element.clientHeight < 2;
    });
    await grow(8);
    assert.ok((await gap()) < 2, 'the tail is followed again after the jump');
    assert.ok(await page.getByText('Streaming 8', { exact: true }).isVisible());
    assert.deepEqual(errors, []);
  },
);

// The app's Ctrl+wheel zoom listens without `passive`, so a wheel (like a key) is handled before
// its scroll lands, a frame later. Here the gesture arrives just after a follow's scrollTop write,
// before that write's scroll event, which every frame of a streaming tail offers.
for (const gesture of ['wheel', 'ArrowUp'] as const)
  test(
    `a reader's ${gesture} leaves a tail that grows every frame`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t);
      const scroller = page.getByTestId('conversation-scroll-container');
      const gap = () =>
        scroller.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        );
      await page.evaluate(
        'window.singlePage=true;window.primeLive().then(()=>window.streaming(true))',
      );
      await page.evaluate(`window.live(20,'Streaming tail\\n\\n')`);
      await page.getByText('Streaming tail', { exact: true }).waitFor();
      await page.evaluate(`(() => {
        let lines = 0;
        const grow = () => {
          if (window.stopGrowing) return;
          lines += 1;
          // One short line per frame stays within the bottom threshold, as a streaming reply does.
          window.live(20, 'Streaming tail\\n\\n' + 'Growing line.  \\n'.repeat(lines));
          requestAnimationFrame(grow);
        };
        requestAnimationFrame(grow);
      })()`);
      await page.evaluate('window.settle(12)');
      assert.ok((await gap()) < 2, `the growing tail is followed (gap ${await gap()})`);
      const event =
        gesture === 'wheel'
          ? "new WheelEvent('wheel',{deltaY:-200,bubbles:true,cancelable:true})"
          : `new KeyboardEvent('keydown',{key:'${gesture}',bubbles:true,cancelable:true})`;
      // The gesture runs right after a follow's write, before that write's scroll event; the
      // gesture's own scroll lands two frames later.
      await page.evaluate(`new Promise((resolve) => {
        const element = document.querySelector('[data-testid="conversation-scroll-container"]');
        const native = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
        Object.defineProperty(element, 'scrollTop', {
          configurable: true,
          get: () => native.get.call(element),
          set: (value) => {
            native.set.call(element, value);
            if (value < element.scrollHeight) return;
            delete element.scrollTop;
            queueMicrotask(() => {
              element.dispatchEvent(${event});
              const top = element.scrollTop;
              requestAnimationFrame(() => requestAnimationFrame(() => {
                element.scrollTop = top - 200;
                resolve();
              }));
            });
          },
        });
      })`);
      await page.evaluate('window.settle(12)');
      const left = await gap();
      await page.evaluate('window.stopGrowing=true');
      assert.ok(left > 150, `the reader left the growing tail (gap ${left})`);
      assert.deepEqual(errors, []);
    },
  );

test(
  'windowing shows rows, not a spacer, when the live view is replaced under a reader',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    const scroller = page.getByTestId('conversation-scroll-container');
    await page.evaluate(`window.primeLive().then(()=>window.live(2000,'Tail'))`);
    await page.getByText('Tail', { exact: true }).waitFor();
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await page.evaluate('window.settle(24)');
    // A resynced view: the same transcript under new item identities.
    await page.evaluate(`window.live(2000,'Tail','resynced-')`);
    await page.locator('[data-source-item^="resynced-"]').first().waitFor();
    await page.evaluate('window.settle(24)');
    const covered = await scroller.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const middle = frame.top + frame.height / 2;
      return [...element.querySelectorAll('[data-window-row]')].some((row) => {
        const box = row.getBoundingClientRect();
        return box.top <= middle && box.bottom >= middle;
      });
    });
    assert.ok(covered, 'a mounted row covers the middle of the view');
    assert.ok(
      (await scroller.evaluate((element) => element.scrollTop)) > 1000,
      'the reader is not sent to the top',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'windowing keeps a 10k-row transcript under 500 mounted rows end to end',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t, 10_000);
    const scroller = page.getByTestId('conversation-scroll-container');
    const counts = [await mountedRows(page)];
    for (const position of [0.5, 0]) {
      await scroller.evaluate((element, ratio) => {
        element.scrollTop = element.scrollHeight * ratio;
      }, position);
      await page.evaluate('window.settle(24)');
      counts.push(await mountedRows(page));
    }
    await page.getByText('NEWEST 0', { exact: true }).waitFor();
    assert.ok(
      counts.every((count) => count > 0 && count <= 500),
      `mounted ${counts.join('/')}`,
    );
    assert.deepEqual(errors, []);
  },
);
