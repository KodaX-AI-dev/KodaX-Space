import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import {
  loadPartnerContext,
  partnerContextResultForScope,
  PartnerContextRail,
} from './PartnerContextRail.js';

test('proposal history stays outside the task rail while direct tasks become browser artifacts', async () => {
  const invokedChannels: string[] = [];
  const createProposal = {
    id: '785fc824-c17a-48c2-a360-e515028869b5',
    sessionId: 'session-1',
    projectRoot: '/project',
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    operation: 'create',
    targetUrl: 'https://test.feishu.cn/drive/folder/Folder1',
    title: '旧新建提案',
    rationale: '',
    contentHash: 'a'.repeat(64),
    scopeHash: 'b'.repeat(64),
    status: 'pending',
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
  } as const;
  const appendProposal = {
    ...createProposal,
    id: '885fc824-c17a-48c2-a360-e515028869b5',
    operation: 'append',
    targetUrl: 'https://test.feishu.cn/docx/Existing1',
    title: '追加现有文档',
  } as const;
  const documentTask = {
    id: '985fc824-c17a-48c2-a360-e515028869b5',
    sessionId: 'session-1',
    projectRoot: '/project',
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    provider: 'feishu',
    target: { kind: 'personal-space' },
    requestedTitle: '项目备忘',
    status: 'succeeded',
    resourceId: 'Document1',
    title: '项目备忘',
    canonicalUrl: 'https://test.feishu.cn/docx/Document1',
    revision: 2,
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:01:00.000Z',
  } as const;
  const bridge = {
    invoke: async (channel: string) => {
      invokedChannels.push(channel);
      if (channel === 'partner.sources.catalog') return { ok: true, data: { sources: [] } };
      if (channel === 'artifact.list') return { ok: true, data: { artifacts: [] } };
      if (channel === 'partner.deliveries.list') return { ok: true, data: { deliveries: [] } };
      if (channel === 'partner.fileProposals.list') return { ok: true, data: { proposals: [] } };
      return {
        ok: true,
        data: {
          sources: [],
          proposals: [createProposal, appendProposal],
          receipts: [],
          baseTasks: [],
          documentTasks: [documentTask],
          recordRevision: 3,
        },
      };
    },
  } as unknown as KodaXSpaceBridge;

  const loaded = await loadPartnerContext({
    bridge,
    projectRoot: '/project',
    sessionId: 'session-1',
    transientArtifacts: [],
    pendingSources: [],
  });
  assert.doesNotMatch(invokedChannels.join('\n'), /partner\.fileProposals/u);
  assert.equal(loaded.summary.artifacts.count, 1);
  assert.equal(loaded.artifacts[0]?.label, '项目备忘');
  assert.deepEqual(loaded.artifacts[0]?.action, {
    kind: 'detail',
    target: {
      kind: 'browser',
      initialUrl: 'https://test.feishu.cn/docx/Document1',
      resourceKey: 'native-document-6:feishu:Document1',
      title: '项目备忘',
    },
  });
});

