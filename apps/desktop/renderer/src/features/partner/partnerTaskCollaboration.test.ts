import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionEvent, SkillMeta } from '@kodax-space/space-ipc-schema';
import {
  collectPartnerTaskSkillNames,
  partnerTaskCollaborationScopeKey,
  selectPartnerTaskSkillsForScope,
} from './partnerTaskCollaboration.js';

const skills: readonly SkillMeta[] = [
  {
    name: 'deep-research',
    description: 'Research with evidence.',
    source: 'project',
    path: '/workspace/.kodax/skills/deep-research/SKILL.md',
  },
  {
    name: 'documents:documents',
    description: 'Create documents.',
    source: 'plugin',
    path: '/plugins/documents/SKILL.md',
  },
];

test('collects only installed Skills referenced by accepted task messages', () => {
  assert.deepEqual(
    collectPartnerTaskSkillNames({
      skills,
      messageTexts: [
        '请使用 /deep-research 调研市场',
        '再调用 /skill:documents:documents 输出文档',
        '不要把 /unknown 当成 Skill',
      ],
      events: [],
    }),
    ['deep-research', 'documents:documents'],
  );
});

test('includes runtime Skill tool calls and the configured expert Skill without duplicates', () => {
  const events = [
    {
      kind: 'tool_start',
      sessionId: 'session-a',
      toolId: 'tool-a',
      toolName: 'skill',
      input: { name: 'deep-research' },
    },
  ] as readonly SessionEvent[];

  assert.deepEqual(
    collectPartnerTaskSkillNames({
      skills,
      messageTexts: ['/deep-research 再检查一次'],
      events,
      expertSkillName: 'documents:documents',
    }),
    ['documents:documents', 'deep-research'],
  );
});

test('hides a previous project skill catalog as soon as the task scope changes', () => {
  const previousScope = partnerTaskCollaborationScopeKey('/workspace/project-a', 'session-a');
  const nextScope = partnerTaskCollaborationScopeKey('/workspace/project-b', 'session-b');

  assert.equal(selectPartnerTaskSkillsForScope({ scopeKey: previousScope, skills }, previousScope), skills);
  assert.deepEqual(
    selectPartnerTaskSkillsForScope({ scopeKey: previousScope, skills }, nextScope),
    [],
  );
});
