import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LeftSidebar}from'./LeftSidebar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
const projects=['alpha','bravo','charlie','delta'].map((name,i)=>({path:'/p/'+name,name,addedAt:1,lastUsedAt:10-i}));
window.kodaxSpace={platform:'linux',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel)=>{
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='project.list')return{ok:true,data:{projects}};
if(channel==='session.list')return{ok:true,data:{sessions:[]}};
return{ok:false,error:{message:'Not used by this fixture: '+channel}};
}};
useAppStore.setState({projects,projectOrder:[],expandedProjects:{}});
window.store=useAppStore;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{width:280,height:600,display:'flex',flexDirection:'column'}}><LeftSidebar/></div></I18nProvider>);
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

async function openFixture(t: TestContext): Promise<{ page: Page; errors: string[] }> {
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
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: 'delta', exact: true }).waitFor();
  return { page, errors };
}

async function centerOf(page: Page, name: string): Promise<{ x: number; y: number }> {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// canonProjectRoot 在 Windows 宿主上会换成反斜杠,断言前统一成正斜杠。
const visibleOrder = async (page: Page): Promise<string[]> =>
  (
    await page.evaluate(
      () =>
        (
          window as unknown as { store: { getState(): { projectOrder: string[] } } }
        ).store.getState().projectOrder,
    )
  ).map((p) => p.replaceAll('\\', '/'));

test(
  'dragging a project previews its landing slot and drops it there, including the tail',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const from = await centerOf(page, 'alpha');
    const to = await centerOf(page, 'delta');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(from.x, to.y + 6, { steps: 6 });

    // 预览中: 其它项已上移让位, 源项未提交
    const deltaShifted = await page
      .getByRole('button', { name: 'delta', exact: true })
      .evaluate((el) => (el.closest('.mb-1') as HTMLElement).style.transform);
    assert.match(deltaShifted, /translateY\(-/);
    assert.deepEqual(await visibleOrder(page), []);

    await page.mouse.up();
    await page.waitForFunction(
      () =>
        (
          window as unknown as { store: { getState(): { projectOrder: string[] } } }
        ).store.getState().projectOrder.length > 0,
    );
    assert.deepEqual(await visibleOrder(page), ['/p/bravo', '/p/charlie', '/p/delta', '/p/alpha']);
    assert.deepEqual(errors, []);
  },
);

test(
  'Escape cancels the drag and a plain click still toggles the project',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const from = await centerOf(page, 'delta');
    const to = await centerOf(page, 'alpha');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, to.y - 6, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.deepEqual(await visibleOrder(page), []);

    const bravo = page.getByRole('button', { name: 'bravo', exact: true });
    await bravo.click();
    assert.equal(await bravo.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(errors, []);
  },
);
