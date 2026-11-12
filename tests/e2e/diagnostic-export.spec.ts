import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { launchSpace } from './fixtures.js';

test('Settings exports startup and Windows probe evidence when the real daemon fails before readiness', async () => {
  test.setTimeout(60_000);
  let output = '';
  const space = await launchSpace(`diagnostic-export-${Date.now()}`, {
    env: { KODAX_FORCE_MOCK: '0' },
    prepareProfile: async (root) => {
      output = path.join(root, 'diagnostics.zip');
      const fixture = path.join(root, 'startup-failure.mjs');
      await writeFile(
        fixture,
        'export default () => { process.stderr.write("[Error] fixture startup failure Bearer export-fixture-secret\\n"); process.exit(17); };',
      );
      await writeFile(path.join(root, 'config.json'), JSON.stringify({ extensions: [fixture] }));
      const daemon = path.join(root, 'runtime', 'daemon', 'coder');
      await mkdir(daemon, { recursive: true });
      await writeFile(
        path.join(daemon, 'daemon.log'),
        `${JSON.stringify({
          time: '2026-11-12T07:21:23.707Z',
          level: 'warn',
          message: 'Windows process probe completed.',
          data: {
            detail: {
              stage: 'job-membership',
              errorCode: 'ETIMEDOUT',
              durationMs: 5020,
              timeoutMs: 5000,
            },
          },
        })}\n`,
      );
    },
  });
  try {
    await expect(space.page.getByTestId('runtime-startup-failed')).toBeVisible({
      timeout: 45_000,
    });
    await space.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await space.page.getByTestId('settings-button').click();
    await space.page.locator('#settings-tab-diagnostics').click();
    await space.page.getByRole('button', { name: 'Export diagnostic ZIP', exact: true }).click();
    await expect
      .poll(
        async () =>
          readFile(output).then(
            () => true,
            () => false,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
    const zip = await JSZip.loadAsync(await readFile(output));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      sdkVersion: string;
      logSources: { path: string; status: string }[];
    };
    const packageJson = JSON.parse(
      await readFile(
        new URL('../../node_modules/@kodax-ai/kodax/package.json', import.meta.url),
        'utf8',
      ),
    ) as { version: string };
    expect(manifest.sdkVersion).toBe(packageJson.version);
    expect(manifest.logSources).toContainEqual(
      expect.objectContaining({ path: 'logs/runtime/coder/daemon.log', status: 'collected' }),
    );
    const bootstrap = await zip.file('logs/runtime/default/bootstrap.log')!.async('string');
    expect(bootstrap).toContain('fixture startup failure');
    expect(bootstrap).not.toContain('export-fixture-secret');
    expect(await zip.file('logs/runtime/coder/daemon.log')!.async('string')).toContain('ETIMEDOUT');
    const capabilities = JSON.parse(await zip.file('capabilities.json')!.async('string')) as {
      runtime: { state: string };
      integrationHealthInspection: { status: string };
    };
    expect(capabilities.runtime.state).not.toBe('ready');
    expect(capabilities.integrationHealthInspection.status).toBe('runtime-unavailable');
  } finally {
    await space.close();
  }
});
