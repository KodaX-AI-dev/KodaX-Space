import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PartnerConnectorOnboardingT } from '@kodax-space/space-ipc-schema';
import { PartnerConnectorTasks } from './connection-tasks.js';
import { PartnerConnectorService } from './service.js';
import type { FeishuCli } from './feishu-cli.js';
import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import { FeishuOnboardingError } from './feishu-onboarding-cli.js';
import { ReadConnectorError, type ReadConnector } from './read-connector.js';

test('provider onboarding uses its own URL validator and preserves safe installation errors', async () => {
  const opened: string[] = [];
  const events: PartnerConnectorOnboardingT[] = [];
  const adapter: ReadConnector = {
    id: 'wecom-cli',
    inspect: async () => ({ installed: false }),
    acceptsResource: () => false,
    read: async () => {
      throw new Error('No read');
    },
    isAuthorizationUrl: (value): value is string =>
      value === 'https://work.weixin.qq.com/ai/qc/gen?key=fixture',
    run: async (input) => {
      if (!input.installCli) throw new ReadConnectorError('needs_install');
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl: 'https://work.weixin.qq.com/ai/qc/gen?key=fixture',
      });
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
  };
  const tasks = new PartnerConnectorTasks({
    service: {
      assertConnectionAllowed: async () => undefined,
      connect: async () => {
        throw new Error('Cancelled flow must never commit');
      },
    },
    resolveAdapter: async () => adapter,
    run: async () => {
      throw new Error('Must not run Feishu auth');
    },
    openExternal: async (url) => {
      opened.push(url);
    },
    changed: (job) => events.push(job),
  });
  try {
    const first = tasks.start({ ...owner, connectorId: 'wecom' });
    await settleUntil(() => tasks.get(first).phase === 'needs_install');
    assert.doesNotMatch(tasks.get(first).error ?? '', /飞书/);
    const second = tasks.start({ ...owner, connectorId: 'wecom', installCli: true });
    await settleUntil(() => opened.length === 1);
    await tasks.reopen(second);
    assert.equal(opened.length, 2);
    assert.equal(JSON.stringify(events).includes('key=fixture'), false);
    await tasks.cancel(second);
    assert.equal(tasks.get(second).phase, 'cancelled');
    assert.doesNotMatch(tasks.get(second).error ?? '', /飞书/);
    await assert.rejects(tasks.reopen(second));
  } finally {
    await tasks.dispose();
  }
});

