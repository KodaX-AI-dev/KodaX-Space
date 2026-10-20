import assert from 'node:assert/strict';
import test from 'node:test';
import { mock } from 'node:test';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import { readMcpServers, readMcpTools, stopMcpServer } from '../ipc/mcp.js';

test('Coder MCP status and tools use the shared Host and errors never fall back to a local owner', async () => {
  const selected = mock.method(runtimeHostAdapter, 'isRuntimeSelected', () => true);
  const status = mock.method(runtimeHostAdapter, 'listRuntimeMcpStatus', async () => [
    {
      serverId: 'host-server',
      connect: 'lazy',
      status: 'ready',
      tools: 1,
      resources: 0,
      prompts: 0,
      dirty: false,
    },
  ]);
  const tools = mock.method(runtimeHostAdapter, 'listRuntimeMcpTools', async () => {
    throw new Error('Host unavailable');
  });
  try {
    const result = await readMcpServers();
    assert.equal(result.canStop, false);
    assert.equal(result.servers[0]?.serverId, 'host-server');
    await assert.rejects(readMcpTools({ serverId: 'host-server' }), /Host unavailable/);
    await assert.rejects(stopMcpServer({ serverId: 'host-server' }), /shared Host.*stop/i);
  } finally {
    selected.mock.restore();
    status.mock.restore();
    tools.mock.restore();
  }
});
