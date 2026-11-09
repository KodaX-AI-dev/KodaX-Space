import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { launchSpace } from './fixtures.js';

async function launchSeededSpace(testId: string) {
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });
  const space = await launchSpace(testId);
  await space.seedProject(projectDir);
  return { space, projectDir };
}

test('workflow slash create sends on Enter and shows immediate progress', async () => {
  const testId = `workflow-enter-${Date.now()}`;
  const { space, projectDir } = await launchSeededSpace(testId);
  try {
    const textarea = space.page.getByTestId('composer-input');
    const stream = space.page.getByTestId('conversation-stream');
    await expect(textarea).toBeEnabled({ timeout: 10_000 });

    const command = '/workflow create review current working tree changes';
    await textarea.fill(command);
    await textarea.press('Enter');

    await expect(
      stream.getByTestId('local-notice-bubble').filter({ hasText: command }),
    ).toBeVisible({
      timeout: 2_000,
    });
    await expect(
      stream.locator('[data-testid="system-notice"][data-notice-variant="workflow"]', {
        hasText: /\[workflow\] generating workflow\.\.\./i,
      }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(
      stream
        .getByTestId('user-message-bubble')
        .filter({ hasText: '[workflow] generating workflow...' }),
    ).toHaveCount(0);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('workflow slash create send button shows immediate progress', async () => {
  const testId = `workflow-click-${Date.now()}`;
  const { space, projectDir } = await launchSeededSpace(testId);
  try {
    const textarea = space.page.getByTestId('composer-input');
    const stream = space.page.getByTestId('conversation-stream');
    await expect(textarea).toBeEnabled({ timeout: 10_000 });

    const command = '/workflow create review all current version changes and commits';
    await textarea.fill(command);
    await space.page.getByLabel('Send message').click();

    await expect(
      stream.getByTestId('local-notice-bubble').filter({ hasText: command }),
    ).toBeVisible({
      timeout: 2_000,
    });
    await expect(
      stream.locator('[data-testid="system-notice"][data-notice-variant="workflow"]', {
        hasText: /\[workflow\] generating workflow\.\.\./i,
      }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(
      stream
        .getByTestId('user-message-bubble')
        .filter({ hasText: '[workflow] generating workflow...' }),
    ).toHaveCount(0);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