const owner = { extensionId: 'partner.library', connectorId: 'feishu' };
const url = 'https://open.feishu.cn/page/cli?user_code=not-public';
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-connection-tasks-'));
  const published: PartnerConnectorOnboardingT[] = [];
  const opened: string[] = [];
  let started: FeishuOnboardingInput | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let tasks: PartnerConnectorTasks;
  let enabled = true;
  const cli: Pick<
    FeishuCli,
    'inspect' | 'listProfiles' | 'read' | 'create' | 'append' | 'createBase'
  > = {
    inspect: async (profile) => ({
      installed: true,
      version: '1.0.92',
      identity: {
        profile,
        appId: 'cli_fixture',
        openId: 'ou_fixture',
        label: 'Test account',
        scopes: [
          'docx:document:readonly',
          'docx:document:create',
          'docx:document:write_only',
          'base:app:create',
          'base:table:read',
          'base:table:create',
          'base:table:update',
          'base:table:delete',
        ],
      },
    }),
    listProfiles: async () => [],
    read: async () => {
      throw new Error('No business operation permitted');
    },
    create: async () => {
      throw new Error('No business operation permitted');
    },
    append: async () => {
      throw new Error('No business operation permitted');
    },
    createBase: async () => {
      throw new Error('No business operation permitted');
    },
  };
  const service = new PartnerConnectorService(root, {
    cli,
    catalog: async () => {
      if (!enabled) throw new Error('disabled');
      return [{ id: owner.connectorId, adapter: 'feishu-cli', name: 'Feishu', description: '' }];
    },
    checkPolicy: async () => undefined,
    revokeConnections: (extensionId) => tasks.cancelForExtension(extensionId),
  });
  tasks = new PartnerConnectorTasks({
    service,
    run: async (input) => {
      started = input;
      input.onProgress({
        phase: 'waiting_app',
        authorizationUrl: url,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
      await held;
    },
    openExternal: async (value) => {
      opened.push(value);
    },
    changed: (job) => {
      published.push(job);
    },
  });
  t.after(async () => {
    release();
    await tasks.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    tasks,
    service,
    published,
    opened,
    cli,
    release,
    started: () => started,
    disable: () => {
      enabled = false;
    },
  };
}
async function settleUntil(condition: () => boolean): Promise<void> {
  for (let count = 0; count < 500; count++) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('Task did not reach its expected state');
}

test('start is single-flight, exposes no authorization URL and commits only the verified account', async (t) => {
  const f = await fixture(t);
  const first = f.tasks.start(owner);
  assert.equal(f.tasks.start(owner).id, first.id);
  await settleUntil(() => !!f.started());
  assert.match(f.started()!.profile, /^space-[a-f0-9-]{36}$/u);
  assert.equal(f.started()!.installCli, false);
  assert.equal(f.tasks.get(first).phase, 'waiting_app');
  assert.equal(f.tasks.get(first).canReopen, true);
  assert.equal(JSON.stringify(f.published).includes('not-public'), false);
  await f.tasks.reopen(first);
  assert.deepEqual(f.opened, [url, url]);
  assert.deepEqual(await f.service.accounts(owner.extensionId, owner.connectorId), []);
  f.release();
  await settleUntil(() => f.tasks.get(first).phase === 'connected');
  const connected = f.tasks.get(first);
  assert.equal(connected.canReopen, false);
  assert.ok(connected.connection?.connected);
  assert.deepEqual(await f.service.accounts(owner.extensionId, owner.connectorId), [
    connected.connection,
  ]);
  assert.equal((await f.tasks.cancel(first)).phase, 'connected');
});

test('a slow private installation leaves time for both official authorization stages', async (t) => {
  const base = Date.parse('2026-09-01T00:00:00.000Z');
  let clock = base;
  t.mock.method(Date, 'now', () => clock);
  const authorizationUrl = 'https://accounts.feishu.cn/oauth/v1/device/verify?user_code=fixture';
  const opened: string[] = [];
  const tasks = new PartnerConnectorTasks({
    service: {
      assertConnectionAllowed: async () => undefined,
      connect: async () => assert.fail('A waiting authorization must not connect an account'),
    },
    run: async (input) => {
      input.onProgress({ phase: 'installing' });
      clock = base + 15 * 60000;
      input.onProgress({
        phase: 'waiting_app',
        authorizationUrl: url,
        expiresAt: '2026-09-01T00:25:00.000Z',
      });
      clock = base + 24 * 60000;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl,
        expiresAt: '2026-09-01T00:34:00.000Z',
      });
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
    openExternal: async (value, assertActive) => {
      assertActive();
      opened.push(value);
    },
  });
  t.after(() => tasks.dispose());
  const job = tasks.start({ ...owner, installCli: true });
  await settleUntil(() => ['waiting_authorization', 'failed'].includes(tasks.get(job).phase));
  assert.equal(tasks.get(job).phase, 'waiting_authorization');
  assert.equal(tasks.get(job).expiresAt, '2026-09-01T00:34:00.000Z');
  await tasks.reopen(job);
  assert.deepEqual(opened, [url, authorizationUrl, authorizationUrl]);
  assert.equal((await tasks.cancel(job)).phase, 'cancelled');
});

test('official URL expiry is capped at the original task deadline and progress never extends it', async (t) => {
  const base = Date.parse('2026-09-01T00:00:00.000Z');
  let clock = base;
  t.mock.method(Date, 'now', () => clock);
  let started: FeishuOnboardingInput | undefined;
  let opens = 0;
  const tasks = new PartnerConnectorTasks({
    service: {
      assertConnectionAllowed: async () => undefined,
      connect: async () => assert.fail('An expired authorization must not connect an account'),
    },
    run: async (input) => {
      started = input;
      clock = base + 35 * 60000;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl: url,
        expiresAt: '2026-09-01T00:45:00.000Z',
      });
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
    openExternal: async (_value, assertActive) => {
      assertActive();
      opens++;
    },
  });
  t.after(() => tasks.dispose());
  const job = tasks.start(owner);
  await settleUntil(() => ['waiting_authorization', 'failed'].includes(tasks.get(job).phase));
  assert.equal(tasks.get(job).phase, 'waiting_authorization');
  assert.equal(tasks.get(job).expiresAt, '2026-09-01T00:40:00.000Z');
  clock = base + 39 * 60000;
  started!.onProgress({
    phase: 'waiting_authorization',
    authorizationUrl: url,
    expiresAt: '2026-09-01T00:49:00.000Z',
  });
  assert.equal(tasks.get(job).expiresAt, '2026-09-01T00:40:00.000Z');
  await tasks.reopen(job);
  assert.equal(opens, 3);
  clock = base + 40 * 60000;
  await assert.rejects(tasks.reopen(job), /超时/);
  await settleUntil(() => tasks.get(job).phase === 'expired');
  assert.equal(started!.signal.aborted, true);
  assert.equal(tasks.get(job).canReopen, false);
  assert.equal(opens, 3);
});

