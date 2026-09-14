import assert from 'node:assert/strict';
import test from 'node:test';
import { PartnerConnectorComponents } from './components.js';

test('component install is independent of account authorization, deduplicates, cancels and retries', async () => {
  let installed = false;
  let installs = 0;
  let inspections = 0;
  let release: (() => void) | undefined;
  const components = new PartnerConnectorComponents({
    'feishu-cli': {
      version: '1.0.92',
      supported: true,
      inspect: async () => {
        inspections++;
        return installed;
      },
      install: async (signal) => {
        installs++;
        await new Promise<void>((resolve, reject) => {
          release = () => {
            installed = true;
            resolve();
          };
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
      },
    },
  });
  assert.equal((await components.list(true))[0].state, 'missing');
  assert.equal(components.install('feishu-cli').state, 'installing');
  components.install('feishu-cli');
  await Promise.resolve();
  assert.equal(installs, 1);
  await components.list();
  assert.equal(inspections, 1, 'polling never repeatedly probes binaries');
  assert.equal((await components.cancel('feishu-cli')).state, 'cancelled');
  components.install('feishu-cli');
  await Promise.resolve();
  release!();
  await components.waitForIdle();
  assert.equal((await components.list())[0].state, 'ready');
  assert.equal(installs, 2);
});

test('component failures are safe and do not disable other components; unsupported installs never run', async () => {
  const components = new PartnerConnectorComponents({
    'feishu-cli': {
      version: '1.0.92',
      supported: true,
      inspect: async () => false,
      install: async () => {
        throw new Error('secret-raw-error');
      },
    },
    'wecom-cli': {
      version: '1.2.0',
      supported: false,
      inspect: async () => {
        throw new Error('must not probe');
      },
      install: async () => {
        throw new Error('must not install');
      },
    },
  });
  assert.equal((await components.list(true))[1].state, 'unsupported');
  assert.throws(() => components.install('wecom-cli'));
  components.install('feishu-cli');
  await components.waitForIdle();
  const failed = (await components.list())[0];
  assert.equal(failed.state, 'failed');
  assert.doesNotMatch(failed.error ?? '', /secret/);
  await components.dispose();
  assert.throws(() => components.install('feishu-cli'));
});

test('a late refresh cannot overwrite a completed installation', async () => {
  let finishInspection: ((ready: boolean) => void) | undefined;
  const components = new PartnerConnectorComponents({
    'feishu-cli': {
      version: '1.0.92',
      supported: true,
      inspect: () =>
        new Promise((resolve) => {
          finishInspection = resolve;
        }),
      install: async () => undefined,
    },
  });
  const refresh = components.list(true);
  components.install('feishu-cli');
  await components.waitForIdle();
  finishInspection!(false);
  assert.equal((await refresh)[0].state, 'ready');
});
