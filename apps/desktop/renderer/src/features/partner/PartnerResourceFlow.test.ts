import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);

// Real task cards, source detail router and public IPC boundary. No provider is contacted.
const fixture = `
import React,{useCallback,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {PartnerContextRail} from './PartnerContextRail.tsx';
import {PartnerRightSidebar} from './PartnerRightSidebar.tsx';
import {PartnerRemoteRecordsProvider} from '../extensions/usePartnerRemoteRecords.ts';
import {PartnerRemoteRecords} from '../extensions/PartnerRemoteRecords.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
import {useToastStore} from '../../store/toastStore.ts';
import {Markdown} from '../session/messages/Markdown.tsx';
import {usePartnerLinkDetails} from './partnerLinkDetails.ts';
import {PARTNER_LINK_DETAIL_EVENT} from './partnerLinkEvents.ts';
const owner={sessionId:'resource-session',projectRoot:'/project'};
const refs=['https://example.feishu.cn/docx/Doc1','notion://page/'+'a'.repeat(32),'airtable://base/app12345678901234/table/tbl12345678901234'];
const sources=['Feishu note','Notion note','Airtable rows'].map((title,index)=>({
 id:'00000000-0000-4000-8000-00000000000'+(index+1),...owner,
 extensionId:'library',connectorId:['feishu-docs','notion-pages','airtable-tables'][index],connectionId:'00000000-0000-4000-8000-000000000004',
 documentId:'document-'+index,url:refs[index],title,revision:8,
 content:'Saved '+title+' body.',contentHash:'a'.repeat(64),readAt:'2026-09-07T00:00:00Z',
}));
if(window.duplicateMail) sources.push(...[6,7].map(index=>({...sources[0],id:'00000000-0000-4000-8000-00000000000'+index,connectionId:'00000000-0000-4000-8000-00000000000'+index,connectorId:'qq-mail',url:'mail://qq/inbox/99/42',title:'Mailbox '+index})));
const apiSources=[['slack','Slack snapshot','https://acme.slack.com/archives/C12345678/p1234567890123456'],['zoom','Zoom snapshot','https://zoom.us/j/12345678901'],['github','GitHub snapshot','https://github.com/octocat/repo/issues/1']];
if(window.apiSources) for(const [index,[connectorId,title,url]] of apiSources.entries()) sources.push({...sources[0],id:'00000000-0000-4000-8000-00000000001'+index,connectorId,title,url,content:'Saved '+title+' body.'});
const createdTask={id:'00000000-0000-4000-8000-000000000005',...owner,extensionId:'library',connectorId:'feishu-docs',connectionId:'00000000-0000-4000-8000-000000000004',provider:'feishu',connectionRevision:1,target:{kind:'personal-space'},requestedTitle:'Created document',status:'succeeded',resourceId:'NewDocument',title:'Created document',canonicalUrl:'https://example.feishu.cn/docx/NewDocument',revision:1,createdAt:'2026-09-07T00:00:00Z',updatedAt:'2026-09-07T00:00:00Z'};
window.calls=[];window.consumed=[];let failedGet=false;window.resolveGet=null;
window.kodaxSpace={platform:'darwin',on:()=>()=>{},invoke:async(channel,input)=>{
 window.calls.push({channel,input});const ok=data=>({ok:true,data});
 if(channel==='partner.sources.catalog')return ok({sources:[]});
 if(channel==='artifact.list')return ok({artifacts:[]});
 if(channel==='partner.deliveries.list')return ok({deliveries:[]});
 if(channel==='partner.connectors.records'&&window.holdRecords)return new Promise(resolve=>{window.pendingRecords=window.pendingRecords??[];window.pendingRecords.push(resolve);window.finishRecords=()=>{window.holdRecords=false;for(const resolve of window.pendingRecords)resolve(ok({sources:sources.map(({content,...source})=>source),proposals:[],receipts:[],baseTasks:[],documentTasks:[],recordRevision:1}));window.pendingRecords=[];};});
 if(channel==='partner.connectors.records')return ok({sources:input.sessionId===owner.sessionId?sources.map(({content,...source})=>source):[],proposals:[],receipts:[],baseTasks:[],documentTasks:input.sessionId===owner.sessionId?[createdTask]:[],recordRevision:1});
 if(channel==='partner.connectors.sources.get'){
  if(window.failFirstGet&&!failedGet){failedGet=true;return {ok:false,error:{message:'Temporary source load failure'}};}
  if(window.delayGet&&input.id.endsWith('2'))await new Promise(resolve=>{window.resolveGet??=resolve;});
  const source=sources.find(source=>source.id===input.id);
  return ok({source:window.missingSource?null:window.wrongOwner?{...source,sessionId:'other-session'}:source});
 }
 if(channel==='shell.openExternal')return ok({opened:true});
 return {ok:false,error:{message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject(owner.projectRoot);useAppStore.getState().setCurrentSession(owner.sessionId);
window.switchSession=()=>useAppStore.getState().setCurrentSession('other-session');
window.switchSurface=surface=>useSurfaceStore.getState().setSurface(surface);
window.getToasts=()=>useToastStore.getState().toasts;
window.requestMailLink=()=>window.dispatchEvent(new CustomEvent(PARTNER_LINK_DETAIL_EVENT,{detail:{context:owner,href:'mail://qq/inbox/99/42'}}));
window.requestStaleLink=()=>window.dispatchEvent(new CustomEvent(PARTNER_LINK_DETAIL_EVENT,{detail:{context:owner,href:'https://stale.test/'}}));
function App(){const [request,setRequest]=useState(null);const revision=useRef(0);const onOpen=useCallback(target=>{window.lastTarget=target;setRequest({revision:++revision.current,target});},[]);usePartnerLinkDetails(onOpen);return <><Markdown content={'[Created document]('+createdTask.canonicalUrl+') [Web page](https://example.org/guide) [Saved Feishu]('+refs[0]+') [Saved Notion]('+refs[1]+') [Saved Airtable]('+refs[2]+') [Missing Notion](notion://page/'+'b'.repeat(32)+') [Unsafe URL](https://user:password@example.org/) [Script](javascript:alert(1))'+(window.apiSources?apiSources.map(([id,title,url])=>' [Chat '+title+']('+url+')').join(''):'')}/><PartnerRemoteRecords kind="results" onOpenDetail={onOpen}/><PartnerContextRail onAddMaterial={()=>{}} onOpenDetail={onOpen}/><PartnerRightSidebar open openRequest={request} onConsumeOpenRequest={consumed=>{window.consumed.push(consumed);setRequest(current=>current?.revision===consumed?null:current);}}/></>;}
createRoot(document.getElementById('root')).render(<I18nProvider><PartnerRemoteRecordsProvider><App/></PartnerRemoteRecordsProvider></I18nProvider>);
`;