test('cancel and plugin deactivation revoke late authorization and cannot be reopened or rebound', async (t) => {
  const f = await fixture(t);
  const job = f.tasks.start(owner);
  await settleUntil(() => !!f.started());
  assert.throws(() => f.tasks.get({ ...job, extensionId: 'other.library' }), /不属于/);
  assert.throws(() => f.tasks.start({ ...owner, connectorId: 'another' }), /正在进行/);
  const cancelling = f.tasks.cancel(job);
  assert.equal(f.started()!.signal.aborted, true);
  await assert.rejects(f.tasks.reopen(job), /取消/);
  f.release();
  assert.equal((await cancelling).phase, 'cancelled');
  assert.deepEqual(await f.service.accounts(owner.extensionId, owner.connectorId), []);
  const another = f.tasks.start(owner);
  await f.service.deactivate(owner.extensionId, async () => {
    f.disable();
  });
  assert.equal(f.tasks.get(another).phase, 'cancelled');
  assert.equal(
    f.published.some((item) => item.phase === 'connected'),
    false,
  );
});

test('cancellation waits out the durable account commit and never acknowledges a late connected record', async (t) => {
  const f = await fixture(t);
  const job = f.tasks.start(owner);
  await settleUntil(() => !!f.started());
  let enter!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rename = fs.rename.bind(fs);
  let caught = false;
  t.mock.method(
    fs,
    'rename',
    async (from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) => {
      if (!caught && String(to) === path.join(f.root, 'records.json')) {
        caught = true;
        enter();
        await held;
      }
      return rename(from, to);
    },
  );
  f.release();
  await waiting;
  let acknowledged = false;
  const cancelling = f.tasks.cancel(job).then((value) => {
    acknowledged = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(acknowledged, false);
  release();
  assert.equal((await cancelling).phase, 'cancelled');
  assert.deepEqual(await f.service.accounts(owner.extensionId, owner.connectorId), []);
  assert.equal(
    f.published.some((item) => item.phase === 'connected'),
    false,
  );
});

test('invalid/expired URLs and a missing installation stay safe and terminal; only explicit consent installs', async (t) => {
  const f = await fixture(t);
  const cases = [
    { phase: 'waiting_app' as const, authorizationUrl: 'https://attacker.invalid/?token=secret' },
    {
      phase: 'waiting_authorization' as const,
      authorizationUrl: url,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    },
    { phase: 'waiting_app' as const, authorizationUrl: url, expiresAt: 'not-a-date' },
    { phase: 'waiting_app' as const, authorizationUrl: url, expiresAt: '' },
  ];
  for (const [index, progress] of cases.entries()) {
    const tasks = new PartnerConnectorTasks({
      service: f.service,
      run: async (input) => {
        input.onProgress(progress);
      },
      openExternal: async () => {
        assert.fail('must never open invalid URL');
      },
    });
    t.after(() => tasks.dispose());
    const job = tasks.start(owner);
    await settleUntil(() => tasks.get(job).phase === (index === 1 ? 'expired' : 'failed'));
    assert.equal(tasks.get(job).canReopen, false);
    assert.equal(JSON.stringify(tasks.get(job)).includes('secret'), false);
  }
  const consent: boolean[] = [];
  const tasks = new PartnerConnectorTasks({
    service: f.service,
    run: async (input) => {
      consent.push(input.installCli);
      throw new FeishuOnboardingError('needs_install');
    },
    openExternal: async () => {
      assert.fail('no URL yet');
    },
  });
  t.after(() => tasks.dispose());
  const first = tasks.start(owner);
  await settleUntil(() => tasks.get(first).phase === 'needs_install');
  const second = tasks.start({ ...owner, installCli: true });
  await settleUntil(() => tasks.get(second).phase === 'needs_install');
  assert.deepEqual(consent, [false, false]);
  assert.notEqual(first.id, second.id);
});

test('browser launch failures cannot leak the opaque authorization URL through reopen', async (t) => {
  const f = await fixture(t);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tasks = new PartnerConnectorTasks({
    service: f.service,
    run: async (input) => {
      input.onProgress({ phase: 'waiting_app', authorizationUrl: url });
      await held;
    },
    openExternal: async () => {
      throw new Error(`Unable to open ${url}`);
    },
  });
  t.after(async () => {
    release();
    await tasks.dispose();
  });
  const job = tasks.start(owner);
  await settleUntil(() => tasks.get(job).canReopen);
  await assert.rejects(
    tasks.reopen(job),
    (error: Error) => !error.message.includes('not-public') && error.message.includes('系统浏览器'),
  );
});

test('disconnect and disable abort an active authorization synchronously before storage work', async (t) => {
  for (const operation of ['disconnect', 'disable']) {
    const f = await fixture(t);
    const account = await f.service.connect({ ...owner, profile: 'existing-profile' });
    const job = f.tasks.start(owner);
    await settleUntil(() => !!f.started());
    const stopping =
      operation === 'disconnect'
        ? f.service.disconnect({ ...owner, connectionId: account.id })
        : f.service.deactivate(owner.extensionId, async () => {
            f.disable();
          });
    assert.equal(f.started()!.signal.aborted, true);
    assert.equal(f.tasks.get(job).canReopen, false);
    f.release();
    await stopping;
    assert.equal(f.tasks.get(job).phase, 'cancelled');
    const accounts = await f.service.accounts(owner.extensionId, owner.connectorId);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].id, account.id);
    assert.equal(accounts[0].connected, false);
  }
});

