import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React,{useEffect} from 'react';import{createRoot}from'react-dom/client';
import{BottomBar}from'./BottomBar.tsx';import{ConversationStreamV2}from'./ConversationStreamV2.tsx';
import{LeftSidebar}from'./LeftSidebar.tsx';
import{I18nProvider}from'../i18n/I18nProvider.tsx';import{useAppStore}from'../store/appStore.ts';
import{restoreNewestSessionHistory}from'./sessionHistoryPaging.ts';
window.calls=[];window.mode='coding';window.revision=1;
const saved={sessionId:'saved',projectRoot:'/project',provider:'anthropic',surface:'code',reasoningMode:'auto',permissionMode:'accept-edits',agentMode:'ama',createdAt:1,lastActivityAt:1,msgCount:2};
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='session.create')return{ok:true,data:{sessionId:'draft',createdAt:Date.now(),reasoningMode:'auto',permissionMode:'accept-edits',agentMode:'ama'}};
if(channel==='session.workMode')return{ok:true,data:{supported:true,locked:false,workMode:window.mode,revision:window.revision}};
if(channel==='session.setWorkMode'){window.mode=input.workMode;window.revision++;setTimeout(()=>useAppStore.setState({liveProjectionBySession:{draft:{sessionId:'draft',cursor:{runtimeId:'host',seq:window.revision},todos:[],interactions:[],queuedRuns:[],settings:{revision:window.revision,value:{workMode:window.mode}}}}}),0);return{ok:true,data:{supported:true,locked:false,workMode:window.mode,revision:window.revision}};}
if(channel==='session.list')return{ok:true,data:{sessions:[saved]}};
if(channel==='session.history')return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[]}};
if(channel==='session.setTitle')return{ok:true,data:{}};
if(channel==='session.send'){await new Promise(resolve=>window.finishSend=resolve);return{ok:true,data:{accepted:true}};}
if(channel==='session.listRunning')return{ok:true,data:{peers:[]}};
if(channel==='slash.discover')return{ok:true,data:{commands:[]}};
if(channel==='project.fileSearch')return{ok:true,data:{paths:[]}};
return{ok:false,error:{code:'ERR_TEST_UNAVAILABLE',message:'Not used in this scenario'}};
}};
useAppStore.setState({currentSessionId:null,currentProjectPath:'/project',projects:[{path:'/project',name:'Project',lastUsedAt:1}],sessions:[saved],providers:[{id:'anthropic',displayName:'Anthropic',configured:true,models:[]}],defaultProviderId:'anthropic',runtimeConnection:{state:'ready',stale:false,runtimeId:'host',capabilities:[]}});
window.selectSaved=()=>useAppStore.getState().setCurrentSession('saved');
function App(){const id=useAppStore(s=>s.currentSessionId);const welcome=useAppStore(s=>s.welcomeDraftSessionId);useEffect(()=>{if(id)void restoreNewestSessionHistory(id,'code')},[id]);return <><LeftSidebar onOpenSettings={()=>{}}/><ConversationStreamV2 key={id===welcome?'no-session':id??'no-session'}/><BottomBar/></>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
window.settle=()=>new Promise(resolve=>{let count=0;function tick(){if(++count===12)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
`;

test(
  'choosing work modes preserves the new-conversation dashboard until the first send',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
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
      logLevel: 'silent',
      define: {
        'process.env.NODE_ENV': '"production"',
        'import.meta.env': '{}',
        'import.meta.glob': '__testAssetGlob',
      },
      banner: { js: 'const __testAssetGlob=()=>({});' },
      loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
      plugins: [
        {
          name: 'vite-assets',
          setup(builder) {
            builder.onResolve({ filter: /\?(?:url|inline|worker)$/ }, (args) => ({
              path: args.path,
              namespace: 'asset',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'asset' }, (args) => ({
              contents: args.path.endsWith('?worker')
                ? 'export default class {}'
                : 'export default ""',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://draft.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('https://draft.test/');
    await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const dashboard = page.getByRole('button', { name: 'Overview', exact: true });
    await dashboard.waitFor();
    for (const mode of ['Agent', 'Script (experimental)', 'Coding']) {
      await page.getByRole('radio', { name: mode, exact: true }).click();
      await page
        .waitForFunction((value) => {
          const button = document.querySelector('[role="radio"][aria-label="' + value + '"]');
          return (
            button?.getAttribute('aria-checked') === 'true' && !button.hasAttribute('disabled')
          );
        }, mode)
        .catch(async (error) => {
          throw new Error(
            String(error) +
              ' ' +
              JSON.stringify(await page.evaluate('window.calls')) +
              ' ' +
              errors.join('\n'),
          );
        });
      await page.evaluate('window.settle()');
      assert.equal(await dashboard.count(), 1, 'mode changes must keep usage statistics visible');
      assert.equal(await page.getByTestId('conversation-stream').count(), 0);
      assert.equal(
        await page.locator('[data-testid="sidebar-session-row"][data-session-id="draft"]').count(),
        0,
      );
    }
    assert.equal(
      await page.evaluate("window.calls.filter(c=>c.channel==='session.create').length"),
      1,
    );
    await page.getByTestId('composer-input').fill('First input');
    await page.getByTestId('composer-input').press('Enter');
    await page.waitForFunction('window.finishSend').catch(async (error) => {
      throw new Error(
        String(error) +
          ' ' +
          JSON.stringify(await page.evaluate('window.calls')) +
          ' ' +
          errors.join('\n'),
      );
    });
    assert.equal(
      await page.evaluate("window.calls.filter(c=>c.channel==='session.create').length"),
      1,
      'first send must reuse the configured draft',
    );
    assert.equal(await dashboard.count(), 0, 'sending the first input opens the conversation');
    await page.getByTestId('conversation-stream').waitFor();
    await page.evaluate('window.selectSaved()');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="conversation-stream"]')
          ?.getAttribute('data-session-id') === 'saved',
    );
    assert.equal(
      await dashboard.count(),
      0,
      'existing empty Sessions must keep the conversation view',
    );
    assert.deepEqual(errors, []);
  },
);
