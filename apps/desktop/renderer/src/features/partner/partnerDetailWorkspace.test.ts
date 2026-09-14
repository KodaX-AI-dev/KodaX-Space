import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PartnerDeliveryRefT,
  PartnerFeishuBaseCreateTaskT,
} from '@kodax-space/space-ipc-schema';
import {
  consumePartnerDetailOpenRequest,
  createPartnerDetailTab,
  createPartnerDetailWorkspaceState,
  partnerDetailTargetForDelivery,
  partnerDetailRequestForContext,
  partnerDetailWorkspaceContextKey,
  reducePartnerDetailWorkspace,
  type PartnerDetailWorkspaceContext,
  type PartnerDetailOpenRequest,
  type PartnerDetailTab,
} from './partnerDetailWorkspace.js';

const workspaceContext: PartnerDetailWorkspaceContext = {
  projectRoot: '/workspace/project-a',
  sessionId: 'session-a',
};

const materialsTab: PartnerDetailTab = {
  id: 'materials-1',
  kind: 'materials',
  title: '资料',
};

const outputsTab: PartnerDetailTab = {
  id: 'outputs-1',
  kind: 'outputs',
  title: '任务产物',
};

const collaborationTab: PartnerDetailTab = {
  id: 'partner-detail-collaboration',
  kind: 'collaboration',
  title: '任务协作',
};

const resultTab: PartnerDetailTab = {
  id: 'result-1',
  kind: 'remoteResult',
  title: '在线成果',
};

const baseTask: PartnerFeishuBaseCreateTaskT = {
  id: '785fc824-c17a-48c2-a360-e515028869b5',
  sessionId: 'session-a',
  projectRoot: '/workspace/project-a',
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu-docs',
  connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
  connectionRevision: 1,
  folderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
  baseName: '项目台账',
  tableName: '任务',
  fields: [{ type: 'text', name: '事项' }],
  timeZone: 'Asia/Shanghai',
  inputHash: 'a'.repeat(64),
  scopeHash: 'b'.repeat(64),
  status: 'preparing',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

test('Partner detail workspace opens every card selection as an active tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: materialsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: collaborationTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: outputsTab });

  assert.deepEqual(state.tabs, [materialsTab, collaborationTab, outputsTab]);
  assert.equal(state.activeId, outputsTab.id);
});

test('Partner detail launcher keeps existing tabs and clears only the active selection', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: materialsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'show-launcher' });

  assert.deepEqual(state.tabs, [materialsTab]);
  assert.equal(state.activeId, null);
});

test('reopening a connector result reuses its stable local detail card', () => {
  const result = createPartnerDetailTab(
    {
      kind: 'remoteResult',
      initialUrl: 'https://example.feishu.cn/docx/NewDocument',
      resourceKey: 'native-document-6:feishu:NewDocument',
      title: 'Created document',
    },
    'Result',
    1,
  );
  let state = reducePartnerDetailWorkspace(createPartnerDetailWorkspaceState(), {
    type: 'open',
    tab: result,
  });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: materialsTab });
  state = reducePartnerDetailWorkspace(state, {
    type: 'open',
    tab: { ...result, title: 'Updated title' },
  });
  assert.equal(state.tabs.length, 2);
  assert.equal(state.activeId, result.id);
  assert.equal(state.tabs[0]?.title, 'Updated title');
});

test('distinct historical source snapshots independently addressable', () => {
  const first = createPartnerDetailTab(
    { kind: 'remoteSource', sourceId: 'snapshot-a', title: 'Saved document' },
    'Sources',
    1,
  );
  const second = createPartnerDetailTab(
    { kind: 'remoteSource', sourceId: 'snapshot-b', title: 'Saved document' },
    'Sources',
    2,
  );
  let state = reducePartnerDetailWorkspace(createPartnerDetailWorkspaceState(), {
    type: 'open',
    tab: first,
  });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: second });
  assert.deepEqual(state.tabs, [first, second]);
  assert.equal(state.activeId, second.id);
});

test('closing the active tab selects the next tab, then falls back to the previous tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: materialsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: outputsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: resultTab });
  state = reducePartnerDetailWorkspace(state, { type: 'select', id: outputsTab.id });

  state = reducePartnerDetailWorkspace(state, { type: 'close', id: outputsTab.id });
  assert.deepEqual(state.tabs, [materialsTab, resultTab]);
  assert.equal(state.activeId, resultTab.id);

  state = reducePartnerDetailWorkspace(state, { type: 'close', id: resultTab.id });
  assert.deepEqual(state.tabs, [materialsTab]);
  assert.equal(state.activeId, materialsTab.id);
});

test('closing a background tab preserves the active tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: materialsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: resultTab });
  state = reducePartnerDetailWorkspace(state, { type: 'close', id: materialsTab.id });

  assert.deepEqual(state.tabs, [resultTab]);
  assert.equal(state.activeId, resultTab.id);
});

test('an artifact request becomes a stable, directly addressable detail tab', () => {
  const snapshot = {
    id: 'artifact-brief',
    kind: 'markdown' as const,
    title: '项目备忘.md',
    source: 'artifact' as const,
    content: '# 项目备忘',
  };

  assert.deepEqual(
    createPartnerDetailTab(
      { kind: 'artifact', artifactId: snapshot.id, title: snapshot.title, snapshot },
      '任务产物',
      4,
    ),
    {
      id: 'partner-detail-artifact-artifact-brief',
      kind: 'artifact',
      title: '项目备忘.md',
      artifactId: 'artifact-brief',
      snapshot,
    },
  );
});

