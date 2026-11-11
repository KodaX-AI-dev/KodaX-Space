import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

// Shared by the conversation history browser tests, split across files to stay under the
// per-file test timeout on slow CI runners.

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

export const browserAvailable = existsSync(chromium.executablePath());
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

export function historyTest(name: string, run: (t: TestContext) => Promise<void>): void {
  test(name, { skip: !browserAvailable }, run);
}

// Loaded is not mounted: a loaded row far from the reader is a spacer.
export const loadedIds = (page: Page): Promise<string[]> =>
  page.evaluate<string[]>('window.loaded()');
export const isLoaded = async (page: Page, id: string): Promise<boolean> =>
  (await loadedIds(page)).includes(id);
export async function waitLoaded(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (target) => (window as unknown as { loaded(): string[] }).loaded().includes(target),
    id,
  );
}

/** The first message row crossing the viewport, and its distance below the viewport top. */
export const rowInView = (page: Page, id?: string): Promise<{ id: string; offset: number }> =>
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

export async function openHistoryFixture(t: TestContext, showScrollbars = false) {
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

export type HistoryDirection = 'newer' | 'older';

export async function sendHistoryPointer(
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

export async function startUnread(page: Page, direction: HistoryDirection): Promise<void> {
  await page.evaluate(
    (id) => (window as unknown as { locate(id: string): Promise<void> }).locate(id),
    direction === 'older' ? 'newest' : 'oldest',
  );
  await page
    .getByText(direction === 'older' ? 'NEWEST 11' : 'OLDEST 11', { exact: true })
    .waitFor();
  await page.evaluate('window.settle(48)');
}
