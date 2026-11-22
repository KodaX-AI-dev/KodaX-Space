import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Locator } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
import{replaceProductSessionView,installProductHistory}from'../store/productSessionView.ts';
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
window.started=()=>useAppStore.setState({eventsBySession:{s:[{kind:'session_start',sessionId:'s',provider:'p'}]}});
window.finished=()=>useAppStore.setState({eventsBySession:{s:[{kind:'session_start',sessionId:'s',provider:'p'},{kind:'session_complete',sessionId:'s'}]}});
window.compact=()=>useAppStore.setState({eventsBySession:{s:[{kind:'session_start',sessionId:'s',provider:'p'},{kind:'compact_start',sessionId:'s'}]}});
window.awaiting=()=>[...base,tool('bash','bash',{command:'rm -rf build'},'awaiting_approval',1500)];
window.olderPage=rows=>installProductHistory('s',rows,true);
window.queue=()=>useAppStore.setState({queuedUserMessagesBySession:{s:[{id:'q',content:'next',matchContent:'next',queueMode:'after-turn',status:'queued'}]}});
window.local=()=>useAppStore.setState({userMessagesBySession:{s:[{id:'u_local',operationId:'op',content:'go',sentAt:t0}]}});
window.answer={id:'answer',type:'assistant',outputState:'draft',text:'the answer',timestamp:t0+4200};
window.say={id:'say',type:'assistant',text:'Let me check',timestamp:t0+50};
window.readTool=tool('read','read',{file_path:'src/a.ts'},'success',100,150);
window.mark=text=>{window.marked=[...document.querySelectorAll('[data-testid="conversation-render-row"]')].find(row=>row.textContent.includes(text));return Boolean(window.marked)};
window.markedAlive=()=>document.contains(window.marked);
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',title:'Live',surface:'code',projectRoot:'/project',createdAt:t0,lastActivityAt:t0}]});
createRoot(document.getElementById('root')).render(<I18nProvider><ConversationStreamV2/></I18nProvider>);
window.settle=()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames<6?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)});
`;

async function tallies(cluster: Locator): Promise<string[]> {
  return cluster
    .getByTestId('tool-cluster-tallies')
    .locator('[data-family]')
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          `${node.getAttribute('data-family')} ${node.querySelector('b')?.textContent}` +
          (node.classList.contains('is-running') ? ' running' : ''),
      ),
    );
}

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
  'the live tool group shows its action feed, family tallies and stats, then keeps the tallies',
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
    assert.deepEqual(await tallies(cluster), ['read 2', 'run 1 running']);
    assert.match(
      (await cluster.locator('[data-family="run"] .tool-pulse-tally-time').textContent()) ?? '',
      /^\d+s$/,
    );
    const stats = cluster.getByTestId('tool-cluster-stats');
    assert.equal(await stats.getAttribute('data-live'), 'true');
    assert.match((await stats.textContent()) ?? '', /\d+s.*↓ \d+ tok/);

    // Thinking between tool calls folds into the live group instead of ending it.
    await page.evaluate('window.show(window.between());window.settle()');
    assert.equal(await page.getByTestId('process-receipt-tool_cluster').count(), 1);
    await cluster
      .locator('.tool-pulse-think.is-on')
      .getByText('now checking the failing case')
      .waitFor();
    assert.deepEqual(await tallies(cluster), ['read 2', 'run 1']);

    await page.evaluate('window.stream(false);window.settle()');
    // The feed collapses (kept mounted for the close transition) out of the a11y tree.
    await cluster.locator('[aria-hidden="true"] [data-testid="tool-cluster-live-feed"]').waitFor();
    // The settled group keeps its elapsed time and output estimate.
    assert.equal(await stats.getAttribute('data-live'), null);
    assert.match((await stats.textContent()) ?? '', /\d+(\.\d)?s.*↓ \d+ tok/);
    assert.deepEqual(await tallies(cluster), ['read 2', 'run 1']);
    assert.deepEqual(errors, []);
  },
);

test(
  'the live feed sizes to its content, fills the column and follows the transcript font',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate(
      'window.stream(true);window.show([window.running()[0],window.running().at(-1)]);window.settle()',
    );
    const cluster = page.getByTestId('process-receipt-tool_cluster');
    const clip = cluster.locator('.tool-pulse-rows-clip');
    await clip.waitFor();
    // One row and no thought: the feed is one row tall, with no empty thinking line above it.
    assert.equal(await clip.evaluate((node) => node.style.getPropertyValue('--rows')), '1');
    assert.equal(await cluster.locator('.tool-pulse-think.is-on').count(), 0);
    assert.equal(await cluster.evaluate((node) => getComputedStyle(node).flexGrow), '1');
    assert.equal(
      await page.getByTestId('conversation-scroll-container').getAttribute('data-transcript-font'),
      'base',
    );

    await page.evaluate('window.show(window.running());window.settle()');
    assert.equal(await clip.evaluate((node) => node.style.getPropertyValue('--rows')), '3');

    await page.evaluate('window.show(window.thinkingOnly());window.settle()');
    const thinking = page.getByTestId('process-receipt-thinking');
    await thinking.locator('.tool-pulse-think.is-on').waitFor();
    assert.equal(await thinking.evaluate((node) => getComputedStyle(node).flexGrow), '1');
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

test(
  'rows keep their DOM through the turn: thought to tools to answer, and text gaining a tool',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate(
      "window.stream(true);window.show([window.running()[0],{...window.running()[1],outputState:'draft'}]);window.settle()",
    );
    assert.equal(await page.evaluate('window.mark("look around")'), true);
    for (const step of [
      'window.show(window.running())',
      'window.show(window.between())',
      'window.show([...window.between(),window.answer])',
    ]) {
      await page.evaluate(`${step};window.settle()`);
      assert.equal(await page.evaluate('window.markedAlive()'), true, step);
    }
    assert.equal(await page.getByTestId('process-receipt-tool_cluster').count(), 1);

    await page.evaluate('window.show([window.running()[0],window.say]);window.settle()');
    assert.equal(await page.evaluate('window.mark("Let me check")'), true);
    await page.evaluate(
      'window.show([window.running()[0],window.say,window.readTool]);window.settle()',
    );
    assert.equal(await page.evaluate('window.markedAlive()'), true);
    assert.deepEqual(errors, []);
  },
);

test(
  'the live group stays live under a queued follow-up but never on an older page',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate(
      'window.stream(true);window.show(window.running());window.queue();window.settle()',
    );
    const stats = page.locator('[data-testid="tool-cluster-stats"][data-live="true"]');
    assert.equal(await stats.count(), 1);
    await page.evaluate('window.olderPage(window.running());window.settle()');
    assert.equal(await stats.count(), 0);
    // An older page is not where the Run is working.
    assert.equal(await page.getByTestId('activity-spinner-row').count(), 0);
    assert.deepEqual(errors, []);
  },
);

test(
  'the sent query keeps its bubble when the SDK view takes it over',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate('window.local();window.show([]);window.settle()');
    assert.equal(await page.evaluate('window.mark("go")'), true);
    await page.evaluate(
      "window.show([{id:'sdk-u',type:'user',inputId:'op',text:'go',timestamp:window.running()[0].timestamp}]);window.settle()",
    );
    assert.equal(await page.getByTestId('user-message-bubble').count(), 1);
    assert.equal(await page.evaluate('window.markedAlive()'), true);
    assert.deepEqual(errors, []);
  },
);

test(
  'scrolled away from a working Run, the return button carries its progress',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.addStyleTag({
      content: '[data-testid="conversation-scroll-container"]{height:240px;overflow:auto}',
    });
    await page.evaluate(
      "window.stream(true);window.started();window.show([...window.running(),{...window.answer,text:'line\\n\\n'.repeat(60)}]);window.settle()",
    );
    const scroller = page.getByTestId('conversation-scroll-container');
    const jump = page.getByRole('button', { name: 'Jump to bottom', exact: true });
    await scroller.getByTestId('activity-spinner-row').waitFor();
    assert.equal(await jump.count(), 0);

    await scroller.hover();
    await page.mouse.wheel(0, -2000);
    const progress = jump.getByTestId('activity-spinner-compact');
    await progress.getByTestId('run-mark').waitFor();
    // Elapsed time appears once the Run has been working for a second.
    await progress.filter({ hasText: /\d+s/ }).waitFor();

    await page.evaluate('window.stream(false);window.finished();window.settle()');
    await jump.getByTestId('activity-spinner-compact').waitFor({ state: 'detached' });
    assert.equal(await jump.isVisible(), true);
    assert.deepEqual(errors, []);
  },
);

test(
  'a transcript that was following catches up after the window comes back to the foreground',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.addStyleTag({
      content: '[data-testid="conversation-scroll-container"]{height:240px;overflow:auto}',
    });
    const grow = (lines: number): string =>
      `window.show([...window.running(),{...window.answer,text:'line\\n\\n'.repeat(${lines})}]);window.settle()`;
    await page.evaluate(`window.stream(true);window.started();${grow(60)}`);
    const scroller = page.getByTestId('conversation-scroll-container');
    const distance = (): Promise<number> =>
      scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    assert.ok((await distance()) < 2);

    // Another window takes the foreground; the Run keeps writing meanwhile.
    await page.evaluate("document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'))");
    await page.evaluate(grow(90));
    // The browser moves the view by itself (scroll anchoring, a row resizing above): not the reader.
    await scroller.evaluate((el) => {
      el.scrollTop -= 1;
    });
    await page.evaluate('window.settle()');

    await page.evaluate("delete document.hasFocus;window.dispatchEvent(new Event('focus'))");
    await page.evaluate('window.settle()');
    assert.ok((await distance()) < 2, 'the transcript follows the end again');
    assert.equal(
      await page.getByRole('button', { name: 'Jump to bottom', exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'a failed tool reads as failed in the live feed',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate(
      "window.stream(true);window.show([...window.running(),{...window.readTool,id:'gone',tool:{...window.readTool.tool,callId:'gone',status:'error'}}]);window.settle()",
    );
    const row = page.getByTestId('tool-cluster-live-row').last();
    assert.equal(await row.getAttribute('class'), 'tool-pulse-row is-failed');
    assert.equal(await row.locator('.tool-pulse-row-icon.is-failed').count(), 1);
    assert.deepEqual(errors, []);
  },
);

test(
  'while the run waits the live group stays open but stops moving, and the spinner takes over',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate(
      'window.stream(true);window.started();window.show(window.running());window.settle()',
    );
    const cluster = page.getByTestId('process-receipt-tool_cluster');
    const spinner = page.getByTestId('activity-spinner-row');
    await cluster.getByTestId('tool-cluster-live-row').first().waitFor();
    // It follows the work at the end of the transcript, scrolling with it.
    assert.equal(
      await page
        .getByTestId('conversation-scroll-container')
        .getByTestId('activity-spinner-row')
        .count(),
      1,
    );
    assert.equal(
      await cluster.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(
            document.querySelector('[data-testid="activity-spinner-row"]')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
      true,
    );
    // The live group shows the work, so the spinner keeps its mark and numbers but no work verb.
    assert.equal(await spinner.getByTestId('run-mark').count(), 1);
    assert.equal(await cluster.locator('.tool-pulse-paused').count(), 0);

    await page.evaluate('window.compact();window.settle()');
    await cluster.locator('.tool-pulse-paused').waitFor();
    assert.equal(await cluster.getByTestId('tool-cluster-live-feed').isVisible(), true);
    assert.equal(await spinner.getByTestId('run-mark').count(), 1);
    assert.match((await spinner.textContent()) ?? '', /Compacting context/);
    assert.deepEqual(errors, []);
  },
);

test(
  'a tool waiting for approval reads as awaiting approval, not running',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openConversation(t);
    await page.evaluate('window.stream(true);window.show(window.awaiting());window.settle()');
    const row = page.getByTestId('tool-cluster-live-row').last();
    await row.waitFor();
    assert.equal(await row.getAttribute('class'), 'tool-pulse-row is-awaiting');
    assert.match((await row.textContent()) ?? '', /awaiting approval/);
    assert.equal(await row.locator('.tool-pulse-spin').count(), 0);
    assert.deepEqual(errors, []);
  },
);
