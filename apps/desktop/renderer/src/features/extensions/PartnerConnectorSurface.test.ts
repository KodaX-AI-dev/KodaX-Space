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
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerConnectorProvider,usePartnerConnectors} from './PartnerConnectorProvider.tsx';
import {PartnerConnectorDetails} from './PartnerConnectorDetails.tsx';
import {PartnerConnectorChips} from './PartnerConnectorChips.tsx';
import {PartnerRemoteRecords} from './PartnerRemoteRecords.tsx';
import {PartnerRemoteRecordsProvider} from './usePartnerRemoteRecords.ts';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
import {useConfirmStore} from '../../store/confirmStore.ts';
import {startNewConversation} from '../../store/newConversation.ts';
const adapter=window.fixtureAdapter??'feishu-cli';
const connector={id:'feishu-docs',adapter,name:adapter==='slack-mcp'?'Slack':'Feishu documents',description:''};
const extension={id:'library',version:'0.4.0',name:'Library',description:'',enabled:true,installedAt:1,expertCount:0,connectorCount:1};
const connection={id:'00000000-0000-4000-8000-000000000001',extensionId:'library',connectorId:'feishu-docs',revision:1,profile:'qa',accountLabel:'QA account',connected:true,permissions:{read:true,create:true,append:true,createBase:true}};
if(window.fixtureAdapter){connection.adapter=window.fixtureAdapter;connection.permissions={read:true,create:false,append:false,createBase:false};}
let connected=true;let allowed=false;let selected=window.fixtureSelections??[];
const proposal={id:'00000000-0000-4000-8000-000000000002',sessionId:'test-session',projectRoot:'/project',extensionId:'library',connectorId:'feishu-docs',connectionId:connection.id,connectionRevision:1,operation:'append',targetUrl:'https://example.feishu.cn/docx/Doc1',title:'Append conclusion',content:'Only append this reviewed sentence.',rationale:'Requested summary',contentHash:'a'.repeat(64),scopeHash:'b'.repeat(64),baseRevision:8,status:'pending',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z'};
window.calls=[];
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='space.extensions.list')return {ok:true,data:{extensions:[extension]}};
if(channel==='space.extensions.connectors.catalog')return {ok:true,data:{connectors:[connector]}};
if(channel==='partner.connectors.accounts')return {ok:true,data:{connections:connected?[connection]:[]}};
if(channel==='partner.connectors.inspect')return {ok:true,data:{installed:true,version:'1.0.92',profiles:[{name:'qa',label:'QA profile'}],connections:connected?[connection]:[]}};
if(channel==='admin.policy.get')return {ok:true,data:{policy:{connectors:{writesAllowed:allowed}}}};
if(channel==='admin.policy.set'){allowed=input.connectors.writesAllowed;return {ok:true,data:{policy:{connectors:{writesAllowed:allowed}},diagnostics:[]}};}
if(channel==='partner.connectors.connect'){connected=true;return {ok:true,data:{connection}};}
if(channel==='partner.connectors.disconnect'){connected=false;return {ok:true,data:{ok:true}};}
if(channel==='partner.connectors.forget'){connected=false;return {ok:true,data:{ok:true}};}
if(channel==='partner.connectors.resolve'){selected=input.connectors;return {ok:true,data:{connectors:input.connectors.map(binding=>({binding:{...binding,name:'Feishu documents',accountLabel:'QA account'},available:true}))}};}
if(channel==='session.partnerConnectors.get'){
const result=()=>({ok:true,data:{connectors:selected.map(binding=>({binding:{...binding,name:'Feishu documents',accountLabel:'QA account'},available:true}))}});
if(window.holdScopeLoad)return new Promise(resolve=>{window.finishScopeLoad=()=>resolve(result());window.failScopeLoad=()=>resolve({ok:false,error:{message:'Cannot load saved scope'}});});
return result();
}
if(channel==='session.partnerConnectors.set'){selected=input.connectors;return {ok:true,data:{connectors:selected.map(binding=>({binding:{...binding,name:'Feishu documents',accountLabel:'QA account'},available:true}))}};}
if(channel==='partner.connectors.read')return new Promise(resolve=>{window.finishRead=()=>resolve({ok:true,data:{source:{id:'old-source',title:'Old project source',content:'Old content'}}});});
if(channel==='partner.connectors.records')return {ok:true,data:{sources:[],proposals:[proposal],receipts:[],baseTasks:[]}};
if(channel==='partner.connectors.proposals.get')return {ok:true,data:{proposal}};
if(channel==='partner.connectors.proposals.apply'){proposal.status='unknown';proposal.error='Connection lost after dispatch';return {ok:true,data:{proposal}};}
return {ok:false,error:{message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject('/project');
function Confirm(){const current=useConfirmStore(state=>state.current);return current?<div role="dialog"><p>{current.message}</p><button onClick={()=>useConfirmStore.getState().settle(current.id,true)}>Confirm policy</button><button onClick={()=>useConfirmStore.getState().settle(current.id,false)}>Cancel policy</button></div>:null;}
function RefreshBinding(){const context=usePartnerConnectors();const [finished,setFinished]=useState(false);window.refreshBinding=()=>context.binding.refresh();return <><button onClick={async()=>{await context.binding.refresh();setFinished(true);}}>Refresh binding metadata</button><output>{finished?'Metadata refreshed':'Waiting metadata'}</output></>;}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerConnectorProvider><PartnerRemoteRecordsProvider><textarea aria-label="Draft" defaultValue="Keep this draft"/><PartnerConnectorChips/><RefreshBinding/><button onClick={()=>startNewConversation()}>New conversation</button><button onClick={()=>useAppStore.getState().setCurrentSession('test-session')}>Enter test session</button><button onClick={()=>useAppStore.getState().setCurrentProject('/other')}>Switch project</button><button onClick={()=>window.finishRead?.()}>Finish old read</button><PartnerConnectorDetails extensionId="library" connector={connector}/><PartnerRemoteRecords kind="pendingReview"/><Confirm/></PartnerRemoteRecordsProvider></PartnerConnectorProvider></SpaceExtensionsProvider></I18nProvider>);
`;

test(
  'connector scope save waits for the session scope, preserves other accounts and blocks refresh races',
  { skip: !browserPath },
  async (t) => {
    const saved = [
      {
        extensionId: 'library',
        connectorId: 'feishu-docs',
        connectionId: '00000000-0000-4000-8000-000000000001',
        connectionRevision: 1,
        documents: [{ url: 'https://example.feishu.cn/docx/Doc1', access: 'append' }],
        createFolderUrl: 'https://example.feishu.cn/drive/folder/Folder1',
        createBaseFolderUrl: 'https://example.feishu.cn/drive/folder/BaseFolder1',
      },
      {
        extensionId: 'library',
        connectorId: 'feishu-docs',
        connectionId: '00000000-0000-4000-8000-000000000003',
        connectionRevision: 1,
        documents: [{ url: 'https://example.feishu.cn/docx/Doc2', access: 'read' }],
      },
    ];
    const output = await build({
      stdin: {
        contents: `window.fixtureSelections=${JSON.stringify(saved)};window.holdScopeLoad=true;\n${fixture}`,
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
    await page.route('http://scope-loading.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://scope-loading.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    await page.getByRole('button', { name: 'Enter test session', exact: true }).click();
    const details = page.getByTestId('partner-connector-details');
    const save = details.getByRole('button', {
      name: 'Use this scope in the conversation',
      exact: true,
    });
    await save.waitFor();
    await page.waitForFunction(() => typeof Reflect.get(window, 'finishScopeLoad') === 'function');
    assert.equal(
      await save.isDisabled(),
      true,
      'loaded accounts must not enable save before session scope loads',
    );
    await page.evaluate(() => Reflect.get(window, 'failScopeLoad')());
    await page.getByText('Cannot load saved scope', { exact: false }).first().waitFor();
    assert.equal(
      await save.isDisabled(),
      true,
      'failed scope loads must not permit empty replacement',
    );
    await page.evaluate(() => {
      Reflect.set(window, 'holdScopeLoad', false);
    });
    await details.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await details.getByRole('textbox', { name: 'Exact target 1', exact: true }).waitFor();
    assert.equal(
      await details
        .getByRole('textbox', { name: 'Optional folder for new documents', exact: true })
        .inputValue(),
      saved[0].createFolderUrl,
    );
    await save.click();
    const selections = await page.evaluate(() =>
      Reflect.get(window, 'calls').filter(
        (call: { channel: string }) => call.channel === 'session.partnerConnectors.set',
      ),
    );
    assert.equal(selections.length, 1);
    assert.deepEqual(selections[0].input.connectors, [saved[1], saved[0]]);
    await save.evaluate((button) => {
      Reflect.set(window, 'holdScopeLoad', true);
      void Reflect.get(window, 'refreshBinding')();
      (button as HTMLButtonElement).click();
    });
    const setCount = await page.evaluate(
      () =>
        Reflect.get(window, 'calls').filter(
          (call: { channel: string }) => call.channel === 'session.partnerConnectors.set',
        ).length,
    );
    assert.equal(
      setCount,
      1,
      'a refresh started in the same event must synchronously block stale save',
    );
    await page.evaluate(() => Reflect.get(window, 'finishScopeLoad')());
  },
);

test(
  'verified Slack connection exposes resource scope and read-only composer',
  { skip: !browserPath },
  async (t) => {
    const output = await build({
      stdin: {
        contents: `window.fixtureAdapter='slack-mcp';window.fixtureSelections=[{extensionId:'library',connectorId:'feishu-docs',connectionId:'00000000-0000-4000-8000-000000000001',connectionRevision:1,adapter:'slack-mcp',documents:[{url:'slack://channel/C12345678/message/1234567890.123456',access:'read'}]}];\n${fixture}`,
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
    page.setDefaultTimeout(3_000);
    await page.route('http://configuration-required-details.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://configuration-required-details.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });

    const details = page.getByTestId('partner-connector-details');
    await details.getByRole('heading', { name: 'Slack', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Enter test session', exact: true }).click();
    await details.getByRole('heading', { name: 'Resource scope', exact: true }).waitFor();
    await details.getByTestId('partner-remote-composer').waitFor();
    assert.equal(await details.getByRole('combobox', { name: 'Account connection' }).count(), 1);
    assert.equal(
      await details
        .getByRole('button', { name: 'Read selected resource', exact: true })
        .isEnabled(),
      true,
    );
    assert.equal(
      await details
        .getByRole('button', { name: 'Remove local account record QA account', exact: true })
        .count(),
      0,
    );
    assert.equal(await details.locator('input[placeholder^="https://example.feishu"]').count(), 0);
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.some((call) => call.channel === 'partner.connectors.forget'),
      false,
    );
  },
);

test(
  'connector composer projects only matching resources and gates append by the implemented provider operation',
  { skip: !browserPath },
  async (t) => {
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    for (const [adapter, resource, readLabel, access] of [
      ['feishu-cli', 'https://example.feishu.cn/docx/Doc1', 'Read selected document', 'append'],
      [
        'notion-mcp',
        'notion://page/0123456789abcdef0123456789abcdef',
        'Read selected document',
        'read',
      ],
      [
        'airtable-mcp',
        'airtable://base/app1234567890/table/tbl1234567890',
        'Read selected resource',
        'read',
      ],
    ] as const) {
      await t.test(adapter, async () => {
        const selected = [
          {
            extensionId: 'library',
            connectorId: 'feishu-docs',
            connectionId: '00000000-0000-4000-8000-000000000001',
            connectionRevision: 1,
            adapter,
            documents: [
              { url: resource, access: 'append' },
              { url: 'file:///tmp/private-note', access: 'append' },
            ],
          },
        ];
        const output = await build({
          stdin: {
            contents: `window.fixtureAdapter=${JSON.stringify(adapter)};window.fixtureSelections=${JSON.stringify(selected)};\n${fixture}`,
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
        const page = await browser.newPage({ locale: 'en-US' });
        t.after(() => page.close());
        page.setDefaultTimeout(3_000);
        await page.route('http://connector-projection.test/', (route) =>
          route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
        );
        await page.goto('http://connector-projection.test/');
        await page.addScriptTag({ content: output.outputFiles[0].text });
        await page.getByRole('button', { name: 'Enter test session', exact: true }).click();
        const composer = page.getByTestId('partner-remote-composer');
        await composer.waitFor();
        assert.equal(
          await composer.getByRole('option').count(),
          1,
          'unrecognized references cannot become action targets',
        );
        await composer.getByRole('button', { name: readLabel, exact: true }).click();
        const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
          channel: string;
          input?: { documentUrl?: string };
        }[];
        assert.equal(
          calls.find((call) => call.channel === 'partner.connectors.read')?.input?.documentUrl,
          resource,
        );
        assert.equal(
          await composer
            .getByRole('textbox', { name: 'Document / proposal title', exact: true })
            .count(),
          access === 'append' ? 1 : 0,
          'stored append access cannot grant an operation absent from the provider implementation',
        );
        assert.equal(
          calls.some((call) => call.channel === 'partner.connectors.proposals.create'),
          false,
        );
      });
    }
  },
);

test(
  'read-only provider details save the adapter and hide irrelevant Feishu write controls',
  { skip: !browserPath },
  async (t) => {
    const output = await build({
      stdin: {
        contents: `window.fixtureAdapter='tencent-meeting-cli';\n${fixture}`,
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
    await page.route('http://readonly.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://readonly.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    const details = page.getByTestId('partner-connector-details');
    await details.getByRole('combobox', { name: 'Account connection' }).waitFor();
    assert.equal(
      await details.getByRole('button', { name: 'Allow reviewed writes globally' }).count(),
      0,
    );
    assert.equal(
      await details.getByRole('textbox', { name: 'Optional folder for new documents' }).count(),
      0,
    );
    assert.equal(
      await details
        .getByRole('textbox', { name: 'Optional folder for new multidimensional tables' })
        .count(),
      0,
    );
    await details.getByRole('button', { name: 'Add resource', exact: true }).click();
    await details
      .getByRole('textbox', { name: 'Exact target 1', exact: true })
      .fill('tmeet://meeting-code/123456');
    await details
      .getByRole('button', { name: 'Use this scope in the conversation', exact: true })
      .click();
    await page
      .getByText('Scope saved. Your draft was not changed and no message was sent.', {
        exact: true,
      })
      .waitFor();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { connectors?: { adapter?: string; documents: { url: string }[] }[] };
    }[];
    const saved = calls.filter((call) => call.channel === 'partner.connectors.resolve').at(-1)
      ?.input.connectors?.[0];
    assert.equal(saved?.adapter, 'tencent-meeting-cli');
    assert.equal(saved?.documents[0].url, 'tmeet://meeting-code/123456');
    assert.equal(
      calls.some((call) =>
        /onboarding|partner.connectors.read|admin.policy.set/.test(call.channel),
      ),
      false,
    );
  },
);

test(
  'trusted connector setup separates account verification, document scope, draft chips and explicit global policy',
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
    const page = await browser.newPage({ locale: 'en-US' });
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://partner.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://partner.test/');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    try {
      await page.getByRole('button', { name: 'Manage connectors', exact: true }).waitFor();
    } catch (error) {
      t.diagnostic(
        JSON.stringify({
          errors,
          text: await page.locator('body').innerText(),
          calls: await page.evaluate(() => Reflect.get(window, 'calls')),
        }),
      );
      throw error;
    }
    const details = page.getByTestId('partner-connector-details');
    await details.getByRole('heading', { name: 'Feishu documents', exact: true }).waitFor();
    const logo = details.locator('header img[data-testid="partner-connector-icon"]');
    await logo.waitFor();
    assert.deepEqual(
      await logo.evaluate(async (element) => {
        const image = element as HTMLImageElement;
        await image.decode();
        return [
          image.naturalWidth,
          image.naturalHeight,
          image.alt,
          image.getAttribute('aria-hidden'),
        ];
      }),
      [700, 700, '', 'true'],
    );
    assert.equal(await page.locator('[data-testid="partner-connector-chips"]').count(), 0);
    await page
      .getByText('Account connected; not selected for this conversation', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Add document', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Exact target 1', exact: true })
      .fill('https://example.feishu.cn/docx/Doc1');
    await page
      .getByRole('textbox', {
        name: 'Optional folder for new multidimensional tables',
        exact: true,
      })
      .fill('https://example.feishu.cn/drive/folder/BaseFolder');
    await page
      .getByRole('button', { name: 'Use this scope in the conversation', exact: true })
      .click();
    await page.getByTestId('partner-connector-chips').waitFor();
    await page
      .getByRole('textbox', { name: 'Exact target 1', exact: true })
      .fill('https://example.feishu.cn/docx/Unsaved');
    await page
      .getByRole('combobox', {
        name: 'Documents and optional destination folders for this conversation',
        exact: true,
      })
      .selectOption('append');
    await page
      .getByRole('textbox', { name: 'Optional folder for new documents', exact: true })
      .fill('https://example.feishu.cn/drive/folder/UnsavedFolder');
    await page
      .getByRole('textbox', {
        name: 'Optional folder for new multidimensional tables',
        exact: true,
      })
      .fill('https://example.feishu.cn/drive/folder/UnsavedBaseFolder');
    await page.getByRole('button', { name: 'Refresh binding metadata', exact: true }).click();
    await page.getByText('Metadata refreshed', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: 'Exact target 1', exact: true }).inputValue(),
      'https://example.feishu.cn/docx/Unsaved',
    );
    assert.equal(
      await page
        .getByRole('combobox', {
          name: 'Documents and optional destination folders for this conversation',
          exact: true,
        })
        .inputValue(),
      'append',
    );
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Optional folder for new documents', exact: true })
        .inputValue(),
      'https://example.feishu.cn/drive/folder/UnsavedFolder',
    );
    assert.equal(
      await page
        .getByRole('textbox', {
          name: 'Optional folder for new multidimensional tables',
          exact: true,
        })
        .inputValue(),
      'https://example.feishu.cn/drive/folder/UnsavedBaseFolder',
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Draft', exact: true }).inputValue(),
      'Keep this draft',
    );
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { connectors?: { createBaseFolderUrl?: string }[] };
    }[];
    assert.equal(
      calls.filter((item) => item.channel === 'partner.connectors.resolve').at(-1)?.input
        .connectors?.[0]?.createBaseFolderUrl,
      'https://example.feishu.cn/drive/folder/BaseFolder',
    );
    assert.equal(
      calls.some(
        (item) => item.channel === 'session.create' || item.channel === 'partner.connectors.read',
      ),
      false,
    );
    assert.equal(
      calls.some((item) => item.channel === 'admin.policy.set'),
      false,
    );
    await page.getByRole('button', { name: 'Allow reviewed writes globally', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel policy', exact: true }).click();
    assert.equal(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as { channel: string }[]).some(
        (item) => item.channel === 'admin.policy.set',
      ),
      false,
    );
    await page.getByRole('button', { name: 'Allow reviewed writes globally', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm policy', exact: true }).click();
    await page
      .getByRole('button', { name: 'Block connector writes globally', exact: true })
      .waitFor();
    const policyCalls = (
      (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
        channel: string;
        input: unknown;
      }[]
    ).filter((item) => item.channel === 'admin.policy.set');
    assert.deepEqual(
      policyCalls.map((item) => item.input),
      [{ connectors: { writesAllowed: true } }],
    );
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="partner-connector-chips"]') === null,
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Draft', exact: true }).inputValue(),
      'Keep this draft',
    );
    await page.getByRole('button', { name: 'Enter test session', exact: true }).click();
    const reviews = page.getByTestId('partner-remote-pendingReview');
    await reviews.getByRole('button', { name: 'View details', exact: true }).click();
    await reviews.getByText('Only append this reviewed sentence.', { exact: true }).waitFor();
    await reviews.getByRole('button', { name: 'Approve this exact write', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel policy', exact: true }).click();
    assert.equal(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as { channel: string }[]).some(
        (item) => item.channel === 'partner.connectors.proposals.apply',
      ),
      false,
    );
    await reviews.getByRole('button', { name: 'Approve this exact write', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm policy', exact: true }).click();
    await reviews
      .getByText(
        'The result is uncertain or partial. Check the remote document manually; this proposal cannot be retried.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await reviews.getByRole('button', { name: 'Approve this exact write', exact: true }).count(),
      0,
    );
    const applies = (
      (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
        channel: string;
        input: unknown;
      }[]
    ).filter((item) => item.channel === 'partner.connectors.proposals.apply');
    assert.deepEqual(
      applies.map((item) => item.input),
      [
        {
          projectRoot: '/project',
          sessionId: 'test-session',
          id: '00000000-0000-4000-8000-000000000002',
          expectedContentHash: 'a'.repeat(64),
        },
      ],
    );
    await page.getByRole('button', { name: 'Read selected document', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Read selected document', exact: true }).click();
    await page.getByRole('button', { name: 'Switch project', exact: true }).click();
    await page.getByRole('button', { name: 'Manage connectors', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Finish old read', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Refresh status', exact: true }).isEnabled(),
      true,
    );
    assert.equal(await page.getByText('Old project source', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  },
);
