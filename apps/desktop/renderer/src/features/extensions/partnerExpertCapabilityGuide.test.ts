import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import { projectPartnerExpertCapabilityGuide } from './partnerExpertCapabilityGuide.js';

const expert: SpaceExpertDefinitionT = {
  id: 'feishu-office-suite',
  revision: 1,
  name: '飞书办公套件专家',
  description: '持续协助飞书办公任务。',
  prompt: 'Use the current Feishu scope.',
  starterTasks: [],
  expertType: 'platform',
  capabilityGuide: {
    groups: [
      {
        id: 'documents',
        label: '飞书文档',
        actions: [
          {
            id: 'draft-document',
            label: '起草飞书文档',
            requiredConnectorIds: ['feishu-docs'],
            promptTemplate: '请起草一份飞书文档。',
          },
        ],
      },
      {
        id: 'base',
        label: '多维表格',
        actions: [
          {
            id: 'create-base',
            label: '新建多维表格',
            requiredConnectorIds: ['feishu-docs'],
            promptTemplate: '请新建一个飞书多维表格。',
          },
        ],
      },
    ],
  },
};

test('projects capability groups and the selected second-level actions for the current scope', () => {
  const projection = projectPartnerExpertCapabilityGuide(expert, 'project-a:draft', {
    scopeKey: 'project-a:draft',
    groupId: 'base',
  });

  assert.deepEqual(
    projection?.groups.map((group) => group.id),
    ['documents', 'base'],
  );
  assert.equal(projection?.selectedGroup?.id, 'base');
  assert.equal(projection?.selectedGroup?.actions[0]?.promptTemplate, '请新建一个飞书多维表格。');
});

test('does not carry a selected group into another project, conversation or expert scope', () => {
  const projection = projectPartnerExpertCapabilityGuide(expert, 'project-b:session-2', {
    scopeKey: 'project-a:draft',
    groupId: 'base',
  });

  assert.equal(projection?.selectedGroup, null);
});

test('hides the guide when the expert has no capability metadata', () => {
  assert.equal(
    projectPartnerExpertCapabilityGuide(
      { ...expert, capabilityGuide: undefined },
      'project-a:draft',
      null,
    ),
    null,
  );
});
