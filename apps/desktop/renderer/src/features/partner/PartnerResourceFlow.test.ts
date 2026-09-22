import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test, { after, type TestContext } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe']
    : []),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);
// macOS CI runners intermittently stall these real-browser flows (keychain/
// browser-service contention on shared runners: observed as whole-file 300s
// hangs with orphaned Chrome/esbuild children). They stay active locally and
// on Windows/Linux CI; revisit when the runner images stabilize.
const darwinCi = process.platform === 'darwin' && Boolean(process.env.CI);

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
import {openConversationLink, PARTNER_LINK_DETAIL_EVENT} from './partnerLinkEvents.ts';
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
 if(channel==='webPreview.prepare')return window.externalFailure?{ok:false,error:{message:'Preview unavailable'}}:ok({id:'10000000-0000-4000-8000-'+String(window.previewSeq=(window.previewSeq??0)+1).padStart(12,'0'),url:input.url});
 if(channel==='webPreview.release')return ok({released:true});
 if(channel==='shell.openExternal')return ok({opened: !window.externalFailure});
 return {ok:false,error:{message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject(owner.projectRoot);useAppStore.getState().setCurrentSession(owner.sessionId);
window.openRawLink=openConversationLink;
window.switchSession=()=>useAppStore.getState().setCurrentSession('other-session');
window.switchSurface=surface=>useSurfaceStore.getState().setSurface(surface);
window.getToasts=()=>useToastStore.getState().toasts;
window.requestMailLink=()=>window.dispatchEvent(new CustomEvent(PARTNER_LINK_DETAIL_EVENT,{detail:{context:owner,href:'mail://qq/inbox/99/42'}}));
window.requestStaleLink=()=>window.dispatchEvent(new CustomEvent(PARTNER_LINK_DETAIL_EVENT,{detail:{context:owner,href:'https://stale.test/'}}));
function App(){const scopeKey=useAppStore(state=>JSON.stringify([state.currentProjectPath,state.currentSessionId]));const [request,setRequest]=useState(null);const revision=useRef(0);const onOpen=useCallback(target=>{window.lastTarget=target;setRequest({revision:++revision.current,target});},[]);usePartnerLinkDetails(onOpen);return <><Markdown content={'[Created document]('+createdTask.canonicalUrl+') [Chinese URL](https://example.org/中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中) [Web page](https://example.org/guide) [Saved Feishu]('+refs[0]+') [Saved Notion]('+refs[1]+') [Saved Airtable]('+refs[2]+') [Missing Notion](notion://page/'+'b'.repeat(32)+') [Unsafe URL](https://user:password@example.org/) [Script](javascript:alert(1))'+(window.apiSources?apiSources.map(([id,title,url])=>' [Chat '+title+']('+url+')').join(''):'')}/><PartnerRemoteRecords kind="results" onOpenDetail={onOpen}/><PartnerContextRail onAddMaterial={()=>{}} onOpenDetail={onOpen}/><PartnerRightSidebar key={scopeKey} open openRequest={request} onConsumeOpenRequest={consumed=>{window.consumed.push(consumed);setRequest(current=>current?.revision===consumed?null:current);}}/></>;}
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
let sharedBrowser: ReturnType<typeof chromium.launch> | undefined;
after(async () => {
  if (sharedBrowser) await (await sharedBrowser).close();
});
async function openFixture(t: TestContext, flags: Record<string, boolean> = {}) {
  const bundle = await (bundledFixture ??= buildFixture());
  const browser = await (sharedBrowser ??= chromium.launch({
    executablePath: browserPath,
    headless: true,
  }));
  const context = await browser.newContext({ locale: 'en-US' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('https://**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Remote preview fixture</h1>' }),
  );
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
  { skip: !browserPath || darwinCi },
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
    { skip: !browserPath || darwinCi },
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
        await panel
          .getByRole('button', { name: 'Open in right-side preview', exact: true })
          .count(),
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
  { skip: !browserPath || darwinCi },
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
  { skip: !browserPath || darwinCi },
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
  'Partner web links use ProjectWebPreview and repeat clicks reuse the tab without external launches',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t);
    const link = page.getByRole('link', { name: 'Web page', exact: true });
    await link.click();
    const preview = page.getByTestId('project-web-preview');
    await preview.locator('iframe').waitFor();
    assert.equal(await preview.locator('iframe').getAttribute('src'), 'https://example.org/guide');
    await link.click();
    assert.equal(await page.getByRole('tab').count(), 1);
    assert.equal(await page.locator('webview').count(), 0);
    const calls = await page.evaluate(() => Reflect.get(window, 'calls'));
    assert.equal(
      calls.filter((call: { channel: string }) => call.channel === 'webPreview.prepare').length,
      1,
    );
    assert.equal(
      calls.some((call: { channel: string }) => call.channel === 'shell.openExternal'),
      false,
    );
  },
);

