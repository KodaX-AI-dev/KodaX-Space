import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { resolveBundledFeishuCliArchivePath } from './feishu-cli-bundle.js';

test('packaged Feishu CLI resolves from installer-owned resources for the running platform', () => {
  assert.equal(
    resolveBundledFeishuCliArchivePath({
      isPackaged: true,
      mainDirectory: '/Applications/KodaX Space.app/Contents/Resources/app.asar/dist-electron',
      resourcesPath: '/Applications/KodaX Space.app/Contents/Resources',
      platform: 'darwin',
      arch: 'arm64',
    }),
    path.join(
      '/Applications/KodaX Space.app/Contents/Resources',
      'managed-components',
      'feishu-cli',
      '1.0.92',
      'darwin-arm64',
      'lark-cli.tar.gz',
    ),
  );
});

test('development Feishu CLI uses the build-prepared component beside the repository', () => {
  assert.equal(
    resolveBundledFeishuCliArchivePath({
      isPackaged: false,
      mainDirectory: '/workspace/dist-electron',
      resourcesPath: '/Electron Framework/Resources',
      platform: 'win32',
      arch: 'x64',
    }),
    path.join(
      '/workspace',
      '.managed-components',
      'feishu-cli',
      '1.0.92',
      'win32-x64',
      'lark-cli.zip',
    ),
  );
});
