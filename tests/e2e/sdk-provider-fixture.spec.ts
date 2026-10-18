import { expect, test } from '@playwright/test';
import { readSdkHistoryPage, readSdkProductView } from './sdk-provider-fixture.js';
import type { SpaceInstance } from './fixtures.js';
import type { ChannelOutput, IpcResult } from '@kodax-space/space-ipc-schema';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const view: ChannelOutput<'session.productSnapshot'> = {
  sessionId: 'fixture',
  runtimeId: 'runtime',
  revision: 1,
  items: [],
};
const conflict = {
  ok: false,
  error: {
    code: 'HANDLER_ERROR',
    message: `[session.productSnapshot] handler threw: Session data changed during the read boundary: ${'a'.repeat(64)}.lock`,
  },
} as const;
function source<T>(results: readonly IpcResult<T>[]) {
  let calls = 0;
  const space = {
    page: { evaluate: async () => results[Math.min(calls++, results.length - 1)] },
  } as unknown as SpaceInstance;
  return { space, count: () => calls };
}
test('only the observed transaction conflict is re-read', async () => {
  const fixture = source([conflict, { ok: true, data: view }]);
  expect(await readSdkProductView(fixture.space, 'fixture')).toEqual(view);
  expect(fixture.count()).toBe(2);
});
for (const code of ['SCHEMA_INVALID', 'OUTPUT_INVALID', 'HANDLER_ERROR'] as const) {
  test(`${code} unrelated failure is never retried`, async () => {
    const fixture = source([
      { ok: false, error: { code, message: 'permanent owner mismatch' } },
      { ok: true, data: view },
    ]);
    await expect(readSdkProductView(fixture.space, 'fixture')).rejects.toThrow(
      'permanent owner mismatch',
    );
    expect(fixture.count()).toBe(1);
  });
}
test('an unavailable success value is not a retryable transaction conflict', async () => {
  const fixture = source([
    { ok: true, data: null },
    { ok: true, data: view },
  ]);
  await expect(readSdkProductView(fixture.space, 'fixture')).rejects.toThrow(
    'SDK supplied no product view',
  );
  expect(fixture.count()).toBe(1);
});

const history: ChannelOutput<'session.history'> = {
  sessionId: 'fixture',
  requestId: 'request',
  items: [],
  productItems: [],
  page: {
    outcome: 'ready',
    revision: 'revision',
    sourceRevision: 'source',
    hasMore: false,
    windowMode: 'replace',
    hasNewer: false,
  },
};
const changed: ChannelOutput<'session.history'> = {
  sessionId: 'fixture',
  requestId: 'request',
  items: [],
  page: { outcome: 'data_changed' },
};

test('a changed first history page is read again without mixing revisions', async () => {
  const fixture = source([
    { ok: true, data: changed },
    { ok: true, data: history },
  ]);
  expect(await readSdkHistoryPage(fixture.space, 'fixture')).toEqual(history);
  expect(fixture.count()).toBe(2);
  const saved = (await readdir(test.info().outputDir)).find((name) =>
    name.endsWith('history-read-boundaries.json'),
  );
  expect(saved).toBeDefined();
  const evidence = JSON.parse(await readFile(path.join(test.info().outputDir, saved!), 'utf8'));
  expect(evidence.outcomes).toEqual([
    { ok: true, data: changed },
    { ok: true, data: history },
  ]);
});

for (const nextCursor of ['cursor', undefined]) {
  test(`an existing history revision is never retried (cursor=${nextCursor})`, async () => {
    const fixture = source([
      { ok: true, data: changed },
      { ok: true, data: history },
    ]);
    const previous = {
      outcome: 'ready' as const,
      revision: 'old',
      sourceRevision: 'old',
      hasMore: !!nextCursor,
      nextCursor,
      windowMode: 'replace' as const,
      hasNewer: false,
    };
    await expect(readSdkHistoryPage(fixture.space, 'fixture', previous)).rejects.toThrow(
      nextCursor ? 'data_changed' : 'no cursor',
    );
    expect(fixture.count()).toBe(nextCursor ? 1 : 0);
  });
}

test('a failed history envelope cannot become a retryable revision conflict', async () => {
  const fixture = source<ChannelOutput<'session.history'>>([
    { ok: false, error: { code: 'OUTPUT_INVALID', message: 'invalid history contract' } },
    { ok: true, data: history },
  ]);
  await expect(readSdkHistoryPage(fixture.space, 'fixture')).rejects.toThrow('OUTPUT_INVALID');
  expect(fixture.count()).toBe(1);
});

for (const page of [undefined, { outcome: 'runtime_unavailable' as const }]) {
  test(`a history page other than data_changed fails immediately (${page?.outcome})`, async () => {
    const fixture = source([
      { ok: true, data: { ...history, page } },
      { ok: true, data: history },
    ]);
    await expect(readSdkHistoryPage(fixture.space, 'fixture')).rejects.toThrow(
      'Saved history unavailable',
    );
    expect(fixture.count()).toBe(1);
  });
}
