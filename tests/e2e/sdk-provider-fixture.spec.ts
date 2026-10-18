import { expect, test } from '@playwright/test';
import { readSdkProductView } from './sdk-provider-fixture.js';
import type { SpaceInstance } from './fixtures.js';
import type { ChannelOutput, IpcResult } from '@kodax-space/space-ipc-schema';
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
function source(results: readonly IpcResult<ChannelOutput<'session.productSnapshot'>>[]) {
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
