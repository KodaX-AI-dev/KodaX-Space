import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
import{replaceProductSessionView}from'../store/productSessionView.ts';
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async()=>({ok:false,error:{message:'Unused channel'}})};
let revision=0;const t0=Date.now()-5000;
const tool=(id,name,input,status,start,end)=>({id,type:'tool',timestamp:t0+start,text:'',
  tool:{name,callId:id,status,resultRecorded:status==='success',inputText:JSON.stringify(input),startedAt:t0+start,...(end===undefined?{}:{endedAt:t0+end})}});
const base=[
  {id:'u',type:'user',text:'go',timestamp:t0},
  {id:'think-1',type:'thinking',text:'look around',timestamp:t0+10},
  tool('read','read',{file_path:'src/a.ts'},'success',100,150),
  tool('grep','grep',{pattern:'needle'},'success',200,1400),
];
window.running=()=>[...base,tool('bash','bash',{command:'npm test'},'running',1500)];
window.between=()=>[...base,tool('bash','bash',{command:'npm test'},'success',1500,4000),
  {id:'think-2',type:'thinking',text:'first idea\\nnow checking the failing case',timestamp:t0+4100}];
window.thinkingOnly=()=>[base[0],{id:'think-0',type:'thinking',outputState:'draft',text:'scan the repo\\nplanning the next step',timestamp:t0+10}];
window.show=rows=>replaceProductSessionView({sessionId:'s',runtimeId:'r',revision:++revision,items:rows});
window.stream=on=>useAppStore.setState({pendingSendBySession:on?{s:true}:{}});
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'Live',surface:'code',projectRoot:'/project',createdAt:t0,lastActivityAt:t0}]});
createRoot(document.getElementById('root')).render(<I18nProvider><ConversationStreamV2/></I18nProvider>);
window.settle=()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<6?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
`;

async function openConversation(t: TestContext) {
  const bundle = await build({
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
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
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
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.route('http://live.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://live.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate('window.settle()');
  return { page, errors };
}

test(
  'the live tool group shows its action feed, beats and stats, then settles to the frozen beats',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate('window.stream(true);window.show(window.running());window.settle()');
    const cluster = page.getByTestId('process-receipt-tool_cluster');
    const rows = cluster.getByTestId('tool-cluster-live-row');
    await rows.first().waitFor();
    assert.deepEqual(await rows.locator('.tool-pulse-row-name').allTextContents(), [
      'read',
      'grep',
      'bash',
    ]);
    assert.deepEqual(await rows.locator('.tool-pulse-row-target').allTextContents(), [
      'src/a.ts',
      'needle',
      'npm test',
    ]);
    assert.equal(await rows.last().getAttribute('class'), 'tool-pulse-row is-running');
    assert.equal(await cluster.getByTestId('tool-cluster-beats').locator('i').count(), 2);
    assert.match(
      (await cluster.getByTestId('tool-cluster-live-stats').textContent()) ?? '',
      /\d+s.*tok/,
    );

    // Thinking between tool calls folds into the live group instead of ending it.
    await page.evaluate('window.show(window.between());window.settle()');
    assert.equal(await page.getByTestId('process-receipt-tool_cluster').count(), 1);
    await cluster
      .locator('.tool-pulse-think.is-on')
      .getByText('now checking the failing case')
      .waitFor();
    assert.equal(await cluster.getByTestId('tool-cluster-beats').locator('i').count(), 3);

    await page.evaluate('window.stream(false);window.settle()');
    // The feed collapses (kept mounted for the close transition) out of the a11y tree.
    await cluster.locator('[aria-hidden="true"] [data-testid="tool-cluster-live-feed"]').waitFor();
    assert.equal(await cluster.getByTestId('tool-cluster-live-stats').count(), 0);
    assert.equal(await cluster.getByTestId('tool-cluster-beats').locator('i').count(), 3);
    assert.deepEqual(errors, []);
  },
);

test(
  'a thinking-only stream shows its latest thought live, then settles to the thinking chip',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate('window.stream(true);window.show(window.thinkingOnly());window.settle()');
    const thinking = page.getByTestId('process-receipt-thinking');
    await thinking.locator('.tool-pulse-think.is-on').getByText('planning the next step').waitFor();

    await page.evaluate('window.stream(false);window.settle()');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="process-receipt-thinking"] .tool-pulse-think') ===
        null,
    );
    assert.deepEqual(errors, []);
  },
);
