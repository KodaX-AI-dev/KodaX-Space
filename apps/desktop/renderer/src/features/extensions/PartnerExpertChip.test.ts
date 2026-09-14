import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { SpaceExtensionManifestT } from '@kodax-space/space-ipc-schema';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);
const manifest: SpaceExtensionManifestT = JSON.parse(
  readFileSync(
    new URL('../../../../../../extensions/partner-library/manifest.json', import.meta.url),
    'utf8',
  ),
);
const experts = ['product-management', 'deep-research'].map((id) => ({
  extensionId: manifest.id,
  extensionVersion: manifest.version,
  expert: manifest.experts.find((entry) => entry.id === id)!,
}));

test(
  'the composer shows durable role and task selections, loading and unavailable states without sending',
  { skip: !browserPath },
  async (t) => {
    const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerExpertProvider,usePartnerExpert} from './PartnerExpertProvider.tsx';
import {PartnerExpertChip} from './PartnerExpertChip.tsx';
const experts=${JSON.stringify(experts)};
const saved={'session-a':experts[0],'session-b':null};
let release; const ready=new Promise(resolve=>{release=resolve});
let unavailable=false;
window.calls=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
  window.calls.push({channel,input});
  if(channel==='space.extensions.list')return {ok:true,data:{extensions:[{id:experts[0].extensionId,name:'Library',description:'',version:'0.1.0',enabled:true,installedAt:1,expertCount:2,connectorCount:0}]}};
  if(channel==='session.partnerExpert.get') {await ready;return {ok:true,data:{expert:saved[input.sessionId],available:!unavailable,unavailableReason:unavailable?'扩展暂不可用':undefined}};}
  if(channel==='session.partnerExpert.set') {saved[input.sessionId]=input.expert?experts.find(e=>e.expert.id===input.expert.expertId):null;return {ok:true,data:{expert:saved[input.sessionId],available:true}};}
  throw new Error('Unexpected IPC '+channel);
}};
useSurfaceStore.getState().setSurface('partner');
useAppStore.getState().setCurrentProject('/project');
useAppStore.getState().setCurrentSession('session-a');
function Fixture(){const {binding}=usePartnerExpert(); const [running,setRunning]=useState(false);return <>
<button onClick={()=>release()}>加载完成</button>
<button onClick={()=>useAppStore.getState().setCurrentSession('session-a')}>会话甲</button>
<button onClick={()=>useAppStore.getState().setCurrentSession('session-b')}>会话乙</button>
<button onClick={()=>binding.select({extensionId:experts[1].extensionId,expertId:experts[1].expert.id,revision:experts[1].expert.revision})}>切换深度研究</button>
<button onClick={()=>{unavailable=true;void binding.refresh()}}>模拟不可用</button>
<button onClick={()=>setRunning(!running)}>切换运行状态</button>
<textarea defaultValue="保留我的草稿"/><PartnerExpertChip running={running}/></>;}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerExpertProvider><Fixture/></PartnerExpertProvider></SpaceExtensionsProvider></I18nProvider>);
`;
    const bundled = await build({
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
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(3_000);
    await page.route('**/*', (route) =>
      route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }),
    );
    await page.goto('https://expert-conversation.test/');
    await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
    await page.getByTestId('partner-expert-binding').getByRole('status').waitFor();
    assert.equal(await page.getByTestId('partner-expert-chip').count(), 0);
    await page.getByText('加载完成', { exact: true }).click();
    const chip = page.getByTestId('partner-expert-chip');
    await chip.filter({ hasText: '产品管理' }).waitFor();
    await page.getByText('本会话持续使用', { exact: true }).waitFor();
    await page.getByText('切换深度研究', { exact: true }).click();
    await chip.filter({ hasText: '深度研究' }).waitFor();
    await page.getByText('会话乙', { exact: true }).click();
    await page.getByTestId('partner-expert-binding').waitFor({ state: 'detached' });
    await page.getByText('会话甲', { exact: true }).click();
    await chip.filter({ hasText: '深度研究' }).waitFor();
    await page.getByText('切换运行状态', { exact: true }).click();
    await page.getByText('专家的切换或移除从下一轮对话生效。', { exact: true }).waitFor();
    await page.getByText('模拟不可用', { exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '扩展暂不可用' }).waitFor();
    assert.equal(await page.getByText('本会话持续使用', { exact: true }).count(), 0);
    await page.getByTestId('partner-expert-remove').click();
    await chip.waitFor({ state: 'detached' });
    assert.equal(await page.locator('textarea').inputValue(), '保留我的草稿');
    const channels: string[] = await page.evaluate(() =>
      Reflect.get(window, 'calls').map((call: { channel: string }) => call.channel),
    );
    assert.ok(!channels.some((channel) => ['session.send', 'session.create'].includes(channel)));
  },
);
