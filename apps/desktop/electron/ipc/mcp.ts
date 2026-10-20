// MCP IPC handlers — FEATURE_036 + v0.1.x lifecycle (Batch 3 #5 follow-up).
//
//   mcp.discover    读 integrations/mcp.json + project (Space 投影, 不触发连接)
//   mcp.servers     McpManager.listServers — runtime 状态快照 + catalog 大小
//   mcp.start       强制连接 + catalog refresh
//   mcp.stop        断开 + drop pending queue, 保留配置
//   mcp.logs        最近 diagnostic envelope (status + lastError + cachedAt)
//   mcp.tools       拿 tool descriptors (lazy connect if needed)
//   mcp.reload      用户改 config 后调, dispose 现有 Manager + 重建

import { registerChannel } from './register.js';
import { discoverMcpServers, projectSdkServerEntry } from '../mcp/config-reader.js';
import { getMcpManager, reloadMcpManager } from '../mcp/manager.js';
import { invalidateSpaceSdkExtensionRuntimes } from '../kodax/sdk-extensions.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import type { McpServerStatusT, McpRuntimeStatusT } from '@kodax-space/space-ipc-schema';
import {
  runWithCoderAdmission,
  type CoderAdmissionOptions,
} from '../kodax/coder-runtime-mode-switch.js';

/** SDK McpServerStatus → IPC McpServerStatusT 投影。两端 shape 几乎一致,只把 number 字段
 *  clamp 到 IPC schema 上限防御异常值。 */
function projectStatus(s: import('@kodax-ai/kodax/mcp').McpServerStatus): McpServerStatusT {
  return {
    serverId: s.serverId,
    connect: s.connect,
    status: s.status as McpRuntimeStatusT,
    tools: Math.min(s.tools, 10_000),
    resources: Math.min(s.resources, 10_000),
    prompts: Math.min(s.prompts, 10_000),
    dirty: s.dirty,
    ...(s.cachedAt !== undefined ? { cachedAt: s.cachedAt } : {}),
    ...(s.lastError !== undefined ? { lastError: s.lastError } : {}),
  };
}

function managerOptions(input?: {
  readonly projectRoot?: string;
}): { readonly projectRoot?: string } | undefined {
  return input?.projectRoot ? { projectRoot: input.projectRoot } : undefined;
}

export async function readMcpServers(input?: { readonly projectRoot?: string }) {
  const servers = runtimeHostAdapter.isRuntimeSelected()
    ? await runtimeHostAdapter.listRuntimeMcpStatus()
    : (await getMcpManager(managerOptions(input))).listServers();
  return {
    servers: servers.slice(0, 128).map(projectStatus),
    canStop: !runtimeHostAdapter.isRuntimeSelected(),
  };
}

export async function stopMcpServer(input: {
  readonly serverId: string;
  readonly projectRoot?: string;
}) {
  if (runtimeHostAdapter.isRuntimeSelected())
    throw new Error(
      'The shared Host does not expose per-server stop. Disable the server configuration instead.',
    );
  return {
    status: projectStatus(
      await (await getMcpManager(managerOptions(input))).stopServer(input.serverId),
    ),
  };
}

export async function readMcpTools(input: {
  readonly serverId: string;
  readonly projectRoot?: string;
  readonly forceRefresh?: boolean;
}) {
  const list = runtimeHostAdapter.isRuntimeSelected()
    ? await runtimeHostAdapter.listRuntimeMcpTools(input.serverId, input.forceRefresh)
    : await (
        await getMcpManager(managerOptions(input))
      ).listTools(input.serverId, { forceRefresh: input.forceRefresh });
  return {
    tools: list.tools
      .slice(0, 1024)
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        ...(tool.summary !== undefined ? { description: tool.summary } : {}),
      })),
    ...(list.cachedAt !== undefined ? { cachedAt: list.cachedAt } : {}),
  };
}

export function registerMcpChannels(options: CoderAdmissionOptions = {}): void {
  registerChannel('mcp.discover', (input) =>
    runWithCoderAdmission(options, async () => {
      if (!runtimeHostAdapter.isRuntimeSelected())
        return discoverMcpServers({ projectRoot: input.projectRoot });
      const config = await runtimeHostAdapter.listRuntimeMcpConfig();
      return {
        servers: Object.entries(config)
          .slice(0, 128)
          .flatMap(([name, value]) => {
            const server = projectSdkServerEntry(
              name,
              value as unknown as Record<string, unknown>,
              'global',
            );
            return server ? [server] : [];
          }),
        errors: [],
      };
    }),
  );
  registerChannel('mcp.servers', (input) =>
    runWithCoderAdmission(options, () => readMcpServers(input)),
  );
  registerChannel('mcp.stop', (input) =>
    runWithCoderAdmission(options, () => stopMcpServer(input)),
  );
  registerChannel('mcp.tools', (input) =>
    runWithCoderAdmission(options, () => readMcpTools(input)),
  );
  registerChannel('mcp.start', (input) =>
    runWithCoderAdmission(options, async () => {
      if (!runtimeHostAdapter.isRuntimeSelected())
        return {
          status: projectStatus(
            await (await getMcpManager(managerOptions(input))).startServer(input.serverId),
          ),
        };
      await runtimeHostAdapter.listRuntimeMcpTools(input.serverId, true);
      const status = (await runtimeHostAdapter.listRuntimeMcpStatus()).find(
        (server) => server.serverId === input.serverId,
      );
      if (!status) throw new Error('MCP server is not registered with the shared Host.');
      return { status: projectStatus(status) };
    }),
  );
  registerChannel('mcp.logs', (input) =>
    runWithCoderAdmission(options, async () => {
      const logs = runtimeHostAdapter.isRuntimeSelected()
        ? (await runtimeHostAdapter.listRuntimeMcpStatus()).find(
            (server) => server.serverId === input.serverId,
          )
        : (await getMcpManager(managerOptions(input))).getServerLogs(input.serverId);
      if (!logs) throw new Error('MCP server is not registered with the shared Host.');
      return {
        serverId: logs.serverId,
        connect: logs.connect,
        status: logs.status as McpRuntimeStatusT,
        ...(logs.lastError !== undefined ? { lastError: logs.lastError } : {}),
        ...(logs.cachedAt !== undefined ? { cachedAt: logs.cachedAt } : {}),
      };
    }),
  );
  registerChannel('mcp.reload', (input) =>
    runWithCoderAdmission(options, async () => {
      if (runtimeHostAdapter.isRuntimeSelected())
        return {
          ok: true,
          serverCount: Math.min((await runtimeHostAdapter.reloadRuntimeMcp()).servers.length, 128),
        };
      const manager = await reloadMcpManager(managerOptions(input));
      await invalidateSpaceSdkExtensionRuntimes();
      return { ok: true, serverCount: Math.min(manager.listServers().length, 128) };
    }),
  );
}
