import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerConnectorProvider,usePartnerConnectors} from './PartnerConnectorProvider.tsx';
import {PartnerConnectorDetails} from './PartnerConnectorDetails.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
const adapter=window.fixtureAdapter??'qq-mail-imap';
const connector={id:'mail',adapter,name:'Test connector',description:'Read authorized sources'};
const extension={id:'library',version:'0.1.0',name:'Library',description:'',enabled:true,installedAt:1,expertCount:0,connectorCount:1};
const connection={id:'00000000-0000-4000-8000-000000000001',extensionId:'library',connectorId:'mail',adapter,revision:1,profile:'isolated',accountLabel:'reader@qq.com',connected:true,permissions:{read:true,create:adapter==='tencent-docs-mcp',append:false}};
let bindings=[{extensionId:'library',connectorId:'mail',adapter,connectionId:connection.id,connectionRevision:1,documents:[],...(window.authorized?{mailbox:'inbox'}:{})}];
const message={reference:'mail://qq/inbox/42/7',subject:'Project report',from:'sender@example.com',to:'reader@qq.com',date:'2026-09-01T00:00:00Z',size:200};
window.calls=[];window.opened=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='space.extensions.list')return {ok:true,data:{extensions:[extension]}};
if(channel==='space.extensions.connectors.catalog')return {ok:true,data:{connectors:[connector]}};
if(channel==='partner.connectors.accounts')return {ok:true,data:{connections:[connection]}};
if(channel==='admin.policy.get')return {ok:true,data:{policy:{connectors:{writesAllowed:true}}}};
if(channel==='session.partnerConnectors.get'){const result={ok:true,data:{connectors:bindings.map(binding=>({binding:{...binding,name:connector.name,accountLabel:connection.accountLabel},available:true}))}};if(window.holdScope)return new Promise(resolve=>{window.finishScope=()=>resolve(result)});return result;}
if(channel==='session.partnerConnectors.set'){bindings=input.connectors;return {ok:true,data:{connectors:bindings.map(binding=>({binding:{...binding,name:connector.name,accountLabel:connection.accountLabel},available:true}))}};}
if(channel==='partner.connectors.search'){
if(window.failSearch)return {ok:false,error:{message:'Mailbox unavailable'}};
const result={ok:true,data:{messages:input.cursor?[]:[message],nextCursor:input.cursor?undefined:'next-page',uidValidity:'42',scannedUidRange:{from:1,to:500},hasMore:!input.cursor}};
if(window.holdSearch)return new Promise(resolve=>{window.finishSearch=()=>resolve(result)});return result;
}
if(channel==='partner.connectors.read')return {ok:true,data:{source:{id:'source-7',connectionId:connection.id,sessionId:'session-1',projectRoot:'/project',title:message.subject,content:'Saved email body'}}};
return {ok:false,error:{message:'Unexpected channel '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject('/project');useAppStore.getState().setCurrentSession('session-1');
function Controls(){const context=usePartnerConnectors();window.refreshScope=()=>context.binding.refresh();return null;}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerConnectorProvider><Controls/><button onClick={()=>useAppStore.getState().setCurrentSession('session-2')}>Switch session</button><PartnerConnectorDetails extensionId='library' connector={connector} onOpenDetail={target=>window.opened.push(target)}/></PartnerConnectorProvider></SpaceExtensionsProvider></I18nProvider>);
`;
async function openFixture(
  t: TestContext,
  options: { authorized?: boolean; adapter?: string; holdSearch?: boolean } = {},
) {
  const bundle = await build({
    stdin: {
      contents: `window.authorized=${!!options.authorized};window.fixtureAdapter=${JSON.stringify(options.adapter)};window.holdSearch=${!!options.holdSearch};\n${fixture}`,
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
  const page = await browser.newPage({ locale: 'en-US' });
  page.setDefaultTimeout(3000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://mailbox.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://mailbox.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { page, errors };
}
test(
  'mail search requires a saved inbox scope and selected mail opens the shared source detail',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page
      .getByText('Save inbox access for this conversation before searching.', { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: 'Exact target 1', exact: true }).count(),
      0,
    );
    await page
      .getByRole('checkbox', {
        name: 'Allow searching and reading this account’s inbox in this conversation',
        exact: true,
      })
      .check();
    await page
      .getByRole('button', { name: 'Use this scope in the conversation', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Subject contains', exact: true }).fill('Project');
    await page.getByRole('button', { name: 'Search mail', exact: true }).click();
    await page.getByText('Project report', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Read mail', exact: true }).click();
    await page.waitForFunction(() => Reflect.get(window, 'opened').length === 1);
    assert.deepEqual(await page.evaluate(() => Reflect.get(window, 'opened')), [
      { kind: 'remoteSource', sourceId: 'source-7', title: 'Project report' },
    ]);
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: Record<string, unknown>;
    }[];
    assert.deepEqual(calls.find((call) => call.channel === 'partner.connectors.search')?.input, {
      projectRoot: '/project',
      sessionId: 'session-1',
      connectionId: '00000000-0000-4000-8000-000000000001',
      query: { subject: 'Project' },
      limit: 25,
    });
    assert.equal(calls.filter((call) => call.channel === 'partner.connectors.read').length, 1);
    assert.deepEqual(errors, []);
  },
);
test(
  'mail search pagination uses the returned cursor and editing filters discards stale pages',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { authorized: true });
    await page.getByRole('button', { name: 'Search mail', exact: true }).click();
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByText('No matching mail in the scanned inbox range.', { exact: true }).waitFor();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { cursor?: string };
    }[];
    assert.deepEqual(
      calls
        .filter((call) => call.channel === 'partner.connectors.search')
        .map((call) => call.input.cursor),
      [undefined, 'next-page'],
    );
    await page.getByRole('textbox', { name: 'Sender contains', exact: true }).fill('other');
    assert.equal(
      await page.getByText('No matching mail in the scanned inbox range.', { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  },
);
test(
  'mail search replies from a previous session are discarded',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { authorized: true, holdSearch: true });
    await page.getByRole('button', { name: 'Search mail', exact: true }).click();
    await page.waitForFunction(() => typeof Reflect.get(window, 'finishSearch') === 'function');
    await page.getByRole('button', { name: 'Switch session', exact: true }).click();
    await page.evaluate(() => Reflect.get(window, 'finishSearch')());
    assert.equal(await page.getByText('Project report', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  },
);
test(
  'Tencent Docs scope offers explicit creation without copying Feishu folder or append controls',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { adapter: 'tencent-docs-mcp' });
    const create = page.getByRole('checkbox', {
      name: 'Allow this conversation to create documents',
      exact: true,
    });
    await create.check();
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Optional folder for new documents', exact: true })
        .count(),
      0,
    );
    await page
      .getByRole('button', { name: 'Use this scope in the conversation', exact: true })
      .click();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { connectors?: { allowCreateDocument?: boolean; adapter: string }[] };
    }[];
    const selection = calls.find((call) => call.channel === 'session.partnerConnectors.set')?.input
      .connectors?.[0];
    assert.equal(selection?.adapter, 'tencent-docs-mcp');
    assert.equal(selection?.allowCreateDocument, true);
    assert.deepEqual(errors, []);
  },
);

test(
  'scope refresh during mail search drops the response and restores an actionable search form',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { authorized: true, holdSearch: true });
    await page.getByRole('button', { name: 'Search mail', exact: true }).click();
    await page.waitForFunction(() => typeof Reflect.get(window, 'finishSearch') === 'function');
    await page.evaluate(() => {
      Reflect.set(window, 'holdScope', true);
      void Reflect.get(window, 'refreshScope')();
    });
    await page.waitForFunction(() => typeof Reflect.get(window, 'finishScope') === 'function');
    await page.evaluate(() => Reflect.get(window, 'finishSearch')());
    await page.evaluate(() => {
      Reflect.set(window, 'holdScope', false);
      Reflect.get(window, 'finishScope')();
    });
    await page.getByRole('button', { name: 'Search mail', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Search mail', exact: true }).isDisabled(),
      false,
    );
    assert.equal(await page.getByText('Project report', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  },
);

test('mail search failures can be retried in the same scope', { skip: !browserPath }, async (t) => {
  const { page, errors } = await openFixture(t, { authorized: true });
  await page.evaluate(() => Reflect.set(window, 'failSearch', true));
  await page.getByRole('button', { name: 'Search mail', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Mailbox unavailable' }).waitFor();
  await page.evaluate(() => Reflect.set(window, 'failSearch', false));
  await page.getByRole('button', { name: 'Search mail', exact: true }).click();
  await page.getByText('Project report', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []);
});
