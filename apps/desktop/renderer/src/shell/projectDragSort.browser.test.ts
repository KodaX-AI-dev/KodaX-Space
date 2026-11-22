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
const projects=['alpha','bravo','zulu','charlie','delta'].map((name,i)=>({path:'/p/'+name,name,addedAt:1,lastUsedAt:10-i,...(name==='zulu'?{archived:true}:{})}));
window.savedOrders=[];window.savedPins=[];
window.kodaxSpace={platform:'linux',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel,input)=>{
if(channel==='project.order.set'){window.savedOrders.push(input.order.map((p)=>p.split(String.fromCharCode(92)).join('/')));return{ok:true,data:{}};}
if(channel==='project.pinned.set'){window.savedPins.push(input.pinned.map((p)=>p.split(String.fromCharCode(92)).join('/')));return{ok:true,data:{}};}
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='project.list')return{ok:true,data:{projects}};
if(channel==='session.list')return{ok:true,data:{sessions:[]}};
return{ok:false,error:{message:'Not used by this fixture: '+channel}};
}};
useAppStore.setState({projects,expandedProjects:{}});
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

const storeOrder = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as { store: { getState(): { projects: { name: string }[] } } }).store
      .getState()
      .projects.map((p) => p.name),
  );

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
    assert.deepEqual(await storeOrder(page), ['alpha', 'bravo', 'zulu', 'charlie', 'delta']);

    await page.mouse.up();
    await page.waitForFunction(
      () => (window as unknown as { savedOrders: unknown[] }).savedOrders.length > 0,
    );
    // Only visible rows move; the hidden archived project keeps its slot in the full order.
    assert.deepEqual(await storeOrder(page), ['bravo', 'charlie', 'zulu', 'delta', 'alpha']);
    // The full order is saved to projects.json, shared by dev and packaged builds.
    assert.deepEqual(await page.evaluate('window.savedOrders'), [
      ['/p/bravo', '/p/charlie', '/p/zulu', '/p/delta', '/p/alpha'],
    ]);
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
    assert.deepEqual(await storeOrder(page), ['alpha', 'bravo', 'zulu', 'charlie', 'delta']);
    assert.deepEqual(await page.evaluate('window.savedOrders'), []);

    const bravo = page.getByRole('button', { name: 'bravo', exact: true });
    await bravo.click();
    assert.equal(await bravo.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(errors, []);
  },
);

test(
  'pinned projects drag within the pinned area without touching the main order',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          store: {
            getState(): { projects: { name: string }[] };
            setState(s: object): void;
          };
        }
      ).store;
      const pins: Record<string, number> = { charlie: 0, delta: 1 };
      store.setState({
        projects: store
          .getState()
          .projects.map((p) => (p.name in pins ? { ...p, pinnedIndex: pins[p.name] } : p)),
      });
    });
    await page.locator('[data-testid="sidebar-pinned-projects"]').waitFor();
    const from = await centerOf(page, 'delta');
    const to = await centerOf(page, 'charlie');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 10, { steps: 2 });
    await page.mouse.move(from.x, to.y - 6, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(
      () => (window as unknown as { savedPins: unknown[] }).savedPins.length > 0,
    );
    assert.deepEqual(await page.evaluate('window.savedPins'), [['/p/delta', '/p/charlie']]);
    assert.deepEqual(await page.evaluate('window.savedOrders'), []);
    assert.deepEqual(await storeOrder(page), ['alpha', 'bravo', 'zulu', 'charlie', 'delta']);
    assert.deepEqual(errors, []);
  },
);
