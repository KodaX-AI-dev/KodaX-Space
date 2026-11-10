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
import{restoreNewestSessionHistory,loadOlderSessionHistory,activateSessionHistoryPaging,deactivateSessionHistoryPaging,openLocatedHistory}from'./sessionHistoryPaging.ts';
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
window.requests.push(input.cursor??input.around?.searchItemId??'newest');
if(window.holdNewest&&!input.cursor){window.newestHeld=true;await new Promise((resolve,reject)=>window.releaseNewest=()=>reject(new Error('Obsolete newest read failed')));}
if(window.hold&&input.cursor)await new Promise((resolve,reject)=>window.release=()=>window.fail?reject(new Error('Late obsolete read failed')):resolve());
const boundary=input.cursor??input.around?.searchItemId;
const index=boundary==='oldest'?2:boundary==='middle'?1:0;
const label=['NEWEST','MIDDLE','OLDEST'][index];
const tool={id:'tool-'+label,type:'tool',text:'concealed tool result',historyBoundary:{entryId:'found',sourceRevision:'s'},tool:{name:'read',callId:'call-'+label,status:'success',resultRecorded:true}};
return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],productItems:(window.samePageItems=[...Array.from({length:12},(_,i)=>({id:label+i,type:'assistant',historyBoundary:{entryId:'found',sourceRevision:'s'},text:label+' '+i+'\\n\\n'+('Readable report paragraph.\\n\\n').repeat(8)})),tool,{id:'info-'+label,type:'info',text:'Informational report'},...(index===0?window.extraItems??[]:[])]),
conversation:window.historyStatus?{status:window.historyStatus}:undefined,
page:{outcome:'ready',revision:'r',sourceRevision:'s',hasMore:!window.singlePage&&index<2,hasNewer:index>0,locatedBoundaryId:'found',windowMode:'replace',...(index>0?{newerCursor:index===2?'middle':'newest'}:{}),...(!window.singlePage&&index<2?{nextCursor:index===0?'middle':'oldest'}:{})}}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'History',surface:'code',projectRoot:'/project'}]});
function App(){const id=useAppStore(state=>state.currentSessionId);return <ConversationStreamV2 key={id}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
window.start=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');await loadOlderSessionHistory('s');};
window.locate=async(id)=>{await restoreNewestSessionHistory('s','code');await openLocatedHistory('s',{searchItemId:id},new AbortController().signal);};
window.middle=()=>window.locate('middle');
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
  'saved history boundary explains single-page navigation and preserves the return position',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    page.setDefaultTimeout(3500);
    await page.evaluate(
      'window.singlePage=true;window.historyStatus="resolved";window.primeLive()',
    );
    const scroller = page.getByTestId('conversation-scroll-container');
    await page.getByText('Live 0', { exact: true }).waitFor();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const browse = page.getByRole('button', { name: 'Browse history messages', exact: true });
    await browse.waitFor({ timeout: 3000 });
    await page.getByText('Opens at the most recent saved messages.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Start of this conversation', { exact: true }).count(), 0);
    await browse.click();
    await page.getByText('NEWEST 0', { exact: true }).waitFor();
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

