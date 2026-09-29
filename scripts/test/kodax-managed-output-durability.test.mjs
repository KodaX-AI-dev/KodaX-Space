import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runManagedTask } from '@kodax-ai/kodax/coding';
import { KodaXBaseProvider, registerModelProvider } from '@kodax-ai/kodax/llm';

for (const persistedByHost of [false, true]) {
  test(`published managed output preserves persistence ownership (host=${persistedByHost})`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'space-sdk-durability-'));
    const providerName = 'space-durability-fixture';
    const keyName = 'SPACE_DURABILITY_FIXTURE_KEY';
    const previous = new Map(['KODAX_HOME', keyName].map((key) => [key, process.env[key]]));
    process.env.KODAX_HOME = path.join(root, 'home');
    process.env[keyName] = 'offline-fixture';
    let stored;
    let beforeTool;
    let beforeNextRequest;
    let calls = 0;
    class Provider extends KodaXBaseProvider {
      name = providerName;
      supportsThinking = false;
      config = { apiKeyEnv: keyName, model: 'fixture', supportsThinking: false };
      async stream() {
        if (calls++ > 0) {
          beforeNextRequest = JSON.stringify(stored?.messages ?? []);
          throw Object.assign(new TypeError('durability fixture interrupted'), {
            code: 'ERR_INVALID_ARG_TYPE',
          });
        }
        return {
          textBlocks: [{ type: 'text', text: 'DURABLE_PROGRESS' }],
          thinkingBlocks: [],
          toolBlocks: [
            {
              type: 'tool_use',
              id: 'durable-read',
              name: 'read',
              input: { path: path.join(root, 'absent.txt') },
            },
          ],
        };
      }
    }
    const unregister = registerModelProvider(providerName, () => new Provider());
    t.after(async () => {
      unregister();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('space-sdk-durability-'));
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
    });
    await assert.rejects(
      runManagedTask(
        {
          provider: providerName,
          model: 'fixture',
          agentMode: 'ama',
          maxIter: 3,
          lsp: false,
          session: {
            id: 'managed-durability',
            persistedByHost,
            storage: {
              load: async () => stored ?? null,
              save: async (_id, data) => {
                stored = structuredClone(data);
              },
            },
          },
          events: {
            beforeToolExecute: async () => {
              beforeTool = JSON.stringify(stored?.messages ?? []);
              return true;
            },
          },
          context: {
            executionCwd: root,
            gitRoot: root,
            managedTaskWorkspaceDir: root,
            repoIntelligenceMode: 'off',
          },
        },
        'Inspect the fixture file',
      ),
      /durability fixture interrupted/,
    );
    assert.equal(calls, 2);
    assert.equal(typeof beforeTool, 'string');
    assert.equal(typeof beforeNextRequest, 'string');
    if (persistedByHost) {
      assert.doesNotMatch(beforeTool, /DURABLE_PROGRESS/);
      assert.doesNotMatch(beforeNextRequest, /DURABLE_PROGRESS/);
    } else {
      assert.match(beforeTool, /DURABLE_PROGRESS/);
      assert.doesNotMatch(beforeTool, /tool_result/);
      assert.match(beforeNextRequest, /DURABLE_PROGRESS/);
      assert.match(beforeNextRequest, /tool_result/);
      assert.match(JSON.stringify(stored.messages), /DURABLE_PROGRESS/);
    }
  });
}
