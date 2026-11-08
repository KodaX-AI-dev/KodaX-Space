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
import{useToastStore}from'../store/toastStore.ts';
window.reads=[];window.requests=[];window.revision=0;window.good=false;window.hold=false;
Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copied=value}}});
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
if(channel!=='session.productItem')return{ok:false,error:{message:'Unused channel'}};
window.reads.push(input.itemId);window.requests.push(input);
if(window.hold)await new Promise(resolve=>window.release=resolve);
return{ok:true,data:window.good?{id:input.itemId,offset:0,totalLength:8,text:'headtail',textRevision:0}:null};}};
const items=Array.from({length:30},(_,index)=>({id:'body-'+index,type:'thinking',text:'tail',textOffset:4,totalTextLength:8,textRevision:0,timestamp:1700000000000}));
window.show=(rows)=>replaceProductSessionView({sessionId:'s',runtimeId:'r',revision:++window.revision,items:rows});
const answer={id:'answer',type:'assistant',text:'tail',textOffset:4,totalTextLength:8,textRevision:0};
window.publish=()=>window.show([...items,answer]);
window.group=()=>window.show([items[0],{...answer,id:'tool',type:'tool',tool:{name:'read',callId:'call',status:'success',resultRecorded:true,inputText:'tail',totalInputLength:8}}]);
window.toasts=()=>useToastStore.getState().toasts;
window.select=id=>useAppStore.setState({currentSessionId:id});
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'Legacy history',surface:'code',projectRoot:'/project',createdAt:1700000000000,lastActivityAt:1700000000000}]});
createRoot(document.getElementById('root')).render(<I18nProvider><ConversationStreamV2/></I18nProvider>);
window.settle=()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<6?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
`;

test(
  'very long thinking stays readable in bounded sections and copies the complete Unicode source',
  {
    skip: !existsSync(chromium.executablePath()),
  },
  async (t) => {
    const { page } = await openConversation(t);
    await page.evaluate(`window.bigThinking = 'A'.repeat(8191) + '🎉' + '思考'.repeat(40000) + 'end';
    window.show([{id:'large',type:'thinking',text:window.bigThinking}]);window.settle()`);
    const row = page.getByTestId('process-receipt-thinking');
    await row.getByRole('button').first().click();
    const chunk = row.getByTestId('thinking-section-content');
    await chunk.waitFor({ timeout: 1500 });
    const sections: string[] = [(await chunk.textContent()) ?? ''];
    const next = row.getByRole('button', { name: 'Next section' });
    while (await next.isEnabled()) {
      await next.click();
      sections.push((await chunk.textContent()) ?? '');
    }
    assert.ok(
      sections.every(
        (section) => section.length <= 8193 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(section),
      ),
    );
    assert.equal(sections.join(''), await page.evaluate('window.bigThinking'));
    await row.getByRole('button', { name: 'Copy full text' }).click();
    assert.equal(await page.evaluate('window.copied === window.bigThinking'), true);
  },
);

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
  await page.route('http://history.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://history.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate('window.settle()');
  return { page, errors };
}

test(
  'collapsed reasoning stays lazy and copying a preview reads and retries the exact body',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate('window.publish();window.settle()');
    const answer = page.locator('[data-msg-id="answer"]');
    await answer.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      (window as unknown as { reads: string[] }).reads.includes('answer'),
    );
    assert.deepEqual(await page.evaluate('window.reads'), ['answer']);
    assert.equal(await page.evaluate('window.toasts().length'), 0);
    const retry = answer.getByRole('button', { name: 'Retry', exact: true });
    await retry.waitFor();
    await answer.locator('.conversation-message-footer button').first().click();
    assert.equal(await page.evaluate('window.copied'), undefined);
    await page.evaluate('window.good=true');
    await answer.locator('.conversation-message-footer button').first().click();
    await page.waitForFunction('window.copied === "headtail"');
    await answer.getByText('headtail', { exact: true }).waitFor();
    assert.equal(
      await answer.locator('.copy-pulse').count(),
      1,
      'completion preserves the copy feedback',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'expanded receipts request only their contributing item parts',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page } = await openConversation(t);
    await page.evaluate('window.group();window.settle()');
    assert.deepEqual(await page.evaluate('window.reads'), []);
    const cluster = page.getByTestId('process-receipt-tool_cluster');
    await cluster.getByRole('button').first().click();
    const card = cluster.getByTestId('tool-call-card');
    await card.waitFor();
    await page.waitForFunction('window.reads.length > 0');
    assert.deepEqual(await page.evaluate('window.reads'), ['body-0']);
    await card.getByRole('button').first().click();
    await page.waitForFunction('window.reads.length >= 3');
    assert.deepEqual(
      await page.evaluate("window.requests.filter(x=>x.itemId==='tool').map(x=>x.part).sort()"),
      ['input', 'text'],
    );
    assert.equal(await card.getByTestId('tool-original').count(), 0);
    await page.evaluate('window.good=true');
    await card.getByRole('button', { name: 'Retry', exact: true }).first().click();
    await page.waitForFunction('window.reads.length === 4');
    assert.equal(await card.getByRole('button', { name: 'Retry', exact: true }).count(), 1);
  },
);

test(
  'late body results cannot replace clipboard after a session switch',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page } = await openConversation(t);
    await page.evaluate(
      'window.hold=true;window.good=true;window.copied="unchanged";window.publish();window.settle()',
    );
    const answer = page.locator('[data-msg-id="answer"]');
    await answer.locator('.conversation-message-footer button').first().click();
    await page.waitForFunction('window.reads.includes("answer")');
    await page.evaluate('window.select("other");window.release();window.settle()');
    assert.deepEqual(await page.evaluate('window.reads'), ['answer']);
    assert.equal(await page.evaluate('window.copied'), 'unchanged');
    assert.equal(await page.evaluate('window.toasts().length'), 0);
  },
);

test(
  'offscreen rows are read when scrolled into view and an unfinished draft stays a preview',
  {
    skip: !existsSync(chromium.executablePath()),
  },
  async (t) => {
    const { page } = await openConversation(t);
    await page.addStyleTag({
      content:
        '[data-testid="conversation-scroll-container"]{height:220px;overflow:auto}[data-testid="conversation-render-row"]{min-height:180px}',
    });
    await page.evaluate(
      `window.show(Array.from({length:40},(_,i)=>({id:'row-'+i,type:'assistant',text:'tail',textOffset:4,totalTextLength:8,textRevision:0})));window.settle()`,
    );
    assert.equal(await page.evaluate("window.reads.includes('row-20')"), false);
    await page.locator('[data-msg-id="row-20"]').scrollIntoViewIfNeeded();
    await page.waitForFunction("window.reads.includes('row-20')");
    await page.evaluate(
      `window.show([{id:'draft',type:'assistant',text:'tail',textOffset:4,totalTextLength:8,textRevision:1,outputState:'draft'}]);window.settle()`,
    );
    const draft = page.locator('[data-msg-id="draft"]');
    await draft.getByText(/Streaming preview/).waitFor();
    assert.equal(
      await draft.locator('.conversation-message-footer button').first().isDisabled(),
      true,
    );
    assert.equal(await page.evaluate("window.reads.includes('draft')"), false);
  },
);
