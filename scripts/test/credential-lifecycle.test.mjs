import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

test('Windows uninstall preserves the encryption state required by retained Space credentials', () => {
  const config = parse(
    readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8'),
  );
  assert.equal(
    config.nsis.deleteAppDataOnUninstall,
    false,
    'The vault survives in .kodax/space: uninstall must also preserve its Local State encryption key',
  );
});

test('clean removes unpacked builds while preserving the user vault and Electron encryption state', (t) => {
  const temporaryBase = path.resolve(os.tmpdir());
  const fixture = mkdtempSync(path.join(temporaryBase, 'space-clean-credential-test-'));
  assert.equal(path.dirname(fixture), temporaryBase);
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const workspace = path.join(fixture, 'workspace');
  const userHome = path.join(fixture, 'user');
  const appData = path.join(userHome, 'AppData', 'Roaming');
  const vault = path.join(userHome, '.kodax', 'space', 'provider-credentials.v1.json');
  const encryptionState = path.join(appData, 'KodaX Space', 'Local State');
  const buildFile = path.join(workspace, 'out', 'win-unpacked', 'build-fixture');
  for (const file of [vault, encryptionState, buildFile]) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'synthetic-fixture');
  }
  mkdirSync(path.join(workspace, 'scripts'));
  copyFileSync(
    new URL('../clean.mjs', import.meta.url),
    path.join(workspace, 'scripts', 'clean.mjs'),
  );
  const result = spawnSync(process.execPath, [path.join(workspace, 'scripts', 'clean.mjs')], {
    cwd: workspace,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, USERPROFILE: userHome, HOME: userHome, APPDATA: appData },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(buildFile), false);
  assert.equal(readFileSync(vault, 'utf8'), 'synthetic-fixture');
  assert.equal(readFileSync(encryptionState, 'utf8'), 'synthetic-fixture');
});
