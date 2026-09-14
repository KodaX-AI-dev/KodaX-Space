import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PartnerConnectorTasks } from './connection-tasks.js';
import type { ReadConnector } from './read-connector.js';
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
test('trusted onboarding input is owner-bound, one-shot, absent from public state and cancellable', async () => {
  let received: unknown;
  const adapter: ReadConnector = {
    id: 'qq-mail-imap',
    inspect: async () => ({ installed: true }),
    acceptsResource: () => false,
    isAuthorizationUrl: (_value): _value is string => false,
    read: async () => {
      throw Error('unused');
    },
    run: async (input) => {
      received = await input.requestInput!('mail_credentials');
    },
  };
  const jobs: unknown[] = [];
  const tasks = new PartnerConnectorTasks({
    service: {
      assertConnectionAllowed: async () => undefined,
      connect: async () => {
        throw Error('end test');
      },
    },
    run: async () => undefined,
    resolveAdapter: async () => adapter,
    openExternal: async () => undefined,
    changed: (job) => jobs.push(job),
  });
  try {
    const owner = { extensionId: 'partner.library', connectorId: 'qq-mail' };
    const job = tasks.start(owner);
    await flush();
    assert.equal(tasks.get(job).inputKind, 'mail_credentials');
    assert.throws(() =>
      tasks.submit({
        ...job,
        connectorId: 'netease-mail',
        value: { email: 'a@qq.com', authorizationCode: 'secret' },
      }),
    );
    assert.throws(() => tasks.submit({ ...job, value: { confirmed: true } }));
    tasks.submit({ ...job, value: { email: 'a@qq.com', authorizationCode: 'secret' } });
    assert.throws(() =>
      tasks.submit({ ...job, value: { email: 'a@qq.com', authorizationCode: 'secret' } }),
    );
    await flush();
    assert.deepEqual(received, { email: 'a@qq.com', authorizationCode: 'secret' });
    assert.equal(JSON.stringify(jobs).includes('secret'), false);
    const next = tasks.start(owner);
    await flush();
    assert.equal((await tasks.cancel(next)).phase, 'cancelled');
    assert.throws(() =>
      tasks.submit({ ...next, value: { email: 'a@qq.com', authorizationCode: 'secret' } }),
    );
  } finally {
    await tasks.dispose();
  }
});
