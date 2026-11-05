import assert from 'node:assert/strict';
import test from 'node:test';
import type { KodaXDaemonRuntime } from '@kodax-ai/kodax/runtime';
import { getSessionRuntimeStore } from '../session-runtime-store.js';
import { hasExplicitHostSkill, registerPartnerHostExecution } from './partner-host-tools.js';
import { registerSpaceHostTools } from './space-host-tools.js';
import { getSpaceExpertCatalog } from '../../space-extensions/runtime.js';
import { capturePartnerBusinessBinding } from './partner-business-binding.js';

test('a contradictory persisted Coder identity cannot receive Partner authority', async () => {
  for (const identity of [
    { surface: 'code', profileId: 'kodax-space.partner', tag: 'partner' },
    { surface: 'partner', profileId: 'kodax-space.coder', tag: 'partner' },
    { surface: 'partner', tag: 'code' },
  ]) {
    const runtime = {
      sessions: {
        load: async () => ({ id: 'conflict', workspaceRoot: '/workspace', ...identity }),
      },
    } as unknown as KodaXDaemonRuntime;
    await assert.rejects(registerPartnerHostExecution(runtime, 'conflict'), /identity changed/);
  }
});

test('a committed expert declares its default method without rewriting the question or restricting Agent tools', async (t) => {
  const store = getSessionRuntimeStore();
  const catalog = getSpaceExpertCatalog();
  t.mock.method(store, 'read', async () => ({
    partnerExpert: {
      extensionId: 'partner.library',
      extensionVersion: '1.0.0',
      expert: {
        id: 'writer',
        revision: 1,
        name: 'Writer',
        description: 'Draft replies',
        prompt: 'Preserve the evidence.',
        starterTasks: [],
        skillRef: 'draft-response',
      },
    },
  }));
  t.mock.method(catalog, 'requireAvailable', async () => undefined);
  const runtime = {
    sessions: {
      load: async () => ({ id: 'default-method', surface: 'partner', workspaceRoot: '/workspace' }),
      getSettings: async () => ({ permissionMode: 'accept-edits' }),
    },
    hostTools: { register: async (tools: unknown) => ({ id: 'lease', tools }) },
    catalog: { skills: async () => [{ name: 'draft-response' }] },
  } as unknown as KodaXDaemonRuntime;
  const binding = await registerPartnerHostExecution(runtime, 'default-method', undefined, {
    query: 'Answer this customer',
  });
  assert.deepEqual(binding.context.defaultSkill, { name: 'draft-response' });
  assert.match(binding.context.agentProfile!.instructions!, /Preserve the evidence/);
  assert.equal(binding.context.excludeTools, undefined);
});

test('explicit methods resolve through the Host catalog in all supported Skill syntaxes', async () => {
  const runtime = {
    catalog: { skills: async () => [{ name: 'draft-response' }] },
  } as unknown as KodaXDaemonRuntime;
  for (const query of [
    '/draft-response answer',
    'Please use /skill:draft-response for this reply',
    'Please use /draft-response for this reply',
  ])
    assert.equal(await hasExplicitHostSkill(runtime, '/workspace', query), true, query);
  assert.equal(await hasExplicitHostSkill(runtime, '/workspace', '/not-a-skill answer'), false);
});

test('read-only connector leases retain Plan eligibility and use the Partner run context', async () => {
  const descriptors: { name: string; sideEffect: string }[] = [];
  let handlers: Record<string, (input: unknown) => Promise<{ content: string }>> = {};
  const runtime = {
    sessions: {
      load: async () => ({ id: 's', surface: 'partner', workspaceRoot: '/workspace' }),
      getSettings: async () => ({ permissionMode: 'plan' }),
    },
    runs: { get: async () => ({ sessionId: 's' }) },
    hostTools: {
      register: async (tools: typeof descriptors, implementations: typeof handlers) => {
        descriptors.push(...tools);
        handlers = implementations;
        return { id: 'lease', tools };
      },
    },
  } as unknown as KodaXDaemonRuntime;
  await registerSpaceHostTools(runtime, undefined, [
    {
      name: 'connector_read',
      description: 'Read selected mail',
      input_schema: { type: 'object' },
      sideEffect: 'reads-network',
      planModeAllowed: true,
      handler: async (_input, context) =>
        context?.agentProfile?.surface === 'partner' && context.taskSurface === 'plan'
          ? 'read-ok'
          : 'wrong-context',
    },
  ]);
  assert.equal(descriptors.find((tool) => tool.name === 'connector_read')?.sideEffect, 'none');
  assert.equal(
    (
      await handlers.connector_read({
        invocationId: 'call',
        leaseId: 'lease',
        sessionId: 's',
        runId: 'r',
        input: {},
      })
    ).content,
    'read-ok',
  );
});

test('checkpoint rebinding keeps admitted persona and does not prepare the newly selected default method', async (t) => {
  const store = getSessionRuntimeStore(),
    original = store.read;
  store.read = async () =>
    ({
      partnerExpert: { useSkill: true, expert: { skillRef: 'unavailable-default' } },
    }) as unknown as Awaited<ReturnType<typeof store.read>>;
  t.after(() => {
    store.read = original;
  });
  const runtime = {
    sessions: {
      load: async () => ({ id: 'recovery', surface: 'partner', workspaceRoot: '/workspace' }),
      getSettings: async () => ({ permissionMode: 'accept-edits' }),
    },
    hostTools: { register: async (tools: unknown) => ({ id: 'lease', tools }) },
  } as unknown as KodaXDaemonRuntime;
  const admitted = {
    surface: 'partner',
    name: 'Original expert',
    instructions: 'The admitted method remains fixed.',
  };
  const binding = await registerPartnerHostExecution(runtime, 'recovery', undefined, {
    recovery: {
      agentProfile: admitted,
      binding: {
        businessBinding: await capturePartnerBusinessBinding({
          sessionId: 'recovery',
          projectRoot: '/workspace',
          bindings: [],
        }),
      },
    },
  });
  assert.deepEqual(binding.context.agentProfile, admitted);
  assert.equal(binding.context.requiredWorkMode, 'agent');
});

test('an older Partner checkpoint without a proven business snapshot never adopts the current expert or connector scope', async () => {
  await assert.rejects(
    registerPartnerHostExecution({} as KodaXDaemonRuntime, 'legacy', undefined, {
      recovery: { agentProfile: { surface: 'partner', name: 'Original role' } },
    }),
    { code: 'execution_binding_unavailable' },
  );
});
