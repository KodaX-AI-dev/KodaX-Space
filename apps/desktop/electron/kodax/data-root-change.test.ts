// data-root-change tests — 先复制、成功才写指针;失败不动指针

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  commitDataRootChange,
  SPACE_PER_ROOT_EXCLUDES,
  type DataRootCopyFunction,
} from './data-root-change.js';
import { readDataRootPointer } from './data-root.js';

let scratch = '';
beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'space-data-root-change-'));
});
afterEach(() => {
  assert.equal(path.dirname(scratch), os.tmpdir());
  rmSync(scratch, { recursive: true, force: true });
});

const pointerFile = (): string => path.join(scratch, 'appdata', 'data-root.json');
const from = (): string => path.join(scratch, 'old');
const to = (): string => path.join(scratch, 'new');

test('copies first with Space per-root state excluded, then writes the pointer', async () => {
  const events: string[] = [];
  const copyRoot: DataRootCopyFunction = async (options) => {
    assert.equal(existsSync(pointerFile()), false, 'pointer must not exist while copying');
    assert.deepEqual(options.exclude, SPACE_PER_ROOT_EXCLUDES);
    events.push(`copy ${options.from} -> ${options.to}`);
    return copied;
  };
  const copied = {
    files: 3,
    bytes: 9,
    skipped: [{ path: 'instances', reason: 'non-portable' }],
    rebasedFiles: 1,
  };
  const outcome = await commitDataRootChange(
    { target: to(), copyFrom: from() },
    { pointerFile: pointerFile(), copyRoot },
  );
  assert.deepEqual(events, [`copy ${from()} -> ${to()}`]);
  assert.equal(outcome, copied, 'the copy outcome is returned for the log');
  assert.deepEqual(readDataRootPointer(pointerFile()).pointer, { version: 1, root: to() });
});

test('a failed copy leaves the pointer untouched', async () => {
  const copyRoot: DataRootCopyFunction = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(
    commitDataRootChange(
      { target: to(), copyFrom: from() },
      { pointerFile: pointerFile(), copyRoot },
    ),
    /disk full/,
  );
  assert.equal(existsSync(pointerFile()), false);
});

test('without copy the pointer is written and the SDK is never asked to copy', async () => {
  let called = false;
  const copyRoot: DataRootCopyFunction = async () => {
    called = true;
    return { files: 0, bytes: 0, skipped: [], rebasedFiles: 0 };
  };
  const outcome = await commitDataRootChange(
    { target: to(), copyFrom: null },
    { pointerFile: pointerFile(), copyRoot },
  );
  assert.equal(called, false);
  assert.equal(outcome, null);
  assert.equal(readDataRootPointer(pointerFile()).pointer?.root, to());
});

test('client-identity-bound Space state stays with its root', () => {
  // Pending input intents are keyed by the client identity, which every root generates anew.
  assert.deepEqual([...SPACE_PER_ROOT_EXCLUDES].sort(), [
    'space/input-intents',
    'space/runtime-client-identity.json',
  ]);
});

test('restore default removes the pointer and never copies', async () => {
  await commitDataRootChange(
    { target: to(), copyFrom: null },
    { pointerFile: pointerFile(), copyRoot: null },
  );
  await commitDataRootChange(
    { target: null, copyFrom: from() },
    { pointerFile: pointerFile(), copyRoot: null },
  );
  assert.equal(existsSync(pointerFile()), false);
});

test('a requested copy fails closed when the SDK cannot copy, before touching the pointer', async () => {
  await assert.rejects(
    commitDataRootChange(
      { target: to(), copyFrom: from() },
      { pointerFile: pointerFile(), copyRoot: null },
    ),
    /cannot copy/,
  );
  assert.equal(existsSync(pointerFile()), false);
});
