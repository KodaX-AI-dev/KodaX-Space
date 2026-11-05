import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';import{useAppStore}from'../store/appStore.ts';
import{restoreNewestSessionHistory,loadOlderSessionHistory,activateSessionHistoryPaging,deactivateSessionHistoryPaging}from'./sessionHistoryPaging.ts';
import{useToastStore}from'../store/toastStore.ts';
import{replaceProductSessionView,productTranscriptSnapshot}from'../store/productSessionView.ts';
window.requests=[];window.hold=false;window.fail=false;window.release=()=>{};window.toasts=()=>useToastStore.getState().toasts;
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
if(channel!=='session.history')return{ok:false,error:{message:'Unexpected '+channel}};
window.requests.push(input.cursor??'newest');
if(window.holdNewest&&!input.cursor){window.newestHeld=true;await new Promise((resolve,reject)=>window.releaseNewest=()=>reject(new Error('Obsolete newest read failed')));}
if(window.hold&&input.cursor)await new Promise((resolve,reject)=>window.release=()=>window.fail?reject(new Error('Late obsolete read failed')):resolve());
const index=input.cursor==='oldest'?2:input.cursor==='middle'?1:0;
const label=['NEWEST','MIDDLE','OLDEST'][index];
return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],productItems:[...Array.from({length:12},(_,i)=>({id:label+i,outputId:label+i,type:'assistant',text:label+' '+i+'\\n\\n'+('Readable report paragraph.\\n\\n').repeat(8)})),{id:'info-'+label,type:'info',text:'Informational report'}],
page:{outcome:'ready',revision:'r',sourceRevision:'s',hasMore:index<2,hasNewer:index>0,windowMode:'replace',...(index<2?{nextCursor:index===0?'middle':'oldest'}:{})}}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'History',surface:'code',projectRoot:'/project'}]});
function App(){const id=useAppStore(state=>state.currentSessionId);return <ConversationStreamV2 key={id}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
window.newest=async()=>{await restoreNewestSessionHistory('s','code');replaceProductSessionView({sessionId:'s',runtimeId:'rt',revision:1,items:productTranscriptSnapshot('s').historyItems.map(item=>({...item,id:'view:'+item.id}))});};
window.start=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');await loadOlderSessionHistory('s');};
window.middle=async()=>{await restoreNewestSessionHistory('s','code');await loadOlderSessionHistory('s');};
window.settle=()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<12?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
window.select=id=>{deactivateSessionHistoryPaging(useAppStore.getState().currentSessionId);useAppStore.setState({currentSessionId:id});activateSessionHistoryPaging(id)};
`;

async function openHistory(t: TestContext, scenarioFixture = fixture) {
  const bundled = await build({
    stdin: {
      contents: scenarioFixture,
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
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.setDefaultTimeout(5000);
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
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  return { page, errors };
}

test(
  'older history stays continuous while scrolling in either direction and one bottom control returns to live',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openHistory(t);
    await page.evaluate('window.start()');
    const stream = page.getByTestId('conversation-stream');
    const scroller = page.getByTestId('conversation-scroll-container');
    await stream.getByText('OLDEST 11', { exact: true }).waitFor();
    assert.equal(
      await stream.getByText('NEWEST 11', { exact: true }).count(),
      1,
      'loading older history must retain the newer messages in the same scroll document',
    );
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
    await page.evaluate('window.settle()');
    assert.deepEqual(await page.evaluate('window.requests'), ['newest', 'middle', 'oldest']);
    assert.equal(await stream.getByText('OLDEST 0', { exact: true }).count(), 1);
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
    await latest.waitFor({ state: 'hidden' });
    await page.evaluate('window.middle()');
    await stream.getByText('MIDDLE 0', { exact: true }).waitFor();
    await page.evaluate('window.settle()');
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
    assert.deepEqual(errors, []);
  },
);

for (const short of [false, true]) {
  test(
    'prepending ' +
      (short ? 'short' : 'long') +
      ' history preserves the visible text and newer replies',
    { skip: !existsSync(chromium.executablePath()) },
    async (t) => {
      const { page, errors } = await openHistory(
        t,
        short ? fixture.replace('length:12', 'length:1') : fixture,
      );
      await page.evaluate('window.newest()');
      const scroller = page.getByTestId('conversation-scroll-container');
      const marker = page.getByText('NEWEST 0', { exact: true });
      await marker.waitFor();
      await page.evaluate('window.settle()');
      if (short) await scroller.evaluate((el) => (el.style.height = '200px'));
      await page.evaluate('window.hold=true');
      const topBefore = await scroller.evaluate((el) => {
        el.scrollTop = 0;
        const top = el.querySelector('[data-msg-id="view:NEWEST0"] p')!.getBoundingClientRect().top;
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true }));
        return top;
      });
      await page.waitForFunction('window.requests.at(-1)==="middle"');
      await page.evaluate('window.release()');
      await page.getByText('MIDDLE 0', { exact: true }).waitFor();
      await page.waitForTimeout(800);
      assert.ok(
        Math.abs((await marker.boundingBox())!.y - topBefore) <= 3,
        'the same visible text must remain anchored after prepend: ' +
          JSON.stringify({ topBefore, after: (await marker.boundingBox())!.y }),
      );
      assert.equal(await page.getByText('NEWEST 0', { exact: true }).count(), 1);
      assert.deepEqual(errors, []);
    },
  );
}
