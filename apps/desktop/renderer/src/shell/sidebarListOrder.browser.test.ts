import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

// Newly added projects sit at the top (newest first); dragged projects keep their saved order
// below them. Recent use never reshuffles them. Sessions hide archived rows behind one toggle.
const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LeftSidebar}from'./LeftSidebar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
import{canonProjectRoot}from'@kodax-space/space-ipc-schema';
const canon=(p)=>canonProjectRoot(p,/Windows/i.test(navigator.userAgent));
const projects=[
{path:'/p/charlie',name:'charlie',addedAt:3,lastUsedAt:5},
{path:'/p/alpha',name:'alpha',addedAt:1,lastUsedAt:1},
{path:'/p/bravo',name:'bravo',addedAt:2,lastUsedAt:9}];
const meta=(sessionId,lastActivityAt)=>({sessionId,title:sessionId,surface:'code',projectRoot:'/p/alpha',createdAt:1,lastActivityAt});
const sessions=[meta('live',2),meta('shelved',3)];
window.kodaxSpace={platform:'linux',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel)=>{
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='project.list')return{ok:true,data:{projects}};
if(channel==='session.list')return{ok:true,data:{sessions}};
if(channel==='session.listRunning')return{ok:true,data:{peers:[]}};
return{ok:false,error:{message:'Unused fixture channel: '+channel}};
}};
useAppStore.setState({projects,projectOrder:(window.__projectOrder??[]).map(canon),expandedProjects:{'/p/alpha':true},sessions,sessionFlags:{shelved:{archived:true}}});
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

async function openFixture(
  t: TestContext,
  projectOrder: readonly string[] = [],
): Promise<{ page: Page; errors: string[] }> {
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
  await page.evaluate((order) => {
    localStorage.setItem('kodax-space.languageMode', 'en-US');
    (window as Window & { __projectOrder?: readonly string[] }).__projectOrder = order;
  }, projectOrder);
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.getByRole('button', { name: 'alpha', exact: true }).waitFor();
  return { page, errors };
}

const projectNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-expanded]'))
      .map((button) => button.textContent?.trim() ?? '')
      .filter((name) => ['alpha', 'bravo', 'charlie'].includes(name)),
  );

test(
  'never-dragged projects show newest added first, regardless of recent use',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    assert.deepEqual(await projectNames(page), ['charlie', 'bravo', 'alpha']);
    assert.deepEqual(errors, []);
  },
);

test(
  'a project added after a drag shows above the dragged order',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t, ['/p/alpha', '/p/bravo']);
    assert.deepEqual(await projectNames(page), ['charlie', 'alpha', 'bravo']);
    assert.deepEqual(errors, []);
  },
);

test(
  'archived sessions stay hidden until the archived toggle is on',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.getByRole('button', { name: /^live/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^shelved/ }).count(), 0);

    const toggle = page.getByRole('button', { name: 'Show archived sessions' });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    const shelved = page.getByRole('button', { name: /^shelved/ });
    await shelved.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    // Archived rows stay recognisable among the active ones.
    assert.match((await shelved.getAttribute('class')) ?? '', /\bopacity-60\b/);
    // The old filter / group / sort menu is gone.
    assert.equal(await page.getByRole('button', { name: 'Filter projects / sessions' }).count(), 0);
    assert.deepEqual(errors, []);
  },
);
