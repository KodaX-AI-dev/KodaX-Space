import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { launchSpace } from './fixtures.js';
import { createLocalSdkProvider, sendSdkPrompt } from './sdk-provider-fixture.js';

test.skip(process.platform !== 'win32', 'Real Windows Job ownership regression');
for (const mode of ['none', 'transient', 'persistent', 'cleanup'] as const) {
  test(`offline startup without a Provider: ${mode} Job probe failure`, async () => {
    test.setTimeout(150_000);
    const preload = fileURLToPath(new URL('./runtime-offline-preload.cjs', import.meta.url));
    const env: Record<string, string> = {
      KODAX_FORCE_MOCK: '0',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      http_proxy: '',
      https_proxy: '',
      all_proxy: '',
      NO_PROXY: 'localhost,127.0.0.1,::1',
      NODE_USE_ENV_PROXY: '0',
      NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
    };
    for (const key of Object.keys(process.env)) {
      if (
        /API_?KEY|ACCESS_TOKEN|AUTH_TOKEN|KODAX_PROVIDER|OPENAI_|ANTHROPIC_|AZURE_OPENAI/i.test(key)
      )
        env[key] = '';
    }
    let attemptsFile = '';
    let faultFile = '';
    const space = await launchSpace(`offline-startup-${mode}-${Date.now()}`, {
      env,
      prepareProfile: async (root) => {
        attemptsFile = path.join(root, 'job-attempts.json');
        faultFile = path.join(root, 'job-fault.txt');
        env.SPACE_TEST_JOB_ATTEMPTS = attemptsFile;
        env.SPACE_TEST_JOB_FAULT = faultFile;
        env.SPACE_TEST_JOB_EVENTS = path.join(root, 'job-events.jsonl');
        env.LOCALAPPDATA = path.join(root, 'local-app-data');
        await mkdir(env.LOCALAPPDATA, { recursive: true });
        await writeFile(faultFile, mode);
        await writeFile(path.join(root, 'config.json'), '{}');
      },
      onLaunched: async (app) => {
        await app.evaluate((_, file) => {
          process.getBuiltinModule('module').createRequire(`${process.cwd()}/fixture.cjs`)(file);
        }, preload);
        await app.evaluate(({ session }) => {
          session.defaultSession.webRequest.onBeforeRequest(
            { urls: ['http://*/*', 'https://*/*'] },
            (request, done) => {
              done({
                cancel: !['localhost', '127.0.0.1', '[::1]'].includes(
                  new URL(request.url).hostname,
                ),
              });
            },
          );
        });
      },
    });
    const attempts = async (): Promise<number[]> =>
      JSON.parse(await readFile(attemptsFile, 'utf8')) as number[];
    // The probe retries once per startup, so persistent failure logs two probes per startup.
    const startups = async (): Promise<number> => new Set(await attempts()).size;
    const connection = () =>
      space.page.evaluate(async () => {
        const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
        if (!result.ok) throw new Error(result.error.message);
        return result.data.connection.state;
      });
    let provider: Awaited<ReturnType<typeof createLocalSdkProvider>> | undefined;
    try {
      const project = path.join(space.testDataDir, 'offline-project');
      await mkdir(project, { recursive: true });
      await space.seedProject(project);
      if (mode === 'persistent') {
        await expect(space.page.getByTestId('runtime-startup-failed')).toBeVisible({
          timeout: 90_000,
        });
        await expect(space.page.getByTestId('pinned-summary-primary')).not.toContainText(
          /Ready|就绪/,
        );
        expect(await startups()).toBe(3);
        // Export from the failing UI itself, while no healthy Host exists.
        const output = path.join(space.testDataDir, 'diagnostics.zip');
        await space.app.evaluate(({ dialog }, filePath) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath });
        }, output);
        await space.page.getByTestId('settings-button').click();
        await space.page.locator('#settings-tab-diagnostics').click();
        await space.page
          .getByRole('button', { name: 'Export diagnostic ZIP', exact: true })
          .click();
        await expect
          .poll(() =>
            readFile(output).then(
              () => true,
              () => false,
            ),
          )
          .toBe(true);
        const zip = await JSZip.loadAsync(await readFile(output));
        expect(await zip.file('logs/runtime/default/daemon.log')!.async('string')).toContain(
          'ETIMEDOUT',
        );
        expect(await zip.file('logs/runtime/default/bootstrap.log')!.async('string')).toContain(
          'no Host was published',
        );
        await space.page.keyboard.press('Escape');
        // Reload must not restart an exhausted loop; the slow timer's first retry is 30 s away.
        await space.page.reload();
        await expect(
          space.page.getByRole('button', { name: 'Retry startup', exact: true }),
        ).toBeVisible();
        expect(await startups()).toBe(3);
        await writeFile(faultFile, 'none');
        await space.page.getByRole('button', { name: 'Retry startup', exact: true }).click();
      }
      await expect.poll(connection, { timeout: 90_000 }).toBe('ready');
      await expect(space.page.getByTestId('runtime-startup-failed')).toHaveCount(0);
      await expect(space.page.getByTestId('pinned-summary-primary')).toContainText('Ready');
      expect(mode === 'persistent' ? await startups() : (await attempts()).length).toBe(
        mode === 'none' ? 1 : mode === 'persistent' ? 4 : 2,
      );
      const log = await readFile(
        path.join(space.testDataDir, 'runtime', 'daemon', 'default', 'daemon.log'),
        'utf8',
      );
      expect(log).toContain('Native Windows Job verification completed');
      if (mode === 'cleanup') {
        const events = (await readFile(env.SPACE_TEST_JOB_EVENTS!, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { kind: string; time: number });
        const exit = events.find((value) => value.kind === 'supervisor-exiting');
        const probes = events.filter((value) => value.kind === 'probe');
        expect(exit).toBeDefined();
        expect(probes[1]!.time).toBeGreaterThanOrEqual(exit!.time);
        const mainLog = await readFile(
          path.join(
            space.testDataDir,
            'space',
            'electron-user-data',
            'diagnostics',
            'space-main.jsonl',
          ),
          'utf8',
        );
        expect(mainLog).toContain('cleanup_incomplete');
      }
      if (mode === 'persistent') {
        // Configure an intranet-style HTTP model only after the offline service recovered.
        provider = await createLocalSdkProvider();
        await space.page.evaluate(async (url) => {
          const added = await window.kodaxSpace!.invoke('provider.addCustom', {
            displayName: 'Offline private model',
            protocol: 'openai',
            baseUrl: url,
            skipBaseUrlValidation: true,
            apiKeyEnv: 'SPACE_ISOLATED_E2E_KEY',
            defaultModel: 'space-e2e-model',
            reasoning: 'none',
            imageInput: false,
            contextWindow: 200_000,
          });
          if (!added.ok) throw new Error(added.error.message);
          const listed = await window.kodaxSpace!.invoke('provider.list', undefined);
          if (!listed.ok) throw new Error(listed.error.message);
          const expected = listed.data.providers.find(
            (value) => value.id === added.data.providerId,
          )?.credentialState;
          if (!expected) throw new Error('Missing fixture credential revision');
          const key = await window.kodaxSpace!.invoke('provider.setKey', {
            providerId: added.data.providerId,
            apiKey: 'space-e2e-fixture',
            expected,
          });
          if (!key.ok) throw new Error(key.error.message);
          const selected = await window.kodaxSpace!.invoke('provider.setDefault', {
            providerId: added.data.providerId,
          });
          if (!selected.ok) throw new Error(selected.error.message);
        }, provider.url);
        await space.seedProject(project);
        await sendSdkPrompt(space, 'OFFLINE_RECOVERED');
        await expect(space.page.getByTestId('conversation-stream')).toContainText(
          'SDK_REPLY:OFFLINE_RECOVERED',
          { timeout: 20_000 },
        );
      }
    } catch (error) {
      await test
        .info()
        .attach('offline-process-events', {
          body: await readFile(env.SPACE_TEST_JOB_EVENTS!).catch(() =>
            Buffer.from('No probe events'),
          ),
          contentType: 'application/json',
        });
      throw error;
    } finally {
      await provider?.close();
      await space.close();
    }
  });
}
