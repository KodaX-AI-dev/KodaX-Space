import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test(
  'Quick Ask keeps its answer until Host promotion is confirmed',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundle = await build({
      stdin: {
        contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QuickAskPopover} from './QuickAskPopover.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
window.handoffs=[];window.closeCalls=0;window.promotion='rejected';const listeners=[];
window.kodaxSpace={on:(channel,listener)=>{listeners.push(listener);return()=>{}},invoke:async(channel)=>{
 if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
 if(channel==='session.create')return{ok:true,data:{sessionId:'quick',createdAt:1,permissionMode:'plan',reasoningMode:'auto',agentMode:'ama'}};
 if(channel==='session.send'){for(const l of listeners)l({sessionId:'quick',kind:'text_delta',text:'Answer stays visible'});window.finishAnswer=()=>{for(const l of listeners)l({sessionId:'quick',kind:'session_complete'})};return{ok:true,data:{accepted:true}};}
 if(channel==='session.promoteEphemeral'){
  if(window.promotion==='throw')throw Error('Connection lost');
  if(window.promotion==='rejected')return{ok:false,error:{message:'Host cannot promote Quick Ask'}};
  return{ok:true,data:{promoted:window.promotion==='confirmed'}};
 }return{ok:true,data:{}};
}};
useAppStore.setState({currentProjectPath:'/project',providers:[],defaultProviderId:'anthropic',upsertSession:s=>window.handoffs.push(['upsert',s.sessionId]),setCurrentSession:id=>window.handoffs.push(['select',id])});
createRoot(document.getElementById('root')).render(<I18nProvider><QuickAskPopover open={true} onClose={()=>window.closeCalls++}/></I18nProvider>);`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.css': 'empty' },
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
    await page.clock.install();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('textbox').fill('Question');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const continueButton = page.getByRole('button', { name: 'Continue in Coder' });
    await page.clock.fastForward(61_000);
    await page.getByText('Answer stays visible', { exact: true }).waitFor();
    assert.equal(await continueButton.count(), 0, 'elapsed time is not a terminal Run fact');
    await page.evaluate('window.finishAnswer()');
    await page.clock.runFor(160);
    await continueButton.waitFor().catch(async (error) => {
      throw new Error(
        String(error) + '\n' + (await page.locator('body').innerText()) + '\n' + errors.join('\n'),
      );
    });
    for (const outcome of ['rejected', 'not_promoted', 'throw']) {
      await page.evaluate((value) => {
        (window as unknown as { promotion: string }).promotion = value;
      }, outcome);
      await continueButton.click();
      await page.getByRole('alert').waitFor();
      assert.deepEqual(await page.evaluate('window.handoffs'), []);
      assert.equal(await page.evaluate('window.closeCalls'), 0);
      assert.equal(await page.getByText('Answer stays visible', { exact: true }).count(), 1);
    }
    await page.evaluate("window.promotion='confirmed'");
    await continueButton.click();
    await page.waitForFunction('window.closeCalls===1');
    assert.deepEqual(await page.evaluate('window.handoffs'), [
      ['upsert', 'quick'],
      ['select', 'quick'],
    ]);
    assert.deepEqual(errors, []);
  },
);
