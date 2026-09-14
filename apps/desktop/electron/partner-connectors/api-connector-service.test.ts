import { createPartnerConnectorRunRuntime } from '../kodax/partner-connector-runtime.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSlackConnector } from './slack-api.js';
import { createZoomConnector } from './zoom-api.js';
import { createGithubConnector } from './github-api.js';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import { FeishuCli } from './feishu-cli.js';
import { PartnerConnectorTasks } from './connection-tasks.js';
import type {
  PartnerConnectorOnboardingValueT,
  PartnerConnectorOnboardingT,
} from '@kodax-space/space-ipc-schema';

const cases = [
  {
    id: 'slack',
    adapter: 'slack-mcp',
    create: createSlackConnector,
    value: { token: 'xoxb-fixture' },
    ref: 'https://acme.slack.com/archives/C12345678/p1234567890123456',
    identity: {
      ok: true,
      team_id: 'T12345678',
      user_id: 'U12345678',
      team: 'Acme',
      url: 'https://acme.slack.com/',
    },
    resource: { ok: true, messages: [{ ts: '1234567890.123456', text: 'Selected source' }] },
  },
  {
    id: 'zoom',
    adapter: 'zoom-mcp',
    create: createZoomConnector,
    value: { accountId: 'account', clientId: 'client', clientSecret: 'fixture-secret' },
    ref: 'https://zoom.us/j/12345678901',
    identity: {
      access_token: 'fixture-token',
      token_type: 'bearer',
      expires_in: 3600,
      scope: 'meeting:read:meeting:admin',
    },
    resource: { id: 12345678901, topic: 'Selected source', agenda: 'Body' },
  },
  {
    id: 'github',
    adapter: 'github-api',
    create: createGithubConnector,
    value: { token: 'github_pat_fixture' },
    ref: 'https://github.com/octocat/repo/issues/1',
    identity: { id: 1, login: 'octocat' },
    resource: {
      number: 1,
      title: 'Selected source',
      body: 'Body',
      state: 'open',
      html_url: 'https://github.com/octocat/repo/issues/1',
    },
  },
] as const;
for (const spec of cases)
  test(`${spec.id}: real adapter/task/service persist only selected reads; revoke before/after dispatch and restart remain isolated`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'api-service-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const secrets = new Map<string, string>();
    let resourceCalls = 0;
    let mode: 'normal' | 'before' | 'after' | 'identity' = 'normal';
    let revoke = () => {};
    const connector = spec.create({
      credentials: {
        get: async (k) => secrets.get(k),
        set: async (k, v) => {
          secrets.set(k, v);
        },
        delete: async (k) => {
          secrets.delete(k);
        },
      },
      fetchFn: async (url) => {
        if (
          ['/auth.test', '/oauth/token', '/user'].some((suffix) => String(url).endsWith(suffix))
        ) {
          if (mode === 'before') revoke();
          if (mode === 'identity')
            return Response.json(
              spec.id === 'slack'
                ? { ...spec.identity, user_id: 'U99999999' }
                : spec.id === 'github'
                  ? { ...spec.identity, id: 99 }
                  : { error: 'invalid_client' },
              spec.id === 'zoom' ? { status: 401 } : undefined,
            );
          return Response.json(spec.identity);
        }
        resourceCalls++;
        if (mode === 'after') revoke();
        return Response.json(spec.resource);
      },
    });
    const deps = {
      cli: new FeishuCli(async () => {
        throw Error('not Feishu');
      }),
      readConnectors: { [spec.adapter]: connector },
      catalog: async () => [{ id: spec.id, adapter: spec.adapter, name: spec.id, description: '' }],
      checkPolicy: async () => {},
    };
    const service = new PartnerConnectorService(root, deps);
    const jobs: PartnerConnectorOnboardingT[] = [];
    const tasks = new PartnerConnectorTasks({
      service,
      run: async () => {
        throw Error('not Feishu');
      },
      resolveAdapter: async () => connector,
      openExternal: async () => {
        throw Error('not browser authorization');
      },
      changed: (job) => jobs.push(job),
    });
    t.after(() => tasks.dispose());
    const job = tasks.start({ extensionId: 'partner.library', connectorId: spec.id });
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 100 && !predicate(); i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.ok(predicate());
    };
    await waitFor(() => tasks.get(job).phase === 'waiting_input');
    assert.throws(() => tasks.submit({ ...job, value: { confirmed: true } }));
    assert.throws(() => tasks.submit({ ...job, connectorId: 'another', value: spec.value }));
    tasks.submit({ ...job, value: spec.value as PartnerConnectorOnboardingValueT });
    assert.throws(() => tasks.submit({ ...job, value: spec.value }));
    await waitFor(() => tasks.get(job).phase === 'connected');
    const account = tasks.get(job).connection!;
    assert.doesNotMatch(
      JSON.stringify(jobs),
      /fixture-secret|github_pat_fixture|xoxb-fixture|access_token|clientSecret/,
    );
    const bindings = await service.resolveSelections([
      {
        extensionId: 'partner.library',
        connectorId: spec.id,
        adapter: spec.adapter,
        connectionId: account.id,
        connectionRevision: account.revision,
        documents: [{ url: spec.ref, access: 'read' }],
      },
    ]);
    let current = bindings;
    revoke = () => {
      current = [];
    };
    const context: PartnerConnectorContext = {
      surface: 'partner',
      sessionId: 'session',
      projectRoot: '/project',
      permissionMode: 'accept-edits',
      bindings,
      getCurrentBindings: () => current,
    };
    const input = { connectionId: account.id, documentUrl: spec.ref };
    const run = await createPartnerConnectorRunRuntime(undefined, context, service);
    assert.deepEqual(
      run!.listRunTools!('mcp').map((tool) => tool.name),
      ['partner_connector_read'],
    );
    const result = await run!.executeCapability('mcp', 'partner-connectors/read', input);
    assert.match(JSON.stringify(result), /Selected source/);
    const source = (await service.records(context)).sources[0]!;
    assert.match(source.title, /Selected source|Slack/);
    assert.equal(resourceCalls, 1);
    assert.equal(
      (await new PartnerConnectorService(root, deps).records(context)).sources.length,
      1,
    );
    assert.equal((await service.records({ ...context, sessionId: 'other' })).sources.length, 0);
    const before = resourceCalls;
    await assert.rejects(() =>
      service.read({ ...context, bindings: [], getCurrentBindings: () => [] }, input),
    );
    assert.equal(resourceCalls, before);
    mode = 'before';
    await assert.rejects(() => service.read(context, input));
    assert.equal(resourceCalls, before);
    current = bindings;
    mode = 'after';
    await assert.rejects(() => service.read(context, input));
    assert.equal(resourceCalls, before + 1);
    current = bindings;
    mode = 'identity';
    await assert.rejects(() => service.read(context, input));
    assert.equal(resourceCalls, before + 1);
    current = bindings;
    mode = 'normal';
    assert.equal((await service.records(context)).sources.length, 1);
    await service.disconnect({
      extensionId: 'partner.library',
      connectorId: spec.id,
      connectionId: account.id,
    });
    assert.equal(secrets.size, 0);
    await assert.rejects(() => service.read(context, input));
    assert.equal((await service.records(context)).sources.length, 1);
  });
