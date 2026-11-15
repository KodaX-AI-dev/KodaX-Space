import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{BottomBar}from'./BottomBar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
window.executed=[];window.sent=[];
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
 if(channel==='session.send'){window.sent.push(input.prompt);return{ok:true,data:{accepted:true}};}
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

test(
  'Enter right after a paste sends the pasted text, not the draft from the last render',
  { skip: !browserAvailable },
  async (t) => {
    const { page, editor, errors } = await openComposer(t);
    await editor.focus();
    // Paste, let the editor commit (a microtask), then press Enter before React has rendered the
    // new draft: a busy renderer (a streaming run) can delay that render past a quick Ctrl+V, Enter.
    await page.evaluate(async () => {
      const root = document.querySelector('[contenteditable="true"]')!;
      const data = new DataTransfer();
      data.setData('text/plain', 'pasted question');
      root.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      root.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForFunction('window.sent.length === 1');
    assert.deepEqual(await page.evaluate('window.sent'), ['pasted question']);
    assert.deepEqual(errors, []);
  },
);
