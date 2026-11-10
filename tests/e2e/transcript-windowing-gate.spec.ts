// F144 tickets 4-7: the sandboxed renderer has no `process.env`, so the preload must carry
// `KODAX_SPACE_TRANSCRIPT_WINDOWING=1` across. Ticket 8 deletes the gate and this spec with it.

import { test, expect } from '@playwright/test';
import { launchSpace, transcriptWindowing } from './fixtures.js';

const windowingFlag = (env: Record<string, string>, id: string) =>
  test.step(id, async () => {
    const space = await launchSpace(`transcript-windowing-${id}-${Date.now()}`, { env });
    try {
      return await transcriptWindowing(space.page);
    } finally {
      await space.close();
    }
  });

test('the transcript windowing env gate reaches the sandboxed renderer', async () => {
  // Two full launches.
  test.setTimeout(120_000);
  expect(await windowingFlag({ KODAX_SPACE_TRANSCRIPT_WINDOWING: '1' }, 'on')).toBe(true);
  expect(await windowingFlag({ KODAX_SPACE_TRANSCRIPT_WINDOWING: '0' }, 'off')).toBe(false);
});
