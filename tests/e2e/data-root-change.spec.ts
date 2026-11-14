// F148: Settings → Data location → copy, save and restart, end to end in the real app.
// Test mode pins the data root, so both launches run without KODAX_TEST_ONBOARDING; the
// `-r` preload (appData, userData, no OS keyring) and KODAX_HOME keep the launches in the
// OS temp directory. ~/.kodax-space and ~/.kodax_space (legacy migrations) must not exist.
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication } from '@playwright/test';
import { launchSpace, type SpaceInstance } from './fixtures.js';

test.skip(
  process.platform !== 'win32',
  'Isolation of a non-test-mode launch is verified on Windows',
);
test.skip(
  ['.kodax-space', '.kodax_space'].some((name) => existsSync(path.join(os.homedir(), name))),
  'A non-test-mode launch would migrate or clean these real home folders',
);
test.setTimeout(240_000);

const SEED = path.join('space', 'e2e-seed.json');
const MARKER = '.kodax-copy-incomplete';

/** The relaunch would escape the harness; record it instead. */
async function recordRelaunch(app: ElectronApplication, evidence: string): Promise<void> {
  await app.evaluate(({ app }, file) => {
    const { appendFileSync } = process.getBuiltinModule('node:fs');
    app.relaunch = () => appendFileSync(file, 'relaunch\n');
  }, evidence);
}

async function chooseFolder(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
  }, folder);
}

async function dataRootInfo(space: SpaceInstance): Promise<Record<string, unknown>> {
  return space.page.evaluate(async () => {
    const result = await window.kodaxSpace!.invoke('dataRoot.get', undefined);
    if (!result.ok) throw new Error(result.error.message);
    return result.data as unknown as Record<string, unknown>;
  });
}

