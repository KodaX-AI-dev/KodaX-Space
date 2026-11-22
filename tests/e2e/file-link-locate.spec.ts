import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('file links with a wrong folder open by name, and search follows .gitignore', async () => {
  test.setTimeout(90_000);
  const testId = `file-link-locate-${Date.now()}`;
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  const files: Record<string, string> = {
    '.gitignore': 'ignored/\n',
    'reports/review/locate-probe-report.md': '# report\n',
    'dist/locate-probe-dist.md': '# dist\n',
    '.agent/locate-probe-agent.md': '# agent\n',
    'ignored/locate-probe-ignored.md': '# ignored\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(projectDir, ...rel.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf-8');
  }

  const space = await launchSpace(testId);
  try {
    await space.seedProject(projectDir);
    const textarea = space.page.getByTestId('composer-input');
    const stream = space.page.getByTestId('conversation-stream');
    const viewer = space.page.getByTestId('file-viewer');

    // A link missing the `reports/` folder, then one into a .gitignore'd folder.
    for (const [label, target, opened] of [
      ['wrong-folder', 'review/locate-probe-report.md', 'locate-probe-report.md'],
      ['gitignored', 'locate-probe-ignored.md', 'locate-probe-ignored.md'],
    ]) {
      await expect(textarea).toBeEnabled({ timeout: 10_000 });
      await textarea.fill(`[${label}](${target})`);
      await textarea.press('Enter');
      const link = stream.getByRole('link', { name: label }).last();
      await expect(link).toBeVisible({ timeout: 10_000 });
      await link.click();
      await expect(viewer).toBeVisible({ timeout: 10_000 });
      await expect(viewer).toContainText(opened);
    }

    // Project search: build output and hidden folders are in, .gitignore'd files are out.
    await space.page.evaluate(() => {
      window.dispatchEvent(new Event('kodax-space.open-files-workspace'));
    });
    const filesPanel = space.page.getByTestId('files-panel');
    await expect(filesPanel).toBeVisible({ timeout: 10_000 });
    await filesPanel.getByTestId('files-search-input').fill('locate-probe');
    const results = filesPanel.getByTestId('files-search-result');
    await expect(results).toHaveCount(3, { timeout: 20_000 });
    const titles = await results.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('title')),
    );
    expect(titles.sort()).toEqual([
      '.agent/locate-probe-agent.md',
      'dist/locate-probe-dist.md',
      'reports/review/locate-probe-report.md',
    ]);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
