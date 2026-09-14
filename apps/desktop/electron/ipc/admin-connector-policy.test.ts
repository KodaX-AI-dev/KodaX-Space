import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ChannelInput, ChannelOutput, InvokeChannelName } from '@kodax-space/space-ipc-schema';
import { AdminPolicyAuditStore } from '../kodax/admin-policy-audit-store.js';
import { PartnerConnectorService } from '../partner-connectors/service.js';
import { FeishuCli } from '../partner-connectors/feishu-cli.js';
import { registerAdminPolicyAuditChannels } from './admin.js';

test('policy IPC blocks new connector authorization for the entire asynchronous policy commit', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'connector-policy-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new AdminPolicyAuditStore(path.join(root, 'policy.json'));
  await store.setPolicy({ connectors: { writesAllowed: true } });
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const held = new Promise<void>((r) => {
    release = r;
  });
  const set = store.setPolicy.bind(store);
  store.setPolicy = async (input) => {
    entered();
    await held;
    return set(input);
  };
  const service = new PartnerConnectorService(path.join(root, 'connectors'), {
    cli: new FeishuCli(async () => {
      throw new Error('must not contact CLI');
    }),
    catalog: async () => [],
    checkPolicy: async () => undefined,
  });
  type Handler = (
    input: ChannelInput<InvokeChannelName>,
  ) => Promise<ChannelOutput<InvokeChannelName>> | ChannelOutput<InvokeChannelName>;
  const handlers = new Map<string, Handler>();
  registerAdminPolicyAuditChannels(
    (name, handler) => {
      handlers.set(name, handler as Handler);
    },
    store,
    () => service,
  );
  const updating = handlers.get('admin.policy.set')!({ connectors: { writesAllowed: false } });
  await ready;
  assert.equal((await store.getPolicy()).policy.connectors.writesAllowed, true);
  await assert.rejects(service.catalog('partner.library'), /停用或更新/);
  release();
  await updating;
  assert.equal((await store.getPolicy()).policy.connectors.writesAllowed, false);
  assert.deepEqual(await service.catalog('partner.library'), []);
});