test(
  'created documents open in ProjectWebPreview and reuse the result tab',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t);
    const card = page.getByTestId('partner-remote-results');
    await card.getByRole('button', { name: 'View details', exact: true }).click();
    const frame = page.getByTestId('project-web-preview').locator('iframe');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), 'https://example.feishu.cn/docx/NewDocument');
    await page.evaluate(() =>
      Reflect.get(window, 'openRawLink')('https://example.feishu.cn/docx/NewDocument'),
    );
    await card.getByRole('button', { name: 'View details', exact: true }).click();
    assert.equal(await page.getByRole('tab').count(), 1);
    const calls = await page.evaluate(() => Reflect.get(window, 'calls'));
    assert.equal(
      calls.filter((call: { channel: string }) => call.channel === 'webPreview.prepare').length,
      1,
    );
    assert.equal(
      calls.some((call: { channel: string }) => call.channel === 'shell.openExternal'),
      false,
    );
    assert.equal(await page.locator('webview').count(), 0);
    await page.getByRole('button', { name: 'Close Created document', exact: true }).click();
    await page.waitForFunction(() =>
      Reflect.get(window, 'calls').some(
        (call: { channel: string }) => call.channel === 'webPreview.release',
      ),
    );
    assert.equal(await page.getByTestId('project-web-preview').count(), 0);
    await card.getByRole('button', { name: 'View details', exact: true }).click();
    await frame.waitFor();
    await page.evaluate(() => Reflect.get(window, 'switchSession')());
    await page.waitForFunction(
      () =>
        Reflect.get(window, 'calls').filter(
          (call: { channel: string }) => call.channel === 'webPreview.release',
        ).length === 2,
    );
    assert.equal(await page.getByTestId('project-web-preview').count(), 0);
  },
);