async function buildFixture(): Promise<string> {
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
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'text' },
    logLevel: 'silent',
    define: { 'import.meta.env': '{}' },
    plugins: [
      {
        name: 'unused-viewer-assets',
        setup(builder) {
          builder.onResolve({ filter: /\?(?:worker|url)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture-assets',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture-assets' }, (args) => ({
            contents: args.path.endsWith('?url')
              ? 'export default "about:blank"'
              : 'export default class WorkerStub {}',
            loader: 'js',
          }));
        },
      },
    ],
  });
  return output.outputFiles[0]!.text;
}

let bundledFixture: Promise<string> | undefined;
async function openFixture(t: TestContext, flags: Record<string, boolean> = {}) {
  const bundle = await (bundledFixture ??= buildFixture());
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: 'en-US' });
  page.setDefaultTimeout(5000);
  await page.route('http://resource-flow.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://resource-flow.test/');
  await page.evaluate((flags) => Object.assign(window, flags), flags);
  await page.addScriptTag({ content: bundle });
  return page;
}

test(
  'the materials page opens connector sources in the shared snapshot detail tab',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    const sources = page.getByTestId('partner-context-rail');
    await sources.getByRole('button', { name: 'Notion note', exact: true }).click();
    const detail = page.getByTestId('partner-remote-source-panel');
    await detail.getByText('Saved Notion note body.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Notion note', exact: true }).count(), 1);
    assert.equal(await sources.getByText('Saved Notion note body.', { exact: true }).count(), 0);
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.sources.get').length,
      1,
    );
    assert.equal(calls.filter((call) => call.channel === 'partner.connectors.read').length, 0);
  },
);

for (const title of ['Feishu note', 'Notion note', 'Airtable rows']) {
  test(
    `task material opens the saved ${title} source through typed details`,
    { skip: !browserPath },
    async (t) => {
      const page = await openFixture(t);
      await page
        .getByTestId('partner-context-rail')
        .getByRole('button', { name: title, exact: true })
        .click();
      const panel = page.getByTestId('partner-remote-source-panel');
      await panel.getByText('Saved ' + title + ' body.', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('partner-browser-webview').count(), 0);
      assert.equal(
        await panel.getByRole('button', { name: 'Open webpage', exact: true }).count(),
        title === 'Feishu note' ? 1 : 0,
      );
      const calls = await page.evaluate(() => Reflect.get(window, 'calls'));
      assert.equal(
        calls.filter(
          (call: { channel: string }) => call.channel === 'partner.connectors.sources.get',
        ).length,
        1,
      );
      assert.equal(
        calls.filter((call: { channel: string }) => call.channel === 'partner.connectors.read')
          .length,
        0,
      );
    },
  );
}

