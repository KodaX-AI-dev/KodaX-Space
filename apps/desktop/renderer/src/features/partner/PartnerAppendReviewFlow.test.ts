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

// Exercise the production task rail, typed detail router, review UI and confirmation
// dialog together. Only the public IPC boundary and unused worker assets are fixtures.
const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {PartnerContextRail} from './PartnerContextRail.tsx';
import {PartnerRightSidebar} from './PartnerRightSidebar.tsx';
import {PartnerRemoteRecordsProvider} from '../extensions/usePartnerRemoteRecords.ts';
import {ConfirmDialog} from '../../shell/ConfirmDialog.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
const owner={sessionId:'review-session',projectRoot:'/project'};
const proposals=(window.proposalTitles??['Approve the conclusion','Reject the note']).map((title,index)=>({
 id:'00000000-0000-4000-8000-00000000000'+(index+1),...owner,
 extensionId:'library',connectorId:'feishu-docs',connectionId:'00000000-0000-4000-8000-000000000003',
 connectionRevision:1,operation:'append',targetUrl:'https://example.feishu.cn/docx/Doc1',
 title,content:index?'Do not append this note.':'Append this exact reviewed conclusion.',rationale:'User requested an update',
 contentHash:(index?'b':'a').repeat(64),scopeHash:'c'.repeat(64),baseRevision:8,status:'pending',
 createdAt:'2026-09-07T00:00:00Z',updatedAt:'2026-09-07T00:00:00Z',
}));
const handlers=new Map();let recordRevision=1;let failedFirstGet=false;window.calls=[];window.changeProposalHash=()=>{proposals[0].contentHash='d'.repeat(64);};
const changed=()=>{recordRevision++;for(const listener of handlers.get('partner.connectors.changed')??[])listener(owner);};
window.kodaxSpace={platform:'darwin',on:(channel,listener)=>{const group=handlers.get(channel)??new Set();group.add(listener);handlers.set(channel,group);return ()=>group.delete(listener);},invoke:async(channel,input)=>{
 window.calls.push({channel,input});
 const ok=data=>({ok:true,data});
 if(channel==='partner.sources.catalog')return ok({sources:[]});
 if(channel==='artifact.list')return ok({artifacts:[]});
 if(channel==='partner.deliveries.list')return ok({deliveries:[]});
 if(channel==='skill.discover')return ok({skills:[]});
 if(channel==='partner.connectors.records')return ok({sources:[],proposals:proposals.map(({content,...summary})=>summary),receipts:[],baseTasks:[],documentTasks:[],recordRevision});
 if(channel==='partner.connectors.proposals.get'){if(window.failFirstProposalGet&&!failedFirstGet){failedFirstGet=true;return {ok:false,error:{message:'Temporary proposal load failure'}};}return ok({proposal:structuredClone(proposals.find(p=>p.id===input.id))});}
 if(channel==='partner.connectors.proposals.apply'||channel==='partner.connectors.proposals.reject'){
  const proposal=proposals.find(p=>p.id===input.id);
  if(channel.endsWith('.apply')&&input.expectedContentHash!==proposal.contentHash)throw new Error('Wrong reviewed hash');
  proposal.status=channel.endsWith('.apply')?'succeeded':'rejected';changed();return ok({proposal:structuredClone(proposal)});
 }
 return {ok:false,error:{message:'Fixture did not allow '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject(owner.projectRoot);useAppStore.getState().setCurrentSession(owner.sessionId);
function App(){const [request,setRequest]=useState(null);return <><PartnerContextRail onAddMaterial={()=>{}} onOpenDetail={target=>setRequest(current=>({revision:(current?.revision??0)+1,target}))}/><PartnerRightSidebar open openRequest={request}/><ConfirmDialog/></>;}
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
        name: 'unused-viewer-worker-assets',
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
async function openFixture(t: TestContext, titles?: readonly string[], failFirstGet = false) {
  const bundle = await (bundledFixture ??= buildFixture());
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: 'en-US' });
  page.setDefaultTimeout(5000);
  await page.route('http://append-review.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://append-review.test/');
  if (titles)
    await page.evaluate((values) => Reflect.set(window, 'proposalTitles', values), titles);
  await page.evaluate((fail) => Reflect.set(window, 'failFirstProposalGet', fail), failFirstGet);
  await page.addScriptTag({ content: bundle });
  return page;
}

test(
  'pending Feishu appends can be approved or rejected through the production task details',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);

    const rail = page.getByTestId('partner-context-rail');
    await rail.getByRole('button', { name: 'Approve the conclusion', exact: true }).click();
    const sidebar = page.getByTestId('right-sidebar');
    await sidebar.getByText('Append this exact reviewed conclusion.', { exact: true }).waitFor();
    await sidebar.getByText('https://example.feishu.cn/docx/Doc1', { exact: true }).waitFor();
    await sidebar.getByRole('button', { name: 'Approve this exact write', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await sidebar.getByText('Verified success', { exact: true }).waitFor();
    await rail
      .getByRole('button', { name: 'Approve the conclusion', exact: true })
      .waitFor({ state: 'detached' });

    await rail.getByRole('button', { name: 'Reject the note', exact: true }).click();
    await sidebar.getByText('Do not append this note.', { exact: true }).waitFor();
    await sidebar.getByRole('button', { name: 'Reject proposal', exact: true }).click();
    await sidebar.getByText('Rejected', { exact: true }).waitFor();
    await rail
      .getByRole('button', { name: 'Reject the note', exact: true })
      .waitFor({ state: 'detached' });
    assert.equal(
      await sidebar.getByRole('button', { name: 'Approve this exact write', exact: true }).count(),
      0,
    );
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input?: { id?: string; expectedContentHash?: string };
    }[];
    const applies = calls.filter((call) => call.channel === 'partner.connectors.proposals.apply');
    assert.equal(applies.length, 1);
    assert.equal(applies[0]?.input?.id, '00000000-0000-4000-8000-000000000001');
    assert.equal(applies[0]?.input?.expectedContentHash, 'a'.repeat(64));
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.proposals.reject').length,
      1,
    );
  },
);

