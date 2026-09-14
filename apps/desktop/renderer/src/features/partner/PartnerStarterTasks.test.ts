import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const manifest = JSON.parse(
  readFileSync(
    new URL('../../../../../../extensions/partner-library/manifest.json', import.meta.url),
    'utf8',
  ),
);

test(
  'starter tasks bind the current expert revision and method before inserting a template; failures and scope changes do not edit drafts',
  { skip: !browserPath },
  async (t) => {
    const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
import {SpaceExtensionsProvider} from '../extensions/SpaceExtensionsProvider.tsx';
import {PartnerExpertProvider} from '../extensions/PartnerExpertProvider.tsx';
import {PartnerStarterTasks} from './PartnerStarterTasks.tsx';
const manifest=${JSON.stringify(manifest)};
window.calls=[];window.fail=false;window.hold=false;window.release=null;
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
 window.calls.push({channel,input});
 if(channel==='space.extensions.list')return {ok:true,data:{extensions:[{id:manifest.id,name:'Library',version:manifest.version,description:'',enabled:true,installedAt:1,expertCount:12,connectorCount:13}]}};
 if(channel==='space.extensions.catalog')return {ok:true,data:{experts:manifest.experts,connectors:manifest.connectors}};
 if(channel==='space.extensions.resolveExpert'){
  if(window.hold)await new Promise(resolve=>{window.release=resolve});
  if(window.fail)return {ok:false,error:{code:'UNAVAILABLE',message:'Expert unavailable'}};
  return {ok:true,data:{expert:{extensionId:manifest.id,extensionVersion:manifest.version,useSkill:input.useSkill,expert:manifest.experts.find(e=>e.id===input.expertId)}}};
 }
 throw new Error('Unexpected IPC '+channel);
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject('/a');useAppStore.getState().setCurrentSession(null);
window.addEventListener('kodax-space.partner-insert-skill-draft',event=>{document.querySelector('textarea').value+=event.detail.text});
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerExpertProvider><textarea defaultValue="保留草稿。"/><button onClick={()=>useAppStore.getState().setCurrentProject('/b')}>换项目</button><PartnerStarterTasks/></PartnerExpertProvider></SpaceExtensionsProvider></I18nProvider>);
`;
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
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(5000);
    await page.route('**/*', (route) =>
      route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }),
    );
    await page.goto('https://starter.test');
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const cards = page.getByTestId('partner-starter-tasks');
    const ids = [
      'deep-research',
      'data-analysis',
      'writing-mentor',
      'meeting-minutes',
      'email-editing',
      'status-report',
    ];
    for (const id of ids) {
      const expert = manifest.experts.find((entry: { id: string }) => entry.id === id);
      const card = cards.getByRole('button').filter({ hasText: expert.name });
      await card.click();
      await page.waitForFunction(
        (text) => document.querySelector('textarea')!.value.includes(text),
        expert.starterTasks[0],
      );
      const requests = await page.evaluate(() => Reflect.get(window, 'calls'));
      assert.deepEqual(
        requests
          .filter((call: { channel: string }) => call.channel === 'space.extensions.resolveExpert')
          .at(-1).input,
        { extensionId: manifest.id, expertId: id, revision: expert.revision, useSkill: true },
      );
      assert.ok((await page.locator('textarea').inputValue()).startsWith('保留草稿。'));
    }
    const before = await page.locator('textarea').inputValue();
    await page.evaluate(() => {
      Reflect.set(window, 'fail', true);
    });
    await cards.getByRole('button').filter({ hasText: '深度研究' }).click();
    await cards.getByRole('alert').waitFor();
    assert.equal(await page.locator('textarea').inputValue(), before);
    await page.evaluate(() => {
      Reflect.set(window, 'fail', false);
      Reflect.set(window, 'hold', true);
    });
    await cards.getByRole('button').filter({ hasText: '深度研究' }).click();
    await page.waitForFunction(() => !!Reflect.get(window, 'release'));
    assert.equal(
      await cards.getByRole('button').filter({ hasText: '邮件编辑' }).isDisabled(),
      true,
    );
    await page.getByRole('button', { name: '换项目' }).click();
    await page.evaluate(() => Reflect.get(window, 'release')());
    await cards.getByRole('status').waitFor({ state: 'detached' });
    assert.equal(await page.locator('textarea').inputValue(), before);
    const requests = await page.evaluate(() => Reflect.get(window, 'calls'));
    assert.ok(
      !requests.some((call: { channel: string }) =>
        ['session.send', 'session.create'].includes(call.channel),
      ),
    );
  },
);
