import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOwnedTestRuntime, stopOwnedTestRuntime } from './owned-runtime-fixture.mjs';

async function resultWithinDeadline(run) {
  let timer;
  try {
    return await Promise.race([
      run.result,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Question Run did not settle')), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fixture(t, userInputTimeoutMs) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-sdk-questions-')));
  const runtime = await createOwnedTestRuntime({
    homeDir: root,
    sessionsDir: path.join(root, 'sessions'),
    defaultProvider: 'anthropic',
    sharedDaemonHost: true,
    ...(userInputTimeoutMs !== undefined ? { userInputTimeoutMs } : {}),
  });
  t.after(async () => {
    await stopOwnedTestRuntime(runtime);
    assert.equal(path.dirname(root), await realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-sdk-questions-'));
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  const session = await runtime.sessions.create({ projectPath: root });
  await runtime.sessions.updateSettings(session.id, {
    agentMode: 'ama',
    permissionMode: 'full-access',
  });
  const run = await runtime.runs.start({
    sessionId: session.id,
    prompt: 'Ask before continuing',
    options: {
      agentMode: 'ama',
      toolInvocation: {
        name: 'ask_user_question',
        input: {
          question: 'Choose a direction',
          default: 'first',
          options: [
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
          ],
        },
      },
    },
  });
  let question;
  const deadline = Date.now() + 5_000;
  while (!question && Date.now() < deadline) {
    question = (await runtime.interactions.list({ sessionId: session.id }))[0];
    if (!question) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(question, 'the installed Runtime must expose its pending question');
  return { runtime, session, run, question };
}

test('published questions have no default deadline and skip completes without choosing the default', async (t) => {
  const { runtime, run, question } = await fixture(t);
  assert.equal(question.expiresAt, undefined);
  const response = await runtime.interactions.respond(question.requestId, { kind: 'skip' });
  assert.equal(response.accepted, true);
  const result = await resultWithinDeadline(run);
  assert.equal(result.phase, 'completed');
  assert.match(result.result?.lastText ?? '', /"status":"unanswered"/);
  assert.match(result.result?.lastText ?? '', /"reason":"skipped"/);
  assert.doesNotMatch(result.result?.lastText ?? '', /"choices":\["first"\]/);
  assert.equal(
    (await runtime.interactions.respond(question.requestId, { kind: 'question', answer: 'first' }))
      .accepted,
    false,
  );
});

test('published question timeout is unanswered and does not interrupt its Run', async (t) => {
  const { run, question } = await fixture(t, 250);
  assert.ok(question.expiresAt);
  const result = await resultWithinDeadline(run);
  assert.equal(result.phase, 'completed');
  assert.match(result.result?.lastText ?? '', /"reason":"timeout"/);
});

test('Stop interrupts the exact question Run and rejects its late answer', async (t) => {
  const { runtime, session, run, question } = await fixture(t);
  await runtime.sessions.cancel({
    sessionId: session.id,
    expectedRunId: run.runId,
    requestId: 'stop-question',
  });
  assert.equal((await resultWithinDeadline(run)).phase, 'interrupted');
  assert.equal(
    (await runtime.interactions.respond(question.requestId, { kind: 'question', answer: 'first' }))
      .accepted,
    false,
  );
});

test('published Host rejects client timeout and preserves non-interactive unanswered reason', async (t) => {
  const { runtime, run, question } = await fixture(t);
  const pending = (await runtime.userInputs.listPending())[0];
  await assert.rejects(
    runtime.userInputs.respond(
      pending.id,
      { unanswered: true, reason: 'timeout' },
      { expectedRevision: pending.revision, runId: pending.runId },
    ),
    /timeout|invalid/i,
  );
  assert.equal((await runtime.interactions.list({ sessionId: question.sessionId })).length, 1);
  await runtime.interactions.respond(question.requestId, {
    kind: 'skip',
    reason: 'non_interactive',
  });
  const result = await resultWithinDeadline(run);
  assert.equal(result.phase, 'completed');
  assert.match(result.result?.lastText ?? '', /"reason":"non_interactive"/);
});
