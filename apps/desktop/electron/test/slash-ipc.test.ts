import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { kodaxHost } from '../kodax/host.js';
import { setRendererTarget } from '../ipc/push.js';
import { executeSlashCommand } from '../ipc/slash.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import { BUILTIN_SLASH_COMMANDS } from '../slash/builtin.js';
import { _resetSlashRegistryForTesting, registerSlash } from '../slash/registry.js';
import { installSessionStoreMock, type MockSessionState } from './_helpers/session-store-mock.js';

let mockState: MockSessionState;

beforeEach(async () => {
  mockState = installSessionStoreMock();
  setRendererTarget(() => null);
  await kodaxHost.disposeAll();
  _resetSlashRegistryForTesting();
  for (const cmd of BUILTIN_SLASH_COMMANDS) registerSlash(cmd);
});

afterEach(async () => {
  await kodaxHost.disposeAll();
  setRendererTarget(() => null);
  mockState.reset();
  _resetSlashRegistryForTesting();
});

test('slash.exec lazy-resumes persisted sessions before running workflow handlers', async () => {
  const sessionId = '20260617_202714';
  mockState.seed(sessionId, 'C:/proj/example', 'historical review session');
  assert.equal(kodaxHost.get(sessionId), undefined);

  const result = await executeSlashCommand({
    sessionId,
    name: 'workflow',
    args: ['help'],
  });

  assert.equal(result.ok, true);
  assert.match(result.message ?? '', /\/workflow create <request>/);
  assert.equal(kodaxHost.get(sessionId)?.sessionId, sessionId);
});

test('slash.exec still reports unknown commands without trying to require a session', async () => {
  const result = await executeSlashCommand({ sessionId: 'missing', name: 'nope', args: [] });
  assert.equal(result.ok, false);
  assert.equal(result.unknownCommand, true);
  assert.match(result.message ?? '', /unknown command/);
});

test('Host prompt commands and review preserve arguments and one execution identity', async (t) => {
  const { sessionId } = kodaxHost.createSession({
    projectRoot: 'C:/proj/a',
    provider: 'mock',
    surface: 'code',
  });
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  t.mock.method(runtimeHostAdapter, 'resolveRuntimeCommandInfo', async () => ({
    name: 'summarize',
    source: 'extension',
    promptCommand: true,
    description: 'Summarize',
  }));
  const executed: unknown[] = [];
  t.mock.method(runtimeHostAdapter, 'executeProductCommand', async (input: unknown) => {
    executed.push(input);
    return { kind: 'started', runId: 'host-command' };
  });
  for (const name of ['summarize', 'review']) {
    const result = await executeSlashCommand({
      sessionId,
      name,
      args: ['sha', 'abc'],
      operationId: `input-${name}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.unknownCommand, undefined);
  }
  assert.deepEqual(
    executed,
    ['summarize', 'review'].map((name) => ({
      sessionId,
      projectRoot: 'C:/proj/a',
      name,
      args: ['sha', 'abc'],
      inputId: `input-${name}`,
    })),
  );
});
test('slash.exec rejects known commands when expected project root does not match session', async () => {
  const { sessionId } = kodaxHost.createSession({ projectRoot: 'C:/proj/a', provider: 'mock' });

  await assert.rejects(
    () =>
      executeSlashCommand({
        sessionId,
        name: 'workflow',
        args: ['help'],
        expectedProjectRoot: 'C:/proj/b',
        expectedSurface: 'code',
      }),
    /session\/project mismatch/,
  );
});

test('slash.exec rejects known commands when expected surface does not match session', async () => {
  const { sessionId } = kodaxHost.createSession({
    projectRoot: 'C:/proj/a',
    provider: 'mock',
    surface: 'code',
  });

  await assert.rejects(
    () =>
      executeSlashCommand({
        sessionId,
        name: 'workflow',
        args: ['help'],
        expectedProjectRoot: 'C:/proj/a',
        expectedSurface: 'partner',
      }),
    /session\/surface mismatch/,
  );
});