test(
  'internal chat source links reuse saved Notion and Airtable details without remote reads',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Notion note', exact: true })
      .waitFor();
    for (const [label, title] of [
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
      2,
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
  'unrecorded internal references provide feedback and script links never open a view',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t);
    await page.getByRole('link', { name: 'Missing Notion', exact: true }).click();
    assert.equal((await page.evaluate(() => Reflect.get(window, 'getToasts')())).length, 1);
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
  { skip: !browserPath || darwinCi },
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
  { skip: !browserPath || darwinCi },
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
    { skip: !browserPath || darwinCi },
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
  { skip: !browserPath || darwinCi },
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
  'saved sources retain their snapshots while webpage buttons open the shared preview',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t, { apiSources: true });
    for (const [name, url] of [
      ['Slack snapshot', 'https://acme.slack.com/archives/C12345678/p1234567890123456'],
      ['Zoom snapshot', 'https://zoom.us/j/12345678901'],
      ['GitHub snapshot', 'https://github.com/octocat/repo/issues/1'],
    ]) {
      await page
        .getByTestId('partner-context-rail')
        .getByRole('button', { name, exact: true })
        .click();
      const panel = page.getByTestId('partner-remote-source-panel');
      await panel.getByText('Saved ' + name + ' body.', { exact: true }).waitFor();
      await panel.getByRole('button', { name: 'Open in right-side preview', exact: true }).click();
      await page.locator('[data-testid="project-web-preview"]:visible iframe').waitFor();
      const external = await page.evaluate(() =>
        Reflect.get(window, 'calls').filter(
          (call: { channel: string }) => call.channel === 'webPreview.prepare',
        ),
      );
      assert.equal(external.at(-1).input.url, url);
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
  { skip: !browserPath || darwinCi },
  async (t) => {
    for (const next of ['none', 'web', 'session'])
      await t.test(next, async (t) => {
        const page = await openFixture(t, { apiSources: true, holdRecords: true });
        await page.getByRole('link', { name: 'Saved Notion', exact: true }).waitFor();
        await page.waitForFunction(
          () => typeof Reflect.get(window, 'finishRecords') === 'function',
        );
        await page.getByRole('link', { name: 'Saved Notion', exact: true }).click();
        assert.equal(await page.evaluate(() => Reflect.get(window, 'lastTarget')), undefined);
        if (next === 'web') await page.getByRole('link', { name: 'Web page', exact: true }).click();
        if (next === 'session') await page.evaluate(() => Reflect.get(window, 'switchSession')());
        await page.evaluate(() => Reflect.get(window, 'finishRecords')());
        if (next === 'none')
          await page
            .getByTestId('partner-remote-source-panel')
            .getByText('Saved Notion note body.', { exact: true })
            .waitFor();
        else {
          await page.waitForFunction(() => !Reflect.get(window, 'holdRecords'));
          const target = await page.evaluate(() => Reflect.get(window, 'lastTarget'));
          assert.equal(target?.kind, next === 'web' ? 'remoteResult' : undefined);
          assert.equal(await page.getByText('Saved Notion note body.', { exact: true }).count(), 0);
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

for (const surface of ['coder', 'partner']) {
  test(
    `Chinese HTTPS links follow the active surface routing: ${surface}`,
    { skip: !browserPath || darwinCi },
    async (t) => {
      const page = await openFixture(t);
      await page.evaluate((surface) => Reflect.get(window, 'switchSurface')(surface), surface);
      await page.getByRole('link', { name: 'Chinese URL', exact: true }).click();
      const channel = surface === 'partner' ? 'webPreview.prepare' : 'shell.openExternal';
      await page.waitForFunction(
        (channel) =>
          Reflect.get(window, 'calls').some(
            (call: { channel: string }) => call.channel === channel,
          ),
        channel,
      );
      const calls = await page.evaluate(
        (channel) =>
          Reflect.get(window, 'calls').filter(
            (call: { channel: string }) => call.channel === channel,
          ),
        channel,
      );
      assert.equal(calls.length, 1);
      assert.equal(decodeURI(calls[0].input.url), 'https://example.org/' + '中'.repeat(240));
      assert.equal(await page.locator('webview').count(), 0);
    },
  );
}

test(
  'a failed embedded preview can retry in place without losing saved source access',
  { skip: !browserPath || darwinCi },
  async (t) => {
    const page = await openFixture(t, { externalFailure: true });
    await page.getByRole('link', { name: 'Web page', exact: true }).click();
    const preview = page.getByTestId('project-web-preview');
    await preview.getByRole('alert').waitFor();
    await page.evaluate(() => {
      Reflect.set(window, 'externalFailure', false);
    });
    await preview.getByRole('button', { name: 'Reload preview', exact: true }).click();
    await preview.locator('iframe').waitFor();
    assert.equal(await page.getByRole('tab').count(), 1);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Feishu note', exact: true })
      .click();
    await page
      .getByTestId('partner-remote-source-panel')
      .getByText('Saved Feishu note body.', { exact: true })
      .waitFor();
    const calls = await page.evaluate(() => Reflect.get(window, 'calls'));
    assert.equal(
      calls.some((call: { channel: string }) => call.channel === 'shell.openExternal'),
      false,
    );
  },
);
