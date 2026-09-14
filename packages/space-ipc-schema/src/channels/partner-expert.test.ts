import assert from 'node:assert/strict';
import test from 'node:test';
import {
  spaceExpertDefinitionSchema,
  partnerExpertSnapshotSchema,
  spaceExpertRefSchema,
  spaceExpertSaveInputSchema,
} from './partner-expert.js';

test('expert workflows preserve inspectable outcomes without accepting executable or authorization declarations', () => {
  const definition = {
    id: 'research',
    revision: 1,
    name: 'Research',
    description: '',
    prompt: 'Research the question.',
    expertType: 'task',
    retired: true,
    workflow: {
      inputs: ['Decision and available evidence'],
      deliverables: ['Research report with sources'],
      qualityChecks: ['Important claims have inspectable evidence'],
      connectorNeeds: [
        { operation: 'read', required: false, reason: 'Read selected external evidence' },
      ],
    },
  };
  const parsed = spaceExpertDefinitionSchema.parse(definition);
  assert.deepEqual(parsed.workflow, definition.workflow);
  assert.equal(parsed.retired, true);
  for (const workflow of [
    { ...definition.workflow, command: 'arbitrary' },
    { ...definition.workflow, qualityChecks: [] },
    {
      ...definition.workflow,
      connectorNeeds: [{ operation: 'delete', required: true, reason: 'unsupported' }],
    },
    {
      ...definition.workflow,
      connectorNeeds: [{ operation: 'read', required: true, reason: 'read', token: 'secret' }],
    },
  ])
    assert.equal(spaceExpertDefinitionSchema.safeParse({ ...definition, workflow }).success, false);
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ extensionId: 'library', values: definition }).success,
    false,
  );
});

test('a prompt-only expert has no implicit Skill and snapshots preserve its revision', () => {
  const expert = spaceExpertDefinitionSchema.parse({
    id: 'writing-mentor',
    revision: 1,
    name: '论文写作导师',
    description: '协助论文写作',
    prompt: '以论文导师的角色协助结构、证据和表达，不编造引用。',
    starterTasks: [],
  });
  assert.equal(expert.skillRef, undefined);
  const snapshot = partnerExpertSnapshotSchema.parse({
    extensionId: 'kodax.partner-library',
    extensionVersion: '0.1.0',
    expert,
  });
  assert.equal(snapshot.expert.revision, 1);
  assert.equal(snapshot.expert.prompt, expert.prompt);
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...expert, skills: ['invented'] }).success,
    false,
  );
});

test('configured Skill names use the same syntax as the shared Skill library', () => {
  const definition = {
    id: 'mentor',
    revision: 1,
    name: '导师',
    description: '',
    prompt: '协助写作',
  };
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: 'writing:paper' }).success,
    true,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: '../paper' }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: 'A'.repeat(80) }).success,
    false,
  );
});

test('expert catalog metadata supports type, broad category, and team composition', () => {
  const classified = spaceExpertDefinitionSchema.parse({
    id: 'investment-research-team',
    revision: 1,
    name: '投资研究团队',
    description: '协作完成投研任务',
    prompt: '从行业、公司和风险三个角度协作研究。',
    expertType: 'role',
    category: '投资分析',
    listingType: 'team',
  });
  assert.equal(classified.expertType, 'role');
  assert.equal(classified.category, '投资分析');
  assert.equal(classified.listingType, 'team');
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...classified, expertType: 'department' }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...classified, category: ' '.repeat(3) }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...classified, category: '全部' }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...classified, category: '专家团' }).success,
    false,
  );
  for (const category of ['all', 'team'])
    assert.equal(spaceExpertDefinitionSchema.safeParse({ ...classified, category }).success, false);
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...classified, listingType: 'workflow' }).success,
    false,
  );
});

