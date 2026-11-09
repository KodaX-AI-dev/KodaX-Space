import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{Shell}from'./Shell.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
import{replaceProductSessionView}from'../store/productSessionView.ts';
import{dispatchOpenFileViewer}from'../features/artifact/transientArtifact.ts';
window.calls=[];window.holdList=false;window.pendingLists=[];
const refs=['first','second'].map((id,index)=>({id,sessionId:'s',surface:'code',kind:'markdown',title:'Report '+id,currentVersion:1,createdAt:1,updatedAt:2-index,versions:[{v:1,createdAt:1,hasContent:true}]}));
window.kodaxSpace={platform:'win32',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='space.extensions.list')return{ok:true,data:{extensions:[]}};
if(channel==='slash.discover')return{ok:true,data:{commands:[]}};
if(channel==='session.history')return{ok:true,data:{sessionId:input.sessionId,requestId:input.requestId,items:[],productItems:[],page:{outcome:'ready',revision:'r',sourceRevision:'r',hasMore:false,hasNewer:false,windowMode:'replace'}}};
if(channel==='artifact.list'){if(window.holdList)await new Promise(resolve=>window.pendingLists.push(resolve));return{ok:true,data:{artifacts:input.sessionId==='s'?refs:[]}};}
if(channel==='artifact.read')return{ok:true,data:{ref:refs.find(ref=>ref.id===input.id),version:1,content:'# Content '+input.id}};
return{ok:false,error:{message:'Not used by this fixture: '+channel}};
}};
const session={sessionId:'s',projectRoot:'/project',surface:'code',provider:'anthropic',createdAt:1,lastActivityAt:1};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',rightSidebarOpen:false,sessions:[session,{...session,sessionId:'other'}],runtimeConnection:{state:'ready',runtimeId:'host',stale:false,capabilities:[]}});
replaceProductSessionView({sessionId:'s',runtimeId:'host',revision:1,items:refs.map(ref=>({id:'create-'+ref.id,type:'tool',text:'Artifact created (id='+ref.id+', v1)',tool:{callId:'create-'+ref.id,name:'create_artifact',status:'success',resultRecorded:true,inputText:JSON.stringify({kind:'markdown',title:ref.title,content:'# Content '+ref.id})}}))});
window.store=useAppStore;
window.openFixtureFile=()=>dispatchOpenFileViewer({id:'old-file',kind:'markdown',title:'Old file',source:'file-preview',projectRoot:'/project',content:'# Old file'});
window.addEventListener('fixture-context-change',event=>useAppStore.setState(event.detail??{currentSessionId:'other'}));
window.releaseLists=()=>{window.holdList=false;for(const resolve of window.pendingLists.splice(0))resolve()};
createRoot(document.getElementById('root')).render(<I18nProvider><Shell/></I18nProvider>);
`;

function bundleFixture() {
  return build({
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
}

async function openFixture(t: TestContext) {
  const bundle = await bundleFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  page.setDefaultTimeout(2500);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://artifact.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://artifact.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { page, errors };
}

test(
  'one card click opens the requested artifact from a collapsed sidebar and after remounting',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.getByText('Report second', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content second', exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId('right-sidebar-tab-artifact').getAttribute('aria-pressed'),
      'true',
    );
    await page.getByText('Report first', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content first', exact: true })
      .waitFor();
    await page.evaluate('window.store.getState().setRightSidebarOpen(false)');
    await page.getByTestId('right-sidebar-tab-artifact').waitFor({ state: 'detached' });
    await page.getByText('Report second', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content second', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
  },
);

test(
  'an artifact open request does not revive after its project context changes',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page
      .getByText('Report second', { exact: true })
      .first()
      .evaluate((node) => {
        (node as HTMLElement).click();
        window.dispatchEvent(
          new CustomEvent('fixture-context-change', { detail: { currentProjectPath: '/other' } }),
        );
      });
    await page.waitForFunction("window.store.getState().currentProjectPath==='/other'");
    await page.getByTestId('right-sidebar-tab-artifact').waitFor();
    await page.evaluate("window.store.setState({currentProjectPath:'/project'})");
    await page.waitForFunction("window.store.getState().currentProjectPath==='/project'");
    assert.equal(
      await page.getByTestId('right-sidebar-tab-artifact').getAttribute('aria-pressed'),
      'false',
    );
    assert.equal(await page.locator('iframe').count(), 0);
    await page.getByText('Report second', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content second', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
  },
);

test(
  'a new artifact target takes priority over restored File Viewer content and a newer file request still opens',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.getByText('Report second', { exact: true }).first().waitFor();
    await page.evaluate('window.openFixtureFile()');
    await page.getByTestId('right-sidebar-tab-file').waitFor();
    await page.evaluate('window.store.getState().setRightSidebarOpen(false)');
    await page.getByTestId('right-sidebar-tab-file').waitFor({ state: 'detached' });
    await page.getByText('Report second', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content second', exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId('right-sidebar-tab-artifact').getAttribute('aria-pressed'),
      'true',
    );
    await page.evaluate('window.openFixtureFile()');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="right-sidebar-tab-file"]')
          ?.getAttribute('aria-pressed') === 'true',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'the latest artifact choice survives delayed lists without replaying a request in another context',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.evaluate('window.holdList=true');
    await page.getByText('Report second', { exact: true }).first().click();
    await page.waitForFunction('window.pendingLists.length > 0');
    await page.getByText('Report first', { exact: true }).first().click();
    await page.evaluate('window.releaseLists()');
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content first', exact: true })
      .waitFor();
    await page.evaluate('window.store.getState().setRightSidebarOpen(false)');
    await page.getByTestId('right-sidebar-tab-artifact').waitFor({ state: 'detached' });
    await page
      .getByText('Report second', { exact: true })
      .first()
      .evaluate((node) => {
        (node as HTMLElement).click();
        window.dispatchEvent(new CustomEvent('fixture-context-change'));
      });
    await page.waitForFunction("window.store.getState().currentSessionId==='other'");
    await page.getByTestId('right-sidebar-tab-artifact').waitFor({ state: 'detached' });
    await page.evaluate("window.store.setState({currentSessionId:'s'})");
    await page.getByTestId('right-sidebar-tab-artifact').waitFor();
    assert.equal(
      await page.getByTestId('right-sidebar-tab-artifact').getAttribute('aria-pressed'),
      'false',
    );
    assert.equal(await page.locator('iframe').count(), 0);
    await page.getByText('Report second', { exact: true }).first().click();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Content second', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
  },
);
