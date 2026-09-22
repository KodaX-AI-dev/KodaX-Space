import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';
import postcss from 'postcss';
import tailwindcss, { type Config } from 'tailwindcss';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
  ...(process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe']
    : []),
].find(existsSync);

// Exercise the real typed sidebar, artifact panel, renderer and production CSS.
// Only the host IPC and unused Vite worker/URL assets are replaced.
const fixture = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {PartnerRightSidebar} from './PartnerRightSidebar.tsx';
import {PartnerRemoteRecordsProvider} from '../extensions/usePartnerRemoteRecords.ts';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
const markdown = '# Research report\\n\\n' + 'A paragraph of the report.\\n\\n'.repeat(80) + 'End of report.';
const artifacts = [{id:'report',kind:'markdown',title:'Research report',currentVersion:2,
  versions:[{v:1,hasContent:true,createdAt:1},{v:2,hasContent:true,createdAt:2}],
  sessionId:'layout-session',surface:'partner',createdAt:1,updatedAt:2}];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
  const ok=data=>({ok:true,data});
  if(channel==='artifact.list')return ok({artifacts});
  if(channel==='artifact.read')return ok({ref:artifacts[0],content:input.version===1?'# Short report':markdown});
  if(channel==='partner.deliveries.list')return ok({deliveries:[]});
  if(channel==='partner.connectors.records')return ok({sources:[],proposals:[],receipts:[],baseTasks:[],documentTasks:[],recordRevision:1});
  return {ok:false,error:{code:'UNAVAILABLE',message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');
useAppStore.getState().setCurrentProject('/project');
useAppStore.getState().setCurrentSession('layout-session');
function App(){
  const [request,setRequest]=useState(null);
  const open=target=>setRequest(current=>({revision:(current?.revision??0)+1,target}));
  return <div style={{height:'100vh',display:'flex',justifyContent:'flex-end'}}>
    <nav style={{flex:1}}>
      <button onClick={()=>open({kind:'artifact',artifactId:'report',title:'Research report'})}>Open report</button>
      <button onClick={()=>open({kind:'artifact',artifactId:'html',title:'HTML report',snapshot:{id:'html',kind:'html',title:'HTML report',content:'<h1>HTML report</h1>'}})}>Open HTML</button>
      <button onClick={()=>open({kind:'outputs'})}>Open outputs</button>
    </nav>
    <PartnerRightSidebar open width={420} openRequest={request}/>
  </div>;
}
createRoot(document.getElementById('root')).render(<I18nProvider><PartnerRemoteRecordsProvider><App/></PartnerRemoteRecordsProvider></I18nProvider>);
`;

async function assertPreviewFillsPanel(page: Page): Promise<void> {
  const panel = page.getByRole('tabpanel');
  const preview = panel.locator('iframe');
  await preview.waitFor({ state: 'visible' });
  const panelBox = await panel.boundingBox();
  const previewBox = await preview.boundingBox();
  assert.ok(panelBox && previewBox);
  assert.ok(
    previewBox.height >= panelBox.height - 100,
    `preview height ${previewBox.height} must fill panel height ${panelBox.height} below its toolbar`,
  );
  assert.ok(Math.abs(previewBox.y + previewBox.height - panelBox.y - panelBox.height) <= 2);
  assert.ok(Math.abs(previewBox.width - panelBox.width) <= 2);
}

test(
  'Partner artifact previews fill the detail panel after opening, resizing and switching tabs or versions',
  { skip: !browserPath },
  async (t) => {
    const desktopRoot = fileURLToPath(new URL('../../../../', import.meta.url));
    const require = createRequire(import.meta.url);
    const config = require(`${desktopRoot}tailwind.config.cjs`) as Config;
    const stylesPath = `${desktopRoot}renderer/src/styles.css`;
    const sourceCss = (await readFile(stylesPath, 'utf8')).replace(
      "@import 'highlight.js/styles/atom-one-dark.css';",
      await readFile(require.resolve('highlight.js/styles/atom-one-dark.css'), 'utf8'),
    );
    const css = await postcss([
      tailwindcss({ ...config, content: [`${desktopRoot}renderer/src/**/*.{ts,tsx}`] }),
    ]).process(sourceCss, { from: stylesPath });
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
      loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'text' },
      define: { 'import.meta.env': '{}' },
      logLevel: 'silent',
      plugins: [
        {
          name: 'unused-vite-assets',
          setup(builder) {
            builder.onResolve({ filter: /\?(?:worker|url)$/ }, (args) => ({
              path: args.path,
              namespace: 'test-assets',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'test-assets' }, (args) => ({
              contents: args.path.endsWith('?url')
                ? 'export default "about:blank"'
                : 'export default class WorkerStub {}',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
    });
    page.setDefaultTimeout(process.env.CI ? 15_000 : 5000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://artifact-layout.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://artifact-layout.test/');
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.getByRole('button', { name: 'Open report', exact: true }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'Research report' }).waitFor();
    await assertPreviewFillsPanel(page);
    await page.frameLocator('iframe').getByText('End of report.').scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .frameLocator('iframe')
        .locator('body')
        .evaluate(() => window.scrollY > 0),
      true,
    );

    for (const viewport of [
      { width: 800, height: 520 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await assertPreviewFillsPanel(page);
    }
    await page.getByRole('tabpanel').getByRole('combobox').selectOption('1');
    await page.frameLocator('iframe').getByRole('heading', { name: 'Short report' }).waitFor();
    await assertPreviewFillsPanel(page);
    await page.getByRole('button', { name: 'Open HTML', exact: true }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'HTML report' }).waitFor();
    await assertPreviewFillsPanel(page);
    await page.getByRole('tab', { name: 'Research report', exact: true }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'Research report' }).waitFor();
    await assertPreviewFillsPanel(page);
    await page.getByRole('button', { name: 'Open outputs', exact: true }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'Research report' }).waitFor();
    await assertPreviewFillsPanel(page);
    assert.deepEqual(errors, []);
  },
);
