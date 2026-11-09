import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ArtifactView}from'./ArtifactView.tsx';import{toArtifactContent}from'./toArtifactContent.ts';
import{I18nProvider}from'../../i18n/I18nProvider.tsx';
window.calls=[];window.kodaxSpace={invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='files.webPreview')return window.fail?{ok:false,error:{message:'File not found'}}:{ok:true,data:{url:'https://preview.test/index.html'}};
throw Error(channel);
}};
const root=createRoot(document.getElementById('root'));
window.renderArtifact=(path,source='workspace',version=1)=>root.render(<I18nProvider><ArtifactView {...toArtifactContent('file',{path,fileSource:source},'/project',undefined,{id:'anatomy',version})}/></I18nProvider>);
window.renderArtifact('/project/.agent/tmp/sessions/session/anatomy.html');
`;

test(
  'workspace HTML registered as a file artifact opens the project web preview and keeps its interactions',
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
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      loader: { '.css': 'empty' },
      plugins: [
        {
          name: 'vite-assets',
          setup(builder) {
            builder.onResolve({ filter: /\?(?:url|worker)$/ }, (args) => ({
              path: args.path,
              namespace: 'asset',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({
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
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://artifact.test/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root" style="height:600px"></div>',
      }),
    );
    await page.route('https://preview.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Anatomy</h1><button onclick="this.textContent=\'Expanded\'">Expand diagram</button>',
      }),
    );
    await page.goto('https://artifact.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.equal(
      await page.getByText('This artifact cannot be rendered (file).', { exact: true }).count(),
      0,
    );
    const preview = page.getByTestId('project-web-preview');
    await preview.waitFor();
    const frame = page.frameLocator('[data-testid="project-web-preview"] iframe');
    await frame.getByRole('heading', { name: 'Anatomy' }).waitFor();
    await frame.getByRole('button', { name: 'Expand diagram' }).click();
    await frame.getByRole('button', { name: 'Expanded', exact: true }).waitFor();
    const requests = (await page.evaluate(
      "window.calls.filter(c=>c.channel==='files.webPreview').map(c=>c.input)",
    )) as unknown[];
    assert.ok(requests.length > 0);
    for (const input of requests)
      assert.deepEqual(input, {
        projectRoot: '/project',
        path: '/project/.agent/tmp/sessions/session/anatomy.html',
        networkAccess: false,
      });
    await page.evaluate("window.renderArtifact('/project/anatomy.HTM','workspace',2)");
    await page.waitForFunction(
      "document.querySelector('[data-testid=project-web-preview] iframe')?.getAttribute('src')?.endsWith('v=2')",
    );
    await page.evaluate(
      "window.fail=true;window.renderArtifact('/project/missing.html','workspace',3)",
    );
    await page.getByText(/File not found/).waitFor();
    assert.deepEqual(errors, []);
  },
);
