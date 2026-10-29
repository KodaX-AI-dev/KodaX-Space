import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN_SLASH_COMMANDS } from './builtin.js';
import { kodaxHost } from '../kodax/host.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';

test('work-mode query produces a visible command reply without mutating Host settings', async (t) => {
  t.mock.method(kodaxHost, 'get', () => ({ surface: 'code' }));
  t.mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  t.mock.method(runtimeHostAdapter, 'readWorkMode', async () => ({
    supported: true,
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
