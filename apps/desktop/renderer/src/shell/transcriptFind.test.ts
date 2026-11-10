import assert from 'node:assert/strict';
import test from 'node:test';
import { DisclosurePart } from '../features/session/messages/rowDisclosure.js';
import { findTranscriptMatches, type FindableItem } from './transcriptFind.js';

const user = (id: string, content: string, attachments?: []): FindableItem => ({
  kind: 'message',
  message: { kind: 'user', id, content, sentAt: 0, ...(attachments ? { attachments } : {}) },
});
const assistant = (id: string, text: string, thinking?: string): FindableItem => ({
  kind: 'message',
  message: { kind: 'assistant_text', id, text, ...(thinking ? { thinking } : {}) },
});
const notice = (id: string, fields: Record<string, unknown>): FindableItem =>
  ({
    kind: 'message',
    message: { kind: 'system_notice', id, text: '', ...fields },
  }) as FindableItem;
const cluster = (
  id: string,
  steps: readonly {
    title: string;
    syntheticTitle?: boolean;
    thinking?: string;
    tools?: readonly {
      id: string;
      toolName: string;
      input?: Record<string, unknown>;
      result?: string;
    }[];
  }[],
): FindableItem => ({
  kind: 'receipts',
  receipts: [
    {
      kind: 'tool_cluster',
      id,
      subClusters: steps.map((step) => ({
        title: step.title,
        syntheticTitle: step.syntheticTitle ?? false,
        ...(step.thinking ? { thinking: step.thinking } : {}),
        tools: step.tools ?? [],
      })),
    },
  ],
});

test('matches loaded rows in render order, case-insensitively, without reveal for visible text', () => {
  const items = [assistant('a0', 'Where is the Needle?'), assistant('a1', 'The NEEDLE is here.')];
  assert.deepEqual(findTranscriptMatches(items, 'needle', false), [{ id: 'a0' }, { id: 'a1' }]);
  assert.deepEqual(findTranscriptMatches(items, '   ', false), []);
});

// A user question collapses by measured height, so its hits always carry the (harmless) reveal.
test('collapsed message bodies match and name the disclosure that reveals them', () => {
  const items = [
    user('u1', 'long question with a needle'),
    assistant('a1', 'answer', 'reasoned about the needle'),
    notice('n1', { variant: 'info', text: 'report needle', taskResult: { status: 'done' } }),
    notice('n2', { variant: 'lineage', lineageKind: 'branch_summary', text: 'branch needle' }),
    notice('n3', { variant: 'error', text: 'Request failed', runtimeRunId: 'run-needle' }),
  ];
  assert.deepEqual(findTranscriptMatches(items, 'needle', false), [
    { id: 'u1', reveal: { kind: 'disclosure', ownerId: 'u1', part: DisclosurePart.userQuery } },
    {
      id: 'a1',
      reveal: { kind: 'disclosure', ownerId: 'a1', part: DisclosurePart.assistantThinking },
    },
    { id: 'n1', reveal: { kind: 'disclosure', ownerId: 'n1', part: DisclosurePart.noticeDetails } },
    { id: 'n2', reveal: { kind: 'disclosure', ownerId: 'n2', part: DisclosurePart.lineageDetail } },
    { id: 'n3', reveal: { kind: 'disclosure', ownerId: 'n3', part: DisclosurePart.errorDetails } },
  ]);
});

test('a visible hit in the same row wins over a collapsed one', () => {
  assert.deepEqual(
    findTranscriptMatches([assistant('a1', 'needle answer', 'needle thinking')], 'needle', false),
    [{ id: 'a1' }],
  );
  assert.deepEqual(
    findTranscriptMatches(
      [
        notice('n1', {
          variant: 'info',
          text: 'body',
          taskResult: { status: 'done', title: 'Needle report' },
        }),
      ],
      'needle',
      false,
    ),
    [{ id: 'n1' }],
  );
});

test('receipts expose folded assistant step text and thinking, never synthetic titles', () => {
  const items: FindableItem[] = [
    cluster('c1', [
      { title: 'Let me check the needle file', tools: [{ id: 't1', toolName: 'read' }] },
    ]),
    cluster('c2', [
      { title: '1 needle', syntheticTitle: true, tools: [{ id: 't2', toolName: 'read' }] },
    ]),
    { kind: 'receipts', receipts: [{ kind: 'thinking', id: 'th1', thinking: 'needle reasoning' }] },
    cluster('c3', [{ title: 'step', thinking: 'folded needle thought' }]),
  ];
  assert.deepEqual(findTranscriptMatches(items, 'needle', false), [
    { id: 'c1', reveal: { kind: 'receipt', id: 'c1' } },
    { id: 'th1', reveal: { kind: 'receipt', id: 'th1' } },
    { id: 'c3', reveal: { kind: 'receipt', id: 'c3' } },
  ]);
  // Tool names are shown on the collapsed summary.
  assert.deepEqual(findTranscriptMatches(items, 'READ', false), [{ id: 'c1' }, { id: 'c2' }]);
});

test('tool input and output are searched only when tool details are shown', () => {
  const items = [
    cluster('c1', [
      {
        title: 'step',
        syntheticTitle: true,
        tools: [{ id: 't1', toolName: 'bash', input: { command: 'grep needle' }, result: 'ok' }],
      },
    ]),
    cluster('c2', [
      {
        title: 'step',
        syntheticTitle: true,
        tools: [{ id: 't2', toolName: 'read', result: 'a needle' }],
      },
    ]),
  ];
  assert.deepEqual(findTranscriptMatches(items, 'needle', false), []);
  assert.deepEqual(findTranscriptMatches(items, 'needle', true), [
    { id: 'c1', reveal: { kind: 'disclosure', ownerId: 't1', part: DisclosurePart.toolDetails } },
    { id: 'c2', reveal: { kind: 'disclosure', ownerId: 't2', part: DisclosurePart.toolDetails } },
  ]);
});

test('text that is not rendered is not searched', () => {
  const items: FindableItem[] = [
    user('u1', '(image)', []),
    {
      kind: 'message',
      message: {
        kind: 'user',
        id: 'u2',
        content: '(image)',
        sentAt: 0,
        attachments: [{ id: 'img', kind: 'image', status: 'missing' }],
      },
    },
    notice('n1', {
      variant: 'lineage',
      lineageKind: 'compaction',
      text: 'internal (image) summary',
    }),
  ];
  assert.deepEqual(findTranscriptMatches(items, '(image)', false), [
    { id: 'u1', reveal: { kind: 'disclosure', ownerId: 'u1', part: DisclosurePart.userQuery } },
  ]);
});
