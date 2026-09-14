import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);

test('BottomBar connects expert capability choices only to its existing draft insertion seam', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../shell/BottomBar.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(source, /<PartnerCapabilityBar\s+onInsertDraft=\{insertAtCaret\}\s*\/>/);
});

async function mountCapabilityFixture(
  t: TestContext,
  withConnectors = false,
  legacyExpert = false,
) {
  const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BottomBar} from '../../shell/BottomBar.tsx';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerExpertProvider,usePartnerExpert} from './PartnerExpertProvider.tsx';
import {PartnerConnectorProvider} from './PartnerConnectorProvider.tsx';
const extension={id:'library',name:'Library',description:'',version:'1.0.0',enabled:true,installedAt:1,expertCount:1,connectorCount:1};
const expert={extensionId:'library',extensionVersion:'1.0.0',expert:{id:'feishu-office-suite',revision:1,name:'飞书办公套件专家',description:'',prompt:'Use the current Feishu scope.',starterTasks:[],expertType:'platform',capabilityGuide:{groups:[{id:'documents',label:'飞书文档',actions:[{id:'draft-document',label:'起草飞书文档',requiredConnectorIds:['feishu-docs'],promptTemplate:'请起草一份飞书文档。'}]},{id:'base',label:'多维表格',actions:[{id:'create-base',label:'新建多维表格',requiredConnectorIds:['feishu-docs'],promptTemplate:'请新建一个飞书多维表格。'}]}]}}};
const serviceBindings=[{extensionId:'library',connectorId:'feishu-docs',connectionId:'feishu-account',connectionRevision:1,documents:[],name:'飞书',accountLabel:'账号甲'}, {extensionId:'library',connectorId:'tencent-docs',connectionId:'tencent-account',connectionRevision:1,adapter:'tencent-docs-mcp',documents:[],name:'腾讯文档',accountLabel:'账号乙',allowCreateDocument:true}];
window.switchSession=()=>useAppStore.getState().setCurrentSession('session-b');
window.calls=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
  window.calls.push({channel,input});
  if(channel==='space.extensions.list')return {ok:true,data:{extensions:[extension]}};
  if(channel==='session.partnerConnectors.get')return {ok:true,data:{connectors:(input.sessionId==='session-a'?serviceBindings:serviceBindings.slice(1)).map(binding=>({binding,available:true}))}};
  if(channel==='session.partnerExpert.get')return {ok:true,data:{expert:${legacyExpert ? 'expert' : 'null'},available:true}};
  if(channel==='space.extensions.connectors.catalog')return {ok:true,data:{connectors:[]}};
  if(channel==='space.extensions.resolveExpert')return {ok:true,data:{expert}};
  if(channel==='session.listRunning')return {ok:true,data:{peers:[]}};
  if(channel==='slash.discover')return {ok:true,data:{commands:[]}};
  if(channel==='project.fileSearch')return {ok:true,data:{paths:[]}};
  return {ok:false,error:{code:'ERR_TEST_UNAVAILABLE',message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');
useAppStore.getState().setCurrentProject('/project');
${withConnectors ? "useAppStore.getState().setCurrentSession('session-a');" : ''}
function Fixture(){const context=usePartnerExpert();return <><button onClick={()=>context.binding.select({extensionId:'library',expertId:'feishu-office-suite',revision:1})}>引用飞书专家</button><BottomBar/></>;}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerExpertProvider>${withConnectors ? '<PartnerConnectorProvider><Fixture/></PartnerConnectorProvider>' : '<Fixture/>'}</PartnerExpertProvider></SpaceExtensionsProvider></I18nProvider>);
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
    logLevel: 'silent',
    define: {
      'import.meta.glob': '__testAssetGlob',
      'import.meta.env': '{}',
      'import.meta.url': '"about:blank"',
    },
    banner: { js: 'const __testAssetGlob = () => ({});' },
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
    plugins: [
      {
        name: 'vite-asset-environment',
        setup(builder) {
          builder.onResolve({ filter: /\?(?:url|inline|worker)$/ }, (args) => ({
            path: args.path,
            namespace: 'test-asset',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'test-asset' }, (args) => ({
            contents: args.path.endsWith('?worker')
              ? 'export default class TestWorker {}'
              : 'export default "";',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: 'zh-CN' });
  page.setDefaultTimeout(3_000);
  page.on('pageerror', (error) => t.diagnostic(error.message));
  await page.route('**/*', (route) =>
    route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }),
  );
  await page.goto('https://partner-capability.test/');
  await page.addScriptTag({ content: bundled.outputFiles[0]!.text });

  return page;
}

test(
  'a two-level expert capability choice inserts an editable prompt without sending or connecting',
  { skip: !browserPath },
  async (t) => {
    const page = await mountCapabilityFixture(t);
    await page.getByRole('button', { name: '引用飞书专家', exact: true }).click();
    await page.getByRole('button', { name: '多维表格', exact: true }).click();
    const draft = page.locator('textarea');
    await draft.fill('保留现有草稿：');
    await draft.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    await page.getByRole('button', { name: '新建多维表格', exact: true }).click();
    assert.equal(await draft.inputValue(), '保留现有草稿：请新建一个飞书多维表格。');
    await draft.fill('保留现有草稿：请新建一个飞书多维表格。字段包括项目、负责人');
    assert.equal(
      await draft.inputValue(),
      '保留现有草稿：请新建一个飞书多维表格。字段包括项目、负责人',
    );

    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.some(({ channel }) =>
        [
          'session.create',
          'session.send',
          'partner.connectors.connect',
          'partner.connectors.resolve',
          'session.partnerConnectors.set',
        ].includes(channel),
      ),
      false,
    );
  },
);

test(
  'connected service shortcuts need no expert, preserve drafts and reset when the session changes',
  { skip: !browserPath },
  async (t) => {
    const page = await mountCapabilityFixture(t, true);
    const bar = page.getByTestId('partner-capability-bar');
    await bar.getByRole('button', { name: '飞书 · 账号甲', exact: true }).click();
    await bar.getByRole('button', { name: '新建多维表格', exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'switchSession')());
    await bar.getByRole('button', { name: '腾讯文档 · 账号乙', exact: true }).waitFor();
    assert.equal(await bar.getByRole('button', { name: '新建多维表格', exact: true }).count(), 0);
    await bar.getByRole('button', { name: '腾讯文档 · 账号乙', exact: true }).click();
    const draft = page.locator('textarea');
    await draft.fill('保留草稿：');
    await draft.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    await bar.getByRole('button', { name: '新建文档', exact: true }).click();
    assert.match(await draft.inputValue(), /^保留草稿：.*腾讯文档.*账号乙/);
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.some(({ channel }) =>
        [
          'session.send',
          'session.create',
          'space.extensions.resolveExpert',
          'partner.connectors.connect',
          'session.partnerConnectors.set',
        ].includes(channel),
      ),
      false,
    );
  },
);

test(
  'connected services preserve authored shortcuts from an old platform expert',
  { skip: !browserPath },
  async (t) => {
    const page = await mountCapabilityFixture(t, true, true);
    const bar = page.getByTestId('partner-capability-bar');
    await page.evaluate(() => Reflect.get(window, 'switchSession')());
    await bar.getByRole('button', { name: '腾讯文档 · 账号乙', exact: true }).waitFor();
    await bar.getByRole('button', { name: '多维表格', exact: true }).click();
    await bar.getByRole('button', { name: '新建多维表格', exact: true }).click();
    assert.equal(await page.locator('textarea').inputValue(), '请新建一个飞书多维表格。');
  },
);
