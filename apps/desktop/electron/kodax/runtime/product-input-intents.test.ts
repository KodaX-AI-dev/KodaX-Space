import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSpaceDataDir } from '../data-paths.js';
import { captureProductInput, takeBackProductInput } from './product-input-intents.js';

test('taking back a long queued input retries its durable Host receipt after response loss', async () => {
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
      if (calls === 1) throw new Error('Host response lost after commit');
      return original;
    },
  };
  await assert.rejects(takeBackProductInput(runs, 'main-principal', original), /response lost/);
  // A Renderer/Main restart retries the same identity after losing its success response.
  assert.deepEqual(await takeBackProductInput(runs, 'main-principal', original), original);
  assert.equal(calls, 2);
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
});

test('legacy queued input without a Space record returns the complete Host receipt and caches it across restart', async () => {
  const original = {
    sessionId: 'legacy-withdraw',
    inputId: 'old-input',
    text: 'Original '.repeat(1500),
    delivery: 'after_turn' as const,
    inputArtifacts: [
      { kind: 'file' as const, path: '/workspace/original.csv', name: 'original.csv' },
    ],
  };
  let calls = 0;
  const runs = {
    withdrawInput: async () => {
      calls++;
      return original;
    },
  };
  assert.deepEqual(await takeBackProductInput(runs, 'legacy-owner', original), original);
  assert.deepEqual(await takeBackProductInput(runs, 'legacy-owner', original), original);
  assert.equal(calls, 1);
  await assert.rejects(
    takeBackProductInput(
      {
        withdrawInput: async () => {
          throw Object.assign(new Error('Original principal required'), {
            code: 'permission_denied',
          });
        },
      },
      'foreign-owner',
      original,
    ),
    { code: 'permission_denied' },
  );
});

test('a Host receipt for another input never replaces the original private material', async () => {
  const original = { sessionId: 'wrong-receipt', inputId: 'original', text: 'Retain original' };
  await captureProductInput('receipt-owner', original);
  await assert.rejects(
    takeBackProductInput(
      { withdrawInput: async () => ({ ...original, inputId: 'other' }) },
      'receipt-owner',
      original,
    ),
    /identity|receipt/i,
  );
});

test('the Host omits an empty artifact list without changing the original intent', async () => {
  const original = {
    sessionId: 'empty-artifacts',
    inputId: 'same-input',
    text: 'Exact original',
    delivery: 'after_turn' as const,
  };
  await captureProductInput('empty-owner', { ...original, inputArtifacts: [] });
  assert.deepEqual(
    await takeBackProductInput({ withdrawInput: async () => original }, 'empty-owner', original),
    original,
  );
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

test('an undelivered steer input is taken back with its target Run binding intact', async () => {
  // SDK beta.9 lets inputs.withdraw take back a steer until its Run claims it at a safety point.
  // Space submits text-only steers with an empty artifact list; the Host receipt omits it.
  const receipt = {
    sessionId: 'steer-take-back',
    inputId: 'steer-input',
    text: 'Use the smaller fixture instead.',
    delivery: 'steer' as const,
    targetRunId: 'run-active',
  };
  await captureProductInput('main-principal', { ...receipt, inputArtifacts: [] });
  let calls = 0;
  const runs = {
    withdrawInput: async () => {
      calls++;
      return structuredClone(receipt);
    },
  };
  assert.deepEqual(await takeBackProductInput(runs, 'main-principal', receipt), receipt);
  assert.deepEqual(await takeBackProductInput(runs, 'main-principal', receipt), receipt);
  assert.equal(calls, 1, 'the confirmed receipt answers a repeated take-back');
});
