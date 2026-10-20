// Slash command IPC — FEATURE_031.
//
// 把 KodaX REPL 的 slash command 模式 (`/mode`, `/model`, `/help`, `/compact`...)
// 搬到 desktop。底部输入框输入 `/` 触发补全 popover；选中后通过 IPC 调对应 handler。
//
// 设计：
//   - main 端注册表 (slash-registry.ts) 启动期加载 builtin + 扫 ~/.kodax/commands/ user commands
//   - slash.discover 列出所有；renderer 缓存填补全列表
//   - slash.exec 调 handler；返回结构化结果 + UI 提示文字 (类似 REPL terminal echo)
//
// 不复用 KodaX REPL `interactive/commands.ts` 的 BUILTIN_COMMANDS：那些 handler 直接操作
// readline / Ink 状态，无法在 main 进程跑。Space 只镜像命令的"意图 → handler"映射，
// handler 实现走 Space 自己的 host / store / settings 路径。

import { z } from 'zod';

// ---- 命令元数据（discover 输出）----
//
// description / argsHint 用于补全 popover 显示，类似 REPL 的 /help 输出。
// source 区分内置 (builtin) vs 用户级 (user; ~/.kodax/commands/*.md)。
const slashCommandSourceSchema = z.enum(['builtin', 'user']);
const slashCommandTokenSchema = z.union([
  z.string().regex(/^[a-z][a-z0-9-]*$/, {
    message: 'command name must be kebab-case',
  }),
  z.literal('?'),
]);

const slashCommandMetaSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, {
      message: 'command name must be kebab-case',
    })
    .min(1)
    .max(64),
  aliases: z.array(slashCommandTokenSchema).max(8).optional(),
  description: z.string().max(512),
  /** 参数提示文字，如 '<plan|accept-edits|auto>'。可空表示无参。*/
  argsHint: z.string().max(2048).optional(),
  source: slashCommandSourceSchema,
});

// ---- Invoke: slash.discover ----
//
// 启动时 + attach menu 打开时 + popover 打开时调；轻量（main 端注册表是 in-memory）。
export const slashDiscoverChannel = {
  name: 'slash.discover',
  direction: 'invoke',
  input: z.undefined().optional(),
  output: z.object({
    commands: z.array(slashCommandMetaSchema).max(200),
  }),
} as const;

// ---- Invoke: slash.exec ----
//
// args 是字符串数组（按空格切分；引号内空格归一段）。handler 自己解析。
// 当前 sessionId 必传——大多数命令操作当前 session（/mode 等）。
//
// 输出：
//   ok          — 是否成功执行
//   message     — 给 renderer 显示的反馈文本（成功 ack 或错误说明）
//   echo        — 是否在 conversation stream 中显示这条命令（如 /clear 显示，
//                 /mode 不显示，由 handler 决定）
//   clearStream — true → renderer 在 echo 之后清空当前 session 的消息流。
//                 用独立字段而非 name === 'clear' 字符串匹配，避免 F035 user
//                 命令同名 'clear' 时被误清屏。
export const slashExecChannel = {
  name: 'slash.exec',
  direction: 'invoke',
  input: z.object({
    sessionId: z.string().min(1),
    name: slashCommandTokenSchema,
    operationId: z.string().min(1).max(128).optional(),
    args: z.array(z.string().max(2048)).max(20),
    /** Optional renderer-side guardrail; main rejects if the session scope drifted. */
    expectedProjectRoot: z.string().min(1).max(4096).optional(),
    expectedSurface: z.enum(['code', 'partner']).optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string().max(2048).optional(),
    echo: z.boolean().optional(),
    clearStream: z.boolean().optional(),
    /**
     * F035 reviewer HIGH-3: 显式 routing 信号——main 找不到 name 对应的 slash command
     * 时 true。renderer 据此走 skill fallback (skill.invoke)，**不**再靠 message
     * 字符串 startsWith 'unknown command' 做隐式判定（i18n / 措辞变更会 break）。
     */
    unknownCommand: z.boolean().optional(),
  }),
} as const;

export type SlashCommandMeta = z.infer<typeof slashCommandMetaSchema>;
export type SlashCommandSource = z.infer<typeof slashCommandSourceSchema>;