test(
  'a failed saved-source load can be retried in its existing detail tab',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, { failFirstGet: true });
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .click();
    const panel = page.getByTestId('partner-remote-source-panel');
    await panel.getByRole('alert').filter({ hasText: 'Temporary source load failure' }).waitFor();
    await panel.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await panel.getByText('Saved Notion note body.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('alert').count(), 0);
  },
);

test(
  'a late saved-source response cannot appear after the session changes',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, { delayGet: true });
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .click();
    await page.waitForFunction(() => typeof Reflect.get(window, 'resolveGet') === 'function');
    await page.evaluate(() => {
      Reflect.get(window, 'switchSession')();
      Reflect.get(window, 'resolveGet')();
    });
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Saved Notion note body.', { exact: true }).count(), 0);
  },
);

test(
  'chat HTTP links use the production Partner event and typed browser details',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page.getByRole('link', { name: 'Web page', exact: true }).click();
    const webview = page.getByTestId('partner-browser-webview');
    await webview.waitFor({ state: 'attached' });
    assert.equal(await webview.getAttribute('src'), 'https://example.org/guide');
    await page.getByRole('link', { name: 'Web page', exact: true }).click();
    assert.equal(await page.getByTestId('partner-browser-panel').count(), 1);
    assert.equal(
      (await page.evaluate(() => Reflect.get(window, 'calls'))).filter(
        (call: { channel: string }) => call.channel === 'shell.openExternal',
      ).length,
      0,
    );
    await page.getByRole('button', { name: 'Open in system browser', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => Reflect.get(window, 'calls'))).filter(
        (call: { channel: string }) => call.channel === 'shell.openExternal',
      ).length,
      1,
    );
  },
);

test(
  'reopening a created result after address navigation returns to its URL and retains browser history',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page
      .getByTestId('partner-remote-results')
      .getByRole('button', { name: 'View details', exact: true })
      .click();
    const webview = page.getByTestId('partner-browser-webview');
    await webview.waitFor({ state: 'attached' });
    const tabId = await page.getByRole('tab', { selected: true }).getAttribute('id');
    const address = page.getByRole('textbox', { name: 'Web address', exact: true });
    await address.fill('https://example.org/other');
    await address.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('webview')?.getAttribute('src') === 'https://example.org/other',
    );
    await page.getByRole('link', { name: 'Created document', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('webview')?.getAttribute('src') ===
        'https://example.feishu.cn/docx/NewDocument',
    );
    assert.equal(await page.getByRole('tab').count(), 1);
    assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), tabId);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await webview.getAttribute('src'), 'https://example.org/other');
    await page.getByRole('button', { name: 'Forward', exact: true }).click();
    assert.equal(await webview.getAttribute('src'), 'https://example.feishu.cn/docx/NewDocument');
  },
);

test(
  'reopening a result after guest link navigation sends the existing tab back to its URL',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page
      .getByTestId('partner-remote-results')
      .getByRole('button', { name: 'View details', exact: true })
      .click();
    const webview = page.getByTestId('partner-browser-webview');
    await webview.waitFor({ state: 'attached' });
    const originalGuest = await webview.elementHandle();
    assert.ok(originalGuest);
    // In-page navigation changes getURL while the host's src attribute stays unchanged.
    await originalGuest.evaluate((element) => {
      Reflect.set(element, 'getURL', () => 'https://example.org/guest-destination');
      element.dispatchEvent(new Event('did-stop-loading'));
    });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input[inputmode="url"]')?.value ===
        'https://example.org/guest-destination',
    );
    await page.getByRole('link', { name: 'Created document', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input[inputmode="url"]')?.value ===
        'https://example.feishu.cn/docx/NewDocument',
    );
    assert.equal(
      await originalGuest.evaluate((element) => element.isConnected),
      false,
      'Reopening must navigate the guest, not only change the address field.',
    );
    assert.equal(await page.getByRole('tab').count(), 1);
    assert.equal(await webview.getAttribute('src'), 'https://example.feishu.cn/docx/NewDocument');
  },
);

