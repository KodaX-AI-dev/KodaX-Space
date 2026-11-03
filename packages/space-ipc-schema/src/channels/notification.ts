// Native OS notification — F020 (v0.1.3)
//
// renderer → main 单向触发：renderer 判断"长任务跑完了 + 窗口不在前台"
// 后调本 channel，main 用 Electron Notification 弹原生通知。
// 用户点通知 → main 把窗口拉前台 + push 'notification.clicked' 让 renderer
// 切到对应 session（如果通知带 sessionId）。
//
// 安全 / 隐私：
//   - title / body 限到 280 字符防意外灌入大段 prompt
//   - body 文案由 renderer 决定 (e.g. "Session done · 1m 24s")，不应当 leak
//     用户消息内容；renderer 端做控制
//   - 没有 OS-level permission 检查 —— Electron 的 main-process Notification
//     不需要 browser permission API，由 OS 自己处理（macOS 首次会弹系统授权
//     dialog；Windows 走 Action Center；Linux 走 libnotify）

import { z } from 'zod';

export const notificationShowChannel = {
  name: 'notification.show',
  direction: 'invoke',
  input: z.object({
    /** 通知标题 —— ASCII 截断 80，CJK 等单字符截断 40 */
    title: z.string().min(1).max(280),
    /** 通知正文 —— 限 280 字符避免意外塞大段 prompt */
    body: z.string().min(0).max(280),
    /** 点击通知后 renderer 该跳的 session id —— main 把这个透传回
     *  notification.clicked push payload，让 renderer setCurrentSession */
    sessionId: z.string().min(1).max(128).optional(),
    /** silent=true 走"通知中心"不响铃 —— 用户已经在敲键盘时不打断节奏 */
    silent: z.boolean().optional(),
  }),
  output: z.object({
    /** True confirms native acceptance, not a visible banner: OS permissions and Focus apply. */
    shown: z.boolean(),
    reason: z.enum(['unsupported', 'failed', 'not_confirmed']).optional(),
  }),
} as const;

export const notificationClickedChannel = {
  name: 'notification.clicked',
  direction: 'push',
  payload: z.object({
    /** main 把 input.sessionId 原样回传；renderer setCurrentSession 即切到该 session */
    sessionId: z.string().min(1).max(128).optional(),
  }),
} as const;
