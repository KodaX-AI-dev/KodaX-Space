import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';import{useAppStore}from'../store/appStore.ts';
import{restoreNewestSessionHistory,loadOlderSessionHistory,activateSessionHistoryPaging,deactivateSessionHistoryPaging}from'./sessionHistoryPaging.ts';
import{useToastStore}from'../store/toastStore.ts';
import{replaceProductSessionView}from'../store/productSessionView.ts';
window.requests=[];window.hold=false;window.fail=false;window.release=()=>{};window.toasts=()=>useToastStore.getState().toasts;
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
if(channel==='session.resolveHistoryTurn'){window.selectedTurn=input.selector;return{ok:true,data:{status:'unavailable',reason:'no_turns'}}}
if(channel==='session.productSearch')return{ok:true,data:{revision:'r',hits:[{itemId:'unique-hit',entryIndex:6,role:'user',snippet:'Archived needle'}]}};
if(channel==='session.productItem')return{ok:true,data:{id:input.itemId,text:'Archived needle detail',offset:0,totalLength:22}};
if(channel!=='session.history')return{ok:false,error:{message:'Unexpected '+channel}};
if(input.around?.searchItemId==='unique-hit')return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],
productItems:window.locatedKind==='same-page'?window.samePageItems:window.locatedKind==='mixed'
?[{id:'located-thinking',type:'thinking',text:'Located thinking detail',historyBoundary:{entryId:'found',sourceRevision:'s'}},
{id:'located-answer',type:'assistant',text:'Located answer',historyBoundary:{entryId:'found',sourceRevision:'s'}},
{id:'located-tool',type:'tool',text:'Located tool detail',tool:{name:'read',callId:'located-call',status:'success',resultRecorded:true},historyBoundary:{entryId:'found',sourceRevision:'s'}},
{id:'located-tool-second',type:'tool',text:'Second located tool detail',tool:{name:'read',callId:'second-call',status:'success',resultRecorded:true},historyBoundary:{entryId:'found',sourceRevision:'s'}}]
:[window.locatedKind==='tool'
?{id:'located-tool',type:'tool',text:'Located tool detail',tool:{name:'read',callId:'located-call',inputText:'{"path":"needle.txt"}',status:'success',resultRecorded:true},historyBoundary:{entryId:'found',sourceRevision:'s'}}
:window.locatedKind==='thinking'
?{id:'located-thinking',type:'thinking',text:'Located thinking detail',historyBoundary:{entryId:'found',sourceRevision:'s'}}
:{id:'located-input',type:'user',text:'Located record',historyBoundary:{entryId:'found',sourceRevision:'s'}},
...(window.locatedKind==='thinking'?[{id:'following-tool',type:'tool',text:'Following result',tool:{name:'read',callId:'following-call',status:'success',resultRecorded:true}}]:[])],
page:{outcome:'ready',revision:'r',sourceRevision:'s',locatedBoundaryId:'found',hasMore:false,hasNewer:true,windowMode:'replace'}}};
window.requests.push(input.cursor??'newest');
if(window.holdNewest&&!input.cursor){window.newestHeld=true;await new Promise((resolve,reject)=>window.releaseNewest=()=>reject(new Error('Obsolete newest read failed')));}
if(window.hold&&input.cursor)await new Promise((resolve,reject)=>window.release=()=>window.fail?reject(new Error('Late obsolete read failed')):resolve());
const index=input.cursor==='oldest'?2:input.cursor==='middle'?1:0;
const label=['NEWEST','MIDDLE','OLDEST'][index];
const tool={id:'tool-'+label,type:'tool',text:'concealed tool result',historyBoundary:{entryId:'found',sourceRevision:'s'},tool:{name:'read',callId:'r',status:'success',resultRecorded:true}};
return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],productItems:(window.samePageItems=[...Array.from({length:12},(_,i)=>({id:label+i,type:'assistant',text:label+' '+i+'\\n\\n'+('Readable report paragraph.\\n\\n').repeat(8)})),tool,{id:'info-'+label,type:'info',text:'Informational report'}]),
page:{outcome:'ready',revision:'r',sourceRevision:'s',hasMore:index<2,hasNewer:index>0,windowMode:'replace',...(index<2?{nextCursor:index===0?'middle':'oldest'}:{})}}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'History',surface:'code',projectRoot:'/project'}]});
function App(){const id=useAppStore(state=>state.currentSessionId);return <ConversationStreamV2 key={id}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
window.start=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');await loadOlderSessionHistory('s');};
window.middle=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');};
window.settle=(count=12)=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<count?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
window.select=id=>{deactivateSessionHistoryPaging(useAppStore.getState().currentSessionId);useAppStore.setState({currentSessionId:id});activateSessionHistoryPaging(id)};
window.detail=mode=>useAppStore.getState().setTranscriptView(mode);
window.primeLive=async()=>{
  window.holdNewest=false;
  await restoreNewestSessionHistory('s','code');
  replaceProductSessionView({sessionId:'s',runtimeId:'rt',revision:1,
    items:Array.from({length:20},(_,i)=>({id:'view-'+i,type:'assistant',outputId:'output-'+i,text:'Live '+i+'\\n\\n'+('Current paragraph.\\n\\n').repeat(6)}))});
};
`;

const browserAvailable = existsSync(chromium.executablePath());
const bundled = browserAvailable
  ? await build({
      stdin: {
        contents: fixture,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      loader: { '.css': 'empty' },
      plugins: [
        {
          name: 'unused-worker',
          setup(builder) {
            builder.onResolve({ filter: /\?worker$/ }, (args) => ({
              path: args.path,
              namespace: 'unused-worker',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'unused-worker' }, () => ({
              contents: 'export default class {}',
              loader: 'js',
            }));
          },
        },
      ],
    })
  : undefined;

async function openHistoryFixture(t: TestContext, showScrollbars = false) {
  const browser = await chromium.launch({
    headless: true,
    ...(showScrollbars ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://history.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<style>[data-testid="conversation-scroll-container"]{height:600px;overflow:auto}</style><div id="root"></div>',
    }),
  );
  await page.goto('http://history.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundled!.outputFiles[0].text });
  return { page, errors };
}

test(
  'one bottom control returns from frozen history to the real latest message and downward gestures visit adjacent pages',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate('window.start()');
    const stream = page.getByTestId('conversation-stream');
    const scroller = page.getByTestId('conversation-scroll-container');
    await stream.getByText('OLDEST 11', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('transcript-search-bar');
    await search.getByRole('searchbox').fill('concealed tool result');
    await search.getByText('0/0').waitFor();
    await page.evaluate('window.detail("verbose")');
    await stream.getByTestId('tool-call-card').getByRole('button').first().click();
    await search.getByText('1/1').waitFor();
    // Slow rendering must not turn a programmatic search jump into history paging.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });
    await search.getByRole('searchbox').fill('no current-page match');
    await search.getByText('0/0').waitFor();
    await scroller.hover();
    await page.mouse.wheel(0, -12_000);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="conversation-scroll-container"]')!.scrollTop === 0,
    );
    await page.evaluate('window.settle()');
    await search.getByRole('searchbox').fill('concealed tool result');
    await search.getByText('1/1').waitFor();
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
    await search.getByText('Archived needle detail').waitFor();
    assert.equal(await search.getByText('0/0').count(), 0);
    await search.getByRole('button', { name: 'View in conversation' }).click();
    await stream.getByText('Located record', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await stream.getByText('OLDEST 11', { exact: true }).waitFor();
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
      await search.getByRole('button', { name: 'View in conversation' }).click();
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
    await stream.getByText('MIDDLE 0', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate('window.requests'), [
      'newest',
      'middle',
      'oldest',
      'middle',
    ]);
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="conversation-scroll-container"]')!;
      return el.scrollTop < el.clientHeight;
    });
    assert.ok(
      await scroller.evaluate((element) => element.scrollTop < element.clientHeight),
      'a newer page opens at its readable beginning',
    );
    await page.evaluate('window.settle()');
    await scroller.evaluate((element) => {
      element.scrollTop = 100;
    });
    await page.evaluate('window.settle()');
    assert.equal(
      await stream.getByText('MIDDLE 0', { exact: true }).count(),
      1,
      'dragging the scrollbar down near the page top must not turn back',
    );
    await page.mouse.wheel(0, 100);
    await page.evaluate('window.settle()');
    assert.equal(
      await stream.getByText('MIDDLE 0', { exact: true }).count(),
      1,
      'continuing downward near the new page top must not turn back',
    );
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
    await stream.getByText('MIDDLE 0', { exact: true }).waitFor();
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
    assert.equal(
      await stream.getByText('OLDEST 0', { exact: true }).count(),
      0,
      'late older replies cannot replace the selected newest window',
    );
    assert.deepEqual(
      await page.evaluate('window.toasts()'),
      [],
      'obsolete navigation failures cannot raise notices',
    );
    await page.evaluate('window.hold=false;window.middle()');
    await stream.getByText('MIDDLE 0', { exact: true }).waitFor();
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
    const saved = page.getByRole('button', { name: 'View saved conversation' });
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
    await search.getByRole('button', { name: 'View in conversation' }).click();
    await stream.getByText('concealed tool result', { exact: true }).waitFor();
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
type HistoryDirection = 'newer' | 'older';

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

async function sendHistoryPointer(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  assert.ok(
    await scroller.evaluate(
      (element) => element instanceof HTMLElement && element.offsetWidth > element.clientWidth,
    ),
    'Scrollbar fixture needs a visible track',
  );
  const rect = await scroller.boundingBox();
  assert.ok(rect);
  await scroller.dispatchEvent(type, {
    pointerId: 7,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: rect.x + rect.width - 1,
    clientY: rect.y + 100,
  });
}

async function dispatchHistoryGesture(
  page: Page,
  input: HistoryGesture,
  direction: HistoryDirection,
): Promise<void> {
  const stream = page.getByTestId('conversation-stream');
  if (input === 'keyboard') {
    await stream.getByTestId('process-receipt-tool_cluster').getByRole('button').first().focus();
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

async function expectHistoryGesturePage(
  page: Page,
  t: TestContext,
  label: string,
  direction: HistoryDirection,
): Promise<void> {
  t.diagnostic(`Checking ${label}/${direction}`);
  try {
    await page
      .getByTestId('conversation-stream')
      .getByText(direction === 'newer' ? 'MIDDLE 0' : 'OLDEST 11', { exact: true })
      .waitFor();
  } catch (error) {
    t.diagnostic(
      JSON.stringify({
        label,
        direction,
        requests: await page.evaluate('window.requests'),
        viewport: await page.getByTestId('conversation-scroll-container').evaluate((element) => ({
          top: element.scrollTop,
          height: element.scrollHeight,
          client: element.clientHeight,
        })),
      }),
    );
    throw error;
  }
  assert.equal(
    await page.evaluate('window.requests.at(-1)'),
    direction === 'newer' ? 'middle' : 'oldest',
  );
}

async function verifyIndependentHistoryGestures(
  page: Page,
  t: TestContext,
  input: HistoryGesture,
): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  await page.evaluate('window.start()');
  await page.getByTestId('conversation-stream').getByText('OLDEST 11', { exact: true }).waitFor();
  for (const direction of ['newer', 'older'] as const) {
    // Finish the previous page's bounded anchor correction before an independent gesture.
    await page.evaluate('window.settle(36)');
    await scroller.evaluate((element, direction) => {
      element.scrollTop =
        direction === 'newer' ? element.scrollHeight - element.clientHeight - 100 : 100;
    }, direction);
    await page.evaluate('window.settle()');
    await dispatchHistoryGesture(page, input, direction);
    await expectHistoryGesturePage(page, t, input, direction);
    if (input === 'scrollbar') await sendHistoryPointer(page, 'pointerup');
  }
}

async function verifyTouchReversals(page: Page, t: TestContext): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  for (const direction of ['newer', 'older'] as const) {
    await page.evaluate('window.settle(36)');
    await sendHistoryTouch(page, 'touchstart', 300);
    await sendHistoryTouch(page, 'touchmove', direction === 'newer' ? 500 : 100);
    await scroller.evaluate((element, direction) => {
      element.scrollTop =
        direction === 'newer' ? element.scrollHeight - element.clientHeight - 100 : 100;
    }, direction);
    await page.evaluate('window.settle()');
    await sendHistoryTouch(page, 'touchmove', direction === 'newer' ? 400 : 200);
    await scroller.evaluate((element, direction) => {
      element.scrollTop = direction === 'newer' ? element.scrollHeight : 0;
    }, direction);
    await expectHistoryGesturePage(page, t, 'touch reversal', direction);
  }
}

async function finishHistoryScrollbarDrag(
  page: Page,
  release: 'pointerup' | 'pointercancel',
): Promise<void> {
  await page.getByTestId('conversation-scroll-container').evaluate((element, release) => {
    const rect = element.getBoundingClientRect();
    const init = { pointerId: 7, clientX: rect.right - 1, clientY: rect.top + 100, bubbles: true };
    element.dispatchEvent(new PointerEvent('pointermove', { ...init, buttons: 1 }));
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new PointerEvent(release, { ...init, buttons: 0 }));
  }, release);
}

async function verifyContinuousScrollbarDrag(
  page: Page,
  t: TestContext,
  release: 'pointerup' | 'pointercancel',
): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  await page.evaluate('window.start();');
  await page.evaluate('window.settle(48)');
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 100;
  });
  await sendHistoryPointer(page, 'pointerdown');
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectHistoryGesturePage(page, t, 'continuous scrollbar', 'newer');
  await page.evaluate('window.settle(48)');
  await finishHistoryScrollbarDrag(page, release);
  if (release === 'pointerup') {
    await page.getByTestId('conversation-stream').getByText('NEWEST 11', { exact: true }).waitFor();
  } else {
    await page.evaluate('window.settle()');
    assert.equal(
      await page.evaluate('window.requests.at(-1)'),
      'middle',
      'cancelled drag cannot start a later page read',
    );
  }
  await page.evaluate('window.settle(48)');
  const requests = await page.evaluate('window.requests');
  await sendHistoryPointer(page, 'pointermove');
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.evaluate('window.settle()');
  assert.deepEqual(
    await page.evaluate('window.requests'),
    requests,
    'a released pointer cannot continue scrollbar paging',
  );
}

for (const input of ['keyboard', 'touch', 'scrollbar'] as const) {
  test(
    `${input} gestures browse history in both directions after programmatic page restoration`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, input === 'scrollbar');
      if (input === 'scrollbar')
        await page.addStyleTag({
          content: '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}',
        });
      await verifyIndependentHistoryGestures(page, t, input);
      if (input === 'touch') await verifyTouchReversals(page, t);
      if (input === 'scrollbar') {
        await verifyContinuousScrollbarDrag(page, t, 'pointerup');
        await verifyContinuousScrollbarDrag(page, t, 'pointercancel');
      }
      assert.deepEqual(errors, []);
    },
  );
}

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
    };
  });
}

async function prepareNativeHistoryScrollbar(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}[data-testid="conversation-scroll-container"]::-webkit-scrollbar-button{display:none}',
  });
  await page.evaluate('window.start()');
  await page.getByText('OLDEST 11', { exact: true }).waitFor();
  await page.getByTestId('conversation-scroll-container').evaluate((element) => {
    element.setAttribute('data-held-native-moves', '0');
    element.addEventListener('pointermove', (event) => {
      if ((event as PointerEvent).buttons === 1)
        element.setAttribute(
          'data-held-native-moves',
          String(Number(element.getAttribute('data-held-native-moves')) + 1),
        );
    });
  });
}

async function dragNativeHistoryPages(
  page: Page,
  direction: HistoryDirection,
  restorationFrames: number,
): Promise<void> {
  const scroller = page.getByTestId('conversation-scroll-container');
  await page.evaluate('window.settle(48)');
  await scroller.evaluate((element, direction) => {
    element.scrollTop =
      direction === 'newer' ? element.scrollHeight - element.clientHeight - 100 : 100;
  }, direction);
  await page.evaluate('window.settle()');
  const geometry = await nativeHistoryScrollbarGeometry(page);
  const edge = direction === 'newer' ? geometry.bottom : geometry.top;
  const sign = direction === 'newer' ? 1 : -1;
  const requestCount = await page.evaluate<number>('window.requests.length');
  await page.mouse.move(geometry.x, geometry.y);
  await page.mouse.down();
  try {
    await page.mouse.move(geometry.x, edge, { steps: 6 });
    await page.waitForFunction(
      (offset) =>
        (window as unknown as { requests: string[] }).requests.slice(offset).includes('middle'),
      requestCount,
    );
    await page.evaluate(`window.settle(${restorationFrames})`);
    const finalCursor = direction === 'newer' ? 'newest' : 'oldest';
    if ((await page.evaluate('window.requests.at(-1)')) !== finalCursor) {
      await page.mouse.move(geometry.x, edge - sign * 15, { steps: 4 });
      await page.mouse.move(geometry.x, edge + sign * 15, { steps: 4 });
    }
    await page
      .getByText(direction === 'newer' ? 'NEWEST 11' : 'OLDEST 11', { exact: true })
      .waitFor();
  } finally {
    await page.mouse.up();
  }
}

for (const restorationFrames of [48, 8])
  test(
    `a held native scrollbar continues across history pages after ${restorationFrames} frames with real mouse input`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, true);
      await prepareNativeHistoryScrollbar(page);
      await dragNativeHistoryPages(page, 'newer', restorationFrames);
      await dragNativeHistoryPages(page, 'older', restorationFrames);
      assert.deepEqual(await page.evaluate('window.requests'), [
        'newest',
        'middle',
        'oldest',
        'middle',
        'newest',
        'middle',
        'oldest',
      ]);
      t.diagnostic(
        `Native held pointermove count: ${await page.getByTestId('conversation-scroll-container').getAttribute('data-held-native-moves')}`,
      );
      assert.deepEqual(errors, []);
    },
  );

for (const phase of ['stable', 'restoring'] as const)
  test(
    `holding a scrollbar during ${phase} does not turn programmatic search scrolling into paging`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, true);
      await page.addStyleTag({
        content: '[data-testid="conversation-scroll-container"]::-webkit-scrollbar{width:12px}',
      });
      await page.evaluate('window.start();');
      await page.getByText('OLDEST 11', { exact: true }).waitFor();
      await page.evaluate('window.settle(48)');
      await page.keyboard.press('Control+f');
      const search = page.getByTestId('transcript-search-bar');
      if (phase === 'stable') {
        await page.evaluate('window.detail("verbose")');
        await page.getByTestId('tool-call-card').getByRole('button').first().click();
      }
      await search.getByRole('searchbox').fill('no current-page match');
      await search.getByText('0/0').waitFor();
      await page.getByTestId('conversation-scroll-container').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.evaluate('window.settle(48)');
      await sendHistoryPointer(page, 'pointerdown');
      if (phase === 'stable') {
        await page.getByTestId('conversation-scroll-container').evaluate((element) => {
          element.scrollTop = 200;
        });
        await page.evaluate('window.settle()');
      }
      if (phase === 'restoring') {
        await page.getByTestId('conversation-scroll-container').evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.getByText('MIDDLE 0').waitFor();
        await page.evaluate('window.settle(8)');
      }
      const requests = await page.evaluate('window.requests');
      await search
        .getByRole('searchbox')
        .fill(phase === 'restoring' ? 'MIDDLE 11' : 'concealed tool result');
      await search.getByText('1/1').waitFor();
      await page.evaluate('window.settle(48)');
      assert.deepEqual(await page.evaluate('window.requests'), requests);
      await sendHistoryPointer(page, 'pointerup');
      assert.deepEqual(errors, []);
    },
  );

async function reverseHeldNativeScrollbar(
  page: Page,
  geometry: { x: number; top: number; bottom: number },
  steps: number,
): Promise<void> {
  await page.mouse.move(geometry.x, geometry.bottom - 30, { steps: 4 });
  await page.mouse.move(geometry.x, geometry.bottom + 15, { steps: 4 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="conversation-scroll-container"]')!;
    return el.scrollHeight - el.clientHeight - el.scrollTop < 2;
  });
  await page.evaluate('window.settle(48)');
  await page.mouse.move(geometry.x, geometry.top - 15, { steps });
  await page.evaluate('window.settle(48)');
  if ((await page.evaluate('window.requests.at(-1)')) !== 'oldest') {
    await page.mouse.move(geometry.x, geometry.top + 15, { steps: 4 });
    await page.mouse.move(geometry.x, geometry.top - 15, { steps: 4 });
  }
  await page.getByText('OLDEST 11', { exact: true }).waitFor();
}

for (const reverseSteps of [1, 12])
  test(
    `a held native scrollbar can reverse paging direction after stable restoration in ${reverseSteps} steps`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, errors } = await openHistoryFixture(t, true);
      await prepareNativeHistoryScrollbar(page);
      const scroller = page.getByTestId('conversation-scroll-container');
      await page.evaluate('window.settle(48)');
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight - 100;
      });
      await page.evaluate('window.settle()');
      const geometry = await nativeHistoryScrollbarGeometry(page);
      await page.mouse.move(geometry.x, geometry.y);
      await page.mouse.down();
      try {
        await page.mouse.move(geometry.x, geometry.bottom + 15, { steps: 6 });
        await page.evaluate('window.settle(48)');
        if ((await page.evaluate('window.requests.at(-1)')) !== 'newest') {
          await page.mouse.move(geometry.x, geometry.bottom - 15, { steps: 4 });
          await page.mouse.move(geometry.x, geometry.bottom + 15, { steps: 4 });
        }
        await page.getByText('NEWEST 11', { exact: true }).waitFor();
        await page.evaluate('window.settle(48)');
        await reverseHeldNativeScrollbar(page, geometry, reverseSteps);
      } finally {
        await page.mouse.up();
      }
      assert.deepEqual(await page.evaluate('window.requests'), [
        'newest',
        'middle',
        'oldest',
        'middle',
        'newest',
        'middle',
        'oldest',
      ]);
      assert.deepEqual(errors, []);
    },
  );
