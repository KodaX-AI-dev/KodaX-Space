import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';import{useAppStore}from'../store/appStore.ts';
import{restoreNewestSessionHistory,loadOlderSessionHistory,activateSessionHistoryPaging,deactivateSessionHistoryPaging,openLocatedHistory}from'./sessionHistoryPaging.ts';
import{useToastStore}from'../store/toastStore.ts';
import{replaceProductSessionView,productTranscriptSnapshot}from'../store/productSessionView.ts';
window.loaded=()=>productTranscriptSnapshot(useAppStore.getState().currentSessionId)?.items.map(item=>item.id)??[];
window.requests=[];window.hold=false;window.fail=false;window.release=()=>{};window.toasts=()=>useToastStore.getState().toasts;
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
if(channel==='session.resolveHistoryTurn'){window.selectedTurn=input.selector;return{ok:true,data:{status:'unavailable',reason:'no_turns'}}}
if(channel==='session.productSearch')return{ok:true,data:{revision:'r',hits:[{itemId:'unique-hit',entryIndex:6,role:'user',snippet:'Archived needle'}]}};
if(channel==='session.productItem')return{ok:true,data:{id:input.itemId,text:'Archived needle detail',offset:0,totalLength:22}};
if(channel!=='session.history')return{ok:false,error:{message:'Unexpected '+channel}};
if(input.around?.searchItemId==='unique-hit')return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],
productItems:window.locatedKind==='same-page'?window.samePageItems:window.locatedKind==='far'
?[...window.extraItems.slice(0,1500),{id:'located-input',type:'user',text:'Located record',historyBoundary:{entryId:'found',sourceRevision:'s'}},...window.extraItems.slice(1500)].map((item,i)=>item.type==='user'?item:{...item,historyBoundary:undefined})
:window.locatedKind==='mixed'
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
return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],productItems:(window.samePageItems=[...Array.from({length:12},(_,i)=>({id:label+i,type:'assistant',historyBoundary:{entryId:'found',sourceRevision:'s'},text:label+' '+i+'\\n\\n'+('Readable report paragraph.\\n\\n').repeat(8)})),tool,{id:'info-'+label,type:'info',text:'Informational report'},...(index===0?window.extraItems??[]:[]),...(window.pageExtra?.[label]??[])]),
conversation:window.historyStatus?{status:window.historyStatus}:undefined,
page:{outcome:'ready',revision:window.revision??'r',sourceRevision:'s',hasMore:!window.singlePage&&index<2,hasNewer:index>0,locatedBoundaryId:'found',windowMode:'replace',...(index>0?{newerCursor:index===2?'middle':'newest'}:{}),...(!window.singlePage&&index<2?{nextCursor:index===0?'middle':'oldest'}:{})}}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'History',surface:'code',projectRoot:'/project'}]});
function App(){const id=useAppStore(state=>state.currentSessionId);return <ConversationStreamV2 key={id}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
window.start=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');await loadOlderSessionHistory('s');};
window.locate=async(id)=>{await restoreNewestSessionHistory('s','code');await openLocatedHistory('s',{searchItemId:id},new AbortController().signal);};
window.middle=()=>window.locate('middle');
window.settle=(count=12)=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<count?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
window.select=id=>{deactivateSessionHistoryPaging(useAppStore.getState().currentSessionId);useAppStore.setState({currentSessionId:id});activateSessionHistoryPaging(id)};
window.streaming=on=>useAppStore.setState({pendingSendBySession:on?{s:true}:{}});
window.detail=mode=>useAppStore.getState().setTranscriptView(mode);
window.fontSize=size=>useAppStore.getState().setTranscriptFontSize(size);
window.live=(count,tail,prefix='view-')=>replaceProductSessionView({sessionId:'s',runtimeId:'rt',revision:window.liveRevision=(window.liveRevision??1)+1,
items:Array.from({length:count},(_,i)=>({id:prefix+i,type:'assistant',outputId:'output-'+i,text:i===count-1?tail:'Live '+i+'\\n\\n'+('Current paragraph.\\n\\n').repeat(i%5)}))});
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

function historyTest(name: string, run: (t: TestContext) => Promise<void>): void {
  test(name, { skip: !browserAvailable }, run);
}

// Loaded is not mounted: a loaded row far from the reader is a spacer.
const loadedIds = (page: Page): Promise<string[]> => page.evaluate<string[]>('window.loaded()');
const isLoaded = async (page: Page, id: string): Promise<boolean> =>
  (await loadedIds(page)).includes(id);
async function waitLoaded(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (target) => (window as unknown as { loaded(): string[] }).loaded().includes(target),
    id,
  );
}

/** The first message row crossing the viewport, and its distance below the viewport top. */
const rowInView = (page: Page, id?: string): Promise<{ id: string; offset: number }> =>
  page.getByTestId('conversation-scroll-container').evaluate((scroller, target) => {
    const frame = scroller.getBoundingClientRect();
    const row = [...scroller.querySelectorAll<HTMLElement>('[data-msg-id]')].find((element) =>
      target === undefined
        ? element.getBoundingClientRect().bottom > frame.top + 1
        : element.dataset.msgId === target,
    );
    if (!row) throw new Error(`no row ${target ?? 'in view'}`);
    return { id: row.dataset.msgId!, offset: row.getBoundingClientRect().top - frame.top };
  }, id);

async function openHistoryFixture(t: TestContext, showScrollbars = false) {
  const browser = await chromium.launch({
    headless: true,
    ...(showScrollbars ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://history.test/chart.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#888"/></svg>',
    }),
  );
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

test(
  'windowing paints rows, not blank spacers, in the frame of a fast scroll',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openWindowedTranscript(t);
    // The probe listens after the window, so its frame callback runs after the window's own.
    const blank = await page.evaluate(`(async () => {
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
      for (let step = 0; step < 12; step += 1) {
        await new Promise((resolve) => {
          element.addEventListener('scroll', () => requestAnimationFrame(() => {
            if (!covered()) blank.push(Math.round(element.scrollTop));
            resolve();
          }), { once: true });
          element.scrollTop -= element.clientHeight * 3;
        });
      }
      return blank;
    })()`);
    assert.deepEqual(blank, [], 'frames painted with a spacer across the middle of the view');
    assert.deepEqual(errors, []);
  },
);

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
