import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{ArtifactsView}from'./ArtifactsView.tsx';import{ArtifactWindow}from'./ArtifactWindow.tsx';
import{ConversationStreamV2}from'../../shell/ConversationStreamV2.tsx';
import{useAppStore}from'../../store/appStore.ts';import{replaceProductSessionView}from'../../store/productSessionView.ts';
import{I18nProvider}from'../../i18n/I18nProvider.tsx';import{useToastStore}from'../../store/toastStore.ts';
window.calls=[];window.saved=false;window.copied='';
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text}}});
const ref={id:'anatomy',sessionId:'s',surface:'code',kind:'file',title:'Anatomy HTML',currentVersion:2,createdAt:1,updatedAt:2,versions:[1,2].map(v=>({v,createdAt:v,hasContent:false,path:'/project/anatomy-v'+v+'.html',fileSource:'workspace'}))};
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='artifact.list')return{ok:true,data:{artifacts:[ref]}};
if(channel==='artifact.read'){const version=input.version??2;return{ok:true,data:{ref,version,path:'/project/anatomy-v'+version+'.html',fileSource:'workspace'}};}
if(channel==='files.webPreview')return{ok:true,data:{url:'https://preview.test/index.html'}};
if(channel==='artifact.export')return window.failSave?{ok:false,error:{message:'Write failed'}}:{ok:true,data:window.cancelSave?{ok:false,canceled:true}:{ok:true,path:'/chosen/anatomy.html'}};
if(channel==='shell.revealPath')return{ok:true,data:{revealed:true}};
if(channel==='artifact.openWindow')return{ok:true,data:{opened:true}};
return{ok:false,error:{message:'Unexpected '+channel}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',sessions:[{sessionId:'s',projectRoot:'/project',surface:'code',provider:'anthropic',createdAt:1,lastActivityAt:1}],runtimeConnection:{state:'ready',runtimeId:'host',stale:false}});
replaceProductSessionView({sessionId:'s',runtimeId:'host',revision:1,items:[{id:'create',type:'tool',text:'Artifact created (id=anatomy, v1)',tool:{callId:'create',name:'create_artifact',status:'success',resultRecorded:true,inputText:JSON.stringify({kind:'file',title:'Anatomy HTML',path:'/project/anatomy-v1.html'})}}]});
const root=createRoot(document.getElementById('root'));
window.renderMode=mode=>root.render(<I18nProvider>{mode==='card'?<ConversationStreamV2/>:mode==='window'?<ArtifactWindow params={{id:'anatomy',version:1,projectRoot:'/project',title:'Anatomy HTML'}}/>:<ArtifactsView focusedId='anatomy'/>}</I18nProvider>);
window.toasts=()=>useToastStore.getState().toasts;
window.clearToasts=()=>useToastStore.getState().clear();
window.renderMode('panel');
`;

test(
  'artifact previews and card menus expose Save As and file-manager actions for the selected version',
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
      route.fulfill({ contentType: 'text/html', body: '<h1>Anatomy</h1>' }),
    );
    await page.goto('https://artifact.test/');
    await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Save as', exact: true }).click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='artifact.export')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='artifact.export').input"),
      { id: 'anatomy', version: 2 },
    );
    await page.getByRole('button', { name: 'Reveal in file manager', exact: true }).click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='shell.revealPath')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='shell.revealPath').input"),
      { path: '/project/anatomy-v2.html', projectRoot: '/project' },
    );
    await page.evaluate("window.renderMode('window');window.calls=[];");
    await page.getByRole('button', { name: 'Save as', exact: true }).click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='artifact.export')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='artifact.export').input"),
      { id: 'anatomy', version: 1 },
    );
    await page.evaluate("window.renderMode('card');window.calls=[];");
    const card = page.getByText('Anatomy HTML', { exact: true });
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Save as...', exact: true }).click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='artifact.export')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='artifact.export').input"),
      { id: 'anatomy', version: 1 },
    );
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Reveal in file manager', exact: true }).click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='shell.revealPath')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='shell.revealPath').input"),
      { path: '/project/anatomy-v1.html', projectRoot: '/project' },
    );
    await page.getByRole('button', { name: 'Artifact actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy file path', exact: true }).click();
    assert.equal(await page.evaluate('window.copied'), '/project/anatomy-v1.html');
    await page.evaluate('window.clearToasts();window.cancelSave=true;');
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Save as...', exact: true }).click();
    await page.waitForFunction("window.calls.filter(c=>c.channel==='artifact.export').length===2");
    assert.deepEqual(await page.evaluate('window.toasts()'), []);
    await page.evaluate('window.cancelSave=false;window.failSave=true;');
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Save as...', exact: true }).click();
    await page.waitForFunction("window.toasts().some(toast=>toast.message==='Write failed')");
    await page.getByRole('button', { name: 'Artifact actions', exact: true }).press('Enter');
    await page
      .getByRole('menuitem', { name: 'Open artifact in a separate window', exact: true })
      .click();
    await page.waitForFunction("window.calls.some(c=>c.channel==='artifact.openWindow')");
    assert.deepEqual(
      await page.evaluate("window.calls.find(c=>c.channel==='artifact.openWindow').input"),
      { id: 'anatomy', version: 1, projectRoot: '/project', title: 'Anatomy HTML' },
    );
    assert.deepEqual(errors, []);
  },
);