test('task-card records from the previous session are hidden before the next load finishes', async () => {
  const bridge = {
    invoke: async (channel: string) => {
      if (channel === 'partner.sources.catalog') return { ok: true, data: { sources: [] } };
      if (channel === 'artifact.list') {
        return {
          ok: true,
          data: {
            artifacts: [
              {
                id: 'artifact-session-a',
                sessionId: 'session-a',
                surface: 'partner',
                kind: 'markdown',
                title: 'A 会话产物',
                currentVersion: 1,
                versions: [],
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        };
      }
      if (channel === 'partner.deliveries.list') return { ok: true, data: { deliveries: [] } };
      return {
        ok: true,
        data: {
          sources: [],
          proposals: [],
          receipts: [],
          baseTasks: [],
          documentTasks: [],
          recordRevision: 0,
        },
      };
    },
  } as unknown as KodaXSpaceBridge;
  const sessionA = await loadPartnerContext({
    bridge,
    projectRoot: '/project',
    sessionId: 'session-a',
    transientArtifacts: [],
    pendingSources: [],
  });

  assert.equal(partnerContextResultForScope(sessionA, '/project', 'session-a'), sessionA);
  assert.deepEqual(partnerContextResultForScope(sessionA, '/project', 'session-b').artifacts, []);
});

test('a persisted artifact and its transcript snapshot become one output item with preview data', async () => {
  const bridge = {
    invoke: async (channel: string) => {
      if (channel === 'partner.sources.catalog') return { ok: true, data: { sources: [] } };
      if (channel === 'artifact.list') {
        return {
          ok: true,
          data: {
            artifacts: [
              {
                id: 'artifact-brief',
                sessionId: 'session-a',
                surface: 'partner',
                kind: 'markdown',
                title: '项目简报.md',
                currentVersion: 1,
                versions: [],
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        };
      }
      if (channel === 'partner.deliveries.list') return { ok: true, data: { deliveries: [] } };
      return {
        ok: true,
        data: {
          sources: [],
          proposals: [],
          receipts: [],
          baseTasks: [],
          documentTasks: [],
          recordRevision: 0,
        },
      };
    },
  } as unknown as KodaXSpaceBridge;
  const snapshot = {
    id: 'artifact-brief',
    kind: 'markdown' as const,
    title: '项目简报.md',
    source: 'artifact' as const,
    version: 1,
    content: '# 项目简报',
  };

  const loaded = await loadPartnerContext({
    bridge,
    projectRoot: '/project',
    sessionId: 'session-a',
    transientArtifacts: [snapshot],
    pendingSources: [],
  });

  assert.equal(loaded.summary.artifacts.count, 1);
  assert.equal(loaded.artifacts.length, 1);
  assert.deepEqual(loaded.artifacts[0]?.action, {
    kind: 'detail',
    target: {
      kind: 'artifact',
      artifactId: 'artifact-brief',
      title: '项目简报.md',
      snapshot,
    },
  });
});

test('a delivered file opens through the unified typed file detail target', async () => {
  const bridge = {
    invoke: async (channel: string) => {
      if (channel === 'partner.sources.catalog') return { ok: true, data: { sources: [] } };
      if (channel === 'artifact.list') return { ok: true, data: { artifacts: [] } };
      if (channel === 'partner.deliveries.list') {
        return {
          ok: true,
          data: {
            deliveries: [
              {
                id: 'delivery-report',
                sessionId: 'session-a',
                projectRoot: '/project',
                rootKind: 'run-output',
                rootPath: '/project/.kodax/runs/run-a/output',
                absolutePath: '/project/.kodax/runs/run-a/output/report.md',
                relativePath: 'report.md',
                kind: 'file',
                title: '任务报告.md',
                sourceRefs: [],
                producer: 'partner',
                createdAt: 1_000,
                updatedAt: 2_000,
              },
            ],
          },
        };
      }
      return {
        ok: true,
        data: {
          sources: [],
          proposals: [],
          receipts: [],
          baseTasks: [],
          documentTasks: [],
          recordRevision: 0,
        },
      };
    },
  } as unknown as KodaXSpaceBridge;

  const loaded = await loadPartnerContext({
    bridge,
    projectRoot: '/project',
    sessionId: 'session-a',
    transientArtifacts: [],
    pendingSources: [],
  });

  assert.equal(loaded.artifacts[0]?.action.kind, 'detail');
  assert.equal(
    loaded.artifacts[0]?.action.kind === 'detail' ? loaded.artifacts[0].action.target.kind : null,
    'file',
  );
});

test('renders exactly the three Partner task cards without a review destination', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerContextRail onOpenDetail={() => undefined} onAddMaterial={() => undefined} />
    </I18nProvider>,
  );

  assert.match(html, /data-testid="partner-context-rail"/);
  assert.match(html, /(?:class="[^"]*\b|\s)w-\[300px\](?:\s|[^"]*")/);
  const railClass = html.match(
    /<aside class="([^"]*)"[^>]*data-testid="partner-context-rail"/,
  )?.[1];
  assert.ok(railClass);
  assert.doesNotMatch(railClass, /(?:^|\s)border-l(?:\s|$)/);
  assert.match(html, /(?:class="[^"]*\b|\s)gap-3(?:\s|[^"]*")/);

  const materialsCardIndex = html.indexOf('data-testid="partner-task-materials-card"');
  const collaborationCardIndex = html.indexOf('data-testid="partner-task-collaboration-card"');
  const artifactsCardIndex = html.indexOf('data-testid="partner-task-artifacts-card"');
  assert.ok(materialsCardIndex >= 0);
  assert.ok(collaborationCardIndex > materialsCardIndex);
  assert.ok(artifactsCardIndex > collaborationCardIndex);

  assert.doesNotMatch(html, /aria-label="Refresh"/);
  assert.doesNotMatch(html, /doc-workspace · knowledge work/);
  assert.match(html, /data-testid="partner-task-materials"/);
  assert.match(html, /data-testid="partner-task-collaboration"/);
  assert.match(html, /data-testid="partner-task-artifacts"/);
  assert.match(html, /data-testid="partner-context-add-material"/);
  assert.doesNotMatch(html, /data-testid="partner-task-confirmation"/);
  assert.doesNotMatch(html, /data-testid="partner-sources-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-artifact-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-file-proposals-panel"/);
});
