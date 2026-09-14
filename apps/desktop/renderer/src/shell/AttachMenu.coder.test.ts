import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);

const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../i18n/I18nProvider.tsx';
import {AttachMenu} from './AttachMenu.tsx';
import {useAppStore} from '../store/appStore.ts';
window.calls=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel)=>{
  window.calls.push(channel);
  if(channel==='mcp.discover')return {ok:true,data:{servers:[{name:'Coder MCP',source:'project',transport:'stdio'}],errors:[]}};
  if(channel==='skill.discover')return {ok:true,data:{skills:[]}};
  if(channel==='slash.discover')return {ok:true,data:{commands:[]}};
  return {ok:false,error:{message:'Unexpected channel '+channel}};
}};
useAppStore.getState().setCurrentProject('/project');
function App(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Open menu</button><div style={{position:'relative'}}><AttachMenu open={open} onClose={()=>setOpen(false)} onAddFiles={()=>{}} onAddFolder={()=>{}} onInsertText={()=>{}}/></div></>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
`;

test(
  'Coder keeps its original click-only connector discovery and has no Partner expert entry',
  {
    skip: !browserPath,
  },
  async (t) => {
    const output = await build({
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
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(3_000);
    await page.route('http://coder-menu.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://coder-menu.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    const connectorButton = page.getByRole('button', { name: '连接器', exact: true });
    await connectorButton.hover();
    assert.deepEqual(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as string[]).filter((channel) =>
        channel.endsWith('.discover'),
      ),
      [],
    );
    assert.equal(await page.getByRole('button', { name: '专家', exact: true }).count(), 0);
    assert.equal(await page.getByText('Coder MCP', { exact: true }).count(), 0);

    await connectorButton.click();
    await page.getByText('Coder MCP', { exact: true }).waitFor();
    assert.deepEqual(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as string[]).filter((channel) =>
        channel.endsWith('.discover'),
      ),
      ['mcp.discover'],
    );
  },
);
