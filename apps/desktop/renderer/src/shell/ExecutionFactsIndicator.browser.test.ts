import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test(
  'execution status uses actual Run facts and ignores another Run reasoning update',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundle = await build({
      stdin: {
        contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ExecutionFactsIndicator} from './ExecutionFactsIndicator.tsx';
import {useAppStore} from '../store/appStore.ts';
import {replaceProductSessionView} from '../store/productSessionView.ts';
import {I18nProvider} from '../i18n/I18nProvider.tsx';
window.kodaxSpace={invoke:async()=>({ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}})};
window.renderFacts=(actual,other)=>{
 useAppStore.setState({currentSessionId:'s',sessions:[{sessionId:'s',workMode:'coding'}],liveProjectionBySession:{s:{activeRun:{runId:'r',phase:'running',...(actual?{workMode:'agent',effectiveConfig:{workMode:'agent',toolScope:['bash']}}:{})}}}});
 replaceProductSessionView({sessionId:'s',runtimeId:'h',revision:Date.now(),items:[],activity:{runId:other?'other':'r',reasoning:{provider:'p',model:'m',requestedEffort:'high',sentEffort:'low',verified:false,fallbacks:[]}}});
}; window.renderFacts(true,false);
createRoot(document.getElementById('root')).render(<I18nProvider><ExecutionFactsIndicator/></I18nProvider>);`,
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
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://fixture.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://fixture.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const label = page.getByTestId('execution-facts');
    await label.waitFor();
    assert.equal(await label.textContent(), 'agent · high → low');
    assert.match((await label.getAttribute('title')) ?? '', /server unverified/);
    await page.evaluate('window.renderFacts(false,true)');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="execution-facts"]')?.textContent === 'unknown',
    );
    assert.equal(await label.textContent(), 'unknown');
    assert.deepEqual(errors, []);
  },
);
