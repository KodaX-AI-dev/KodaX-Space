import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ModelEffortSelector}from'./ModelEffortSelector.tsx';
import{useAppStore}from'../store/appStore.ts';
import{I18nProvider}from'../i18n/I18nProvider.tsx';
window.writes=[];
window.kodaxSpace={invoke:async(channel,input)=>{
 if(channel==='provider.setDefault'||channel==='settings.setRuntimeDefaults'){
  window.writes.push({channel,input});await new Promise(resolve=>window.finishWrite=resolve);
  return {ok:true,data:channel==='provider.setDefault'?{ok:true}:{runtimeDefaults:input.runtimeDefaults}};
 }
 return {ok:true,data:channel==='settings.get'?{languageMode:'en-US',effectiveLocale:'en-US'}:{contextWindow:200000,source:'fallback',compactionTriggerPercent:75}};
}};
useAppStore.setState({currentSessionId:null,sessions:[],defaultProviderId:'openai',pendingReasoningMode:'auto',providers:[
 {id:'openai',displayName:'OpenAI',configured:true,models:['old'],defaultModel:'old'},
 {id:'other',displayName:'Other',configured:true,models:['new'],defaultModel:'new'}
]});
window.preference=()=>useAppStore.getState().pendingReasoningMode;
createRoot(document.getElementById('root')).render(<I18nProvider><ModelEffortSelector/></I18nProvider>);
`;

async function createPickerPage(t: TestContext) {
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
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  await page.route('http://localhost/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://localhost/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return page;
}

async function waitForPickerReady(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>('[data-testid="model-effort-selector"]')
        ?.disabled === false,
  );
}

test(
  'pending model and effort writes prevent a late save from closing a new selection',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const page = await createPickerPage(t);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const picker = page.getByTestId('model-effort-selector');
    await picker.click();
    await page.getByTitle('Other', { exact: true }).click();
    await page.getByRole('button', { name: 'new', exact: true }).click();
    await page.waitForFunction('window.writes.length === 1');
    assert.equal(await picker.isDisabled(), true);
    assert.equal(await picker.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Control+i');
    assert.equal(await picker.getAttribute('aria-expanded'), 'false');
    await page.evaluate('window.finishWrite()');
    await waitForPickerReady(page);
    await picker.click();
    await page.getByRole('button', { name: 'Off', exact: true }).click();
    await page.waitForFunction('window.writes.length === 2');
    assert.equal(await page.getByRole('button', { name: /^Max/ }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'new', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate('window.preference()'), 'off');
    await page.evaluate('window.finishWrite()');
    await page.getByRole('button', { name: 'Max', exact: true }).waitFor();
    await waitForPickerReady(page);
    await page.getByRole('button', { name: 'Max', exact: true }).click();
    await page.waitForFunction('window.writes.length === 3');
    await page.evaluate('window.finishWrite()');
    await waitForPickerReady(page);
    assert.equal(await page.evaluate('window.preference()'), 'max');
    assert.deepEqual(errors, []);
  },
);
