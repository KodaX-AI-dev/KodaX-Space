import assert from 'node:assert/strict';
import test from 'node:test';
import { gatherCommands } from './commandSources.js';

test('command sessions request and retain only the selected surface', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let surface: unknown;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      kodaxSpace: {
        invoke: async (channel: string, input: { surface?: string }) => {
          if (channel === 'session.list') {
            surface = input.surface;
            return {
              ok: true,
              data: {
                sessions: ['code', 'partner'].map((kind) => ({
                  sessionId: kind,
                  surface: kind,
                  title: kind,
                  provider: 'test',
                  lastActivityAt: 1,
                })),
              },
            };
          }
          return { ok: true, data: { paths: [], commands: [] } };
        },
      },
    },
  });
  const items = await gatherCommands({
    projectPath: 'C:/project',
    sessionId: null,
    surface: 'partner',
    close() {},
    t: (key) => key,
    locale: 'en-US',
    insertToInput() {},
  });
  assert.equal(surface, 'partner');
  assert.deepEqual(
    items.filter((item) => item.kind === 'session').map((item) => item.id),
    ['session:partner'],
  );
});
