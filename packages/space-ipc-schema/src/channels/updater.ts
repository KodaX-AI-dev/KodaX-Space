// Manual update channels — F022.
// getState is local; check fetches metadata; download/install each require the confirmed version.
// Main sanitizes errors and rejects versions outside the installed release channel.

import { z } from 'zod';

const updaterStateSchema = z.discriminatedUnion('state', [
  /** 初始 / 无更新 / 检查失败后回落 */
  z.object({
    state: z.literal('idle'),
  }),
  /** 正在向 GitHub Releases feed 询问 */
  z.object({
    state: z.literal('checking'),
  }),
  /** 找到同通道候选，等待用户确认下载。 */
  z.object({
    state: z.literal('available'),
    version: z.string().min(1).max(64),
  }),
  /** 下载中 —— percent 0~100，bytesPerSecond / transferred / total 可选 */
  z.object({
    state: z.literal('downloading'),
    version: z.string().min(1).max(64),
    percent: z.number().min(0).max(100),
  }),
  /** 已下载完成，等待用户确认重启安装。 */
  z.object({
    state: z.literal('ready'),
    version: z.string().min(1).max(64),
  }),
  /** 检查 / 下载失败 —— message 经 sanitize 后传给 renderer */
  z.object({
    state: z.literal('error'),
    message: z.string().min(1).max(280),
  }),
]);

export type UpdaterStateT = z.infer<typeof updaterStateSchema>;

/** renderer 主动触发检查（"Check for updates" 菜单 / 设置项） */
export const updaterCheckChannel = {
  name: 'updater.check',
  direction: 'invoke',
  input: z.object({}).strict(),
  output: z.object({
    /** 当前是否启用 updater（dev 模式 / darwin 未签名构建返 false，UI 提示 "available in built app"） */
    enabled: z.boolean(),
    /** 触发后立刻拿到的最新已知 state（异步状态变化继续走 push channel） */
    state: updaterStateSchema,
  }),
} as const;

/** ready 之后 renderer 让用户点 "Install & restart" → 触发 quitAndInstall */
export const updaterInstallChannel = {
  name: 'updater.install',
  direction: 'invoke',
  input: z.object({ version: z.string().min(1).max(64) }).strict(),
  output: z.object({
    /** false 表示未 ready 或 dev 模式，UI 不应该走到这里 */
    accepted: z.boolean(),
  }),
} as const;

/** Read current state without making a network request. */
export const updaterGetStateChannel = {
  name: 'updater.getState',
  direction: 'invoke',
  input: z.object({}).strict(),
  output: updaterCheckChannel.output,
} as const;

/** Download only the version the user confirmed after checking. */
export const updaterDownloadChannel = {
  name: 'updater.download',
  direction: 'invoke',
  input: z.object({ version: z.string().min(1).max(64) }).strict(),
  output: z.object({ accepted: z.boolean() }),
} as const;

/** main → renderer 状态推送 */
export const updaterStatusChannel = {
  name: 'updater.status',
  direction: 'push',
  payload: updaterStateSchema,
} as const;
