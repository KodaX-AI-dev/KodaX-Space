import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentModeSelector} from './AgentModeSelector.tsx';
import {useAppStore} from '../store/appStore.ts';
import {I18nProvider} from '../i18n/I18nProvider.tsx';
window.calls=[];window.fail=false;window.defer=false;window.locked=false;
window.kodaxSpace={invoke:async(channel,args)=>{
  window.calls.push({channel,args});
  if(channel==='settings.get')return {ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
  if(channel==='session.workMode')return {ok:true,data:{supported:true,locked:window.locked,workMode:'coding',revision:4}};
  if(channel==='session.setWorkMode'){
    if(window.defer)await new Promise(resolve=>window.finish=resolve);
    return window.fail?{ok:false,error:{message:'Version conflict'}}:{ok:true,data:{supported:true,locked:false,workMode:args.workMode,revision:5}};
  }
  throw Error(channel);
}};
useAppStore.setState({currentProjectPath:'/project',currentSessionId:null,runtimeConnection:{state:'ready',runtimeId:'host'}});
window.navigate=id=>useAppStore.setState({currentSessionId:id});
window.ensure=()=>new Promise(resolve=>window.resolveDraft=id=>{
  if(useAppStore.getState().currentSessionId===null)useAppStore.setState({currentSessionId:id});
  resolve(id);
});
function App(){const[busy,setBusy]=useState(false);return <I18nProvider><AgentModeSelector ensureSession={window.ensure} disabled={busy} onBusyChange={setBusy}/><button disabled={busy}>Send</button></I18nProvider>}
createRoot(document.getElementById('root')).render(<App/>);
`;

test(
  'draft mode changes block sending, ignore stale navigation and recover from Host conflicts',
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
    const picker = page.getByTestId('work-mode-selector');
    await picker.getByRole('radio', { name: 'Coding', exact: true }).waitFor();
    assert.equal(
      await picker.getByRole('radio', { name: 'Coding', exact: true }).getAttribute('aria-checked'),
      'true',
    );
    await picker
      .getByRole('radio', { name: 'Agent', exact: true })
      .click({ timeout: 3000 })
      .catch((error) => {
        throw new Error(String(error) + errors.join('\n'));
      });
    assert.equal(await page.getByRole('button', { name: 'Send' }).isDisabled(), true);
    assert.equal(
      await picker.getByRole('radio', { name: 'Agent', exact: true }).isDisabled(),
      true,
    );
    await page.evaluate("window.navigate('different');window.resolveDraft('draft');");
    await page.getByRole('button', { name: 'Send', exact: true }).waitFor();
    assert.equal(
      await page.evaluate("window.calls.filter(c=>c.channel==='session.setWorkMode').length"),
      0,
    );
    await page.evaluate('window.fail=true;window.defer=true;');
    await picker.getByRole('radio', { name: 'Script (experimental)', exact: true }).click();
    await page.waitForFunction('window.finish');
    assert.equal(await page.getByRole('button', { name: 'Send' }).isDisabled(), true);
    await page.evaluate('window.finish();');
    await page.waitForFunction(() => {
      const selected = document.querySelector<HTMLButtonElement>(
        '[role="radio"][aria-checked="true"]',
      );
      return selected?.textContent?.includes('Coding') && selected.disabled === false;
    });
    assert.equal(
      await picker.getByRole('radio', { name: 'Coding', exact: true }).getAttribute('aria-checked'),
      'true',
    );
    assert.deepEqual(
      await page.evaluate(
        "window.calls.filter(c=>c.channel==='session.setWorkMode').map(c=>c.args)",
      ),
      [{ sessionId: 'different', workMode: 'script', expectedRevision: 4 }],
    );
    await page.evaluate('window.fail=false;window.defer=false;');
    await picker.getByRole('radio', { name: 'Coding', exact: true }).press('Home');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="radio"][aria-label="Agent"]')
          ?.getAttribute('aria-checked') === 'true',
    );
    await page.evaluate("window.locked=true;window.navigate('started');");
    await page.getByTestId('work-mode-current').waitFor();
    assert.equal(await page.getByRole('radio').count(), 0);
    assert.match(await page.getByTestId('work-mode-current').innerText(), /Coding/);
    assert.match(
      (await page.getByTestId('work-mode-current').getAttribute('title')) ?? '',
      /new session/i,
    );
    assert.deepEqual(errors, []);
  },
);