test('a platform expert can publish a bounded two-level capability guide in its snapshot', () => {
  const definition = {
    id: 'feishu-office-suite',
    revision: 1,
    name: '飞书办公套件专家',
    description: '在飞书中协同处理文档和多维表格。',
    prompt: '先确认任务目标，再使用当前会话已授权的飞书能力完成工作。',
    expertType: 'platform' as const,
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
              promptTemplate: '请在飞书中起草一份【文档主题】文档，面向【目标读者】。',
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
              description: '创建一个新的 Base 和首张数据表。',
              requiredConnectorIds: ['feishu-docs'],
              promptTemplate:
                '请新建一个名为【多维表格名称】的飞书多维表格，首张表名为【数据表名称】，字段包括【字段及类型】。',
            },
          ],
        },
      ],
    },
  };
  const expert = spaceExpertDefinitionSchema.parse(definition);
  assert.deepEqual(expert.capabilityGuide, definition.capabilityGuide);
  const snapshot = partnerExpertSnapshotSchema.parse({
    extensionId: 'kodax.partner-library',
    extensionVersion: '0.8.0',
    expert,
  });
  assert.equal(snapshot.expert.capabilityGuide?.groups[1]?.actions[0]?.id, 'create-base');
});

test('capability guides are independent of expert type and remain unique bounded metadata', () => {
  const guide = {
    groups: [
      {
        id: 'documents',
        label: '飞书文档',
        actions: [
          {
            id: 'draft-document',
            label: '起草文档',
            requiredConnectorIds: ['feishu-docs'],
            promptTemplate: '请起草一份飞书文档。',
          },
        ],
      },
    ],
  };
  const definition = {
    id: 'feishu-office-suite',
    revision: 1,
    name: '飞书办公套件专家',
    description: '',
    prompt: '协助用户使用飞书。',
    expertType: 'platform',
    capabilityGuide: guide,
  };
  assert.equal(spaceExpertDefinitionSchema.safeParse(definition).success, true);
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, expertType: 'role' }).success,
    true,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({
      ...definition,
      capabilityGuide: { groups: [guide.groups[0], guide.groups[0]] },
    }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({
      ...definition,
      capabilityGuide: {
        groups: [
          {
            ...guide.groups[0],
            actions: [guide.groups[0].actions[0], guide.groups[0].actions[0]],
          },
        ],
      },
    }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({
      ...definition,
      capabilityGuide: { groups: [] },
    }).success,
    false,
  );
});

test('saving an expert accepts content but cannot assign identity or bypass edit revisions', () => {
  const input = {
    extensionId: 'kodax.partner-library',
    values: { name: '导师', description: '', prompt: '帮助写作', starterTasks: [] },
  };
  assert.equal(spaceExpertSaveInputSchema.safeParse(input).success, true);
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({
      ...input,
      values: { ...input.values, category: null },
    }).success,
    true,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({
      id: 'mentor',
      revision: 1,
      ...input.values,
      category: null,
    }).success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({
      ...input,
      expertId: 'user.abc',
      expectedRevision: 2,
    }).success,
    true,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, expertId: 'user.abc' }).success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, expectedRevision: 2 }).success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, values: { ...input.values, id: 'user.abc' } })
      .success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({
      ...input,
      values: {
        ...input.values,
        capabilityGuide: {
          groups: [
            {
              id: 'base',
              label: '多维表格',
              actions: [
                {
                  id: 'create-base',
                  label: '新建多维表格',
                  requiredConnectorIds: ['feishu-docs'],
                  promptTemplate: '请新建多维表格。',
                },
              ],
            },
          ],
        },
      },
    }).success,
    false,
  );
});

test('an explicit prompt-only choice survives both the reference and the session snapshot', () => {
  const reference = spaceExpertRefSchema.parse({
    extensionId: 'kodax.partner-library',
    expertId: 'writing-mentor',
    revision: 1,
    useSkill: false,
  });
  const snapshot = partnerExpertSnapshotSchema.parse({
    extensionId: reference.extensionId,
    extensionVersion: '0.3.0',
    useSkill: false,
    expert: {
      id: reference.expertId,
      revision: 1,
      name: '论文导师',
      description: '',
      prompt: '帮助写作',
      skillRef: 'writing:paper',
    },
  });
  assert.equal(reference.useSkill, false);
  assert.equal(snapshot.useSkill, false);
  assert.equal(snapshot.expert.skillRef, 'writing:paper');
});
