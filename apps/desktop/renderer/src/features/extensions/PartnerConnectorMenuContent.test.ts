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
import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerConnectorProvider} from './PartnerConnectorProvider.tsx';
import {PartnerConnectorChips,PartnerConnectorMenuContent,projectPartnerConnectorMenuRows} from './PartnerConnectorChips.tsx';
import {PARTNER_CONNECTOR_MANAGE_EVENT} from './PartnerConnectorProvider.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';

const connectors=Array.from({length:10},(_,index)=>({
  id:'connector-'+(index+1),
  adapter:index===0?'feishu-cli':index===1?'wecom-cli':index===2&&window.configurationMode?'slack-mcp':'test-cli-'+(index+1),
  name:index===2&&window.configurationMode?'Slack':(index<2?'Connected ':'Available ')+(index+1),
  description:'Connector '+(index+1),
}));
const extension={id:'partner-library',version:'1.0.0',name:'Partner library',description:'',enabled:true,installedAt:1,expertCount:2,connectorCount:connectors.length};
const connections=Object.fromEntries(connectors.slice(0,2).map((connector,index)=>[connector.id,[{
  id:'00000000-0000-4000-8000-00000000000'+(index+1),
  extensionId:extension.id,
  connectorId:connector.id,
  revision:1,
  adapter:connector.adapter,
  profile:'qa-'+(index+1),
  accountLabel:'QA '+(index+1),
  connected:true,
  permissions:{read:true,create:false,append:false},
}]]));
const staleConfigurationBinding={
  binding:{
    extensionId:extension.id,
    connectorId:connectors[2].id,
    connectionId:'00000000-0000-4000-8000-000000000098',
    connectionRevision:2,
    adapter:'slack-mcp',
    name:'Slack',
    accountLabel:'Legacy Slack account',
    documents:[],
  },
  available:false,
};
if(window.configurationMode)connections[connectors[2].id]=[{
  id:staleConfigurationBinding.binding.connectionId,
  extensionId:extension.id,
  connectorId:connectors[2].id,
  revision:2,
  adapter:'slack-mcp',
  profile:'legacy-slack',
  accountLabel:'Legacy Slack account',
  connected:false,
  permissions:{read:true,create:false,append:false,createBase:false},
}];
window.staleRows=projectPartnerConnectorMenuRows([{
  extensionId:extension.id,
  connector:connectors[2],
  connections:[],
}],[{
  binding:{
    extensionId:extension.id,
    connectorId:connectors[2].id,
    connectionId:'00000000-0000-4000-8000-000000000099',
    connectionRevision:3,
    adapter:connectors[2].adapter,
    name:connectors[2].name,
    accountLabel:'Disconnected QA',
    documents:[],
  },
  available:false,
  unavailableReason:'Account disconnected',
}]);
if(window.configurationMode)window.configurationPriorityRows=projectPartnerConnectorMenuRows([
  ...[0,1,3,4,5].map(index=>({
    extensionId:extension.id,
    connector:connectors[index],
    connections:[{
      id:'00000000-0000-4000-8000-0000000000'+(index+10),
      extensionId:extension.id,
      connectorId:connectors[index].id,
      revision:1,
      adapter:connectors[index].adapter,
      profile:'connected-'+index,
      accountLabel:'Connected '+index,
      connected:true,
      permissions:{read:true,create:false,append:false,createBase:false},
    }],
  })),
  {extensionId:extension.id,connector:connectors[2],connections:connections[connectors[2].id]},
],[staleConfigurationBinding]);
window.calls=[];window.management=[];window.closed=0;
window.addEventListener(PARTNER_CONNECTOR_MANAGE_EVENT,event=>window.management.push(event.detail));
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
  window.calls.push({channel,input});
  if(channel==='space.extensions.list')return {ok:true,data:{extensions:[extension]}};
  if(channel==='space.extensions.connectors.catalog')return {ok:true,data:{connectors}};
  if(channel==='partner.connectors.accounts')return {ok:true,data:{connections:connections[input.connectorId]??[]}};
  if(channel==='partner.connectors.resolve')return {ok:true,data:{connectors:input.connectors.map(binding=>({binding:{...binding,name:connectors.find(item=>item.id===binding.connectorId).name,accountLabel:'QA 1'},available:true}))}};
  if(channel==='session.partnerConnectors.get')return {ok:true,data:{connectors:window.configurationMode?[staleConfigurationBinding]:[]}};
  if(channel==='session.partnerConnectors.set')return {ok:true,data:{connectors:input.connectors.map(binding=>({binding:{...binding,name:'Slack',accountLabel:'Legacy Slack account'},available:true}))}};
  return {ok:false,error:{message:'Unexpected channel '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');
useAppStore.getState().setCurrentProject('/project');
if(window.configurationMode)useAppStore.getState().setCurrentSession('legacy-session');
createRoot(document.getElementById('root')).render(
  <I18nProvider><SpaceExtensionsProvider><PartnerConnectorProvider>
    <PartnerConnectorMenuContent onClose={()=>window.closed+=1} showHeading={false}/>
    <PartnerConnectorChips/>
  </PartnerConnectorProvider></SpaceExtensionsProvider></I18nProvider>
);
`;

test(
  'Partner connector flyout shows at most five configured connectors, connected first, with session switches and plugin navigation',
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
      loader: { '.png': 'dataurl', '.svg': 'dataurl' },
      logLevel: 'silent',
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(3_000);
    await page.route('http://partner-connectors.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://partner-connectors.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    const [staleRow] = (await page.evaluate(() => Reflect.get(window, 'staleRows'))) as {
      connector: { name: string };
      connection?: { id: string; connected: boolean };
      selected?: { available: boolean };
    }[];
    assert.equal(staleRow?.connector.name, 'Available 3');
    assert.equal(staleRow?.connection?.id, '00000000-0000-4000-8000-000000000099');
    assert.equal(staleRow?.connection?.connected, false);
    assert.equal(staleRow?.selected?.available, false);

    const menu = page.getByTestId('partner-connector-menu-content');
    const rows = menu.getByTestId('partner-connector-menu-row');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 5);
    assert.deepEqual(await rows.locator('[data-connector-name]').allTextContents(), [
      'Connected 1',
      'Connected 2',
      'Available 3',
      'Available 4',
      'Available 5',
    ]);
    assert.equal(await menu.getByText('Available 6', { exact: true }).count(), 0);

    const firstSwitch = menu.getByRole('switch', {
      name: '在本会话启用 Connected 1',
      exact: true,
    });
    assert.equal(await firstSwitch.getAttribute('aria-checked'), 'false');
    await firstSwitch.click();
    await firstSwitch.evaluate((element) => {
      if (element.getAttribute('aria-checked') !== 'true') throw new Error('switch not enabled');
    });
    await firstSwitch.click();
    await firstSwitch.evaluate((element) => {
      if (element.getAttribute('aria-checked') !== 'false') throw new Error('switch not disabled');
    });

    await menu.getByRole('button', { name: '连接 Available 3', exact: true }).click();
    await menu.getByRole('button', { name: '更多', exact: true }).click();
    const management = (await page.evaluate(() => Reflect.get(window, 'management'))) as {
      extensionId?: string;
    }[];
    assert.equal(management.length, 2);
    assert.equal(management[0]?.extensionId, 'partner-library');
    assert.equal(management[1]?.extensionId, 'partner-library');
  },
);

test(
  'Partner connector icon group exposes only connected connectors and controls their conversation switches',
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
      loader: { '.png': 'dataurl', '.svg': 'dataurl' },
      logLevel: 'silent',
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(3_000);
    await page.route('http://partner-connector-icons.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://partner-connector-icons.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await page
      .getByTestId('partner-connector-menu-content')
      .first()
      .getByRole('switch', { name: '在本会话启用 Connected 1', exact: true })
      .click();
    const chips = page.getByTestId('partner-connector-chips');
    await chips.waitFor();
    assert.equal(await chips.getByTestId('partner-connector-active-icon').count(), 1);
    await chips.getByRole('button', { name: '本会话连接器', exact: true }).click();

    const popover = page.getByTestId('partner-connector-popover');
    const rows = popover.getByTestId('partner-connector-menu-row');
    await rows.first().waitFor();
    assert.deepEqual(await rows.locator('[data-connector-name]').allTextContents(), [
      'Connected 1',
      'Connected 2',
    ]);
    assert.equal(await popover.getByText('Available 3', { exact: true }).count(), 0);
    assert.equal(await popover.getByRole('button', { name: '更多', exact: true }).count(), 1);

    const firstSwitch = popover.getByRole('switch', {
      name: '在本会话启用 Connected 1',
      exact: true,
    });
    await firstSwitch.click();
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
  },
);

test(
  'revoked Slack bindings never appear connected and remain removable',
  { skip: !browserPath },
  async (t) => {
    const output = await build({
      stdin: {
        contents: `window.configurationMode=true;\n${fixture}`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.png': 'dataurl', '.svg': 'dataurl' },
      logLevel: 'silent',
      define: { 'import.meta.env': '{}' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.setDefaultTimeout(3_000);
    await page.route('http://configuration-required.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://configuration-required.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    const menu = page.getByTestId('partner-connector-menu-content').first();
    await page.waitForFunction(() =>
      Reflect.get(window, 'calls').some(
        (call: { channel: string }) => call.channel === 'session.partnerConnectors.get',
      ),
    );
    const priorityNames = (await page.evaluate(() =>
      Reflect.get(window, 'configurationPriorityRows').map(
        (row: { connector: { name: string } }) => row.connector.name,
      ),
    )) as string[];
    assert.equal(priorityNames.includes('Slack'), true);
    const slackRow = menu.getByTestId('partner-connector-menu-row').filter({ hasText: 'Slack' });
    const remove = slackRow.getByRole('switch');
    await remove.waitFor();
    assert.equal(await remove.getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await remove.click();
    await page.waitForFunction(() =>
      Reflect.get(window, 'calls').some(
        (call: { channel: string; input: { connectors: unknown[] } }) =>
          call.channel === 'session.partnerConnectors.set' && call.input.connectors.length === 0,
      ),
    );
    assert.equal(await remove.count(), 0);
  },
);
