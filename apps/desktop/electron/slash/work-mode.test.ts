import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN_SLASH_COMMANDS } from './builtin.js';
import { kodaxHost } from '../kodax/host.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import { registerSlash, listSlashCommands, getSlashHandler } from './registry.js';

test('retired agent-mode command is hidden from suggestions but remains compatible', () => {
  for (const command of BUILTIN_SLASH_COMMANDS) registerSlash(command);
  assert.equal(
    listSlashCommands().some((command) => command.name === 'agent-mode'),
    false,
  );
  assert.equal(
    listSlashCommands().some((command) => command.name === 'work-mode'),
    true,
  );
  assert.ok(getSlashHandler('agent-mode'));
});

test('work-mode query produces a visible command reply without mutating Host settings', async (t) => {
  t.mock.method(kodaxHost, 'get', () => ({ surface: 'code' }));
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  t.mock.method(runtimeHostAdapter, 'readWorkMode', async () => ({
    supported: true,
    locked: false,
    workMode: 'coding',
    revision: 3,
  }));
  const update = t.mock.method(runtimeHostAdapter, 'updateWorkMode');
  const command = BUILTIN_SLASH_COMMANDS.find((command) => command.name === 'work-mode');
  assert.ok(command);
  assert.deepEqual(await command.handler({ sessionId: 'command-fixture', args: [] }), {
    ok: true,
    echo: true,
    message: 'Work mode: coding',
  });
  assert.equal(update.mock.callCount(), 0);
});

test('work-mode change in a started session gives a readable refusal', async (t) => {
  t.mock.method(kodaxHost, 'get', () => ({ surface: 'code' }));
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  t.mock.method(runtimeHostAdapter, 'readWorkMode', async () => ({
    supported: true,
    locked: true,
    workMode: 'coding',
    revision: 3,
  }));
  const update = t.mock.method(runtimeHostAdapter, 'updateWorkMode');
  const command = BUILTIN_SLASH_COMMANDS.find((command) => command.name === 'work-mode');
  assert.ok(command);
  assert.deepEqual(await command.handler({ sessionId: 'started', args: ['agent'] }), {
    ok: false,
    message:
      'Work mode is fixed for this conversation. Start a new session to choose another mode.',
  });
  assert.equal(update.mock.callCount(), 0);
});
