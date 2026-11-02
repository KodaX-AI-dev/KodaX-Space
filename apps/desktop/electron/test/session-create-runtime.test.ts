import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { ChannelInput, IpcResult, ChannelOutput } from '@kodax-space/space-ipc-schema';

process.env.KODAX_TEST_ONBOARDING = 'session-create-runtime';
const require = createRequire(import.meta.url);
require('electron');
const electronModule = require.cache[require.resolve('electron')];
assert.ok(electronModule);
type InvokeHandler = (event: unknown, input: unknown) => Promise<unknown>;
const handlers = new Map<string, InvokeHandler>();
electronModule.exports = {
  ipcMain: { handle: (name: string, handler: InvokeHandler) => handlers.set(name, handler) },
};

const { registerSessionChannels } = await import('../ipc/session.js');
const { kodaxHost } = await import('../kodax/host.js');
const { runtimeHostAdapter } = await import('../kodax/runtime-host-adapter.js');
const { settingsStore } = await import('../settings/store.js');
const { setUserConfigImpl } = await import('../kodax/user-config.js');
registerSessionChannels();

test('session.create uses daemon allocation for both real surfaces without trusting a renderer ID', async (t) => {
  setUserConfigImpl({
    loadConfig: (() => ({ provider: 'anthropic' })) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  t.after(() => setUserConfigImpl(null));
  t.mock.method(settingsStore, 'load', async () => ({}));
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  const created: unknown[] = [];
  t.mock.method(
    runtimeHostAdapter,
    'createSession',
    async (identity: Parameters<typeof runtimeHostAdapter.createSession>[0]) => {
      created.push(identity);
      return 's_daemon_allocated';
    },
  );
  t.mock.method(
    kodaxHost,
    'createSession',
    (input: Parameters<typeof kodaxHost.createSession>[0]) => ({
      sessionId: input.sessionId!,
      createdAt: 1,
    }),
  );
  t.mock.method(kodaxHost, 'persistRuntime', async () => true);
  const input: ChannelInput<'session.create'> = {
    projectRoot: process.cwd(),
    provider: 'anthropic',
    surface: 'code',
    ephemeral: true,
  };
  const invoke = handlers.get('session.create');
  assert.ok(invoke);
  const result = (await invoke({}, { ...input, sessionId: 'renderer_untrusted' })) as IpcResult<
    ChannelOutput<'session.create'>
  >;
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.sessionId, 's_daemon_allocated');
  assert.deepEqual(created, [{ projectRoot: process.cwd(), surface: 'code', ephemeral: true }]);

  const partner = (await invoke(
    {},
    { ...input, surface: 'partner', sessionId: 'renderer_untrusted' },
  )) as IpcResult<ChannelOutput<'session.create'>>;
  assert.equal(partner.ok, true);
  if (partner.ok) assert.equal(partner.data.sessionId, 's_daemon_allocated');
  for (const localInput of [{ ...input, provider: 'mock' }]) {
    const localResult = (await invoke({}, localInput)) as IpcResult<
      ChannelOutput<'session.create'>
    >;
    assert.equal(localResult.ok, true);
    if (localResult.ok) assert.notEqual(localResult.data.sessionId, 's_daemon_allocated');
  }
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => false);
  const embeddedResult = (await invoke({}, input)) as IpcResult<ChannelOutput<'session.create'>>;
  assert.equal(embeddedResult.ok, true);
  if (embeddedResult.ok) assert.notEqual(embeddedResult.data.sessionId, 's_daemon_allocated');
  assert.equal(
    created.length,
    2,
    'Both product surfaces allocate through Host; mock and injected legacy fixtures stay local',
  );
});