test(
  'expanded collaboration cards expose every append review',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, [
      'First update',
      'Second update',
      'Third update',
      'Fourth update',
    ]);
    const rail = page.getByTestId('partner-context-rail');
    await rail.getByRole('button', { name: 'First update', exact: true }).waitFor();
    await rail.getByRole('button', { name: 'Fourth update', exact: true }).click();
    const sidebar = page.getByTestId('right-sidebar');
    await sidebar.getByText('Do not append this note.', { exact: true }).waitFor();
    await sidebar.getByRole('button', { name: 'Reject proposal', exact: true }).click();
    await sidebar.getByText('Rejected', { exact: true }).waitFor();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input?: { id?: string };
    }[];
    assert.equal(
      calls.find((call) => call.channel === 'partner.connectors.proposals.reject')?.input?.id,
      '00000000-0000-4000-8000-000000000004',
    );
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.proposals.apply').length,
      0,
    );
  },
);

test(
  'contextual append approval refuses a changed content hash before confirmation or apply',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Approve the conclusion', exact: true })
      .click();
    const sidebar = page.getByTestId('right-sidebar');
    await sidebar.getByText('Append this exact reviewed conclusion.', { exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'changeProposalHash')());
    await sidebar.getByRole('button', { name: 'Approve this exact write', exact: true }).click();
    await sidebar
      .getByRole('alert')
      .filter({ hasText: 'The proposal changed. Review the new content first' })
      .waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    const applies = await page.evaluate(() =>
      Reflect.get(window, 'calls').filter(
        (call: { channel: string }) => call.channel === 'partner.connectors.proposals.apply',
      ),
    );
    assert.equal(applies.length, 0);
  },
);

test(
  'a failed contextual proposal load can be retried without closing its detail tab',
  { skip: !browserPath },
  async (t) => {
    const page = await openFixture(t, undefined, true);
    await page
      .getByTestId('partner-context-rail')
      .getByRole('button', { name: 'Approve the conclusion', exact: true })
      .click();
    const sidebar = page.getByTestId('right-sidebar');
    await sidebar
      .getByRole('alert')
      .filter({ hasText: 'Temporary proposal load failure' })
      .waitFor();
    await sidebar.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await sidebar.getByText('Append this exact reviewed conclusion.', { exact: true }).waitFor();
    assert.equal(await sidebar.getByRole('alert').count(), 0);
    assert.equal(
      await sidebar
        .getByRole('button', { name: 'Approve this exact write', exact: true })
        .isEnabled(),
      true,
    );
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.proposals.get').length,
      2,
    );
    assert.equal(
      calls.filter((call) => /proposals\.(?:apply|reject)$/.test(call.channel)).length,
      0,
    );
  },
);
