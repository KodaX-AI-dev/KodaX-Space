// AGENTS.md loader — v0.1.6 切到 SDK 出口 (cleanup gap)
//
// 之前 Space 自己写"扫 ~/.kodax/AGENTS.md + projectRoot/AGENTS.md"——比 KodaX REPL
// 行为窄（REPL 用 packages/coding/src/context/agents-loader.ts 递归 cwd→root + .kodax/）。
// SDK 0.7.42 把 loadAgentsFiles 通过 /coding 暴露后切到 SDK：
//   - 行为和 REPL 100% 一致（同一份代码）
//   - 用户 ~/.kodax/AGENTS.md + projectRoot 上递归到 root 的所有 AGENTS.md 都被注入
//
// 字段名 AgentsFile { path, content, scope } 与 schema agentsFileSchema 严格对齐。
//
// **同步实现**：SDK loadAgentsFiles 是 sync I/O。Space main process IPC 短同步 OK
// （SDK 内部已优化为 hot path），不需要再包 async。

import path from 'node:path';

// **静态 import 改 dynamic**：SDK 的 subpath exports 只声明 "import" 条件，CJS-built
// main 进程 require() 会撞 ERR_PACKAGE_PATH_NOT_EXPORTED。
// `import type` 仅 compile-time，runtime 无 require；运行时调用走 dynamic import 命中
// "import" 条件正常工作。
import type { AgentsFile as SdkAgentsFile } from '@kodax-ai/kodax/coding';
type SdkCodingModule = typeof import('@kodax-ai/kodax/coding');

/**
 * 与 schema agentsFileSchema + SDK AgentsFile 严格对齐。
 * scope: 'global' (~/.kodax) / 'project' (projectRoot) / 'directory' (递归扫到的子目录)
 */
export type AgentsFile = SdkAgentsFile;

// Lazy load + cache。生产 runtime 第一次调时 dynamic import 走一遍，之后命中 cache。
let sdkModuleCache: SdkCodingModule | null = null;
async function loadSdkCodingModule(): Promise<SdkCodingModule> {
  if (sdkModuleCache === null) {
    sdkModuleCache = await import('@kodax-ai/kodax/coding');
  }
  return sdkModuleCache;
}

export interface LoadAgentsMdOptions {
  /** 当前 session 的 projectRoot。必须 absolute（host validateProjectRoot 校验过）*/
  projectRoot: string;
  /** 测试 hook：覆盖 ~/.kodax 路径 */
  kodaxGlobalDir?: string;
}

/**
 * 加载 AGENTS.md 文件，走 SDK 0.7.42 loadAgentsFiles。
 *
 * **Async 包装**：调用方（IPC handler / auto-mode-bootstrap）原本走 async，保留
 * 兼容；SDK 本身同步，await 立刻 resolve（不产生额外 microtask round-trip）。
 *
 * **错误兜底 (reviewer HIGH-2)**：SDK 抛任何异常（fs 权限、shape 异常等）都 fallback []，
 * 保持 pre-cleanup 时 Space loader 的 "永不向上抛" 契约。IPC handler 因此能拿到稳定空数组
 * 而非 HANDLER_ERROR envelope——AGENTS.md 缺失不应让 chat 不可用。
 */
export async function loadAgentsMd(opts: LoadAgentsMdOptions): Promise<AgentsFile[]> {
  // Defense-in-depth: host validateProjectRoot 已拦 renderer 进来的 path，但仍保留
  // 此 check 让 loader 不依赖外部前置验证（直接调用方传 invalid input 时也 fallback 空）
  if (!path.isAbsolute(opts.projectRoot)) {
    console.warn(`[agents-md-loader] projectRoot must be absolute, got: ${opts.projectRoot}`);
    return [];
  }
  try {
    const sdk = await loadSdkCodingModule();
    return sdk.loadAgentsFiles({
      projectRoot: opts.projectRoot,
      kodaxDir: opts.kodaxGlobalDir,
      cwd: opts.projectRoot, // SDK 默认 process.cwd()——Space 强制 cwd=projectRoot 让递归扫只从项目根开始
    });
  } catch (err) {
    console.warn(
      '[agents-md-loader] SDK loadAgentsFiles threw:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * AGENTS.md files Space may write. SDK `scope` is precedence, not location:
 * `<projectRoot>/AGENTS.md` loads as 'directory' and `<projectRoot>/.kodax/AGENTS.md`
 * as 'project', so saves address one of these exact paths instead of a scope.
 */
export function agentsMdEditTargets(projectRoot: string, kodaxGlobalDir: string) {
  const root = path.resolve(projectRoot);
  return {
    global: path.join(path.resolve(kodaxGlobalDir), 'AGENTS.md'),
    project: path.join(root, 'AGENTS.md'),
    projectKodax: path.join(root, '.kodax', 'AGENTS.md'),
  } as const;
}