for (const first of ['result', 'chat'] as const) {
  test(
    `created results and chat links reuse their existing browser tab and consume both requests: ${first} first`,
    { skip: !browserPath },
    async (t) => {
      const page = await openFixture(t);
      const result = page
        .getByTestId('partner-remote-results')
        .getByRole('button', { name: 'View details', exact: true });
      const chat = page.getByRole('link', { name: 'Created document', exact: true });
      await (first === 'result' ? result : chat).click();
      await page.getByTestId('partner-browser-webview').waitFor({ state: 'attached' });
      const tab = page.getByRole('tab', { selected: true });
      const id = await tab.getAttribute('id');
      const title = await tab.textContent();
      await page.waitForFunction(() => Reflect.get(window, 'consumed').length === 1);
      await (first === 'result' ? chat : result).click();
      await page.waitForFunction(() => Reflect.get(window, 'consumed').length === 2);
      assert.equal(await page.getByRole('tab').count(), 1);
      assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('id'), id);
      assert.equal(await page.getByRole('tab', { selected: true }).textContent(), title);
      assert.equal(await page.getByTestId('partner-browser-panel').count(), 1);
      assert.equal(
        await page.getByTestId('partner-browser-webview').getAttribute('src'),
        'https://example.feishu.cn/docx/NewDocument',
      );
    },
  );
}

test(
  'chat source links reuse saved Feishu, Notion and Airtable details without remote reads',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .waitFor();
    for (const [label, title] of [
      ['Saved Feishu', 'Feishu note'],
      ['Saved Notion', 'Notion note'],
      ['Saved Airtable', 'Airtable rows'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page
        .getByTestId('partner-remote-source-panel')
        .getByText('Saved ' + title + ' body.', { exact: true })
        .waitFor();
    }
    assert.equal(await page.getByTestId('partner-browser-panel').count(), 0);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Airtable rows', exact: true })
      .click();
    assert.equal(await page.getByRole('tab', { name: 'Airtable rows', exact: true }).count(), 1);
    const channels = (await page.evaluate(() => Reflect.get(window, 'calls'))).map(
      (call: { channel: string }) => call.channel,
    );
    assert.equal(
      channels.filter((channel: string) => channel === 'partner.connectors.sources.get').length,
      3,
    );
    assert.equal(
      channels.some(
        (channel: string) =>
          channel === 'partner.connectors.read' ||
          channel.includes('.proposals.') ||
          channel.includes('.selection.'),
      ),
      false,
    );
  },
);

test(
  'unrecorded internal references provide feedback and unsafe links never open a view',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page.getByRole('link', { name: 'Missing Notion', exact: true }).click();
    assert.equal((await page.evaluate(() => Reflect.get(window, 'getToasts')())).length, 1);
    await page.getByRole('link', { name: 'Unsafe URL', exact: true }).click();
    assert.equal(await page.getByTestId('partner-browser-panel').count(), 0);
    assert.equal(await page.getByTestId('partner-remote-source-panel').count(), 0);
    assert.equal(await page.getByText('Script', { exact: true }).getAttribute('href'), '');
    const channels = (await page.evaluate(() => Reflect.get(window, 'calls'))).map(
      (call: { channel: string }) => call.channel,
    );
    assert.equal(
      channels.some(
        (channel: string) =>
          channel === 'partner.connectors.read' ||
          channel === 'shell.openExternal' ||
          channel === 'partner.connectors.sources.get',
      ),
      false,
    );
  },
);

test(
  'Coder HTTP links stay external and stale Partner link requests are ignored',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page.evaluate(() => Reflect.get(window, 'switchSurface')('coder'));
    await page.getByRole('link', { name: 'Web page', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => Reflect.get(window, 'calls'))).filter(
        (call: { channel: string }) => call.channel === 'shell.openExternal',
      ).length,
      1,
    );
    assert.equal(await page.getByTestId('partner-browser-panel').count(), 0);
    await page.evaluate(() => {
      Reflect.get(window, 'switchSurface')('partner');
      Reflect.get(window, 'switchSession')();
      Reflect.get(window, 'requestStaleLink')();
    });
    assert.equal(await page.getByTestId('partner-browser-panel').count(), 0);
  },
);

test(
  'changing the active source discards the previous source response',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, { delayGet: true });
    const rail = page.getByTestId('partner-context-rail');
    await rail.getByRole('button', { name: 'Notion note', exact: true }).click();
    await page.waitForFunction(() => typeof Reflect.get(window, 'resolveGet') === 'function');
    await rail.getByRole('button', { name: 'Airtable rows', exact: true }).click();
    await page
      .getByTestId('partner-remote-source-panel')
      .getByText('Saved Airtable rows body.', { exact: true })
      .waitFor();
    await page.evaluate(() => Reflect.get(window, 'resolveGet')());
    assert.equal(await page.getByText('Saved Notion note body.', { exact: true }).count(), 0);
  },
);

