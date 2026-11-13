// data-root-change tests — 先复制、成功才写指针;失败不动指针

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  commitDataRootChange,
  copyDataRootWithSdk,
  SPACE_PER_ROOT_EXCLUDES,
  type DataRootCopyFunction,
} from './data-root-change.js';
import { COPY_MARKER, readDataRootPointer } from './data-root.js';

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
    skipped: [{ path: 'instances', reason: 'non-portable' as const }],
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
  const copyRoot: DataRootCopyFunction = async () => {
    throw new Error('restore default must not copy');
  };
  await commitDataRootChange(
    { target: to(), copyFrom: null },
    { pointerFile: pointerFile(), copyRoot },
  );
  await commitDataRootChange(
    { target: null, copyFrom: from() },
    { pointerFile: pointerFile(), copyRoot },
  );
  assert.equal(existsSync(pointerFile()), false);
});

test('the SDK copy keeps Space per-root state behind and rebases paths into the new root', async () => {
  const write = (root: string, relative: string, body: string): void => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), body);
  };
  const image = path.join(from(), 'space', 'images', 'a.png');
  write(from(), 'space/runtime-client-identity.json', '{"instanceId":"old"}');
  write(from(), 'space/input-intents/session/input.json', '{}');
  write(from(), 'space/images/a.png', 'png');
  write(
    from(),
    'sessions/s.jsonl',
    `${JSON.stringify({ image })}
`,
  );
  mkdirSync(to());
  const progress: number[] = [];
  const outcome = await commitDataRootChange(
    { target: to(), copyFrom: from() },
    {
      pointerFile: pointerFile(),
      copyRoot: copyDataRootWithSdk,
      onProgress: (p) => progress.push(p.files),
    },
  );
  assert.equal(existsSync(path.join(to(), 'space', 'runtime-client-identity.json')), false);
  assert.equal(existsSync(path.join(to(), 'space', 'input-intents')), false);
  assert.equal(readFileSync(path.join(to(), 'space', 'images', 'a.png'), 'utf8'), 'png');
  assert.deepEqual(JSON.parse(readFileSync(path.join(to(), 'sessions', 's.jsonl'), 'utf8')), {
    image: path.join(to(), 'space', 'images', 'a.png'),
  });
  assert.equal(existsSync(path.join(to(), COPY_MARKER)), false);
  assert.equal(outcome?.rebasedFiles, 1);
  assert.ok(progress.length > 0);
  assert.equal(readDataRootPointer(pointerFile()).pointer?.root, to());
  assert.equal(
    readFileSync(path.join(from(), 'space', 'runtime-client-identity.json'), 'utf8'),
    '{"instanceId":"old"}',
  );
});

test('a target left by an interrupted SDK copy is refused without touching the pointer', async () => {
  mkdirSync(from());
  mkdirSync(to());
  writeFileSync(path.join(to(), COPY_MARKER), '');
  await assert.rejects(
    commitDataRootChange(
      { target: to(), copyFrom: from() },
      { pointerFile: pointerFile(), copyRoot: copyDataRootWithSdk },
    ),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'target_incomplete',
  );
  assert.equal(existsSync(pointerFile()), false);
});

test('the marker Space checks before loading the SDK is the one the SDK writes', async () => {
  const { KODAX_DATA_ROOT_COPY_MARKER } = await import('@kodax-ai/kodax/runtime');
  assert.equal(COPY_MARKER, KODAX_DATA_ROOT_COPY_MARKER);
});
