import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test.setTimeout(600_000);

test('diagnose repeated real SDK startup in one long-lived Windows worker', async () => {
  for (let index = 0; index < 40; index++) {
    const started = Date.now();
    const space = await launchSpace(`startup-loop-${Date.now()}-${index}`, {
      env: { KODAX_FORCE_MOCK: '0', SPACE_TEST_COMPLETE_EXIT_TRIGGER: '1' },
      prepareProfile: async (root) => {
        const extension = path.join(root, 'acceptance-broken.mjs');
        await writeFile(
          extension,
          'export default function () { throw new Error("Cannot find module acceptance-dependency"); }',
        );
        await mkdir(path.join(root, 'integrations'), { recursive: true });
        await writeFile(
          path.join(root, 'integrations/extensions.json'),
          JSON.stringify({ version: 1, paths: [extension] }),
        );
      },
    });
    try {
      expect(space.page.url()).toBe('app://space/index.html');
      expect(await space.page.locator('#root').count()).toBe(1);
    } finally {
      await space.close();
    }
    process.stdout.write(
      `[DEBUG-win-startup-loop] ${JSON.stringify({ index, ms: Date.now() - started, heap: process.memoryUsage().heapUsed })}\n`,
    );
  }
});
