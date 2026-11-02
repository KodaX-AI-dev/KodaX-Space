import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test(
  'model picker separates selected effort from canonical SDK wire facts and preserves unknown',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundle = await build({
      stdin: {
        contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {ModelEffortSelector} from './ModelEffortSelector.tsx';
import {useAppStore} from '../store/appStore.ts';
import {replaceProductSessionView} from '../store/productSessionView.ts';
import {I18nProvider} from '../i18n/I18nProvider.tsx';
window.kodaxSpace={invoke:async channel=>({ok:true,data:channel==='settings.get'?{languageMode:'en-US',effectiveLocale:'en-US'}:{contextWindow:200000,source:'fallback',compactionTriggerPercent:75}})};
useAppStore.setState({currentSessionId:'s',sessions:[{sessionId:'s',provider:'openai',model:'fixture',reasoningMode:'off',surface:'code'}],providers:[{id:'openai',displayName:'OpenAI',configured:true,models:['fixture'],defaultModel:'fixture'}],eventsBySession:{s:[]}});
window.report=(kind)=>{const reasoning={provider:kind==='other'?'other':'openai',model:'fixture',requestedEffort:'none',sentEffort:'minimal',verified:false,fallbacks:[{effort:'none',reason:'cached-rejection'}]};
 replaceProductSessionView({sessionId:'s',runtimeId:'rt',revision:window.revision=(window.revision||0)+1,items:[],...(kind==='missing'?{}:{activity:{runId:'r',reasoning}})});
 if(kind==='missing')useAppStore.setState({eventsBySession:{s:[{kind:'reasoning_resolved',sessionId:'s',resolution:reasoning}]}});
};window.report('current');
createRoot(document.getElementById('root')).render(<I18nProvider><ModelEffortSelector/></I18nProvider>);`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://localhost/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const picker = page.getByTestId('model-effort-selector');
    await picker.click();
    assert.match((await picker.textContent()) ?? '', /Off/);
    const observation = page.getByTestId('reasoning-resolution');
    await observation.waitFor();
    assert.match(
      (await observation.textContent()) ?? '',
      /Last request sent: Minimal.*Effective strength unconfirmed/,
    );
    assert.match((await observation.textContent()) ?? '', /Skipped a previously rejected setting/);
    await page.evaluate("window.report('other')");
    await observation.waitFor({ state: 'detached' });
    await page.evaluate("window.report('missing')");
    assert.equal(
      await observation.count(),
      0,
      'canonical absence must not display a legacy observation',
    );
    assert.match((await picker.textContent()) ?? '', /Off/);
    assert.deepEqual(errors, []);
  },
);
