import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
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
window.calls=[];window.fail=false;window.defer=false;window.locked=false;window.savedDefaults={};
window.kodaxSpace={invoke:async(channel,args)=>{
  window.calls.push({channel,args});
  if(channel==='settings.get')return {ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
  if(channel==='settings.setRuntimeDefaults'){
    if(window.failDefaults)return {ok:false,error:{message:'Default settings write failed'}};
    Object.assign(window.savedDefaults,args.runtimeDefaults);
    return {ok:true,data:{runtimeDefaults:window.savedDefaults}};
  }
  if(channel==='session.workMode'){
    if(window.holdRead)await new Promise(resolve=>window.releaseRead=resolve);
    return {ok:true,data:{supported:true,locked:window.locked,workMode:'coding',revision:4}};
  }
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

const browserMissing = !existsSync(chromium.executablePath());

async function openFixture(t: TestContext) {
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
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://fixture.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://fixture.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { page, errors, picker: page.getByTestId('work-mode-selector') };
}

test(
  'draft mode changes block sending, ignore stale navigation and recover from Host conflicts',
  { skip: browserMissing },
  async (t) => {
    const { page, errors, picker } = await openFixture(t);
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

test(
  'a reconcile read that resolves after a newer saved mode cannot revert the selection',
  { skip: browserMissing },
  async (t) => {
    const { page, errors, picker } = await openFixture(t);
    await page.evaluate("window.navigate('started');");
    await picker.getByRole('radio', { name: 'Coding', exact: true }).waitFor();
    await page.evaluate('window.fail=true;window.holdRead=true;');
    await picker.getByRole('radio', { name: 'Script (experimental)', exact: true }).click();
    await page.waitForFunction('window.releaseRead');
    await page.evaluate('window.fail=false;window.holdRead=false;');
    await picker.getByRole('radio', { name: 'Agent', exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="radio"][aria-label="Agent"]')
          ?.getAttribute('aria-checked') === 'true',
    );
    await page.evaluate(
      'window.releaseRead();new Promise(resolve=>setTimeout(()=>requestAnimationFrame(resolve),50));',
    );
    assert.equal(
      await picker.getByRole('radio', { name: 'Agent', exact: true }).getAttribute('aria-checked'),
      'true',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'only successful mode changes become the next-conversation default, while existing Sessions keep their Host mode',
  { skip: browserMissing },
  async (t) => {
    const { page, errors, picker } = await openFixture(t);
    await page.evaluate("window.navigate('existing');window.fail=true;");
    await picker.getByRole('radio', { name: 'Agent', exact: true }).click();
    await page.waitForFunction(
      "window.calls.some(c=>c.channel==='session.setWorkMode') && !document.querySelector('[role=radio]').disabled",
    );
    assert.deepEqual(await page.evaluate('window.savedDefaults'), {});
    await page.evaluate('window.fail=false;');
    await picker.getByRole('radio', { name: 'Agent', exact: true }).click();
    await page.waitForFunction("window.savedDefaults.workMode==='agent'");
    await page.evaluate('window.navigate(null);');
    assert.equal(
      await picker.getByRole('radio', { name: 'Agent', exact: true }).getAttribute('aria-checked'),
      'true',
    );
    await page.evaluate("window.navigate('other');window.failDefaults=true;");
    await picker.getByRole('radio', { name: 'Script (experimental)', exact: true }).click();
    await page.waitForFunction(
      "window.calls.filter(c=>c.channel==='settings.setRuntimeDefaults').length===2 && !document.querySelector('[role=radio]').disabled",
    );
    assert.equal(
      await picker
        .getByRole('radio', { name: 'Script (experimental)', exact: true })
        .getAttribute('aria-checked'),
      'true',
    );
    await page.evaluate('window.navigate(null);');
    assert.equal(
      await picker.getByRole('radio', { name: 'Agent', exact: true }).getAttribute('aria-checked'),
      'true',
    );
    await page.evaluate("window.failDefaults=false;window.navigate('another');");
    for (const [label, mode] of [
      ['Script (experimental)', 'script'],
      ['Coding', 'coding'],
    ]) {
      if (mode === 'coding') {
        await picker.getByRole('radio', { name: 'Agent', exact: true }).click();
        await page.waitForFunction("window.savedDefaults.workMode==='agent'");
      }
      await picker.getByRole('radio', { name: label, exact: true }).click();
      await page.waitForFunction(
        (value) =>
          (window as unknown as { savedDefaults: { workMode: string } }).savedDefaults.workMode ===
          value,
        mode,
      );
      await page.evaluate('window.navigate(null);');
      assert.equal(
        await picker.getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked'),
        'true',
      );
      await page.evaluate(
        (value) =>
          (window as unknown as { navigate: (id: string) => void }).navigate('existing-' + value),
        mode,
      );
      await page.waitForFunction(
        "document.querySelector('[role=radio][aria-label=Coding]')?.getAttribute('aria-checked')==='true'",
      );
    }
    assert.deepEqual(errors, []);
  },
);