for (const flag of ['missingSource', 'wrongOwner']) {
  const flags = { [flag]: true };
  test(
    `missing or mismatched source cannot display another snapshot: ${JSON.stringify(flags)}`,
    { skip: !browserPath },
    async (t) => {
      const page = await openFixture(t, flags);
      await page
        .getByTestId('partner-context-rail')
        .getByRole('button', { name: 'Notion note', exact: true })
        .click();
      await page.getByTestId('partner-remote-source-panel').getByRole('alert').waitFor();
      assert.equal(await page.getByText('Saved Notion note body.', { exact: true }).count(), 0);
    },
  );
}

test(
  'ambiguous internal mail link never selects a snapshot from another account',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, { duplicateMail: true });
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .waitFor();
    await page.evaluate(() => Reflect.get(window, 'requestMailLink')());
    assert.equal(await page.evaluate(() => Reflect.get(window, 'lastTarget')), undefined);
    assert.equal(await page.getByTestId('partner-remote-source-panel').count(), 0);
    assert.equal((await page.evaluate(() => Reflect.get(window, 'getToasts')())).length, 1);
    const calls = await page.evaluate(() => Reflect.get(window, 'calls'));
    assert.equal(
      calls.some((call: { channel: string }) => call.channel === 'partner.connectors.sources.get'),
      false,
    );
  },
);

test(
  'Slack, Zoom and GitHub sources and chat links reuse shared details without remote connector dispatch',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, { apiSources: true });
    for (const [name, url] of [
      ['Slack snapshot', 'https://acme.slack.com/archives/C12345678/p1234567890123456'],
      ['Zoom snapshot', 'https://zoom.us/j/12345678901'],
      ['GitHub snapshot', 'https://github.com/octocat/repo/issues/1'],
    ]) {
      await page.getByTestId('partner-context-rail').getByRole('button', { name, exact: true }).click();
      const panel = page.getByTestId('partner-remote-source-panel');
      await panel.getByText('Saved ' + name + ' body.', { exact: true }).waitFor();
      await panel.getByRole('button', { name: 'Open webpage', exact: true }).click();
      const browserPanel = page.locator('[data-testid=partner-browser-panel]:visible');
      await browserPanel.waitFor();
      assert.equal(await browserPanel.locator('input').inputValue(), url);
      await page.getByRole('link', { name: 'Chat ' + name, exact: true }).click();
      await panel.getByText('Saved ' + name + ' body.', { exact: true }).waitFor();
      const target = await page.evaluate(() => Reflect.get(window, 'lastTarget'));
      assert.equal(target.kind, 'remoteSource');
    }
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      new Set(
        calls
          .filter((call) => call.channel === 'partner.connectors.sources.get')
          .map((call) => JSON.stringify(call)),
      ).size,
      3,
    );
    assert.equal(calls.filter((call) => call.channel === 'partner.connectors.read').length, 0);
  },
);

test(
  'provider chat links wait for local records and preserve snapshot priority; a new click or session switch cancels the pending intent',
  { skip: !browserPath },
  async (t) => {
    for (const next of ['none', 'web', 'session'])
      await t.test(next, async (t) => {
        const page = await openFixture(t, { apiSources: true, holdRecords: true });
        await page.getByRole('link', { name: 'Chat GitHub snapshot', exact: true }).waitFor();
        await page.waitForFunction(
          () => typeof Reflect.get(window, 'finishRecords') === 'function',
        );
        await page.getByRole('link', { name: 'Chat GitHub snapshot', exact: true }).click();
        assert.equal(await page.evaluate(() => Reflect.get(window, 'lastTarget')), undefined);
        if (next === 'web') await page.getByRole('link', { name: 'Web page', exact: true }).click();
        if (next === 'session') await page.evaluate(() => Reflect.get(window, 'switchSession')());
        await page.evaluate(() => Reflect.get(window, 'finishRecords')());
        if (next === 'none')
          await page
            .getByTestId('partner-remote-source-panel')
            .getByText('Saved GitHub snapshot body.', { exact: true })
            .waitFor();
        else {
          await page.waitForFunction(() => !Reflect.get(window, 'holdRecords'));
          const target = await page.evaluate(() => Reflect.get(window, 'lastTarget'));
          assert.equal(target?.kind, next === 'web' ? 'browser' : undefined);
          assert.equal(
            await page.getByText('Saved GitHub snapshot body.', { exact: true }).count(),
            0,
          );
        }
        assert.equal(
          await page.evaluate(
            () =>
              Reflect.get(window, 'calls').filter(
                (call: { channel: string }) => call.channel === 'partner.connectors.read',
              ).length,
          ),
          0,
        );
      });
  },
);
