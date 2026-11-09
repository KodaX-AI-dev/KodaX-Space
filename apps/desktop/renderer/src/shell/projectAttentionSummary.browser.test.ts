import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LeftSidebar}from'./LeftSidebar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
const meta=(sessionId,projectRoot)=>({sessionId,title:sessionId,surface:'code',projectRoot,createdAt:1,lastActivityAt:1});
const sessions=[meta('current','/cur'),meta('done','/other'),meta('failed','/other'),meta('quiet','/other')];
const projects=[{path:'/cur',name:'Current',addedAt:1,lastUsedAt:2},{path:'/other',name:'Other',addedAt:1,lastUsedAt:1}];
window.kodaxSpace={platform:'win32',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel)=>{
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='project.list')return{ok:true,data:{projects}};
if(channel==='session.list')return{ok:true,data:{sessions}};
if(channel==='session.listRunning')return{ok:true,data:{peers:[]}};
return{ok:false,error:{message:'Unused fixture channel: '+channel}};
}};
useAppStore.setState({projects,projectOrder:[],expandedProjects:{},sessions,currentSessionId:'current',currentProjectPath:'/cur',
sessionFlags:{done:{unread:true}},eventsBySession:{failed:[{kind:'session_error',sessionId:'failed',error:'boom'}]}});
window.store=useAppStore;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{width:280,height:600,display:'flex',flexDirection:'column'}}><LeftSidebar onOpenSettings={()=>{}}/></div></I18nProvider>);
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

test(
  'collapsed project summarises Sessions that need the user and clears as they are read',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundle = await bundleFixture();
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    page.setDefaultTimeout(2500);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://sidebar.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('https://sidebar.test/');
    await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });

    const summary = page.getByRole('img', { name: '1 failed · 1 finished, unread' });
    await summary.waitFor();
    assert.equal((await summary.textContent())?.trim(), '2');

    // Opening the finished Session clears its unread flag; the summary counts down.
    await page.evaluate(() => {
      const w = window as unknown as {
        store: { setState: (patch: Record<string, unknown>) => void };
      };
      w.store.setState({ sessionFlags: {} });
    });
    const remaining = page.getByRole('img', { name: '1 failed', exact: true });
    await remaining.waitFor();
    assert.equal((await remaining.textContent())?.trim(), '1');

    // Expanded projects show the rows themselves, so the summary steps aside.
    await page.getByRole('button', { name: 'Other', exact: true }).click();
    await page
      .getByRole('button', { name: /^failed/ })
      .first()
      .waitFor();
    assert.equal(await remaining.count(), 0);
    assert.deepEqual(errors, []);
  },
);
