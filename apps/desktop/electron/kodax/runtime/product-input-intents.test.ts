import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSpaceDataDir } from '../data-paths.js';
import { captureProductInput, takeBackProductInput } from './product-input-intents.js';

test('taking back a long queued input survives Host and UI response loss without losing attachments or withdrawing twice', async () => {
  const original = {
    sessionId: 'long-queued',
    inputId: 'original',
    text: 'Keep the full original. '.repeat(2000),
    inputArtifacts: [
      { kind: 'image' as const, path: '/original/image.png', mediaType: 'image/png' as const },
    ],
  };
  await captureProductInput('main-principal', original);
  await captureProductInput('main-principal', original);
  await captureProductInput('main-principal', { ...original, targetRunId: undefined });
  await assert.rejects(
    captureProductInput('main-principal', { ...original, text: 'A replacement intent' }),
  );
  let state: 'queued' | 'withdrawn' = 'queued';
  let calls = 0;
  const runs = {
    getInput: async () => ({ state, sessionId: original.sessionId, inputId: original.inputId }),
    withdrawInput: async () => {
      calls++;
      state = 'withdrawn';
      throw new Error('Host response lost after commit');
    },
  };
  assert.deepEqual(await takeBackProductInput(runs, 'main-principal', original), original);
  // A Renderer/Main restart retries the same identity after losing its success response.
  assert.deepEqual(await takeBackProductInput(runs, 'main-principal', original), original);
  assert.equal(calls, 1);
  const coldHost = {
    ...runs,
    getInput: async () => {
      throw new Error('The old Host no longer exists');
    },
  };
  assert.deepEqual(
    await takeBackProductInput(coldHost, 'main-principal', original),
    original,
    'a durably confirmed Main receipt survives Host replacement',
  );
  await assert.rejects(
    takeBackProductInput(runs, 'different-principal', original),
    /recovery record/,
  );
  assert.equal(calls, 1);
});

test('a refused take-back keeps its original input and never records a successful cancellation', async () => {
  const original = { sessionId: 'take-back-refused', inputId: 'still-queued', text: 'Retain me' };
  await captureProductInput('main-principal', original);
  let calls = 0;
  const runs = {
    getInput: async () => ({
      state: 'queued' as const,
      sessionId: original.sessionId,
      inputId: original.inputId,
    }),
    withdrawInput: async () => {
      calls++;
      throw Object.assign(new Error('Not withdrawn'), { code: 'conflict' });
    },
  };
  await assert.rejects(takeBackProductInput(runs, 'main-principal', original), {
    code: 'conflict',
  });
  await assert.rejects(takeBackProductInput(runs, 'main-principal', original), {
    code: 'conflict',
  });
  assert.equal(calls, 2, 'an unconfirmed result does not create a durable success receipt');
});

test('a damaged private recovery record refuses withdrawal without exposing its contents', async () => {
  const directory = path.join(getSpaceDataDir(), 'input-intents');
  const before = new Set(await readdir(directory));
  const original = { sessionId: 'damaged-intent', inputId: 'damaged', text: 'Private input' };
  await captureProductInput('main-principal', original);
  const file = (await readdir(directory)).find((name) => !before.has(name))!;
  let calls = 0;
  const runs = {
    getInput: async () => {
      calls++;
      throw new Error('Must not query the Host');
    },
    withdrawInput: async () => {
      calls++;
      throw new Error('Must not mutate the Host');
    },
  };
  for (const damaged of [
    'private-marker-not-json',
    JSON.stringify({ principal: 'private-marker', input: null }),
  ]) {
    await writeFile(path.join(directory, file), damaged);
    await assert.rejects(
      takeBackProductInput(runs, 'main-principal', original),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Invalid input recovery record.');
        assert.doesNotMatch(error.message, /private-marker/);
        return true;
      },
    );
  }
  assert.equal(calls, 0);
});
