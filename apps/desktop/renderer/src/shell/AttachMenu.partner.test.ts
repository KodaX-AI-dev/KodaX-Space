import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../i18n/I18nProvider.tsx';
import {PartnerAttachMenu} from './PartnerAttachMenu.tsx';
import {useAppStore} from '../store/appStore.ts';
window.calls=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel)=>{
window.calls.push(channel);
if(channel==='skill.discover')return {ok:true,data:{skills:[{name:'document-processing',description:'Process documents',path:'/skills/document-processing/SKILL.md',source:'user'}]}};
if(channel==='slash.discover')return {ok:true,data:{commands:[]}};
if(channel==='mcp.discover')return {ok:true,data:{servers:[],errors:[]}};
return {ok:false,error:{message:'Unexpected channel '+channel}};
}};
useAppStore.getState().setCurrentProject('/project');
function App(){const [open,setOpen]=useState(true);const [result,setResult]=useState('');return <><button onClick={()=>setOpen(true)}>Open menu</button><output>{result}</output><div style={{position:'relative'}}><PartnerAttachMenu open={open} onClose={()=>setOpen(false)} onAddFiles={()=>setResult('files')} onAddFolder={()=>setResult('folder')} onInsertText={setResult} partnerConnectorContent={<button type="button">Connected Feishu</button>} partnerExpertContent={<button type="button" onClick={()=>setResult('writing-mentor')}>Writing mentor</button>}/></div></>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
`;

test(
  'Partner plus menu keeps the root visible while hover opens Connector, Slash and Skill flyouts',
  { skip: !browserPath },
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
    await page.route('http://attach-menu.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://attach-menu.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    for (const label of ['添加文件或照片', '添加文件夹', '斜杠命令', '连接器', '技能', '专家'])
      await page.getByRole('button', { name: label, exact: true }).waitFor();

    await page.getByRole('button', { name: '连接器', exact: true }).hover();
    await page.getByRole('button', { name: 'Connected Feishu', exact: true }).waitFor();
    const connectorFlyout = page.getByTestId('partner-connectors-flyout');
    assert.equal(await connectorFlyout.locator('header').count(), 0);
    assert.match((await connectorFlyout.getAttribute('class')) ?? '', /w-60/);
    await page.getByRole('button', { name: '添加文件或照片', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Connected Feishu', exact: true }).hover();
    await page.getByRole('button', { name: '添加文件或照片', exact: true }).waitFor();
    assert.equal(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as string[]).includes(
        'mcp.discover',
      ),
      false,
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.getByRole('button', { name: 'Connected Feishu', exact: true }).count(),
      0,
    );
    const connectorButton = page.getByRole('button', { name: '连接器', exact: true });
    await connectorButton.focus();
    assert.equal(await connectorButton.getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: 'Connected Feishu', exact: true }).waitFor();
    await connectorButton.press('ArrowRight');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-testid') === 'partner-connectors-flyout',
    );
    assert.equal(
      await page
        .getByTestId('partner-connectors-flyout')
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page
        .getByRole('button', { name: 'Connected Feishu', exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: '专家', exact: true }).hover();
    await page.getByTestId('partner-experts-flyout').waitFor();
    await page.getByRole('button', { name: 'Writing mentor', exact: true }).click();
    await page.getByText('writing-mentor', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: '添加文件或照片', exact: true }).click();
    await page.getByText('files', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: '添加文件夹', exact: true }).click();
    await page.getByText('folder', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: '斜杠命令', exact: true }).hover();
    await page.getByRole('button', { name: '添加文件或照片', exact: true }).waitFor();
    await page.getByRole('button', { name: /\/help/ }).click();
    assert.equal(await page.locator('output').textContent(), '/help ');

    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: '技能', exact: true }).hover();
    await page.getByRole('button', { name: '添加文件或照片', exact: true }).waitFor();
    await page.getByRole('button', { name: /document-processing/ }).click();
    assert.equal(await page.locator('output').textContent(), '/document-processing ');
  },
);
