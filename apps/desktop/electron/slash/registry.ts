// Slash command registry — FEATURE_031.
//
// Builtin 命令在本文件硬编码（与 KodaX REPL packages/repl/src/interactive/commands.ts
// 镜像；只镜像 desktop 实际能实现的 handler）。User 命令扫 ~/.kodax/commands/*.md
// frontmatter (KodaX REPL 兼容路径)，留 F035 完整实现，stub 这里返回 []。

import type { SlashCommandMeta, SlashCommandSource } from '@kodax-space/space-ipc-schema';

export interface SlashHandlerContext {
  sessionId: string;
  args: string[];
}

export interface SlashHandlerResult {
  ok: boolean;
  message?: string;
  /** true → renderer 把 "/cmd args" 当作一条 system/user 消息显示进 conversation。 */
  echo?: boolean;
  /** true → renderer 清空当前 session 的消息流（/clear 专用，独立于 name 匹配）。*/
  clearStream?: boolean;
}

export interface SlashCommandDef extends SlashCommandMeta {
  /** Handler 必须是 async 的（即便不真 await）— IPC handler 统一 await。*/
  handler: (ctx: SlashHandlerContext) => Promise<SlashHandlerResult>;
}

const builtins: SlashCommandDef[] = [];
const aliases = new Map<string, string>();

function normalizeSlashToken(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 注册一个 builtin 命令。FEATURE_031 main 启动时调，把 handler 全部塞进 registry。
 * 同名重复注册会覆盖（后注册的赢）——给测试 / 热替换留口子。
 */
export function registerSlash(def: SlashCommandDef): void {
  const normalizedName = normalizeSlashToken(def.name);
  const existingIdx = builtins.findIndex((c) => normalizeSlashToken(c.name) === normalizedName);
  if (existingIdx >= 0) builtins[existingIdx] = def;
  else builtins.push(def);

  for (const [alias, owner] of [...aliases.entries()]) {
    if (owner === normalizedName) aliases.delete(alias);
  }
  for (const alias of def.aliases ?? []) {
    const normalizedAlias = normalizeSlashToken(alias);
    if (!normalizedAlias || normalizedAlias === normalizedName) continue;
    aliases.set(normalizedAlias, normalizedName);
  }
}

/**
 * 测试用：清空注册表。
 * 生产构建下 no-op——避免运行期被误调导致命令丢失。
 * (node --test 把 NODE_ENV 设 'test'；electron 启动时是 'production' 或 undefined。)
 */
export function _resetSlashRegistryForTesting(): void {
  if (process.env.NODE_ENV === 'production') return;
  builtins.length = 0;
  aliases.clear();
}

/** 列出已注册命令（按 name 字典序）。*/
export function listSlashCommands(): readonly SlashCommandMeta[] {
  return [...builtins]
    .filter(({ name }) => name !== 'agent-mode')
    .map(({ handler: _h, ...meta }) => meta)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 取 handler；不存在返回 undefined。*/
export function getSlashHandler(name: string): SlashCommandDef | undefined {
  const normalizedName = normalizeSlashToken(name);
  const canonical = aliases.get(normalizedName) ?? normalizedName;
  return builtins.find((c) => normalizeSlashToken(c.name) === canonical);
}

export type { SlashCommandSource };