/** Save and restart needs a verified stop of a running Host, so let startup finish first. */
async function waitForHost(space: SpaceInstance): Promise<void> {
  await expect
    .poll(
      async () => {
        const result = await space.page.evaluate(() =>
          window.kodaxSpace!.invoke('space.version', undefined),
        );
        if (!result.ok) throw new Error(result.error.message);
        return result.data.capabilities.find((row) => row.id === 'runtime.hostAdapter')?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('supported');
}

async function openDataLocation(space: SpaceInstance): Promise<void> {
  await space.page.getByTestId('settings-button').click();
  const settings = space.page.getByTestId('settings-workspace');
  await settings.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(settings.getByText('Data location', { exact: true })).toBeVisible();
}

test('copy the data to an empty folder, restart, and start from the new location', async () => {
  const id = `data-root-${Date.now()}`;
  const tmp = os.tmpdir();
  const oldRoot = path.join(tmp, `kodax-test-${id}`);
  const target = path.join(tmp, `kodax-test-${id}-copy`);
  const staging = path.join(tmp, `kodax-test-${id}-staged`);
  const sandbox = path.join(tmp, `kodax-test-${id}-env`);
  const appData = path.join(sandbox, 'appData');
  const keyringAttempts = path.join(sandbox, 'keyring-attempts.log');
  const relaunches = path.join(sandbox, 'relaunch.log');
  const pointerFile = path.join(appData, 'KodaX Space', 'data-root.json');
  const preload = fileURLToPath(new URL('./data-root-isolation-preload.cjs', import.meta.url));
  await rm(sandbox, { recursive: true, force: true });
  await mkdir(appData, { recursive: true });
  await writeFile(keyringAttempts, '');
  const env = {
    KODAX_TEST_ONBOARDING: '',
    KODAX_HOME: oldRoot,
    SPACE_TEST_APP_DATA: appData,
    SPACE_TEST_KEYRING_ATTEMPTS: keyringAttempts,
  };
  // An absolute path into the old root, JSON-escaped as the stores write it.
  const seed = JSON.stringify({ file: path.join(oldRoot, 'tool-output.txt') });
  let first: SpaceInstance | undefined;
  let second: SpaceInstance | undefined;
  try {
    first = await launchSpace(id, {
      env,
      electronArgs: ['-r', preload],
      prepareProfile: async (root) => {
        await writeFile(path.join(root, SEED), seed);
        await writeFile(path.join(root, 'tool-output.txt'), 'output');
      },
    });
    await recordRelaunch(first.app, relaunches);
    expect(await dataRootInfo(first)).toMatchObject({ current: oldRoot, editable: true });

    await waitForHost(first);
    await mkdir(target, { recursive: true });
    await chooseFolder(first.app, target);
    await openDataLocation(first);
    const settings = first.page.getByTestId('settings-workspace');
    await settings.getByRole('button', { name: 'Change location…' }).click();
    await expect(settings.getByText(target, { exact: true })).toBeVisible();
    await settings.getByRole('checkbox', { name: /^Copy current data/ }).check();
    const exited = new Promise<void>((resolve) =>
      first!.app.process().once('exit', () => resolve()),
    );
    await settings.getByRole('button', { name: 'Save and restart' }).click();
    await first.page.getByRole('dialog').getByRole('button', { name: 'Save and restart' }).click();
    await exited;

    // The change ran after a verified Host stop: pointer, copy and relaunch request.
    expect(JSON.parse(await readFile(pointerFile, 'utf8'))).toEqual({ version: 1, root: target });
    expect(await readFile(relaunches, 'utf8')).toBe('relaunch\n');
    expect(existsSync(path.join(target, MARKER))).toBe(false);
    expect(existsSync(path.join(target, 'space', 'runtime-client-identity.json'))).toBe(false);
    expect(existsSync(path.join(target, 'space', 'settings.json'))).toBe(true);
    expect(await readFile(path.join(target, 'tool-output.txt'), 'utf8')).toBe('output');
    expect(JSON.parse(await readFile(path.join(target, SEED), 'utf8'))).toEqual({
      file: path.join(target, 'tool-output.txt'),
    });
    expect(await readFile(path.join(oldRoot, SEED), 'utf8')).toBe(seed);
    const log = await readFile(
      path.join(appData, 'KodaX Space', 'diagnostics', 'space-main.jsonl'),
      'utf8',
    );
    const changed = log
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string; data?: Record<string, unknown> })
      .find((entry) => entry.event === 'data_root_changed');
    // Diagnostics redact paths; the counts show the copy and the rewrite happened.
    expect(changed?.data).toMatchObject({
      files: expect.any(Number),
      rebasedFiles: expect.any(Number),
    });
    expect(changed!.data!.files).toBeGreaterThanOrEqual(2);
    expect(changed!.data!.rebasedFiles).toBeGreaterThanOrEqual(1);

    // The fixture recreates its profile folder, so stage the copy and put it back unchanged.
    await rename(target, staging);
    second = await launchSpace(`${id}-copy`, {
      env,
      electronArgs: ['-r', preload],
      prepareProfile: async (root) => {
        await rm(root, { recursive: true, force: true });
        await rename(staging, root);
      },
    });
    await recordRelaunch(second.app, relaunches);
    expect(await dataRootInfo(second)).toMatchObject({
      current: target,
      source: 'setting',
      envRoot: oldRoot,
      pointerRoot: target,
    });
    expect(await second.app.evaluate(() => process.env.KODAX_HOME)).toBe(target);
    await openDataLocation(second);
    const secondSettings = second.page.getByTestId('settings-workspace');
    await expect(secondSettings.getByText(/^Current location . Set here$/)).toBeVisible();
    await expect(secondSettings.getByText(/^The KODAX_HOME environment variable/)).toBeVisible();
    expect(await readFile(keyringAttempts, 'utf8')).toBe('');
  } finally {
    await second?.close();
    await first?.close();
    await rm(staging, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rm(sandbox, { recursive: true, force: true });
  }
});
