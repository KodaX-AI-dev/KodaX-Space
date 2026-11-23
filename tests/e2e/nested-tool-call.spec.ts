import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  readSdkProductView,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

// 1x1 PNG.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('an extension tool called through tool_call leaves no running tool cards', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `nested-tool-call-${Date.now()}`,
    provider.url,
  );
  const { page } = space;
  try {
    provider.setProject(projectRoot);
    await writeFile(path.join(projectRoot, 'pixel.png'), PIXEL);
    await sendSdkPrompt(space, 'NESTED_RENDER');
    await expect(page.getByText('NESTED_RENDER_DONE')).toBeVisible({ timeout: 60_000 });
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    expect(provider.nestedToolResults).toHaveLength(1);
    // The forwarded extension tool really ran (its handler made the internal calls).
    expect(provider.nestedToolResults[0]).toContain('"status":"ready"');

    // Only the model-issued call owns a card; the handler's internal calls add none.
    const view = await readSdkProductView(space, sessionId);
    const tools = view.items.filter((item) => item.type === 'tool');
    expect(tools.map((item) => [item.tool?.callId, item.tool?.status])).toEqual([
      ['nested-render', 'success'],
    ]);

    await page.reload();
    await page.getByText('NESTED_RENDER', { exact: true }).first().click();
    await expect(page.getByText('NESTED_RENDER_DONE')).toBeVisible({ timeout: 30_000 });
    const cluster = page.getByTestId('process-receipt-tool_cluster').last();
    await expect(cluster).toBeVisible();
    await expect(cluster.getByText(/Running/)).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('nested-tool-call.png') });
  } finally {
    await space.close();
    await provider.close();
  }
});