test('terminal jobs are bounded, disposal aborts work and a new host cannot replay previous authorization', async (t) => {
  const f = await fixture(t);
  const deps = {
    service: f.service,
    run: async () => {
      throw new FeishuOnboardingError('needs_install');
    },
    openExternal: async () => {
      assert.fail('no browser replay');
    },
  };
  const tasks = new PartnerConnectorTasks(deps);
  t.after(() => tasks.dispose());
  const first = tasks.start(owner);
  await settleUntil(() => tasks.get(first).phase === 'needs_install');
  let latest = first;
  for (let index = 0; index < 32; index++) {
    latest = tasks.start(owner);
    await settleUntil(() => tasks.get(latest).phase === 'needs_install');
  }
  assert.throws(() => tasks.get(first), /不存在/);
  assert.equal(tasks.get(latest).phase, 'needs_install');
  const restarted = new PartnerConnectorTasks(deps);
  assert.throws(() => restarted.get(latest), /不存在/);
  await restarted.dispose();
  assert.throws(() => restarted.start(owner), /已关闭/);
  const active = f.tasks.start(owner);
  await settleUntil(() => !!f.started());
  const disposing = f.tasks.dispose();
  assert.equal(f.started()!.signal.aborted, true);
  f.release();
  await disposing;
  assert.equal(f.tasks.get(active).phase, 'cancelled');
});
