import assert from 'node:assert/strict';
import test from 'node:test';
import type { KodaXDaemonRuntime } from '@kodax-ai/kodax/runtime';
import { getSessionRuntimeStore } from '../session-runtime-store.js';
import { hasExplicitHostSkill, registerPartnerHostExecution } from './partner-host-tools.js';
import { registerSpaceHostTools } from './space-host-tools.js';

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
    recovery: { agentProfile: admitted },
  });
  assert.deepEqual(binding.context.agentProfile, admitted);
});
