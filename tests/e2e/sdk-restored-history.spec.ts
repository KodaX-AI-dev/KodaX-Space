import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createSessionManager, type KodaXSessionUiHistoryItem } from '@kodax-ai/kodax/session';
import type { KodaXMessage } from '@kodax-ai/kodax/agent';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';
import type { SpaceInstance } from './fixtures.js';
import {
  createLocalSdkProvider,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
  readSdkProductView as readView,
} from './sdk-provider-fixture.js';

test.setTimeout(120_000);
const SAVED_AT = '2026-10-15T01:29:00.000Z';
type ReadyHistoryPage = Extract<
  NonNullable<ChannelOutput<'session.history'>['page']>,
  { outcome: 'ready' }
>;

function checkpointHistory() {
  const messages: KodaXMessage[] = [
    { role: 'user', inputId: 'saved-query', content: 'HOLD_QUEUE', timestamp: SAVED_AT },
  ];
  const uiHistory: KodaXSessionUiHistoryItem[] = [];
  for (let index = 0; index < 55; index++) {
    messages.push(
      {
        role: 'assistant',
        outputId: `saved-output-${index}`,
        timestamp: SAVED_AT,
        content: [
          { type: 'thinking', thinking: `SAVED_THINKING_${index}` },
          { type: 'text', text: `SAVED_ANSWER_${index}` },
          {
            type: 'tool_use',
            id: `saved-call-${index}`,
            name: 'read',
            input: { path: 'fixture.txt' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `saved-call-${index}`,
            content: `SAVED_RESULT_${index}`,
          },
        ],
      },
    );
    uiHistory.push({
      type: 'tool_group',
      afterInputId: 'saved-query',
      tools: [
        {
          id: `saved-call-${index}`,
          assistantOutputId: `saved-output-${index}`,
          name: 'read',
          status: 'success',
          output: `SAVED_RESULT_${index}`,
        },
      ],
    });
  }
  return { messages, uiHistory };
}

async function seedRestoredHistory(root: string): Promise<void> {
  const projectRoot = path.join(root, 'project');
  await mkdir(projectRoot, { recursive: true });
  const manager = createSessionManager({
    sessionsDir: path.join(root, 'sessions'),
    configHome: root,
  });
  const base = {
    gitRoot: projectRoot,
    scope: 'user' as const,
    runtimeInfo: { workspaceRoot: projectRoot, surface: 'repl' as const },
  };
  await manager.storage.save('checkpoint-history', {
    ...base,
    title: 'SDK_CHECKPOINT_HISTORY',
    ...checkpointHistory(),
  });
  await manager.storage.save('pending-tool-history', {
    ...base,
    title: 'SDK_PENDING_TOOL_HISTORY',
    messages: [
      {
        role: 'user',
        inputId: 'pending-query',
        content: 'SAVED_PENDING_QUERY',
        timestamp: SAVED_AT,
      },
      {
        role: 'assistant',
        outputId: 'pending-output',
        timestamp: SAVED_AT,
        content: [
          { type: 'thinking', thinking: 'SAVED_PENDING_THINKING' },
          { type: 'tool_use', id: 'pending-call', name: 'read', input: { path: 'fixture.txt' } },
        ],
      },
    ],
  });
}

async function readPage(space: SpaceInstance, sessionId: string, page?: ReadyHistoryPage) {
  return space.page.evaluate(
    async ({ id, previous }) => {
      const result = await window.kodaxSpace!.invoke('session.history', {
        sessionId: id,
        requestId: crypto.randomUUID(),
        expectedSurface: 'code',
        ...(previous?.nextCursor
          ? {
              cursor: previous.nextCursor,
              revision: previous.revision,
              sourceRevision: previous.sourceRevision,
            }
          : {}),
      });
      if (!result.ok) throw new Error(result.error.message);
      if (result.data.page?.outcome !== 'ready')
        throw new Error('Saved history unexpectedly invalidated');
      return { ...result.data, page: result.data.page };
    },
    { id: sessionId, previous: page },
  );
}

async function assertCheckpointHistory(space: SpaceInstance): Promise<void> {
  let history = await readPage(space, 'checkpoint-history');
  const items = [...(history.productItems ?? [])];
  for (let page = 0; history.page.nextCursor && page < 8; page++) {
    history = await readPage(space, 'checkpoint-history', history.page);
    items.unshift(...(history.productItems ?? []));
  }
  expect(history.page.hasMore).toBe(false);
  const queries = items.filter((item) => item.type === 'user' && item.text === 'HOLD_QUEUE');
  expect(queries).toHaveLength(2);
  expect(new Set(queries.map((item) => item.inputId)).size).toBe(2);
  expect(items.filter((item) => item.type === 'tool')).toHaveLength(55);
  const tools = await space.page.evaluate(() =>
    window.kodaxSpace!.invoke('session.executionFacts', {
      sessionId: 'checkpoint-history',
      kind: 'tools',
    }),
  );
  if (!tools.ok) throw new Error(tools.error.message);
  expect(tools.data.items).toEqual([]);
}

test('published SDK checkpoint window retains the preceding turn after browse and repeated input', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `sdk-checkpoint-${Date.now()}`,
    provider.url,
    seedRestoredHistory,
  );
  try {
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_CHECKPOINT_HISTORY' })
      .click();
    await expect
      .poll(async () => (await readView(space, 'checkpoint-history')).items.length)
      .toBe(150);
    const before = await readView(space, 'checkpoint-history');
    expect(before.items[0]?.type).not.toBe('user');
    const scroller = space.page.getByTestId('conversation-scroll-container');
    await scroller.hover();
    await space.page.mouse.wheel(0, -2400);
    await sendSdkPrompt(space, 'HOLD_QUEUE');
    await expect.poll(() => provider.requests.length).toBe(1);
    const view = await readView(space, 'checkpoint-history');
    expect(view.items.some((item) => item.text === 'SAVED_ANSWER_54')).toBe(true);
    expect(view.items.length).toBeLessThanOrEqual(150);
    expect(new Set(view.items.map((item) => item.id)).size).toBe(view.items.length);
    await expect(space.page.getByTestId('conversation-stream')).toContainText('SAVED_ANSWER_54');
    provider.release('HOLD_QUEUE');
    await waitSdkIdle(space, 'checkpoint-history');
    await assertCheckpointHistory(space);
    expect(provider.requests).toEqual(['HOLD_QUEUE']);
    expect(provider.errors).toEqual([]);
  } finally {
    provider.release('HOLD_QUEUE');
    await provider.close();
    await space.close();
  }
});

test('published SDK unfinished tool tail pages to the original query with saved timestamps', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `sdk-pending-tool-${Date.now()}`,
    provider.url,
    seedRestoredHistory,
  );
  try {
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_PENDING_TOOL_HISTORY' })
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SAVED_PENDING_QUERY',
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      const history = await readPage(space, 'pending-tool-history');
      expect(history.page?.hasMore).toBe(false);
      expect(history.productItems?.map((item) => item.type)).toEqual(['user', 'thinking', 'tool']);
      const tool = history.productItems?.find((item) => item.type === 'tool');
      expect(tool?.timestamp).toBe(Date.parse(SAVED_AT));
      expect(tool?.tool?.status).toBe('cancelled');
      const view = await readView(space, 'pending-tool-history');
      expect(view.items.map((item) => item.id)).toHaveLength(3);
      expect(view.items.find((item) => item.type === 'tool')?.timestamp).toBe(Date.parse(SAVED_AT));
      await space.page.reload();
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: 'SDK_PENDING_TOOL_HISTORY' })
        .click();
    }
    expect(provider.requests).toEqual([]);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