test(
  'earlier-history boundary keeps readable messages during failure and offers a working retry',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    page.setDefaultTimeout(3500);
    await page.evaluate('window.historyStatus="resolved";window.middle()');
    await page.getByText('MIDDLE 0', { exact: true }).waitFor();
    await page.evaluate('window.settle(48);window.hold=true');
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await page.waitForFunction('window.requests.at(-1)==="oldest"');
    await page.getByTestId('history-paging-status').waitFor();
    await page.evaluate('window.fail=true;window.release()');
    const error = page.getByTestId('history-paging-error');
    await error.waitFor();
    assert.equal(await page.getByText('MIDDLE 0', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Start of this conversation', { exact: true }).count(), 0);
    await page.evaluate('window.fail=false;window.hold=false');
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('OLDEST 0', { exact: true }).waitFor();
    await page.getByText('Start of this conversation', { exact: true }).waitFor();
    assert.equal(await page.getByText('MIDDLE 0', { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  },
);

test(
  'partial and unverified saved histories never claim to be the conversation start',
  { skip: !browserAvailable },
  async (t) => {
    for (const status of ['partial', 'ambiguous', undefined]) {
      const { page, errors } = await openHistoryFixture(t);
      page.setDefaultTimeout(3500);
      await page.evaluate((value) => {
        Object.assign(window, { singlePage: true, historyStatus: value });
      }, status);
      await page.evaluate('window.primeLive()');
      await page.getByRole('button', { name: 'Browse history messages', exact: true }).click();
      await page.getByText('NEWEST 0', { exact: true }).waitFor();
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
    await page.evaluate('window.settle(48)');
    assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    assert.equal(await stream.getByText('OLDEST 11', { exact: true }).count(), 1);
    assert.equal(await stream.getByText('NEWEST 11', { exact: true }).count(), 1);
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

async function startUnread(page: Page, direction: HistoryDirection): Promise<void> {
  await page.evaluate(
    (id) => (window as unknown as { locate(id: string): Promise<void> }).locate(id),
    direction === 'older' ? 'newest' : 'oldest',
  );
  await page
    .getByText(direction === 'older' ? 'NEWEST 11' : 'OLDEST 11', { exact: true })
    .waitFor();
  await page.evaluate('window.settle(48)');
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
      scale: travel / range,
    };
  });
}

for (const input of ['keyboard', 'touch', 'scrollbar'] as const) {
  test(
    `${input} reads unread adjacent pages and keeps every already-read page`,
    { skip: !browserAvailable },
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
        await page.getByText('MIDDLE 11', { exact: true }).waitFor();
        await page
          .getByText(direction === 'older' ? 'NEWEST 11' : 'OLDEST 11', { exact: true })
          .waitFor();
        await page.evaluate('window.settle(48)');
        if (input === 'scrollbar') await sendHistoryPointer(page, 'pointerup');
        // Reversing over already-read content must not refetch or change source.
        const requests = await page.evaluate('window.requests');
        const ids = await page
          .locator('[data-source-item]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-source-item')));
        await dispatchHistoryGesture(page, input, direction === 'older' ? 'newer' : 'older');
        await page.evaluate('window.settle(48)');
        if (input === 'scrollbar') await sendHistoryPointer(page, 'pointercancel');
        assert.deepEqual(await page.evaluate('window.requests'), requests);
        assert.deepEqual(
          await page
            .locator('[data-source-item]')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-source-item'))),
          ids,
        );
      }
      assert.deepEqual(errors, []);
    },
  );
}

for (const direction of ['older', 'newer'] as const)
  for (const restorationFrames of [48, 8])
    test(
      `a held native scrollbar ${direction} retains pages after ${restorationFrames} frames`,
      { skip: !browserAvailable },
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
          await page
            .getByText(direction === 'older' ? 'OLDEST 11' : 'NEWEST 11', { exact: true })
            .waitFor();
          await page.evaluate('window.settle(48)');
          assert.deepEqual((await page.evaluate<string[]>('window.requests')).slice(count), [
            'middle',
            direction === 'older' ? 'oldest' : 'newest',
          ]);
          for (const label of ['OLDEST', 'MIDDLE', 'NEWEST'])
            assert.equal(await page.getByText(label + ' 11', { exact: true }).count(), 1);
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

for (const phase of ['stable', 'restoring'] as const)
  test(
    `holding a scrollbar during ${phase} does not turn programmatic search scrolling into paging`,
    { skip: !browserAvailable },
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
  test(
    `a short history viewport confirms its first native ${direction} boundary`,
    { skip: !browserAvailable },
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
test(
  'prepending retains the visible row and its offset across a delayed layout change',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    await page.evaluate('window.middle()');
    const scroller = page.getByTestId('conversation-scroll-container');
    await page.getByText('MIDDLE 0', { exact: true }).waitFor();
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
    await page.locator('[data-source-item="OLDEST0"]').evaluate((element) => {
      (element as HTMLElement).style.paddingTop = '100px';
    });
    await page.evaluate('window.settle(48)');
    assert.ok(
      Math.abs((await row.evaluate((element) => element.getBoundingClientRect().top)) - before) <=
        2,
    );
    assert.equal(await page.getByText('MIDDLE 11', { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  },
);

test(
  'the first native edge is not determined by an earlier opposite relayout offset',
  { skip: !browserAvailable },
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

test(
  'appending a newer page from a located window keeps the visible row at the bottom edge',
  { skip: !browserAvailable },
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
    await page.getByText('NEWEST 11', { exact: true }).waitFor();
    await page.evaluate('window.settle(48)');
    const after = await row.evaluate((element) => element.getBoundingClientRect().top);
    assert.ok(Math.abs(after - before) <= 2, `visible row drifted ${after - before}px`);
    assert.deepEqual(errors, []);
  },
);

test(
  'find counts collapsed thinking and opens it on jump',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openHistoryFixture(t);
    await page.evaluate(
      `window.extraItems=[{id:'pondered',type:'thinking',text:'Pondered the hidden route',historyBoundary:{entryId:'found',sourceRevision:'s'}}];window.start()`,
    );
    const stream = page.getByTestId('conversation-stream');
    await stream.getByText('OLDEST 11', { exact: true }).waitFor();
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
  },
);
