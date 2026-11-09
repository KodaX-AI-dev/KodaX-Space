import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{BottomBar}from'./BottomBar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
window.executed=[];
const commands=[
 {name:'help',aliases:['h'],description:'Help',argsHint:'[command]',source:'builtin'},
 {name:'agent-mode',description:'Agent mode',source:'builtin'},
 {name:'compact',description:'Compact',argsHint:'[instructions]',source:'builtin'},
 {name:'mode',description:'Mode',source:'builtin'},
 {name:'model',description:'Model',source:'builtin'},
 {name:'sessions',description:'Sessions',source:'builtin'},
 {name:'extensions',description:'Extensions',source:'builtin'},
];
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
 if(channel==='slash.discover'){
  if(window.discoveryMode==='hold')await new Promise(resolve=>window.releaseCommands=resolve);
  if(window.discoveryMode==='fail')return{ok:false,error:{message:'Discovery failed'}};
  return{ok:true,data:{commands}};
 }
 if(channel==='skill.discover')return{ok:true,data:{skills:[{name:'example-skill',path:'/skills/example',description:'Example skill'}]}};
 if(channel==='slash.exec'){window.executed.push({name:input.name,args:input.args});return{ok:true,data:{ok:true}};}
 return{ok:false,error:{message:'Not used in this scenario'}};
}};
useAppStore.setState({currentProjectPath:'/project',currentSessionId:'s',
 sessions:[{sessionId:'s',title:'Test',surface:'code',projectRoot:'/project'}]});
createRoot(document.getElementById('root')).render(<I18nProvider><BottomBar/></I18nProvider>);
`;

const browserAvailable = existsSync(chromium.executablePath());
const bundle = browserAvailable
  ? await build({
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
        'process.env.NODE_ENV': '"test"',
        'import.meta.env': '{}',
        'import.meta.glob': '__fixtureGlob',
      },
      banner: { js: 'const __fixtureGlob=()=>({});' },
      loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl' },
      plugins: [
        {
          name: 'unused-worker',
          setup(builder) {
            builder.onResolve({ filter: /\?worker$/ }, (args) => ({
              path: args.path,
              namespace: 'unused-worker',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'unused-worker' }, () => ({
              contents: 'export default class {}',
              loader: 'js',
            }));
          },
        },
      ],
    })
  : undefined;

async function openComposer(t: TestContext, discoveryMode: 'ready' | 'hold' | 'fail' = 'ready') {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://slash.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="root"></div>',
    }),
  );
  await page.goto('https://slash.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.evaluate((mode) => Object.assign(window, { discoveryMode: mode }), discoveryMode);
  await page.addScriptTag({ content: bundle!.outputFiles[0].text });
  const editor = page.getByRole('textbox');
  await editor.waitFor();
  return { page, editor, errors };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test(
  'accepting help closes optional completion and Enter submits without inventing a topic',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.fill('/hel');
    await page.getByRole('listbox').waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/help ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.keyboard.press('Space');
    await settle(page);
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.keyboard.press('Enter');
    await page.waitForFunction('window.executed.length === 1');
    assert.deepEqual(await page.evaluate('window.executed'), [{ name: 'help', args: [] }]);
    await editor.fill('/help ag');
    await page.getByRole('option', { name: /agent-mode/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/help agent-mode ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.keyboard.press('Enter');
    await page.waitForFunction('window.executed.length === 2');
    assert.deepEqual(await page.evaluate('window.executed[1]'), {
      name: 'help',
      args: ['agent-mode'],
    });
    assert.deepEqual(errors, []);
  },
);

test(
  'an empty suggestion list lets Enter submit the user text for normal command validation',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.fill('/help zzz');
    await page.getByRole('listbox').waitFor();
    await settle(page);
    assert.equal(await page.getByRole('option').count(), 0);
    await page.keyboard.press('Enter');
    await settle(page);
    assert.deepEqual(await page.evaluate('window.executed'), [{ name: 'help', args: ['zzz'] }]);
    assert.deepEqual(errors, []);
  },
);

for (const discoveryMode of ['hold', 'fail'] as const) {
  test(
    `command discovery ${discoveryMode} keeps its visible state and protects Enter until dismissed`,
    { skip: !browserAvailable },
    async (t) => {
      const { page, editor, errors } = await openComposer(t, discoveryMode);
      await editor.fill('/help zzz');
      const list = page.getByRole('listbox');
      await list
        .getByText(
          discoveryMode === 'hold' ? 'Searching…' : 'Search failed. Esc to close and retry.',
          {
            exact: true,
          },
        )
        .waitFor();
      await settle(page);
      await page.keyboard.press('Enter');
      await settle(page);
      assert.deepEqual(await page.evaluate('window.executed'), []);
      assert.equal(await editor.textContent(), '/help zzz');
      await page.keyboard.press('Escape');
      await settle(page);
      assert.equal(await list.count(), 0);
      await page.keyboard.press('Enter');
      await page.waitForFunction('window.executed.length === 1');
      assert.deepEqual(await page.evaluate('window.executed'), [{ name: 'help', args: ['zzz'] }]);
      assert.deepEqual(errors, []);
    },
  );
}

test(
  'fixed choices continue through a real subcommand and stop at its final value',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.fill('/sess');
    await page.getByRole('option', { name: /sessions/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/sessions ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await editor.fill('/comp');
    await page.getByRole('option', { name: /compact/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/compact ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await editor.fill('/mode au');
    await page.getByRole('option', { name: /^auto/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/mode auto ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await editor.fill('/extensions sdk');
    await page.getByRole('option', { name: /^sdk/ }).waitFor();
    await page.keyboard.press('Tab');
    await page.getByRole('option', { name: /^load/ }).waitFor();
    await settle(page);
    assert.equal(await editor.textContent(), '/extensions sdk ');
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/extensions sdk load ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    assert.deepEqual(errors, []);
  },
);

test(
  'accepted dynamic values and skills leave ordinary editing available',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.fill('/model de');
    await page.getByRole('option', { name: /^default/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), '/model default ');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.keyboard.press('Enter');
    await page.waitForFunction('window.executed.length === 1');
    assert.deepEqual(await page.evaluate('window.executed[0]'), {
      name: 'model',
      args: ['default'],
    });
    await editor.fill('/example');
    await page.getByRole('option', { name: /example-skill/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.locator('[data-composer-token="skill"]').count(), 1);
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.keyboard.type('do the work');
    assert.equal(await editor.textContent(), '/example-skill do the work');
    assert.deepEqual(errors, []);
  },
);

test(
  'completion preserves trailing text and does not intercept composition or Shift+Enter',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.fill('please /hel trailing');
    await editor.evaluate((element) => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw new Error('Expected editable prompt text');
      const range = document.createRange();
      range.setStart(text, 'please /hel'.length);
      range.collapse(true);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await page.getByRole('option', { name: /help/ }).waitFor();
    await page.keyboard.press('Tab');
    await settle(page);
    assert.equal(await editor.textContent(), 'please /help trailing');
    await editor.fill('/help zzz');
    await page.getByRole('listbox').waitFor();
    await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await settle(page);
    assert.deepEqual(await page.evaluate('window.executed'), []);
    assert.equal(await editor.textContent(), '/help zzz');
    await page.keyboard.press('Shift+Enter');
    await settle(page);
    assert.deepEqual(await page.evaluate('window.executed'), []);
    assert.ok((await editor.innerText()).startsWith('/help zzz'));
    assert.deepEqual(errors, []);
  },
);
