import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{NotificationsSurface}from'./NotificationsSurface.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
window.kodaxSpace={platform:'win32',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel)=>{
if(channel==='settings.get')return{ok:true,data:{languageMode:'zh-CN',effectiveLocale:'zh-CN'}};
return{ok:false,error:{message:'Unused fixture channel: '+channel}};
}};
useAppStore.setState({currentSessionId:'s',notifications:[]});
useAppStore.getState().pushNotification({id:'done',severity:'success',text:'已完成 · 用时 3m 12s',sessionId:'s',createdAt:1,dismissOnOutsideInteraction:true});
window.store=useAppStore;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{width:640,padding:24}}><button id="outside">outside</button><NotificationsSurface/></div></I18nProvider>);
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
  'completion notice renders as a neutral success card and dismisses on close or outside click',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundle = await bundleFixture();
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    page.setDefaultTimeout(2500);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://notice.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('https://notice.test/');
    await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'zh-CN'));
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });

    const row = page.getByTestId('notification-row');
    await row.waitFor();
    assert.equal((await row.textContent())?.trim(), '已完成 · 用时 3m 12s');
    assert.equal(
      await row.locator('[data-notice-tone]').getAttribute('data-notice-tone'),
      'success',
    );
    assert.equal(await row.locator('svg.text-ok').count(), 1);

    await row.getByRole('button', { name: '关闭通知' }).click();
    assert.equal(await row.count(), 0);

    await page.evaluate(() => {
      const w = window as unknown as {
        store: { getState: () => { pushNotification: (n: Record<string, unknown>) => void } };
      };
      w.store.getState().pushNotification({
        id: 'failed',
        severity: 'error',
        text: '运行失败 · 用时 1m 5s',
        sessionId: 's',
        createdAt: 2,
        dismissOnOutsideInteraction: true,
      });
    });
    await row.waitFor();
    assert.equal(
      await row.locator('[data-notice-tone]').getAttribute('data-notice-tone'),
      'danger',
    );
    await page.locator('#outside').click();
    assert.equal(await row.count(), 0);
    assert.deepEqual(errors, []);
  },
);
