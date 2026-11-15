import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{AskUserInlineStack}from'./AskUserInline.tsx';
import{I18nProvider}from'../../i18n/I18nProvider.tsx';
import{useAppStore}from'../../store/appStore.ts';
window.replies=[];
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{if(channel!=='askUser.reply')return{ok:false,error:{message:'Unused channel'}};window.replies.push(input);return{ok:true,data:{}}}};
const question=(n)=>({question:'Question '+n,options:[{value:'a'+n,label:'Recommended '+n},{value:'b'+n,label:'Other '+n}]});
window.ask=(count)=>useAppStore.setState({currentSessionId:'s',askUserQueue:[{kind:'multi',reqId:'r'+count,sessionId:'s',questions:Array.from({length:count},(_,i)=>question(i+1))}]});
createRoot(document.getElementById('root')).render(<I18nProvider><AskUserInlineStack/></I18nProvider>);
`;

async function openCard(t: TestContext) {
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
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.route('http://ask.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://ask.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { page, errors };
}

test(
  'skipping later questions keeps the earlier answers instead of skipping the whole ask',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openCard(t);
    await page.evaluate('window.ask(3)');
    await page.getByText('Question 1').waitFor();
    await page.getByText('Other', { exact: true }).click();
    await page.locator('textarea').fill('Put it in this repo');
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.getByText('Question 2').waitFor();
    await page.getByRole('button', { name: 'Skip (Esc)' }).click();
    await page.getByText('Question 3').waitFor();
    // Esc belongs to the card while focus rests on the page (the conversation stream in the app).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');

    await page.waitForFunction(() => (window as unknown as { replies: unknown[] }).replies.length);
    assert.deepEqual(await page.evaluate('window.replies'), [
      {
        reqId: 'r3',
        value: { 'Question 1': { kind: 'customInput', value: 'Put it in this repo' } },
      },
    ]);
    assert.deepEqual(errors, []);
  },
);

test(
  'skipping every question still skips the ask as a whole',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openCard(t);
    await page.evaluate('window.ask(2)');
    await page.getByText('Question 1').waitFor();
    await page.getByRole('button', { name: 'Skip (Esc)' }).click();
    await page.getByText('Question 2').waitFor();
    await page.getByRole('button', { name: 'Skip (Esc)' }).click();

    await page.waitForFunction(() => (window as unknown as { replies: unknown[] }).replies.length);
    assert.deepEqual(await page.evaluate('window.replies'), [{ reqId: 'r2', cancelled: true }]);
    assert.deepEqual(errors, []);
  },
);
