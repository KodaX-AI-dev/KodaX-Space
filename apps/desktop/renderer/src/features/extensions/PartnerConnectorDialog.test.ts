import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { messages } from '../../i18n/messages.js';

const browserPath = [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

test('Tencent Meeting guidance uses only the canonical 6–15 digit meeting code reference', () => {
  assert.equal(
    messages['en-US']['connectors.meetingHint'],
    'Read details of a specified meeting using tmeet://meeting-code/<6–15 digit meeting code>. Business and Enterprise accounts may require provider approval. No automatic recording, transcript or participant export.',
  );
  assert.equal(
    messages['zh-CN']['connectors.meetingHint'],
    '通过 tmeet://meeting-code/<6–15 位会议码> 读取指定会议详情。商业版、企业版可能需要官方灰度批准。本版不自动导出录制、转写或参会者。',
  );
});
test('mail connection guidance names only the inbox domains implemented by the host', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const netease = messages[locale]['connectors.neteaseMailHint'];
    const qq = messages[locale]['connectors.qqMailHint'];
    assert.match(netease, /163\.com/);
    assert.match(qq, /qq\.com/);
    assert.doesNotMatch(netease + qq, /126|yeah|foxmail/i);
  }
});

const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../../i18n/I18nProvider.tsx';
import {SpaceExtensionsProvider} from './SpaceExtensionsProvider.tsx';
import {PartnerConnectorProvider,usePartnerConnectors} from './PartnerConnectorProvider.tsx';
import {PartnerConnectorDialog} from './PartnerConnectorDialog.tsx';
import {PartnerConnectorChips} from './PartnerConnectorChips.tsx';
import {ConfirmDialog} from '../../shell/ConfirmDialog.tsx';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
const adapter=window.fixtureOptions?.adapter??'feishu-cli';
const connectorNames={'feishu-cli':'Feishu documents','tencent-meeting-cli':'Tencent Meeting','notion-mcp':'Notion','slack-mcp':'Slack','zoom-mcp':'Zoom','github-api':'GitHub','tencent-docs-mcp':'Tencent Docs','netease-mail-imap':'NetEase Mail','qq-mail-imap':'QQ Mail'};
const connector={id:'feishu-docs',adapter,name:connectorNames[adapter],description:'Read only selected resources.'};
const extension={id:'library',version:'0.5.0',name:'Library',description:'',enabled:true,installedAt:1,expertCount:0,connectorCount:1};
const connection={id:'00000000-0000-4000-8000-000000000001',extensionId:'library',connectorId:'feishu-docs',revision:1,profile:'private-profile',accountLabel:'Test account',connected:true,permissions:{read:true,create:true,append:true}};
if(connector.adapter!=='feishu-cli')Object.assign(connection,{adapter:connector.adapter,permissions:{read:true,create:false,append:false}});
const savedBindings=[{binding:{extensionId:'library',connectorId:'feishu-docs',connectionId:connection.id,connectionRevision:1,documents:[{url:'https://example.feishu.cn/docx/Saved',access:'append'}],createFolderUrl:'https://example.feishu.cn/drive/folder/SavedFolder',name:connector.name,accountLabel:connection.accountLabel},available:true},{binding:{extensionId:'library',connectorId:'feishu-docs',connectionId:'00000000-0000-4000-8000-000000000002',connectionRevision:4,documents:[{url:'https://example.feishu.cn/docx/Other',access:'read'}],name:connector.name,accountLabel:'Other account'},available:true}];
let accounts=[];let listeners={};let job={id:'00000000-0000-4000-8000-000000000003',extensionId:'library',connectorId:'feishu-docs',phase:'needs_install',canReopen:false};
window.calls=[];
window.emit=(channel,data)=>{for(const cb of listeners[channel]??[])cb(data);};
window.finishConnection=()=>{accounts=[connection];job={...job,phase:'connected',connection};window.emit('partner.connectors.onboarding.changed',{job});window.emit('partner.connectors.changed',{extensionId:'library'});};
window.revokeConnection=()=>{accounts=[{...connection,connected:false,revision:2}];window.emit('partner.connectors.changed',{extensionId:'library'});};
window.progressOnboarding=(phase,error)=>{job={...job,phase,error,canReopen:phase==='waiting_app'||phase==='waiting_authorization'};window.emit('partner.connectors.onboarding.changed',{job});};
window.kodaxSpace={platform:'darwin',on:(channel,cb)=>{listeners[channel]=[...(listeners[channel]??[]),cb];return()=>{listeners[channel]=listeners[channel].filter(item=>item!==cb);};},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='space.extensions.list')return {ok:true,data:{extensions:[extension]}};
if(channel==='space.extensions.connectors.catalog')return {ok:true,data:{connectors:[connector]}};
if(channel==='partner.connectors.accounts')return {ok:true,data:{connections:accounts}};
if(channel==='partner.connectors.onboarding.start'){const kind={'slack-mcp':'slack_token','github-api':'github_token','zoom-mcp':'zoom_account'}[connector.adapter];if(kind){job={...job,inputKind:kind,phase:'waiting_input',canReopen:false};return {ok:true,data:{job}};}const providerInstall=['wecom-cli','dingtalk-cli','tencent-meeting-cli'].includes(connector.adapter)&&!input.installCli;job={...job,...(['netease-mail-imap','qq-mail-imap'].includes(connector.adapter)?{inputKind:'mail_credentials'}:connector.adapter==='tencent-docs-mcp'?{inputKind:'authorization_complete'}:{}),phase:['netease-mail-imap','qq-mail-imap'].includes(connector.adapter)?'waiting_input':providerInstall?'needs_install':(window.fixtureOptions?.installPhase??(window.delayStart?'waiting_app':'waiting_authorization')),canReopen:!providerInstall};if(window.delayStart)return new Promise(resolve=>{window.finishStart=()=>resolve({ok:true,data:{job}});});return {ok:true,data:{job}};}
if(channel==='partner.connectors.onboarding.submit'){if(window.failCredentials)return {ok:false,error:{message:'Client authorization code was rejected'}};job={...job,phase:'verifying',inputKind:undefined};return {ok:true,data:{job}};}
if(channel==='partner.connectors.onboarding.get')return {ok:true,data:{job}};
if(channel==='partner.connectors.onboarding.reopen')return {ok:true,data:{ok:true}};
if(channel==='partner.connectors.onboarding.cancel'){if(window.failCancel)return {ok:false,error:{message:'Cancellation could not be confirmed'}};return new Promise(resolve=>{window.finishCancel=()=>{job={...job,phase:window.connectedBeforeCancel?'connected':'cancelled',canReopen:false,...(window.connectedBeforeCancel?{connection}:{})};if(window.connectedBeforeCancel)accounts=[connection];resolve({ok:true,data:{job}});};});}
if(channel==='partner.connectors.disconnect'){accounts=[];window.emit('partner.connectors.changed',{extensionId:'library'});return {ok:true,data:{ok:true}};}
if(channel==='partner.connectors.resolve')return {ok:true,data:{connectors:input.connectors.map(binding=>({binding:{...binding,name:connector.name,accountLabel:connection.accountLabel},available:true}))}};
if(channel==='session.partnerConnectors.get')return new Promise(resolve=>{window.finishSessionGet=()=>resolve(window.failSessionGet?{ok:false,error:{message:'Could not read saved conversation bindings'}}:{ok:true,data:{connectors:savedBindings}});});
if(channel==='session.partnerConnectors.set')return {ok:true,data:{connectors:input.connectors.map(binding=>({binding:{...binding,name:connector.name,accountLabel:connection.accountLabel},available:true}))}};
return {ok:false,error:{message:'Unexpected channel '+channel}};
}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject('/project');
if(window.fixtureOptions?.existingSession){accounts=[connection];useAppStore.getState().setCurrentSession('saved-session');}
window.changeProject=()=>useAppStore.getState().setCurrentProject('/other');
function App(){const [open,setOpen]=useState(true);const [tried,setTried]=useState(false);const project=useAppStore(state=>state.currentProjectPath);const context=usePartnerConnectors();window.readBindings=()=>context.binding.getSnapshot().state;window.refreshBindings=()=>context.binding.refresh();window.seedScope=()=>context.binding.select({extensionId:'library',connectorId:'feishu-docs',connectionId:connection.id,connectionRevision:1,documents:[{url:'https://example.feishu.cn/docx/Keep',access:'append'}],createFolderUrl:'https://example.feishu.cn/drive/folder/KeepFolder'});return <><textarea aria-label="Draft" defaultValue="Keep my draft"/><PartnerConnectorChips/><button onClick={()=>setOpen(true)}>Open connection</button><button onClick={()=>useAppStore.getState().setCurrentProject('/other')}>Other project</button><output>{tried?'Conversation focused':''}</output>{open&&project==='/project'&&<PartnerConnectorDialog extension={extension} connector={connector} onClose={()=>setOpen(false)} onTry={()=>{setTried(true);setOpen(false);}} onScope={()=>setOpen(false)}/>}<ConfirmDialog/></>;}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerConnectorProvider><App/></PartnerConnectorProvider></SpaceExtensionsProvider></I18nProvider>);
`;

async function openFixture(
  t: TestContext,
  options: {
    existingSession?: boolean;
    installPhase?: 'installing';
    adapter?:
      | 'tencent-meeting-cli'
      | 'notion-mcp'
      | 'slack-mcp'
      | 'zoom-mcp'
      | 'github-api'
      | 'tencent-docs-mcp'
      | 'netease-mail-imap'
      | 'qq-mail-imap';
  } = {},
) {
  const output = await build({
    stdin: {
      contents: `window.fixtureOptions=${JSON.stringify(options)};\n${fixture}`,
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
  await page.route('http://connector.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://connector.test/');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  return { page, errors };
}

test(
  'hosted Notion OAuth starts in the browser without offering a CLI installation',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { adapter: 'notion-mcp' });
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('heading', { name: 'Notion', exact: true }).waitFor();
    await dialog
      .getByText(
        'Browser authorization grants read-only access. This conversation may read only the exact Notion pages selected in Resource scope.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await dialog.getByText(/CLI|package|install/iu).count(), 0);
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText('Complete authorization in your browser', { exact: true }).waitFor();
    assert.equal(
      await dialog.getByRole('button', { name: 'Install and continue', exact: true }).count(),
      0,
    );
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { installCli?: boolean };
    }[];
    assert.deepEqual(
      calls
        .filter((call) => call.channel === 'partner.connectors.onboarding.start')
        .map((call) => call.input.installCli),
      [false],
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'Slack, Zoom and GitHub submit credentials only through the trusted input channel and clear rejected secrets',
  { skip: !browserPath },
  async (t) => {
    for (const adapter of ['slack-mcp', 'zoom-mcp', 'github-api'] as const)
      await t.test(adapter, async (t) => {
        const { page, errors } = await openFixture(t, { adapter });
        const dialog = page.getByTestId('partner-connector-dialog');
        await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
        const secretLabel = adapter === 'zoom-mcp' ? 'Client Secret' : 'Access token';
        const field = dialog.getByLabel(secretLabel, { exact: true });
        await field.fill('fixture-secret');
        assert.equal(await field.getAttribute('type'), 'password');
        if (adapter === 'zoom-mcp') {
          await dialog.getByLabel('Account ID', { exact: true }).fill('account');
          await dialog.getByLabel('Client ID', { exact: true }).fill('client');
        }
        await page.evaluate(() => Reflect.set(window, 'failCredentials', true));
        await dialog.getByRole('button', { name: 'Verify connection', exact: true }).click();
        await dialog.getByText('Client authorization code was rejected', { exact: true }).waitFor();
        assert.equal(await field.inputValue(), '');
        const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
          channel: string;
          input: { value?: unknown };
        }[];
        const submitted = calls.filter((c) => c.channel === 'partner.connectors.onboarding.submit');
        assert.equal(submitted.length, 1);
        assert.deepEqual(
          submitted[0]?.input.value,
          adapter === 'zoom-mcp'
            ? { accountId: 'account', clientId: 'client', clientSecret: 'fixture-secret' }
            : { token: 'fixture-secret' },
        );
        assert.deepEqual(errors, []);
      });
  },
);

test(
  'another provider keeps its own brand, requirements, explicit installation and read-only session binding',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { adapter: 'tencent-meeting-cli' });
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('heading', { name: 'Tencent Meeting', exact: true }).waitFor();
    assert.equal(await dialog.locator('details').count(), 0);
    const logo = dialog.locator('img[data-testid="partner-connector-icon"]');
    await logo.evaluate((image: HTMLImageElement) => image.decode());
    assert.equal(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth), 128);
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText(/@tencentcloud\/tmeet/).waitFor();
    assert.equal(await dialog.getByText(/Feishu/).count(), 0);
    await dialog.getByRole('button', { name: 'Install and continue', exact: true }).click();
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    await dialog.getByRole('button', { name: 'Try it', exact: true }).click();
    await page.getByText('Conversation focused', { exact: true }).waitFor();
    const state = (await page.evaluate(() => Reflect.get(window, 'readBindings')())) as {
      connectors: { binding: { adapter: string; documents: unknown[] } }[];
    };
    assert.equal(state.connectors[0].binding.adapter, 'tencent-meeting-cli');
    assert.deepEqual(state.connectors[0].binding.documents, []);
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.deepEqual(errors, []);
  },
);

test(
  'the Feishu connection dialog loads its decorative brand image and retains the catalog name',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('heading', { name: 'Feishu documents', exact: true }).waitFor();
    const logo = dialog.locator('img[data-testid="partner-connector-icon"]');
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
    assert.equal(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as { channel: string }[]).some(
        ({ channel }) =>
          channel.includes('onboarding.') || channel === 'partner.connectors.resolve',
      ),
      false,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'conversation connector icon group appears after connection and keeps the Feishu brand',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await page.evaluate(() => Reflect.get(window, 'seedScope')());
    const chips = page.getByTestId('partner-connector-chips');
    await chips.waitFor();
    await chips.getByRole('button', { name: 'Conversation connectors', exact: true }).click();
    const popover = page.getByRole('dialog', { name: 'Conversation connectors', exact: true });
    await popover.getByRole('button', { name: 'More', exact: true }).waitFor();
    assert.equal(
      await popover.getByRole('button', { name: 'Connect Feishu documents', exact: true }).count(),
      0,
    );
    await popover.getByText('Feishu documents', { exact: true }).waitFor();
    assert.equal(await popover.locator('img[data-testid="partner-connector-icon"]').count(), 1);
    await popover
      .getByRole('switch', {
        name: 'Enable Feishu documents for this conversation',
        exact: true,
      })
      .waitFor();
    const logo = popover.locator('img[data-testid="partner-connector-icon"]');
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
    assert.equal(await popover.getByText('Feishu documents', { exact: true }).count(), 1);
    assert.equal(await logo.count(), 1);
    assert.equal(await logo.evaluate((element) => (element as HTMLImageElement).naturalWidth), 700);
    assert.equal(
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as { channel: string }[]).some(
        ({ channel }) =>
          channel.includes('onboarding.') || channel === 'partner.connectors.connect',
      ),
      false,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'Feishu connection starts once without an installation prompt, cancels durably, and preserves the draft',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).waitFor();
    assert.equal(await dialog.getByText(/CLI|profile/u).count(), 0);
    const calls = () =>
      page.evaluate(() => Reflect.get(window, 'calls')) as Promise<
        { channel: string; input: unknown }[]
      >;
    assert.equal(
      (await calls()).some((call) => call.channel.includes('onboarding.')),
      false,
    );
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText('Complete authorization in your browser', { exact: true }).waitFor();
    assert.equal(
      await dialog.getByRole('button', { name: 'Install and continue', exact: true }).count(),
      0,
    );
    assert.deepEqual(
      (await calls())
        .filter((call) => call.channel === 'partner.connectors.onboarding.start')
        .map((call) => call.input),
      [{ extensionId: 'library', connectorId: 'feishu-docs', installCli: false }],
    );
    await dialog.getByRole('button', { name: 'Cancel connection', exact: true }).click();
    assert.equal(
      await dialog.getByRole('button', { name: 'Cancelling…', exact: true }).isDisabled(),
      true,
    );
    assert.equal(await dialog.count(), 1);
    await page.evaluate(() => Reflect.get(window, 'finishCancel')());
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Open connection', exact: true }).click();
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    await dialog.getByText('Connected', { exact: true }).waitFor();
    assert.equal(
      (await calls()).some((call) => call.channel === 'partner.connectors.resolve'),
      false,
    );
    await dialog.getByRole('button', { name: 'Try it', exact: true }).click();
    await page.getByText('Conversation focused', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.deepEqual(
      (await calls())
        .filter((call) => call.channel === 'partner.connectors.resolve')
        .map((call) => call.input),
      [
        {
          projectRoot: '/project',
          connectors: [
            {
              extensionId: 'library',
              connectorId: 'feishu-docs',
              connectionId: '00000000-0000-4000-8000-000000000001',
              connectionRevision: 1,
              documents: [],
            },
          ],
        },
      ],
    );
    assert.equal(
      (await calls()).some(
        (call) => call.channel === 'session.create' || call.channel === 'partner.connectors.read',
      ),
      false,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'built-in connection preparation and failure never tell the user to complete browser authorization',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { installPhase: 'installing' });
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText('Preparing the Feishu connection…', { exact: true }).waitFor();
    await dialog
      .getByText(
        'Space is preparing its built-in Feishu connection component. The official Feishu page opens automatically when it is ready.',
        { exact: true },
      )
      .waitFor();
    await page.evaluate(() =>
      Reflect.get(window, 'progressOnboarding')(
        'failed',
        '飞书连接组件校验失败，尚未进入网页授权，请稍后重试。',
      ),
    );
    await dialog
      .getByText('飞书连接组件校验失败，尚未进入网页授权，请稍后重试。', { exact: true })
      .waitFor();
    await dialog
      .getByText(
        'This connection attempt has stopped. Check the reason below, then reconnect to try again.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await dialog
        .getByText(
          'Continue in the system browser. Space will update this dialog after authorization; no token needs to be pasted here.',
          { exact: true },
        )
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'onboarding guidance follows the actual local, webpage, verification, and stopped phases',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    const authorizationHint =
      'Continue in the system browser. Space will update this dialog after authorization; no token needs to be pasted here.';
    const phases = [
      [
        'preparing',
        'Space is preparing its built-in Feishu connection component. The official Feishu page opens automatically when it is ready.',
      ],
      [
        'waiting_app',
        'Complete app setup on the official Feishu page that opened. Space will guide you through account authorization next.',
      ],
      ['waiting_authorization', authorizationHint],
      [
        'verifying',
        'Space is checking the account and permissions. Wait for the result here; opening a webpage alone does not mean the connection succeeded.',
      ],
      [
        'failed',
        'This connection attempt has stopped. Check the reason below, then reconnect to try again.',
      ],
      [
        'cancelled',
        'Space has stopped waiting for this connection. Permissions already granted in Feishu are not revoked.',
      ],
      ['expired', 'This connection attempt expired. Reconnect to start a new attempt.'],
    ];
    for (const [phase, hint] of phases) {
      await page.evaluate(
        (phase) =>
          Reflect.get(window, 'progressOnboarding')(
            phase,
            phase === 'failed' ? 'Account permissions could not be verified.' : undefined,
          ),
        phase,
      );
      await dialog.getByText(hint, { exact: true }).waitFor();
      assert.equal(
        await dialog.getByText(authorizationHint, { exact: true }).count(),
        phase === 'waiting_authorization' ? 1 : 0,
        phase,
      );
      if (phase === 'failed') {
        await dialog
          .getByText('Account permissions could not be verified.', { exact: true })
          .waitFor();
        assert.equal(await dialog.getByText('尚未进入网页授权', { exact: false }).count(), 0);
      }
    }
    assert.deepEqual(errors, []);
  },
);

test(
  'failed cancellation stays visible, and a connection committed before cancel is shown honestly',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.evaluate(() => Reflect.set(window, 'failCancel', true));
    await dialog.getByRole('button', { name: 'Cancel connection', exact: true }).click();
    await dialog
      .getByRole('alert')
      .getByText('Cancellation could not be confirmed', { exact: true })
      .waitFor();
    assert.equal(
      await dialog.getByRole('button', { name: 'Cancel connection', exact: true }).isEnabled(),
      true,
    );
    await page.evaluate(() => {
      Reflect.set(window, 'failCancel', false);
      Reflect.set(window, 'connectedBeforeCancel', true);
    });
    await dialog.getByRole('button', { name: 'Cancel connection', exact: true }).click();
    await page.evaluate(() => Reflect.get(window, 'finishCancel')());
    await dialog.getByText('Connected', { exact: true }).waitFor();
    await dialog
      .getByText(
        'Authorization completed before cancellation. The account is connected; disconnect it here if needed.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByText('Conversation focused', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  },
);

test(
  'a start response arriving after project navigation is cancelled and cannot select the new conversation',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.evaluate(() => Reflect.set(window, 'delayStart', true));
    await page
      .getByTestId('partner-connector-dialog')
      .getByRole('button', { name: 'Connect', exact: true })
      .click();
    await page.evaluate(() => Reflect.get(window, 'changeProject')());
    await page.getByTestId('partner-connector-dialog').waitFor({ state: 'detached' });
    await page.evaluate(() => Reflect.get(window, 'finishStart')());
    await page.waitForFunction(() =>
      Reflect.get(window, 'calls').some(
        (call: { channel: string }) => call.channel === 'partner.connectors.onboarding.cancel',
      ),
    );
    await page.evaluate(() => Reflect.get(window, 'finishCancel')());
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
    }[];
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.onboarding.cancel').length,
      1,
    );
    assert.equal(
      calls.some(
        (call) =>
          call.channel === 'partner.connectors.resolve' || call.channel === 'session.create',
      ),
      false,
    );
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.deepEqual(errors, []);
  },
);

test(
  'Feishu connection never exposes a CLI installation decision',
  { skip: !browserPath },
  async (t) => {
    const { page } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByText('Complete authorization in your browser', { exact: true }).waitFor();
    assert.equal(
      await dialog.getByRole('button', { name: 'Install and continue', exact: true }).count(),
      0,
    );
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { installCli?: boolean };
    }[];
    assert.equal(
      calls.filter((call) => call.channel === 'partner.connectors.onboarding.start').length,
      1,
    );
    assert.equal(
      calls.find((call) => call.channel === 'partner.connectors.onboarding.start')?.input
        .installCli,
      false,
    );
    await page.evaluate(() =>
      Reflect.get(window, 'progressOnboarding')(
        'needs_install',
        '请先安装 Space 专用的飞书 CLI 1.0.92。',
      ),
    );
    await dialog
      .getByText(
        'The Feishu connection component is unavailable. Update or reinstall KodaX Space.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await dialog.getByText('请先安装 Space 专用的飞书 CLI 1.0.92。', { exact: true }).count(),
      0,
    );
    await dialog.getByRole('button', { name: 'Connect', exact: true }).waitFor();
  },
);

test(
  'a later local disconnect cannot be revived by an old connected onboarding snapshot',
  { skip: !browserPath },
  async (t) => {
    const { page } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    await dialog.getByText('Connected', { exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'revokeConnection')());
    await dialog.getByRole('button', { name: 'Connect', exact: true }).waitFor();
    assert.equal(await dialog.getByText('Connected', { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Try it', exact: true }).count(), 0);
  },
);

test(
  'Try it preserves an already approved document and folder scope without writing an empty replacement',
  { skip: !browserPath },
  async (t) => {
    const { page } = await openFixture(t);
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    await dialog.getByText('Connected', { exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'seedScope')());
    await dialog.getByRole('button', { name: 'Try it', exact: true }).click();
    await page.getByText('Conversation focused', { exact: true }).waitFor();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: {
        connectors: { documents: { url: string; access: string }[]; createFolderUrl: string }[];
      };
    }[];
    const selections = calls.filter((call) => call.channel === 'partner.connectors.resolve');
    assert.equal(selections.length, 1);
    assert.deepEqual(selections[0].input.connectors[0].documents, [
      { url: 'https://example.feishu.cn/docx/Keep', access: 'append' },
    ]);
    assert.equal(
      selections[0].input.connectors[0].createFolderUrl,
      'https://example.feishu.cn/drive/folder/KeepFolder',
    );
  },
);

test(
  'the connected composer icon remains discoverable with zero selections and toggles only this conversation',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page
      .getByTestId('partner-connector-dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await page.evaluate(() => Reflect.get(window, 'finishConnection')());
    assert.equal(await page.getByTestId('partner-connector-chips').count(), 0);
    await page.evaluate(() => Reflect.get(window, 'seedScope')());
    const trigger = page.getByRole('button', { name: 'Conversation connectors', exact: true });
    await trigger.click();
    const popover = page.getByTestId('partner-connector-popover');
    await popover.getByRole('button', { name: 'More', exact: true }).waitFor();
    assert.equal(
      await popover.getByRole('button', { name: 'Connect Feishu documents', exact: true }).count(),
      0,
    );
    await popover.getByText('Feishu documents', { exact: true }).waitFor();
    const toggle = popover.getByRole('switch', {
      name: 'Enable Feishu documents for this conversation',
    });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.click();
    await page.getByTestId('partner-connector-chips').waitFor({ state: 'detached' });
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: unknown;
    }[];
    assert.equal(calls.filter((call) => call.channel === 'partner.connectors.resolve').length, 1);
    assert.equal(
      calls.some(
        (call) =>
          call.channel === 'partner.connectors.disconnect' || call.channel.includes('onboarding.'),
      ),
      false,
    );
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    await page.evaluate(() => Reflect.get(window, 'changeProject')());
    await popover.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
  },
);

test(
  'Try it waits for saved session bindings and preserves document scope and other accounts across loading and errors',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { existingSession: true });
    const dialog = page.getByTestId('partner-connector-dialog');
    const tryButton = dialog.getByRole('button', { name: 'Try it', exact: true });
    await tryButton.waitFor();
    assert.equal(await tryButton.isDisabled(), true);
    const writes = async () =>
      ((await page.evaluate(() => Reflect.get(window, 'calls'))) as { channel: string }[]).filter(
        (call) => call.channel === 'session.partnerConnectors.set',
      );
    assert.deepEqual(await writes(), []);
    await page.evaluate(() => Reflect.get(window, 'finishSessionGet')());
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].some(
        (button) => button.textContent === 'Try it' && !button.disabled,
      ),
    );
    const before = await page.evaluate(() => Reflect.get(window, 'readBindings')());
    // Refresh publishes synchronously, before React can commit a new disabled prop.
    await tryButton.evaluate((button) => {
      void Reflect.get(window, 'refreshBindings')();
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the Try it button');
      button.click();
    });
    assert.equal(await dialog.count(), 1);
    assert.equal(await page.getByText('Conversation focused', { exact: true }).count(), 0);
    assert.deepEqual(await writes(), []);
    await page.evaluate(() => {
      Reflect.set(window, 'failSessionGet', true);
      Reflect.get(window, 'finishSessionGet')();
    });
    await dialog.getByText('Could not read saved conversation bindings', { exact: true }).waitFor();
    assert.equal(await tryButton.isDisabled(), true);
    await page.evaluate(() => {
      Reflect.set(window, 'failSessionGet', false);
      void Reflect.get(window, 'refreshBindings')();
      Reflect.get(window, 'finishSessionGet')();
    });
    await tryButton.click();
    await page.getByText('Conversation focused', { exact: true }).waitFor();
    assert.deepEqual(await writes(), []);
    assert.deepEqual(await page.evaluate(() => Reflect.get(window, 'readBindings')()), before);
    const result = before as {
      connectors: {
        binding: {
          connectionId: string;
          documents: { url: string; access: string }[];
          createFolderUrl?: string;
        };
      }[];
    };
    assert.equal(result.connectors.length, 2);
    assert.deepEqual(result.connectors[0].binding.documents, [
      { url: 'https://example.feishu.cn/docx/Saved', access: 'append' },
    ]);
    assert.equal(
      result.connectors[0].binding.createFolderUrl,
      'https://example.feishu.cn/drive/folder/SavedFolder',
    );
    assert.equal(result.connectors[1].binding.connectionId, '00000000-0000-4000-8000-000000000002');
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.deepEqual(errors, []);
  },
);

test(
  'mail account setup keeps client authorization code in the trusted dialog and clears it on failure',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { adapter: 'netease-mail-imap' });
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    assert.equal(
      await dialog.getByLabel('Email address', { exact: true }).getAttribute('placeholder'),
      'name@163.com',
    );
    await dialog.getByLabel('Email address', { exact: true }).fill('reader@163.com');
    const code = dialog.getByLabel('Client authorization code', { exact: true });
    assert.equal(await code.getAttribute('type'), 'password');
    await code.fill('example-private-code');
    await page.evaluate(() => Reflect.set(window, 'failCredentials', true));
    await dialog.getByRole('button', { name: 'Verify mailbox', exact: true }).click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Client authorization code was rejected' })
      .waitFor();
    assert.equal(await code.inputValue(), '');
    assert.equal(
      await page
        .locator('body')
        .innerText()
        .then((text) => text.includes('example-private-code')),
      false,
    );
    const submissions = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { value?: { email: string; authorizationCode: string } };
    }[];
    assert.deepEqual(
      submissions
        .filter((call) => call.channel === 'partner.connectors.onboarding.submit')
        .map((call) => call.input.value),
      [{ email: 'reader@163.com', authorizationCode: 'example-private-code' }],
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'Tencent Docs waits for explicit browser authorization completion before host verification',
  { skip: !browserPath },
  async (t) => {
    const { page, errors } = await openFixture(t, { adapter: 'tencent-docs-mcp' });
    const dialog = page.getByTestId('partner-connector-dialog');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await dialog.getByRole('button', { name: 'I have authorized', exact: true }).click();
    await dialog.getByText('Verifying connection…', { exact: true }).waitFor();
    const calls = (await page.evaluate(() => Reflect.get(window, 'calls'))) as {
      channel: string;
      input: { value?: unknown };
    }[];
    assert.deepEqual(
      calls
        .filter((call) => call.channel === 'partner.connectors.onboarding.submit')
        .map((call) => call.input.value),
      [{ confirmed: true }],
    );
    assert.equal(await dialog.getByLabel('Client authorization code', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  },
);
