import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { SPACE_EXTENSION_FRAME_BOOTSTRAP } from '../window/space-extension-frame.js';

const browserPath = [
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const htmlPath = new URL('../../../../extensions/partner-library/ui/index.html', import.meta.url);
async function fixture(html: string): Promise<string> {
  const result = await build({
    stdin: {
      contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {ExtensionFrame} from './PartnerExtensionView.tsx';
    window.requests=[];
    const dispatch=async request=>{window.requests.push(request);return request.method==='catalog.list'?{experts:[{id:'writing-mentor',revision:1,name:'写作导师',description:'写作',prompt:'Write.'}]}:{connectors:[],connectedIds:[]};};
    function App(){const [target,setTarget]=useState({tab:'connectors',revision:0});window.navigate=tab=>setTarget(current=>({tab,revision:current.revision+1}));return <ExtensionFrame html={${JSON.stringify(html)}} title="Library" onRequest={dispatch} initialTab={target.tab} navigationRevision={target.revision}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: fileURLToPath(
        new URL('../../renderer/src/features/extensions/', import.meta.url),
      ),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
    plugins: [
      {
        name: 'test-frame-transport',
        setup(builder) {
          builder.onLoad({ filter: /PartnerExtensionView\.tsx$/ }, async (args) => ({
            contents: (await readFile(args.path, 'utf8')).replace(
              'src={SPACE_EXTENSION_FRAME_URL}',
              'src="http://localhost:17895/frame"',
            ),
            loader: 'tsx',
          }));
        },
      },
    ],
  });
  return result.outputFiles[0]!.text;
}

for (const { legacy, early } of [
  { legacy: true, early: false },
  { legacy: false, early: false },
  { legacy: true, early: true },
])
  test(
    `library management navigation ${legacy ? 'reinitializes legacy bridge' : 'preserves modern frame'}${early ? ' after an early navigation' : ''}`,
    { skip: !browserPath },
    async (t) => {
      let html = await readFile(htmlPath, 'utf8');
      if (legacy)
        html = html
          .replace(/, supportsBidirectionalNavigation: true/g, '')
          .replace(
            "(message.tab === 'connectors' || message.tab === 'experts')",
            "message.tab === 'connectors'",
          );
      const bundle = await fixture(html);
      const browser = await chromium.launch({ executablePath: browserPath, headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage();
      // Shared CI runners can pause between browser launch, iframe bootstrap,
      // and navigation; keep a bounded but contention-tolerant budget there.
      page.setDefaultTimeout(process.env.CI ? 15_000 : 5_000);
      let releaseBootstrap!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
      });
      if (!early) releaseBootstrap();
      await page.route('http://localhost:17895/**', async (route) => {
        const isFrame = route.request().url().endsWith('/frame');
        if (isFrame) await gate;
        await route.fulfill({
          contentType: 'text/html',
          body: isFrame ? SPACE_EXTENSION_FRAME_BOOTSTRAP : '<div id="root"></div>',
        });
      });
      await page.goto('http://localhost:17895/');
      await page.addScriptTag({ content: bundle });
      const frame = page.frameLocator('iframe');
      if (early) {
        await page.locator('iframe').waitFor({ state: 'attached' });
        await page.evaluate(() => Reflect.get(window, 'navigate')('experts'));
        releaseBootstrap();
      }
      await frame
        .locator('#' + (early ? 'experts' : 'connectors') + '-tab[aria-selected="true"]')
        .waitFor();
      await frame.locator('body').evaluate((body) => {
        body.dataset.original = 'yes';
      });
      for (const tab of ['experts', 'connectors', 'experts']) {
        await page.evaluate((tab) => Reflect.get(window, 'navigate')(tab), tab);
        await page.waitForFunction(() => Reflect.get(window, 'requests').length > 0);
        await frame.locator('#' + tab + '-tab[aria-selected="true"]').waitFor();
        if (tab === 'experts')
          await frame.getByRole('button', { name: '查看 写作导师 详情', exact: true }).waitFor();
      }
      const requests = (await page.evaluate(() => Reflect.get(window, 'requests'))) as {
        token: string;
        requestId: string;
        method: string;
      }[];
      assert.equal(new Set(requests.map((request) => request.token)).size, legacy ? 4 : 1);
      assert.equal(
        await frame.locator('body').getAttribute('data-original'),
        legacy ? null : 'yes',
      );
      if (legacy) {
        const catalog = requests.filter((request) => request.method === 'catalog.list');
        assert.equal(catalog.length, 4);
        assert.equal(
          new Set(catalog.map((request) => request.requestId)).size,
          1,
          'New documents restart request numbering but remain accepted by fresh bridges',
        );
      }
    },
  );
