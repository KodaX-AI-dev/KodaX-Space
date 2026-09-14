import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerExpertSnapshotT, SpaceExpertDraftT } from '@kodax-space/space-ipc-schema';
import {
  createPartnerExtensionActions,
  type PartnerExtensionActionsOptions,
} from './partnerExtensionActions.js';

const values = {
  name: 'My editor',
  description: 'Writing support',
  prompt: 'Help me edit.',
  starterTasks: ['Review this outline'],
} satisfies SpaceExpertDraftT;
const expert: PartnerExpertSnapshotT = {
  extensionId: 'library',
  extensionVersion: '1.0.0',
  expert: { ...values, id: 'user.editor', revision: 2 },
};
const envelope = {
  type: 'space-extension.request.v1' as const,
  requestId: 'request-1',
  token: 'frame',
};

function fixture(overrides: Partial<PartnerExtensionActionsOptions> = {}) {
  const calls: unknown[] = [];
  const options: PartnerExtensionActionsOptions = {
    extensionId: 'library',
    isActive: () => true,
    api: {
      catalog: async (id) => {
        calls.push(['catalog', id]);
        return { experts: [expert.expert] };
      },
      resolve: async (ref) => {
        calls.push(['resolve', ref]);
        return { expert };
      },
      save: async (input) => {
        calls.push(['save', input]);
        return { expert: expert.expert };
      },
      delete: async (ref) => {
        calls.push(['delete', ref]);
        return { ok: true };
      },
    },
    selectExpert: async (ref) => {
      calls.push(['select', ref]);
    },
    onSelected: () => {
      calls.push(['selected']);
    },
    onDetails: (snapshot) => {
      calls.push(['details', snapshot]);
    },
    confirmDelete: async () => true,
    ...overrides,
  };
  return { calls, options, dispatch: createPartnerExtensionActions(options) };
}

test('saving an expert uses the host package identity without selecting it or changing the draft', async () => {
  const { calls, dispatch } = fixture();
  const result = await dispatch({ ...envelope, method: 'expert.save', values });
  assert.deepEqual(result, { expert: expert.expert });
  assert.deepEqual(calls, [['save', { extensionId: 'library', values }]]);
});

test('deletion requires host confirmation of the resolved user expert and cancellation has no mutation', async () => {
  const names: string[] = [];
  const { calls, dispatch } = fixture({
    confirmDelete: async (snapshot) => {
      names.push(snapshot.expert.name);
      return false;
    },
  });
  const result = await dispatch({
    ...envelope,
    method: 'expert.delete',
    expertId: 'user.editor',
    revision: 2,
  });
  assert.deepEqual(names, ['My editor']);
  assert.deepEqual(result, { cancelled: true });
  assert.deepEqual(calls, [
    ['resolve', { extensionId: 'library', expertId: 'user.editor', revision: 2 }],
  ]);
});

test('closing the frame or disabling its package during confirmation prevents a late deletion', async () => {
  let active = true;
  const { calls, dispatch } = fixture({
    isActive: () => active,
    confirmDelete: async () => {
      active = false;
      return true;
    },
  });
  await assert.rejects(
    dispatch({ ...envelope, method: 'expert.delete', expertId: 'user.editor', revision: 2 }),
    /closed or changed/,
  );
  assert.equal(calls.length, 1);
});

test('prompt-only selection carries an explicit Skill opt-out without changing the expert version', async () => {
  const { dispatch, calls } = fixture();
  await dispatch({
    ...envelope,
    method: 'expert.select',
    expertId: 'user.editor',
    revision: 2,
    useSkill: false,
  });
  assert.deepEqual(calls, [
    ['select', { extensionId: 'library', expertId: 'user.editor', revision: 2, useSkill: false }],
    ['selected'],
  ]);
});

test('connector catalog replies expose only declarations and connected IDs, never account or onboarding fields', async () => {
  const connector = {
    id: 'feishu-docs',
    adapter: 'feishu-cli' as const,
    name: 'Feishu documents',
    description: '',
  };
  const catalog = {
    connectors: [connector],
    connectedIds: ['feishu-docs'],
    connections: [{ accountLabel: 'Private account', profile: 'private-profile' }],
    job: { id: 'private-job' },
  };
  const { dispatch } = fixture({
    connectors: { catalog: async () => catalog, onConfigure: () => undefined },
  });
  assert.deepEqual(await dispatch({ ...envelope, method: 'connector.catalog' }), {
    connectors: [connector],
    connectedIds: ['feishu-docs'],
  });
});

test('closing or replacing context while connector metadata loads cannot open a stale connection modal', async () => {
  let active = true;
  let opened = false;
  const { dispatch } = fixture({
    isActive: () => active,
    connectors: {
      catalog: async () => {
        active = false;
        return {
          connectors: [
            { id: 'feishu-docs', adapter: 'feishu-cli', name: 'Feishu', description: '' },
          ],
        };
      },
      onConfigure: () => {
        opened = true;
      },
    },
  });
  await assert.rejects(
    dispatch({ ...envelope, method: 'connector.configure', connectorId: 'feishu-docs' }),
    /closed or changed/,
  );
  assert.equal(opened, false);
});
