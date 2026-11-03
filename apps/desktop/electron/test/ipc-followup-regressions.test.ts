import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import { build } from 'esbuild';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';

interface Fixture {
  channels: Record<string, (input: unknown, event?: unknown) => Promise<unknown>>;
  state: {
    failure: boolean;
    localStarts: number;
    removal: string;
    removed: number;
    refreshFailure: boolean;
    directory: string;
  };
}

/** Load the real IPC handlers, replacing their process owners with deterministic fixtures. */
async function loadFixture(
  t: TestContext,
  module: string,
  register: string,
  mocks: Record<string, string>,
): Promise<Fixture> {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-ipc-followup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL(`../ipc/${module}.ts`, import.meta.url));
  const output = path.join(directory, 'fixture.mjs');
  const shared = `export const channels={}; export const state={failure:true,localStarts:0,removal:'error',removed:0,refreshFailure:false,directory:${JSON.stringify(path.join(directory, 'installed'))}};`;
  await build({
    stdin: {
      contents: `import {${register}} from ${JSON.stringify(entry)};export{channels,state}from'fixture:state';${register}();`,
      resolveDir: directory,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: output,
    packages: 'external',
    logLevel: 'silent',
    plugins: [
      {
        name: 'owners',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            args.path === 'fixture:state' || args.path in mocks
              ? { path: args.path, namespace: 'fixture' }
              : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents:
              args.path === 'fixture:state'
                ? shared
                : `import{channels,state}from'fixture:state';${mocks[args.path]}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(output).href) as Promise<Fixture>;
}

const channelRegistration =
  'export const registerChannel=(name,handler)=>channels[name]=handler;export const registerChannelWithEvent=registerChannel;';

test('repo status reports Host configuration and unknown engine health without probing Main', async (t) => {
  const fixture = await loadFixture(t, 'repointel', 'registerRepointelChannels', {
    './register.js': channelRegistration,
    '../kodax/repo-intel-gate.js': 'export const isRepoIntelEntitled=async()=>true;',
    '../kodax/sdk-extensions.js':
      'export const loadSpaceSdkCoding=async()=>{throw Error("must not probe Main")};',
    '../kodax/runtime-host-adapter.js':
      'export const runtimeHostAdapter={isRuntimeSelected:()=>true,readEffectiveRuntimeConfig:async()=>{if(state.failure)throw Error("Host unavailable");return{entries:{repoIntelligenceMode:{value:"full"}}}}};',
  });
  fixture.state.failure = false;
  const status = (await fixture.channels['repointel.status']!({
    probe: true,
  })) as ChannelOutput<'repointel.status'>;
  assert.equal(status.effectiveEngine, null);
  assert.equal(status.warmSupported, false);
  assert.ok(
    status.diagnostics.some((item) => item.detail.includes('Host configuration mode=full')),
  );
  fixture.state.failure = true;
  const failed = (await fixture.channels['repointel.status']!(
    {},
  )) as ChannelOutput<'repointel.status'>;
  assert.equal(failed.engineStatus, null);
  assert.ok(
    failed.diagnostics.some(
      (item) => item.status === 'blocked' && item.detail.includes('Host unavailable'),
    ),
  );
  assert.deepEqual(await fixture.channels['repointel.prewarm']!({ projectRoot: 'ignored' }), {
    started: false,
  });
});

test('permission.list preserves Host grant failures instead of presenting local rules as the whole list', async (t) => {
  const fixture = await loadFixture(t, 'permission', 'registerPermissionChannels', {
    './register.js': channelRegistration,
    '../permission/broker.js': 'export const permissionBroker={};',
    '../permission/registry.js':
      'export const permissionRegistry={load:async()=>{},list:()=>[{pattern:"local",createdAt:1}]};',
    '../kodax/runtime-host-adapter.js':
      'export const runtimeHostAdapter={isRuntimeSelected:()=>true,listPermissionGrants:async()=>{throw Error("Host grant store failed")}};',
  });
  await assert.rejects(fixture.channels['permission.list']!({}), /Host grant store failed/);
});

test('external task start refuses a failed Host query but retains healthy local Reference routing', async (t) => {
  const fixture = await loadFixture(t, 'agent', 'registerAgentChannels', {
    './register.js': channelRegistration,
    './push.js': 'export const isRendererTarget=()=>true;',
    '../kodax/host.js': 'export const kodaxHost={get:()=>({projectRoot:"project"})};',
    '../kodax/external-agent-gateway.js':
      'export const externalAgentGateway={startTask:async()=>{state.localStarts++;return{taskId:"local"}}};',
    '../kodax/runtime-host-adapter.js':
      'export const runtimeHostAdapter={isRuntimeSelected:()=>true,listRuntimeDispatchableAgents:async()=>{if(state.failure)throw Error("Host catalog failed");return[]}};',
    '../kodax/coder-runtime-mode-switch.js':
      'export const runWithCoderAdmission=(_options,operation)=>operation();',
  });
  const start = () =>
    fixture.channels['agent.external.task.start']!(
      { sessionId: 's', agentId: 'reference', objective: 'task', readOnly: true },
      { sender: {} },
    );
  await assert.rejects(start, /Host catalog failed/);
  assert.equal(fixture.state.localStarts, 0);
  fixture.state.failure = false;
  assert.deepEqual(await start(), { taskId: 'local' });
  assert.equal(fixture.state.localStarts, 1);
});

test('bundle uninstall retains registration and files on removal conflict, I/O failure or Host reload failure', async (t) => {
  const fixture = await loadFixture(t, 'mcpb', 'registerMcpbChannels', {
    electron: 'export const BrowserWindow={};export const dialog={};export const Notification={};',
    './register.js': channelRegistration,
    './push.js': 'export const pushToRenderer=()=>{};',
    '../mcpb/installer.js': 'export const installMcpb=()=>{};export const readManifestOnly=()=>{};',
    '../mcpb/registry.js': `const entry=()=>({extensionId:'bundle',installDir:state.directory});export const readRegistry=async()=>({extensions:[entry()]});
      export const removeByExtensionId=async()=>{state.removed++;return{removed:true,installDir:state.directory}};
      export const removeEntryFromKodaxMcp=async()=>({kind:state.removal,message:'config locked'});
      export const isInsideExtractBase=p=>p===state.directory;export const toExternal=x=>x;
      export const addOrReplace=()=>{};export const buildExtensionFromManifest=()=>{};export const syncEntryToKodaxMcp=()=>{};export const getExtractBase=()=>state.directory;export const getTmpBase=getExtractBase;`,
    '../kodax/runtime-host-adapter.js':
      'export const runtimeHostAdapter={isRuntimeSelected:()=>true,reloadRuntimeMcp:async()=>{if(state.refreshFailure)throw Error("Host reload failed")}};',
    '../mcp/manager.js': 'export const reloadMcpManager=async()=>{};',
    '../kodax/sdk-extensions.js': 'export const invalidateSpaceSdkExtensionRuntimes=async()=>{};',
  });
  await mkdir(fixture.state.directory);
  const uninstall = () => fixture.channels['mcpb.uninstall']!({ extensionId: 'bundle' });
  await assert.rejects(uninstall, /config locked/);
  fixture.state.removal = 'skipped-changed';
  await assert.rejects(uninstall, /files have been preserved/);
  fixture.state.removal = 'removed';
  fixture.state.refreshFailure = true;
  await assert.rejects(uninstall, /Host reload failed/);
  assert.equal(fixture.state.removed, 0);
  assert.ok((await stat(fixture.state.directory)).isDirectory());
  fixture.state.removal = 'not-found';
  fixture.state.refreshFailure = false;
  assert.deepEqual(await uninstall(), { ok: true });
  assert.equal(fixture.state.removed, 1);
  await assert.rejects(stat(fixture.state.directory), { code: 'ENOENT' });
});