test('a file preview request becomes its own detail tab with the real snapshot and title attached', () => {
  const snapshot = {
    id: 'file-brief',
    kind: 'markdown' as const,
    title: 'brief.md',
    source: 'file-preview' as const,
    path: 'brief.md',
  };

  assert.deepEqual(createPartnerDetailTab({ kind: 'file', snapshot }, 'Files', 12), {
    id: 'partner-detail-file-12',
    kind: 'file',
    title: 'brief.md',
    snapshot,
  });
});

test('a Partner delivery becomes a typed file detail backed by the delivery store', () => {
  const delivery: PartnerDeliveryRefT = {
    id: 'delivery-brief',
    sessionId: 'session-a',
    projectRoot: '/workspace/project-a',
    rootKind: 'run-output',
    rootPath: '/workspace/project-a/.kodax/runs/run-a/output',
    absolutePath: '/workspace/project-a/.kodax/runs/run-a/output/brief.md',
    relativePath: 'brief.md',
    kind: 'file',
    title: '项目简报.md',
    extension: '.md',
    sourceRefs: [],
    producer: 'partner',
    createdAt: 1_000,
    updatedAt: 2_000,
  };

  const target = partnerDetailTargetForDelivery(delivery);

  assert.equal(target?.kind, 'file');
  assert.deepEqual(target?.kind === 'file' ? target.snapshot : null, {
    id: 'delivery-preview-delivery-brief',
    kind: 'file',
    title: '项目简报.md',
    source: 'delivery-preview',
    version: 2_000,
    path: 'brief.md',
    projectRoot: '/workspace/project-a',
    sessionId: 'session-a',
    fileSource: 'delivery-store',
    deliveryId: 'delivery-brief',
    versions: [
      {
        v: 2_000,
        path: 'brief.md',
        fileSource: 'delivery-store',
        deliveryId: 'delivery-brief',
      },
    ],
  });
});

test('collaboration is a stable category tab and each Skill opens a named detail tab', () => {
  const skill = {
    name: 'deep-research',
    description: 'Research with evidence.',
    source: 'project' as const,
    path: '/workspace/project-a/.kodax/skills/deep-research/SKILL.md',
  };

  assert.deepEqual(createPartnerDetailTab({ kind: 'collaboration' }, '任务协作', 3), {
    id: 'partner-detail-collaboration',
    kind: 'collaboration',
    title: '任务协作',
  });
  assert.deepEqual(createPartnerDetailTab({ kind: 'skill', skill }, 'Skill', 4), {
    id: 'partner-detail-skill-deep-research',
    kind: 'skill',
    title: 'deep-research',
    skill,
  });
});

test('Base task and verified resource targets keep host-owned task identity and URL', () => {
  assert.deepEqual(createPartnerDetailTab({ kind: 'baseTask', task: baseTask }, 'Task', 12), {
    id: `partner-detail-base-task-${baseTask.id}`,
    kind: 'baseTask',
    title: baseTask.baseName,
    baseTask,
  });

  assert.deepEqual(
    createPartnerDetailTab(
      {
        kind: 'remoteResult',
        initialUrl: 'https://www.feishu.cn/base/baseToken',
        resourceKey: `base-task-${baseTask.id}`,
        title: baseTask.baseName,
      },
      'Result',
      13,
    ),
    {
      id: `partner-detail-base-task-${baseTask.id}`,
      kind: 'remoteResult',
      title: baseTask.baseName,
      externalUrl: 'https://www.feishu.cn/base/baseToken',
      resourceKey: `base-task-${baseTask.id}`,
    },
  );
});

test('a consumed detail request clears only the matching revision', () => {
  const request: PartnerDetailOpenRequest = {
    revision: 8,
    context: workspaceContext,
    target: { kind: 'materials', openPicker: true },
  };

  assert.equal(consumePartnerDetailOpenRequest(request, 8), null);
  assert.equal(consumePartnerDetailOpenRequest(request, 7), request);
});

test('detail requests and workspace instances are scoped to project and session context', () => {
  const request: PartnerDetailOpenRequest = {
    revision: 9,
    context: workspaceContext,
    target: { kind: 'file', snapshot: { id: 'a', kind: 'markdown', title: 'a.md' } },
  };
  const nextSession = { ...workspaceContext, sessionId: 'session-b' };
  const nextProject = { projectRoot: '/workspace/project-b', sessionId: null };

  assert.equal(partnerDetailRequestForContext(request, workspaceContext), request);
  assert.equal(partnerDetailRequestForContext(request, nextSession), null);
  assert.equal(partnerDetailRequestForContext(request, nextProject), null);
  assert.notEqual(
    partnerDetailWorkspaceContextKey(workspaceContext),
    partnerDetailWorkspaceContextKey(nextSession),
  );
  assert.notEqual(
    partnerDetailWorkspaceContextKey(workspaceContext),
    partnerDetailWorkspaceContextKey(nextProject),
  );
});
