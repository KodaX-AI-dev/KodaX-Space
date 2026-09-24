// Auto-update channels — F022 (v0.1.3)
//
// 走 electron-updater（GitHub Releases feed，由 electron-builder publish 上传
// 的 latest{,-mac,-linux}.yml 索引）。
//
// 流程：
//   1) app.whenReady → main 调一次 autoUpdater.checkForUpdates()（dev / 没签名时
//      不会真的下载，只触发事件链让我们能在调试模式看 push）
//   2) 'update-available'  → push 'updater.status' { state: 'available', version }
//   3) 'download-progress' → push 'updater.status' { state: 'downloading', percent }
//   4) 'update-downloaded' → push 'updater.status' { state: 'ready', version }
//      renderer 弹 "Restart to install" banner
//   5) 用户点 Install → invoke 'updater.install' → quitAndInstall()
//
// 隐私 / 安全：
//   - 不带任何用户内容、不带 telemetry，纯版本号 + 进度百分比
//   - 错误信息 sanitize 成 generic string（不漏机器路径 / token）
//   - install 是 user-gesture，main 必须收到 invoke 才 quitAndInstall
//
// dev 模式（app.isPackaged === false）main 不注册 autoUpdater 但保留 IPC
// surface（返回 idle），renderer 可以测试 UI 不报错

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
  /** 找到新版本，电子签名 / 渠道匹配 → 即将自动下载 */
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
  /** 已下载完成，重启即装 */
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
  input: z.object({}).strict(),
  output: z.object({
    /** false 表示未 ready 或 dev 模式，UI 不应该走到这里 */
    accepted: z.boolean(),
  }),
} as const;

/** main → renderer 状态推送 */
export const updaterStatusChannel = {
  name: 'updater.status',
  direction: 'push',
  payload: updaterStateSchema,
} as const;
